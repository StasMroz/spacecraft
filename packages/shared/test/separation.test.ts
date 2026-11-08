import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { applyInput, createWorld, emptyInput, stepWorld, type World } from '../src/sim/index.js';
import { spawnEnemy } from '../src/sim/systems/director.js';

function swarm(n: number): World {
  const w = createWorld([{ id: 1, name: 'M1' }], 9);
  w.map = { ...w.map, walls: [] };
  w.director.idle = true;
  const p = w.players[0];
  p.x = 1600;
  p.y = 1100;
  p.hp = p.maxHp = 1e9;
  for (let i = 0; i < n; i++)
    spawnEnemy(w, 'hormagaunt', 900 + (i % 5) * 3, 1100 + Math.floor(i / 5) * 3);
  return w;
}

const overlap = (w: World) => {
  let worst = 0;
  for (const a of w.enemies)
    for (const b of w.enemies) {
      if (a.id >= b.id) continue;
      worst = Math.max(worst, 26 - Math.hypot(a.x - b.x, a.y - b.y));
    }
  return worst;
};

describe('swarm separation', () => {
  it('a stacked pack spreads out instead of overlapping', () => {
    const w = swarm(20);
    let seq = 0;
    for (let t = 0; t < 30 * 3; t++) {
      applyInput(w, 1, { ...emptyInput(), seq: ++seq });
      stepWorld(w, TICK_DT);
    }
    // bodies (r 13) may touch but not sit inside each other
    expect(overlap(w)).toBeLessThan(10);
  });

  it('fans out on the approach instead of trailing in one line', () => {
    const w = swarm(20);
    let seq = 0;
    for (let t = 0; t < 30 * 1.5; t++) {
      applyInput(w, 1, { ...emptyInput(), seq: ++seq });
      stepWorld(w, TICK_DT);
    }
    const ys = w.enemies.map((e) => e.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(120);
  });

  it('moves smoothly: no per-tick jumps beyond a sprint', () => {
    const w = swarm(25);
    let seq = 0;
    const last = new Map(w.enemies.map((e) => [e.id, { x: e.x, y: e.y }]));
    let worst = 0;
    for (let t = 0; t < 30 * 6; t++) {
      applyInput(w, 1, { ...emptyInput(), seq: ++seq });
      stepWorld(w, TICK_DT);
      for (const e of w.enemies) {
        const p = last.get(e.id)!;
        if (t >= 5) worst = Math.max(worst, Math.hypot(e.x - p.x, e.y - p.y));
        last.set(e.id, { x: e.x, y: e.y });
      }
    }
    expect(worst).toBeLessThan(195 * 2.4 * TICK_DT + 8);
  });
});
