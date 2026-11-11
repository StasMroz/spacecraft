import { describe, expect, it } from 'vitest';
import { PLAYER, TICK_DT } from '../src/constants.js';
import {
  defaultContent,
  MARINE_DIRECTIONAL_ARMOUR as A,
  MARINE_SPRINT as S,
  newSprintState,
  stepSprint,
} from '../src/data/index.js';
import { createWireCodec, isClientMessage } from '../src/net/index.js';
import {
  applyInput,
  buildSnapshot,
  createWorld,
  emptyInput,
  stepWorld,
  type Player,
  type PlayerInput,
  type World,
} from '../src/sim/index.js';
import { damagePlayer } from '../src/sim/systems/combat.js';

function quietWorld(n = 1, seed = 11): World {
  const w = createWorld(
    Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `M${i + 1}` })),
    seed,
  );
  w.director.idle = true;
  w.players.forEach((p, i) => {
    p.x = 600;
    p.y = 400 + i * 400;
  });
  return w;
}

let seq = 0;
/** Steps `ticks` ticks with the same input for player 1 (others idle). */
function run(w: World, ticks: number, i: Partial<PlayerInput>, p: Player = w.players[0]): void {
  for (let t = 0; t < ticks; t++) {
    applyInput(w, p.id, { ...emptyInput(), seq: ++seq, ...i });
    stepWorld(w, TICK_DT);
  }
}

const ticks = (s: number) => Math.round(s / TICK_DT);
const sprintRight = { mx: 1, my: 0, sprint: true } as const;

describe('sprint constants', () => {
  it('1.56× speed (hotfix: +56%), 2.4 s of stamina (v0.6.0 hotfix −20%), full regen in 7 s standing, 0.8 s weapon delay', () => {
    expect(S).toMatchObject({
      speedMul: 1.56,
      staminaMaxS: 2.4,
      drainPerS: 1,
      minToStartS: 0.5,
      weaponReadyDelayS: 0.8,
    });
    expect(S.staminaMaxS / S.regenStandingPerS).toBeCloseTo(7, 9);
    expect(S.regenWalkingPerS).toBeCloseTo(S.regenStandingPerS / 2, 9);
  });
});

describe('sprint (shared sim)', () => {
  it('moves at speedMul × base marine speed (ignoring the weapon carry penalty)', () => {
    const w = quietWorld();
    const p = w.players[0];
    const x0 = p.x;
    run(w, ticks(1), sprintRight);
    expect(p.sprint.sprinting).toBe(true);
    expect(p.x - x0).toBeCloseTo(PLAYER.speed * S.speedMul * ticks(1) * TICK_DT, 3);

    const w2 = quietWorld();
    const p2 = w2.players[0];
    const def = defaultContent.weapon(p2.current);
    const x2 = p2.x;
    run(w2, ticks(1), { mx: 1 });
    expect(p2.sprint.sprinting).toBe(false);
    expect(p2.x - x2).toBeCloseTo(PLAYER.speed * def.moveSpeedMul * ticks(1) * TICK_DT, 3);
  });

  it('drains 1 stamina/s, auto-stops at 0 and only restarts at minToStartS', () => {
    const w = quietWorld();
    const p = w.players[0];
    run(w, ticks(1), sprintRight);
    expect(p.sprint.stamina).toBeCloseTo(S.staminaMaxS - 1, 6);
    run(w, ticks(S.staminaMaxS - 1) + 1, sprintRight);
    expect(p.sprint.sprinting).toBe(false); // auto-stop, still holding sprint
    expect(p.sprint.stamina).toBeLessThan(S.minToStartS);
    p.sprint.stamina = 0;
    const x0 = p.x;
    run(w, ticks(1), sprintRight); // holding sprint but not sprinting (empty): walking regen, no restart
    expect(p.sprint.sprinting).toBe(false);
    expect(p.sprint.stamina).toBeCloseTo(S.regenWalkingPerS * 1, 6);
    expect(p.x - x0).toBeLessThan(PLAYER.speed * ticks(1) * TICK_DT + 1e-6);
    p.sprint.stamina = 0;
    // stand still (holding sprint) just under the restart threshold, then move: no sprint
    run(w, ticks(S.minToStartS / S.regenStandingPerS) - 3, { sprint: true });
    expect(p.sprint.stamina).toBeLessThan(S.minToStartS);
    run(w, 1, sprintRight);
    expect(p.sprint.sprinting).toBe(false);
    run(w, ticks(0.2), { sprint: true });
    expect(p.sprint.stamina).toBeGreaterThanOrEqual(S.minToStartS);
    run(w, 1, sprintRight);
    expect(p.sprint.sprinting).toBe(true);
  });

  it('regenerates whenever not sprinting: walking at half the standing rate, full in 7 s standing', () => {
    const w = quietWorld();
    const p = w.players[0];
    run(w, ticks(2), sprintRight);
    const left = p.sprint.stamina;
    run(w, ticks(3), { mx: 1 }); // walking
    expect(p.sprint.stamina).toBeCloseTo(left + 3 * S.regenWalkingPerS, 6);
    run(w, ticks(3), { mx: 0.1 }); // stick drift below STILL_INPUT counts as standing
    expect(p.sprint.stamina).toBeCloseTo(
      left + 3 * S.regenWalkingPerS + 3 * S.regenStandingPerS,
      6,
    );

    const w2 = quietWorld();
    const p2 = w2.players[0];
    p2.sprint.stamina = 0;
    run(w2, ticks(7) - 2, {});
    expect(p2.sprint.stamina).toBeLessThan(S.staminaMaxS);
    run(w2, 3, {});
    expect(p2.sprint.stamina).toBe(S.staminaMaxS);
  });

  it('cannot fire while sprinting; the trigger does not cancel the sprint', () => {
    const w = quietWorld();
    const p = w.players[0];
    const ammo0 = p.ammo[p.current];
    run(w, 1, sprintRight); // sprint first (fire held blocks only the START)
    run(w, ticks(1), { ...sprintRight, fire: true });
    expect(p.sprint.sprinting).toBe(true);
    expect(p.ammo[p.current]).toBe(ammo0);
    expect(w.events.some((e) => e.e === 'shot')).toBe(false);
    // the trigger doesn't slow the sprint down either
    expect(p.fireSlow).toBe(0);
  });

  it('does not START a sprint while the trigger is held; starts once it is released', () => {
    const w = quietWorld();
    const p = w.players[0];
    const ammo0 = p.ammo[p.current];
    run(w, ticks(0.5), { ...sprintRight, fire: true });
    expect(p.sprint.sprinting).toBe(false);
    expect(p.sprint.stamina).toBe(S.staminaMaxS); // request ignored: no drain
    expect(p.ammo[p.current]).toBeLessThan(ammo0); // ...and he kept shooting
    run(w, 1, sprintRight); // trigger released, sprint still requested
    expect(p.sprint.sprinting).toBe(true);
    // pressing the trigger again mid-sprint changes nothing (ignored, sprint keeps going)
    run(w, ticks(0.3), { ...sprintRight, fire: true });
    expect(p.sprint.sprinting).toBe(true);
  });

  it('client prediction applies the same fire-blocks-sprint-start rule', () => {
    const a = newSprintState();
    const b = newSprintState();
    const seq = [true, true, false, true, true, false, false, true];
    for (const fire of seq) {
      stepSprint(a, true, true, true, TICK_DT, fire);
      stepSprint(b, true, true, true, TICK_DT, fire);
      expect(a).toEqual(b);
    }
    const s = newSprintState();
    stepSprint(s, true, true, true, TICK_DT, true);
    expect(s.sprinting).toBe(false);
    stepSprint(s, true, true, true, TICK_DT, false);
    expect(s.sprinting).toBe(true);
    stepSprint(s, true, true, true, TICK_DT, true);
    expect(s.sprinting).toBe(true);
  });

  it('weapon is ready weaponReadyDelayS after the sprint ends (trigger held through)', () => {
    const w = quietWorld();
    const p = w.players[0];
    expect(defaultContent.weapon(p.current).automatic).toBe(true);
    run(w, 1, sprintRight);
    run(w, ticks(0.5), { ...sprintRight, fire: true });
    expect(p.sprint.sprinting).toBe(true);
    const ammo0 = p.ammo[p.current];
    let t = 0;
    while (p.ammo[p.current] === ammo0 && t < ticks(3)) {
      run(w, 1, { mx: 1, fire: true }); // released sprint, still moving + firing
      t++;
    }
    expect(t * TICK_DT).toBeGreaterThanOrEqual(S.weaponReadyDelayS);
    expect(t * TICK_DT).toBeLessThanOrEqual(S.weaponReadyDelayS + 2 * TICK_DT);
  });

  it('auto-stopping at 0 stamina also starts the weapon delay', () => {
    const w = quietWorld();
    const p = w.players[0];
    p.sprint.stamina = 0.6;
    run(w, ticks(0.6) + 2, sprintRight);
    expect(p.sprint.sprinting).toBe(false);
    expect(p.sprint.weaponDelay).toBeGreaterThan(S.weaponReadyDelayS - 3 * TICK_DT);
  });

  it('faces the movement direction while sprinting (directional armour turns with him)', () => {
    const w = quietWorld();
    const p = w.players[0];
    run(w, 3, { mx: 0, my: 1, aim: Math.PI, sprint: true });
    expect(p.aim).toBeCloseTo(Math.PI / 2, 9);
    run(w, 1, { mx: 0, my: 1, aim: Math.PI }); // released: back to the aim
    expect(p.aim).toBeCloseTo(Math.PI, 9);
  });

  it('a hit from behind while sprinting away lands on the rear armour', () => {
    const w = quietWorld();
    const p = w.players[0];
    w.rng.chance = () => false; // no deflection rolls
    run(w, 3, { mx: 1, my: 0, aim: Math.PI, sprint: true }); // aiming back, running right
    damagePlayer(w, p, 10, { fromX: p.x - 40, fromY: p.y });
    expect(PLAYER.maxHp - p.hp).toBeCloseTo(10 * A.rear, 6);
  });

  it('cannot sprint while reviving a downed squadmate', () => {
    const w = quietWorld(2);
    const [a, b] = w.players;
    b.state = 'downed';
    b.x = a.x + 40;
    b.y = a.y;
    run(w, 3, { mx: 0, my: 1, sprint: true }, a);
    expect(a.sprint.sprinting).toBe(false);
    b.x = a.x + PLAYER.reviveRadius + 60;
    run(w, 1, { mx: 0, my: 1, sprint: true }, a);
    expect(a.sprint.sprinting).toBe(true);
  });

  it('is deterministic with sprint inputs', () => {
    const play = () => {
      const w = createWorld(
        [1, 2].map((id) => ({ id, name: `M${id}` })),
        4242,
      );
      for (let i = 0; i < 900; i++) {
        for (const p of w.players)
          applyInput(w, p.id, {
            ...emptyInput(),
            seq: i,
            mx: Math.sin(i / 37 + p.id),
            my: Math.cos(i / 51 + p.id) * (i % 200 < 60 ? 0 : 1),
            aim: i / 20,
            fire: i % 7 < 4,
            sprint: i % 90 < 50,
          });
        stepWorld(w, TICK_DT);
      }
      return JSON.stringify(buildSnapshot(w, 60));
    };
    expect(play()).toBe(play());
  });

  it('pure state machine: entering is instant, any stop arms the weapon delay', () => {
    const s = newSprintState();
    stepSprint(s, true, true, true, TICK_DT);
    expect(s.sprinting).toBe(true);
    stepSprint(s, true, false, true, TICK_DT); // stopped moving
    expect(s.sprinting).toBe(false);
    expect(s.weaponDelay).toBe(S.weaponReadyDelayS);
    stepSprint(s, true, true, false, TICK_DT); // not allowed (reviving)
    expect(s.sprinting).toBe(false);
  });
});

describe('sprint on the wire (protocol v5 compatible)', () => {
  it('accepts inputs with or without the optional sprint bit, rejects junk', () => {
    const i = { ...emptyInput(), seq: 1 };
    expect(isClientMessage({ t: 'input', i })).toBe(true);
    expect(isClientMessage({ t: 'input', i: { ...i, sprint: true } })).toBe(true);
    expect(isClientMessage({ t: 'input', i: { ...i, sprint: 'yes' } })).toBe(false);
  });

  it('round-trips sprint flag, stamina and weapon delay in the player flags', () => {
    const w = quietWorld(2);
    run(w, ticks(0.7), sprintRight);
    run(w, 5, {});
    const s = buildSnapshot(w, 60);
    const me = s.players[0];
    expect(me.sp).toBeUndefined();
    expect(me.wd).toBeGreaterThan(0);
    expect(me.stm).toBeLessThan(S.staminaMaxS);
    const host = createWireCodec();
    const client = createWireCodec();
    client.decode(host.encode({ t: 'welcome', playerId: 1 }));
    const got = client.decode(host.encode({ t: 'snap', s })) as { s: typeof s };
    expect(got.s.players).toEqual(JSON.parse(JSON.stringify(s.players)));

    run(w, 2, sprintRight);
    const s2 = buildSnapshot(w, 60);
    expect(s2.players[0].sp).toBe(1);
    const got2 = client.decode(host.encode({ t: 'snap', s: s2 })) as { s: typeof s };
    expect(got2.s.players[0]).toMatchObject({ sp: 1, stm: s2.players[0].stm });
  });
});
