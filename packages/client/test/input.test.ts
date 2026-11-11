import { describe, expect, it } from 'vitest';
import {
  combineIntents,
  initialInputKind,
  mergeActions,
  moveStickFeedback,
  NO_ACTIONS,
  resolveSlot,
  stickSprint,
  stickVector,
  TOUCH_TUNING,
  TouchSprint,
  touchIntent,
  VirtualStick,
  zoneFor,
  ZERO_STICK,
  type ContinuousIntent,
} from '../src/input/index.js';

describe('stickVector', () => {
  it('is inactive at the origin and inside the deadzone', () => {
    expect(stickVector(0, 0, 60, 0.12)).toEqual(ZERO_STICK);
    const v = stickVector(5, 0, 60, 0.12); // 0.083 < 0.12
    expect(v.active).toBe(false);
    expect(v.mag).toBe(0);
    expect(v.x).toBe(0);
  });

  it('ramps from 0 at the deadzone edge to 1 at full deflection', () => {
    const dz = 0.2;
    const edge = stickVector(60 * dz + 0.001, 0, 60, dz);
    expect(edge.active).toBe(true);
    expect(edge.mag).toBeLessThan(0.01);
    const half = stickVector(60 * 0.6, 0, 60, dz);
    expect(half.mag).toBeCloseTo(0.5, 5);
    expect(stickVector(60, 0, 60, dz).mag).toBeCloseTo(1, 5);
  });

  it('clamps magnitude beyond the radius and keeps direction', () => {
    const v = stickVector(0, -500, 60, 0.1);
    expect(v.mag).toBe(1);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(-1, 9);
    expect(v.angle).toBeCloseTo(-Math.PI / 2, 9);
    const d = stickVector(300, 300, 60, 0.1);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
    expect(d.angle).toBeCloseTo(Math.PI / 4, 9);
  });
});

describe('VirtualStick', () => {
  it('floats: origin is where the touch began', () => {
    const s = new VirtualStick({ radius: 50, deadzone: 0.1 });
    expect(s.vector.active).toBe(false);
    s.begin(7, 100, 200);
    expect(s.engaged).toBe(true);
    s.move(130, 200);
    expect(s.vector.x).toBeCloseTo((0.6 - 0.1) / 0.9, 5);
    expect(s.knob).toEqual({ x: 130, y: 200 });
    s.end();
    expect(s.engaged).toBe(false);
    expect(s.vector).toEqual(ZERO_STICK);
  });

  it('drags the origin along when the thumb leaves the radius', () => {
    const s = new VirtualStick({ radius: 50, deadzone: 0.1, follow: true });
    s.begin(1, 0, 0);
    s.move(200, 0);
    expect(s.originX).toBeCloseTo(150, 9);
    expect(s.vector.mag).toBe(1);
    // reversing direction now responds immediately
    s.move(100, 0);
    expect(s.vector.x).toBeLessThan(0);
  });

  it('clamps the knob when follow is off', () => {
    const s = new VirtualStick({ radius: 50, deadzone: 0.1, follow: false });
    s.begin(1, 0, 0);
    s.move(0, 200);
    expect(s.originY).toBe(0);
    expect(s.knob.y).toBeCloseTo(50, 9);
  });
});

describe('touchIntent', () => {
  const push = (dx: number, dy: number, dz = 0.2) => stickVector(dx, dy, 60, dz);

  it('idle sticks produce no move, no aim, no fire', () => {
    expect(touchIntent(ZERO_STICK, ZERO_STICK)).toEqual({
      move: { x: 0, y: 0 },
      aim: null,
      fire: false,
      sprint: false,
      guard: false,
    });
  });

  it('left stick moves and faces the movement direction without firing', () => {
    const i = touchIntent(push(0, 60, 0.12), ZERO_STICK);
    expect(i.move.y).toBeCloseTo(1, 5);
    expect(i.fire).toBe(false);
    expect(i.aim).toEqual({ kind: 'angle', angle: Math.PI / 2 });
  });

  it('right stick aims and auto-fires past the deadzone', () => {
    const i = touchIntent(push(60, 0, 0.12), push(-60, 0));
    expect(i.move.x).toBeCloseTo(1, 5);
    expect(i.aim).toEqual({ kind: 'angle', angle: Math.PI });
    expect(i.fire).toBe(true);
    // inside deadzone: no fire, aim falls back to movement direction
    const j = touchIntent(push(60, 0, 0.12), push(-5, 0));
    expect(j.fire).toBe(false);
    expect(j.aim).toEqual({ kind: 'angle', angle: 0 });
  });

  it('honours a fire threshold', () => {
    expect(touchIntent(ZERO_STICK, push(30, 0), 0.5).fire).toBe(false);
    expect(touchIntent(ZERO_STICK, push(55, 0), 0.5).fire).toBe(true);
  });

  it('splits the screen into move (left) and aim (right) zones', () => {
    expect(zoneFor(10, 800)).toBe('move');
    expect(zoneFor(399, 800)).toBe('move');
    expect(zoneFor(400, 800)).toBe('aim');
    expect(zoneFor(790, 800)).toBe('aim');
  });
});

describe('intent merging', () => {
  const kbm: ContinuousIntent = {
    move: { x: 1, y: 0 },
    aim: { kind: 'screen', x: 10, y: 20 },
    fire: false,
    sprint: false,
    guard: false,
  };
  const touch: ContinuousIntent = {
    move: { x: 0, y: -0.5 },
    aim: { kind: 'angle', angle: 1 },
    fire: true,
    sprint: false,
    guard: false,
  };
  const idleTouch: ContinuousIntent = {
    move: { x: 0, y: 0 },
    aim: null,
    fire: false,
    sprint: false,
    guard: false,
  };

  it('PC mode is exactly the keyboard/mouse intent when touch is idle', () => {
    expect(combineIntents('kbm', kbm, idleTouch)).toEqual(kbm);
  });

  it('touch mode aims with the stick, moves with the stick, fires with either', () => {
    expect(combineIntents('touch', kbm, touch)).toEqual({
      move: { x: 0, y: -0.5 },
      aim: { kind: 'angle', angle: 1 },
      fire: true,
      sprint: false,
      guard: false,
    });
    expect(combineIntents('touch', { ...kbm, fire: true }, idleTouch).fire).toBe(true);
    expect(combineIntents('touch', kbm, idleTouch).aim).toBeNull();
  });

  it('sprints from either device (Shift or the touch SPRINT toggle)', () => {
    expect(combineIntents('kbm', { ...kbm, sprint: true }, idleTouch).sprint).toBe(true);
    expect(combineIntents('touch', kbm, { ...touch, sprint: true }).sprint).toBe(true);
    expect(combineIntents('touch', kbm, touch).sprint).toBe(false);
  });

  it('guards from either device (RMB or touch GUARD hold)', () => {
    expect(combineIntents('kbm', { ...kbm, guard: true }, idleTouch).guard).toBe(true);
    expect(combineIntents('touch', kbm, { ...touch, guard: true }).guard).toBe(true);
    expect(combineIntents('touch', kbm, touch).guard).toBe(false);
  });

  it('resolves direct slots and cycling over owned weapons', () => {
    expect(resolveSlot(NO_ACTIONS, [1, 2, 3], 1)).toBe(0);
    expect(resolveSlot({ ...NO_ACTIONS, slot: 3 }, [1, 2, 3], 1)).toBe(3);
    expect(resolveSlot({ ...NO_ACTIONS, cycle: 1 }, [1, 2, 4], 4)).toBe(1);
    expect(resolveSlot({ ...NO_ACTIONS, cycle: -1 }, [1, 2, 4], 1)).toBe(4);
    expect(resolveSlot({ ...NO_ACTIONS, cycle: 1 }, [1], 1)).toBe(0);
  });

  it('merges latched actions from several sources', () => {
    expect(
      mergeActions([
        { slot: 2, cycle: 0, reload: false },
        { slot: 0, cycle: 0, reload: true },
      ]),
    ).toEqual({ slot: 2, cycle: 0, reload: true });
  });

  it('starts in touch mode only on coarse touch devices', () => {
    expect(initialInputKind(true, true)).toBe('touch');
    expect(initialInputKind(false, true)).toBe('kbm'); // touch laptop with a mouse
    expect(initialInputKind(false, false)).toBe('kbm');
  });
});

describe('touch sprint (stick edge + button toggle)', () => {
  const Z = TOUCH_TUNING.sprintZone;
  const R = TOUCH_TUNING.move.radius;
  const stick = () => new VirtualStick({ ...TOUCH_TUNING.move, follow: true, outer: Z.outer });

  it('full deflection inside the ring walks; past the ring into the sprint zone sprints', () => {
    const s = stick();
    s.begin(1, 100, 200);
    s.move(100 + R, 200); // at the ring: full speed, no sprint
    expect(s.vector.mag).toBe(1);
    expect(stickSprint(s.reach, false)).toBe(false);
    s.move(100 + R * (Z.enter + 0.05), 200); // past the ring
    expect(s.vector.mag).toBe(1);
    expect(s.originX).toBe(100); // no follow inside the outer band
    expect(stickSprint(s.reach, false)).toBe(true);
  });

  it('has hysteresis and the origin only follows past the outer band', () => {
    expect(stickSprint(Z.enter - 0.01, false)).toBe(false);
    expect(stickSprint(Z.exit + 0.01, true)).toBe(true); // stays on until back inside exit
    expect(stickSprint(Z.exit - 0.01, true)).toBe(false);
    const s = stick();
    s.begin(1, 100, 200);
    s.move(100 + R * 3, 200); // dragged way past: origin follows to keep the thumb at outer
    expect(s.reach).toBeCloseTo(Z.outer, 9);
    expect(stickSprint(s.reach, false)).toBe(true);
    expect(Math.hypot(s.knob.x - s.originX, s.knob.y - s.originY)).toBeCloseTo(R * Z.outer, 6);
  });

  it('TouchSprint: holds while the SPRINT button is down, resets cleanly', () => {
    const t = new TouchSprint();
    expect(t.on).toBe(false);
    t.setHeld(true);
    expect(t.on).toBe(true);
    t.setHeld(false);
    expect(t.on).toBe(false);
    t.setHeld(true);
    t.reset();
    expect(t.on).toBe(false);
  });
});

describe('move-stick sprint feedback (v0.6.0 hotfix)', () => {
  const on = { sprinting: true, stamina: 2, fire: false };
  const idle = { sprinting: false, stamina: 2, fire: false };
  it('max walk at the radius; a dead gap before the sprint trigger', () => {
    expect(moveStickFeedback(0.99, idle).maxWalk).toBe(false);
    expect(moveStickFeedback(1, idle).maxWalk).toBe(true);
    expect(stickVector(60, 0, 60, TOUCH_TUNING.move.deadzone).mag).toBe(1); // speed saturates here
    const gap = TOUCH_TUNING.sprintZone.enter - 1;
    expect(gap).toBeGreaterThanOrEqual(0.15);
    expect(gap).toBeLessThanOrEqual(0.2);
    expect(stickSprint(1.1, false)).toBe(false); // inside the gap: still walking
  });
  it('band lit only while really sprinting; greyed on low stamina or a held trigger', () => {
    expect(moveStickFeedback(1.3, on).sprintMode).toBe('on');
    expect(moveStickFeedback(1.3, idle).sprintMode).toBe('off');
    expect(moveStickFeedback(1.3, { ...idle, stamina: 0.49 }).sprintMode).toBe('noStamina');
    expect(moveStickFeedback(1.3, { ...idle, fire: true }).sprintMode).toBe('fire');
    expect(moveStickFeedback(1.3, { ...on, fire: true }).sprintMode).toBe('on'); // running sprint unchanged
    expect(moveStickFeedback(1.3, null).sprintMode).toBe('off');
  });
  it('returns the StickView feedback fields (maxWalk, sprintMode)', () => {
    expect(moveStickFeedback(0, { sprinting: true, stamina: 1, fire: false })).toEqual({
      maxWalk: false,
      sprintMode: 'on',
    });
  });
  it('the knob clamps to the sprint band outer edge', () => {
    const s = new VirtualStick({
      radius: 60,
      deadzone: 0.12,
      follow: true,
      outer: TOUCH_TUNING.sprintZone.outer,
    });
    s.begin(1, 100, 100);
    s.move(400, 100);
    expect(Math.hypot(s.knob.x - s.originX, s.knob.y - s.originY)).toBeCloseTo(
      60 * TOUCH_TUNING.sprintZone.outer,
      6,
    );
  });
});
