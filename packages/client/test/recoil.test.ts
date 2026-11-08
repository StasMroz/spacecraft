import {
  applyInput,
  buildSnapshot,
  createWorld,
  emptyInput,
  grantWeapon,
  stepWorld,
  TICK_DT,
} from '@sms/shared';
import { describe, expect, it } from 'vitest';
import { RecoilMirror, recoilReticle } from '../src/game/recoil.js';

describe('client recoil mirror', () => {
  it('matches the host recoil between snapshots (prediction = authoritative aim)', () => {
    const w = createWorld([{ id: 1, name: 'M1' }], 31);
    w.director.idle = true;
    const p = w.players[0];
    p.x = 600;
    p.y = 600;
    grantWeapon(w, p, 'heavy_bolter');
    p.current = 'heavy_bolter';
    const m = new RecoilMirror();
    let checked = 0;
    for (let t = 0; t < 200; t++) {
      const fire = t % 50 < 20;
      const now = t * TICK_DT * 1000;
      applyInput(w, 1, { ...emptyInput(), seq: t + 1, my: 1, aim: 0.5, fire });
      stepWorld(w, TICK_DT);
      const shot = w.events.some((e) => e.e === 'shot' && e.p === 1);
      if (!shot && t > 0) {
        // no new kick this tick: the mirror's recovery must land on the host value
        expect(Math.abs(m.angle(now) - p.recoil)).toBeLessThan(1 / 2000 + 1e-5);
        checked++;
      }
      const me = buildSnapshot(w, 60).players[0];
      m.sync(me.rc, me.w, now);
      // drawn aim = raw input + mirror = the host's aim (snapshot `a`, 0.01 rad)
      expect(Math.abs(0.5 + m.angle(now) - me.a)).toBeLessThanOrEqual(0.005 + 1 / 2000);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('reticle rotates around the marine by the recoil and pushes out along the aim', () => {
    const marine = { x: 100, y: 100 };
    const r = recoilReticle({ x: 300, y: 100 }, marine, 0.1, 5);
    expect(Math.atan2(r.y - 100, r.x - 100)).toBeCloseTo(0.1, 12);
    expect(Math.hypot(r.x - 100, r.y - 100)).toBeCloseTo(205, 9);
    expect(recoilReticle({ x: 3, y: 4 }, marine, 0, 0)).toEqual({ x: 3, y: 4 });
    const m = new RecoilMirror();
    m.sync(undefined, 'heavy_bolter', 0);
    expect(m.angle(10)).toBe(0);
  });
});
