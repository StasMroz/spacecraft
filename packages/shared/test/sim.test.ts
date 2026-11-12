import { describe, expect, it } from 'vitest';
import { ARENA, PLAYER, TICK_DT } from '../src/constants.js';
import {
  applyInput,
  createWorld,
  damagePlayer,
  emptyInput,
  stepPlayerMovement,
  stepWorld,
  type World,
} from '../src/sim/index.js';
import { segmentDist2 } from '../src/sim/systems/projectiles.js';

const tick = (w: World, n: number) => {
  for (let i = 0; i < n; i++) stepWorld(w, TICK_DT);
};

describe('movement', () => {
  it('normalizes diagonals and clamps to the arena', () => {
    const p = { x: 500, y: 500 };
    stepPlayerMovement(p, 1, 1, 100, 1);
    expect(Math.hypot(p.x - 500, p.y - 500)).toBeCloseTo(100, 5);
    const q = { x: 5, y: 5 };
    stepPlayerMovement(q, -1, -1, 1000, 1);
    expect(q.x).toBe(PLAYER.radius);
    expect(q.y).toBe(PLAYER.radius);
    const r = { x: ARENA.width - 1, y: 10 };
    stepPlayerMovement(r, 1, 0, 1000, 1);
    expect(r.x).toBe(ARENA.width - PLAYER.radius);
  });
});

describe('segment collision', () => {
  it('measures distance to a segment, not just its endpoint', () => {
    // point right in the middle of a long segment: a point-only test would miss it
    expect(segmentDist2(0, 0, 100, 0, 50, 3)).toBeCloseTo(9);
    expect(segmentDist2(0, 0, 100, 0, -10, 0)).toBeCloseTo(100);
    expect(segmentDist2(0, 0, 0, 0, 3, 4)).toBeCloseTo(25);
  });
});

describe('simulation', () => {
  it('is deterministic for the same seed and inputs', () => {
    const run = () => {
      const w = createWorld([{ id: 1, name: 'A' }], 1234);
      for (let i = 0; i < 600; i++) {
        applyInput(w, 1, {
          ...emptyInput(),
          seq: i,
          mx: Math.sin(i / 30),
          my: 0,
          aim: i / 20,
          fire: true,
        });
        stepWorld(w, TICK_DT);
      }
      return {
        x: w.players[0].x,
        kills: w.stats.kills,
        enemies: w.enemies.length,
        rng: w.rng.getState(),
      };
    };
    expect(run()).toEqual(run());
  });

  it('shooting kills enemies and spends ammo', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 99);
    const p = w.players[0];
    let fired = false;
    for (let i = 0; i < 30 * 40 && w.stats.kills === 0; i++) {
      const target = w.enemies[0];
      const aim = target ? Math.atan2(target.y - p.y, target.x - p.x) : 0;
      applyInput(w, 1, { ...emptyInput(), seq: i, aim, fire: !!target });
      stepWorld(w, TICK_DT);
      if (target && w.stats.shots > 0) fired = true;
    }
    expect(fired).toBe(true);
    expect(w.stats.kills).toBeGreaterThan(0);
  });

  it('swarm spawns over time', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 5);
    tick(w, 30 * 10);
    expect(w.enemies.length).toBeGreaterThan(0);
  });

  it('a downed marine is revived by a nearby teammate', () => {
    const w = createWorld(
      [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      3,
    );
    const [a, b] = w.players;
    b.x = a.x + 20;
    b.y = a.y;
    a.invuln = 0;
    damagePlayer(w, a, 10_000);
    expect(a.state).toBe('downed');
    w.enemies.length = 0;
    for (
      let i = 0;
      i < Math.ceil((PLAYER.reviveTime + 0.5) / TICK_DT) && a.state !== 'alive';
      i++
    ) {
      w.enemies.length = 0; // keep the test about reviving
      b.invuln = 10;
      stepWorld(w, TICK_DT);
    }
    expect(a.state).toBe('alive');
    expect(a.hp).toBeCloseTo(a.maxHp * PLAYER.reviveHpFraction);
  });

  it('game is over when nobody is left standing and the reinforcement budget is empty', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 8);
    const a = w.players[0];
    a.invuln = 0;
    w.reinforce.left = 0;
    damagePlayer(w, a, 10_000);
    stepWorld(w, TICK_DT);
    expect(w.over).toBe(true);
    expect(a.state).toBe('dead');
  });

  it('a solo marine who never shoots is eventually overrun', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 77);
    while (!w.over && w.time < 600) stepWorld(w, TICK_DT);
    expect(w.over).toBe(true);
  });
});
