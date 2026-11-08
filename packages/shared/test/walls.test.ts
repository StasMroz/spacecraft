import { describe, expect, it } from 'vitest';
import { PLAYER, TICK_DT } from '../src/constants.js';
import { COVER, WAVE_MAP, type WallDef } from '../src/maps/index.js';
import {
  applyInput,
  buildFlowField,
  createWorld,
  emptyInput,
  grantWeapon,
  insideWall,
  stepPlayerMovement,
  stepWorld,
  type GameEvent,
  type World,
} from '../src/sim/index.js';
import { spawnEnemy } from '../src/sim/systems/director.js';

function world(walls: WallDef[], seed = 3): World {
  const w = createWorld([{ id: 1, name: 'M1' }], seed);
  w.map = { ...w.map, walls };
  w.director.idle = true;
  const p = w.players[0];
  p.x = 600;
  p.y = 600;
  p.hp = p.maxHp = 1e9;
  return w;
}

let seq = 0;
function run(
  w: World,
  ticks: number,
  input: Partial<ReturnType<typeof emptyInput>> = {},
): GameEvent[] {
  const evs: GameEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    applyInput(w, 1, { ...emptyInput(), seq: ++seq, ...input });
    stepWorld(w, TICK_DT);
    evs.push(...w.events);
  }
  return evs;
}

const full = (x: number, y: number, w: number, h: number): WallDef => ({
  x,
  y,
  w,
  h,
  kind: 'full',
});
const low = (x: number, y: number, w: number, h: number): WallDef => ({ x, y, w, h, kind: 'low' });

describe('wave map walls', () => {
  const m = WAVE_MAP;
  it('keep breaches, vents and the deploy ring clear', () => {
    for (const sp of m.director.spawnPoints)
      expect(insideWall(m.walls, sp.x, sp.y, 120)).toBe(false);
    const ring = Math.max(m.playerSpawn.ringMin, 8 * m.playerSpawn.ringPerMarine) + PLAYER.radius;
    expect(insideWall(m.walls, m.playerSpawn.x, m.playerSpawn.y, ring + 40)).toBe(false);
  });

  it('leave every open cell reachable from the deploy zone (no sealed pockets)', () => {
    const f = buildFlowField(m.arena, m.walls, [m.playerSpawn]);
    for (let i = 0; i < f.dist.length; i++) {
      const x = ((i % f.cols) + 0.5) * f.cell;
      const y = (Math.floor(i / f.cols) + 0.5) * f.cell;
      if (!insideWall(m.walls, x, y, 14))
        expect(f.dist[i], `cell ${x},${y}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('has both kinds', () => {
    expect(m.walls.some((w) => w.kind === 'full')).toBe(true);
    expect(m.walls.some((w) => w.kind === 'low')).toBe(true);
  });
});

describe('movement', () => {
  it.each(['full', 'low'] as const)('a marine cannot walk through a %s wall', (kind) => {
    const walls = [{ x: 650, y: 400, w: 32, h: 400, kind }];
    const pos = { x: 600, y: 600 };
    for (let i = 0; i < 90; i++)
      stepPlayerMovement(pos, 1, 0, PLAYER.speed, TICK_DT, { arena: WAVE_MAP.arena, walls });
    expect(pos.x).toBeCloseTo(650 - PLAYER.radius, 6);
  });

  it('a Tyranid walks around a full wall to reach the marine', () => {
    const w = world([full(700, 300, 32, 600)]);
    const e = spawnEnemy(w, 'hormagaunt', 900, 600);
    let reached = false;
    for (let t = 0; t < 30 * 12 && !reached; t++) {
      run(w, 1);
      expect(insideWall(w.map.walls, e.x, e.y, 13 - 0.5)).toBe(false);
      reached = Math.hypot(e.x - 600, e.y - 600) < 60;
    }
    expect(reached).toBe(true);
  });
});

describe('melee and line of sight', () => {
  it('no bites across low cover', () => {
    const w = world([low(630, 450, 32, 300)]);
    spawnEnemy(w, 'hormagaunt', 680, 600);
    const evs = run(w, 60);
    expect(evs.filter((e) => e.e === 'bite')).toHaveLength(0);
  });

  it('a spitter only fires with sight past full walls, and over low cover', () => {
    const spits = (walls: WallDef[]) => {
      const w = world(walls, 5);
      const e = spawnEnemy(w, 'termagant', 950, 600);
      e.attackCooldown = 0;
      let n = 0;
      for (let t = 0; t < 30; t++) {
        e.x = 950;
        e.y = 600;
        n += run(w, 1).filter((x) => x.e === 'spit').length;
      }
      return n;
    };
    expect(spits([full(760, 450, 32, 300)])).toBe(0);
    expect(spits([low(760, 450, 32, 300)])).toBeGreaterThan(0);
  });
});

describe('projectiles', () => {
  const shoot = (walls: WallDef[], enemyX: number, seed = 1, weapon = 'bolt_rifle') => {
    const w = world(walls, seed);
    const p = w.players[0];
    grantWeapon(w, p, weapon);
    p.current = weapon;
    const e = spawnEnemy(w, 'carnifex', enemyX, 600);
    e.hp = e.maxHp = 1e9;
    const hp0 = e.hp;
    const evs: GameEvent[] = [];
    for (let t = 0; t < 40; t++) {
      e.x = enemyX;
      e.y = 600;
      evs.push(...run(w, 1, { aim: 0, fire: t < 2 }));
    }
    return { hit: e.hp < hp0 || evs.some((x) => x.e === 'bnc' && x.x > enemyX - 60), evs };
  };

  it('a full wall stops shots and blasts', () => {
    expect(shoot([], 900).hit).toBe(true);
    expect(shoot([full(750, 400, 32, 400)], 900).hit).toBe(false);
    expect(shoot([full(750, 400, 32, 400)], 900, 1, 'frag_grenade').hit).toBe(false);
  });

  /** One shot only; `hit` = the target took damage, `stopX` = where it sparked on a wall. */
  const once = (walls: WallDef[], enemyX: number, seed: number, weapon = 'bolt_rifle') => {
    const w = world(walls, seed);
    const p = w.players[0];
    grantWeapon(w, p, weapon);
    p.current = weapon;
    const e = spawnEnemy(w, 'carnifex', enemyX, 600);
    e.hp = e.maxHp = 1e9;
    const evs: GameEvent[] = [];
    for (let t = 0; t < 40; t++) {
      e.x = enemyX;
      e.y = 600;
      evs.push(...run(w, 1, { aim: 0, fire: t === 0 }));
    }
    const shots = evs.filter((x) => x.e === 'shot').length;
    const stop = evs.find((x) => x.e === 'bnc' && x.x < enemyX - 60);
    // reached the target = damaged it or bounced off its carapace (Carnifex armour)
    const reached = e.hp < 1e9 || evs.some((x) => x.e === 'bnc' && x.x > enemyX - 60);
    return { hit: reached, stopX: stop && 'x' in stop ? stop.x : null, shots, evs };
  };
  const rate = (f: (s: number) => boolean, n = 200) => {
    let k = 0;
    for (let s = 1; s <= n; s++) if (f(s)) k++;
    return k / n;
  };

  it(`far low cover stops ~${COVER.stopChance * 100}% of shots ON the cover, the rest hit behind it`, () => {
    let stopped = 0;
    let hit = 0;
    const n = 200;
    for (let s = 1; s <= n; s++) {
      const r = once([low(800, 400, 32, 400)], 1000, s);
      expect(r.shots).toBe(1);
      expect(r.hit && r.stopX !== null).toBe(false); // never both
      if (r.stopX !== null) {
        stopped++;
        expect(r.stopX).toBeGreaterThanOrEqual(790);
        expect(r.stopX).toBeLessThanOrEqual(802);
      }
      if (r.hit) hit++;
    }
    expect(stopped + hit).toBe(n);
    expect(stopped / n).toBeGreaterThan(COVER.stopChance - 0.1);
    expect(stopped / n).toBeLessThan(COVER.stopChance + 0.1);
  });

  it('one roll per shot and wall: a thick barricade does not stop more often', () => {
    const thin = rate((s) => once([low(800, 400, 32, 400)], 1100, s).hit);
    const thick = rate((s) => once([low(800, 400, 200, 400)], 1100, s).hit);
    expect(Math.abs(thin - thick)).toBeLessThan(0.12);
  });

  it('two far barricades: rolled separately (~25% get through both)', () => {
    const r = rate((s) => once([low(760, 400, 24, 400), low(900, 400, 24, 400)], 1100, s).hit);
    expect(r).toBeGreaterThan(0.15);
    expect(r).toBeLessThan(0.35);
  });

  it(`cover up to ${COVER.ignoreNear} px from the shooter is always fired over; just beyond it rolls`, () => {
    // marine centre at x=600, the muzzle origin is the marine
    expect(rate((s) => once([low(600 + COVER.ignoreNear, 400, 32, 400)], 1000, s).hit, 60)).toBe(1);
    expect(rate((s) => once([low(630, 400, 32, 400)], 1000, s).hit, 60)).toBe(1);
    expect(
      rate((s) => once([low(600 + COVER.ignoreNear + 4, 400, 32, 400)], 1000, s).hit, 120),
    ).toBeLessThan(0.75);
  });

  it('same seed, same decision (deterministic, no per-tick reroll)', () => {
    for (let s = 1; s <= 20; s++) {
      const a = once([low(800, 400, 32, 400)], 1000, s);
      const b = once([low(800, 400, 32, 400)], 1000, s);
      expect([a.hit, a.stopX]).toEqual([b.hit, b.stopX]);
    }
  });

  it('a target standing before far cover is hit normally', () => {
    expect(rate((s) => once([low(900, 400, 32, 400)], 800, s).hit, 60)).toBe(1);
  });

  it('Tyranid spit: fired over near cover, ~half stopped by far cover, never through a full wall', () => {
    const hits = (walls: WallDef[], seeds = 40) => {
      let k = 0;
      for (let s = 1; s <= seeds; s++) {
        const w = world(walls, s);
        w.players[0].aim = Math.PI; // back to the spitter: no front-plate ricochet
        const e = spawnEnemy(w, 'termagant', 950, 600);
        e.attackCooldown = 0;
        let fired = false;
        for (let t = 0; t < 60; t++) {
          e.x = 950;
          e.y = 600;
          const ev = run(w, 1, { aim: Math.PI });
          if (ev.some((x) => x.e === 'spit')) fired = true;
          if (fired) e.attackCooldown = 99; // exactly one spit
        }
        if (w.players[0].hp < 1e9) k++;
      }
      return k / seeds;
    };
    const open = hits([], 80); // spit has spread: not every one lands even in the open
    expect(hits([low(900, 450, 32, 300)], 80)).toBe(open); // within 70 of the spitter: free
    const far = hits([low(760, 450, 32, 300)], 80);
    expect(far / open).toBeGreaterThan(0.3);
    expect(far / open).toBeLessThan(0.7);
    expect(hits([full(760, 450, 32, 300)])).toBe(0);
  });

  it('firing over your own cover is free', () => {
    for (let s = 1; s <= 30; s++) expect(shoot([low(630, 400, 32, 400)], 900, s).hit).toBe(true);
  });
});

describe('determinism with walls', () => {
  it('same seed, same world', () => {
    const go = () => {
      const w = createWorld([{ id: 1, name: 'M1' }], 42);
      w.players[0].hp = w.players[0].maxHp = 1e9;
      for (let t = 0; t < 30 * 40; t++) {
        applyInput(w, 1, { ...emptyInput(), seq: t + 1, fire: true, aim: 1 });
        stepWorld(w, TICK_DT);
      }
      return JSON.stringify({ e: w.enemies, p: w.players, t: w.tick });
    };
    expect(go()).toBe(go());
  });
});
