import { describe, expect, it } from 'vitest';
import {
  AIM_HINT,
  hitTouchPad,
  touchPadLayout,
  wheelSliceAt,
  WHEEL_INNER,
} from '../src/input/touchControls.js';

describe('touch pad layout (sprint + weapon wheel above AIM·FIRE)', () => {
  it('places SPRINT above the right attack stick, and the wheel handle above SPRINT', () => {
    const L = touchPadLayout(390, 844);
    expect(L.aim.x).toBe(390 - AIM_HINT.xFromRight);
    expect(L.aim.y).toBe(844 - AIM_HINT.fromBottom);
    const sprintCx = L.sprint.x + L.sprint.w / 2;
    const sprintCy = L.sprint.y + L.sprint.h / 2;
    const wheelCx = L.wheel.x + L.wheel.w / 2;
    const wheelCy = L.wheel.y + L.wheel.h / 2;
    expect(sprintCx).toBe(L.aim.x);
    expect(wheelCx).toBe(L.aim.x);
    expect(sprintCy).toBeLessThan(L.aim.y);
    expect(wheelCy).toBeLessThan(sprintCy);
    expect(L.sprint.y + L.sprint.h).toBeLessThan(L.aim.y - 40);
  });

  it('hit-tests the buttons and the open wheel slices (clockwise from the top)', () => {
    const L = touchPadLayout(390, 844);
    expect(
      hitTouchPad(L, L.aim.x, L.sprint.y + 10, { wheelOpen: false, slots: [1, 3, 7] }),
    ).toEqual({ kind: 'sprint' });
    expect(hitTouchPad(L, L.aim.x, L.wheel.y + 10, { wheelOpen: false, slots: [1, 3, 7] })).toEqual(
      {
        kind: 'wheel',
      },
    );
    expect(hitTouchPad(L, 10, 10, { wheelOpen: false, slots: [1, 3, 7] })).toBeNull();
    const slots = [1, 2, 3, 4];
    const top = hitTouchPad(L, L.wheelCenter.x, L.wheelCenter.y - 70, { wheelOpen: true, slots });
    expect(top).toEqual({ kind: 'slot', slot: 1 });
    const right = hitTouchPad(L, L.wheelCenter.x + 70, L.wheelCenter.y, { wheelOpen: true, slots });
    expect(right).toEqual({ kind: 'slot', slot: 2 });
    expect(
      wheelSliceAt(
        L.wheelCenter.x,
        L.wheelCenter.y,
        L.wheelRadius,
        L.wheelCenter.x,
        L.wheelCenter.y,
        4,
      ),
    ).toBe(-1); // handle hole
    expect(WHEEL_INNER).toBeGreaterThan(10);
  });

  it('also fits a landscape phone viewport', () => {
    const L = touchPadLayout(844, 390);
    expect(L.wheel.y).toBeGreaterThan(0);
    expect(L.sprint.x + L.sprint.w).toBeLessThan(844);
  });
});
