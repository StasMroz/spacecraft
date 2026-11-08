import { describe, expect, it } from 'vitest';
import { emptyInput, snapWalls, WAVE_MAP, type WreckSnap } from '@sms/shared';
import { Predictor } from '../src/game/prediction.js';

describe('prediction with wreck walls', () => {
  it('the local marine is blocked by wreck walls from the snapshot', () => {
    const wk: WreckSnap[] = [[650, 500, 30, 200, 1]];
    const go = (withWreck: boolean) => {
      const pr = new Predictor();
      if (withWreck) pr.field = { arena: WAVE_MAP.arena, walls: snapWalls(WAVE_MAP.walls, wk) };
      pr.reconcile(600, 600, 0, true);
      for (let i = 1; i <= 30; i++) pr.applyLocal({ ...emptyInput(), seq: i, mx: 1 }, 200, true);
      return pr.pos.x;
    };
    expect(go(false)).toBeGreaterThan(700);
    expect(go(true)).toBeLessThan(650);
  });
});
