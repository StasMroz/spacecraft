import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { ENEMIES } from '../src/data/enemies.js';
import type { WallDef } from '../src/maps/index.js';
import { buildSnapshot, createWorld, ENEMY_FLAG, stepWorld, type World } from '../src/sim/index.js';
import { damageEnemy } from '../src/sim/systems/combat.js';
import { buildRoster, spawnEnemy } from '../src/sim/systems/director.js';

const phage = ENEMIES.find((e) => e.id === 'psychophage')!;
const stim = phage.stim!;

function world(walls: WallDef[] = [], seed = 9): World {
  const w = createWorld([{ id: 1, name: 'M1' }], seed);
  w.map = { ...w.map, walls };
  w.director.idle = true;
  const p = w.players[0]!;
  p.x = 1400;
  p.y = 1400;
  p.hp = p.maxHp = 1e9;
  return w;
}
const tick = (w: World, n = 1) => {
  for (let i = 0; i < n; i++) stepWorld(w, TICK_DT);
};

describe('Psychophage (support boss)', () => {
  it('is a weak-hitting large boss with an aura', () => {
    const carn = ENEMIES.find((e) => e.id === 'carnifex')!;
    expect(phage.boss).toBe(true);
    expect(phage.size).toBe('large');
    expect(phage.contactDamage).toBeLessThan(carn.contactDamage);
    expect(phage.ranged!.projectile.damage).toBeLessThan(5);
  });

  it('buffs visible Tyranids in range, not beyond it, not behind a full wall', () => {
    const w = world([{ x: 590, y: 700, w: 20, h: 200, kind: 'full' }]);
    spawnEnemy(w, 'psychophage', 500, 500);
    const near = spawnEnemy(w, 'hormagaunt', 600, 500);
    const far = spawnEnemy(w, 'hormagaunt', 500 + stim.radius + 60, 500);
    const hidden = spawnEnemy(w, 'hormagaunt', 680, 800);
    w.enemies[0]!.x = 500;
    w.enemies[0]!.y = 800; // phage left of the wall, hidden right of it
    w.enemies[0]!.x = 520;
    near.x = 560;
    near.y = 760;
    tick(w);
    expect(near.stimTaken).toBe(stim.damageTakenMul);
    expect(near.synSpeed).toBe(stim.speedMul);
    expect(far.stimTaken).toBe(1);
    expect(hidden.stimTaken).toBe(1);
    expect(w.enemies[0]!.stimTaken).toBe(1); // not itself
    const snap = buildSnapshot(w, 60);
    const flags = (id: number) => snap.enemies.find((e) => e[0] === id)![6];
    expect(flags(near.id) & ENEMY_FLAG.stim).toBeTruthy();
    expect(flags(far.id) & ENEMY_FLAG.stim).toBe(0);
  });

  it('never stacks: two sources plus a Warrior give the single best value per stat', () => {
    const w = world();
    spawnEnemy(w, 'psychophage', 500, 500);
    spawnEnemy(w, 'psychophage', 520, 520);
    spawnEnemy(w, 'warrior', 480, 520);
    const g = spawnEnemy(w, 'hormagaunt', 540, 500);
    tick(w);
    const syn = ENEMIES.find((e) => e.id === 'warrior')!.synapse!;
    expect(g.stimTaken).toBe(stim.damageTakenMul);
    expect(g.synSpeed).toBe(Math.max(syn.speedMul, stim.speedMul));
    expect(g.synDamage).toBe(Math.max(syn.damageMul, stim.damageMul));
  });

  it('a stimmed beast takes less damage; killing the Psychophage lifts the buff at once', () => {
    const w = world();
    const ph = spawnEnemy(w, 'psychophage', 500, 500);
    const g = spawnEnemy(w, 'hormagaunt', 560, 500);
    g.hp = g.maxHp = 1000;
    tick(w);
    damageEnemy(w, g, 100);
    expect(1000 - g.hp).toBeCloseTo(100 * stim.damageTakenMul, 6);
    damageEnemy(w, ph, 1e6);
    tick(w);
    expect(g.stimTaken).toBe(1);
    expect(g.synSpeed).toBe(1);
  });

  it('a stimmed pack surrounds the marine instead of queueing from one side', () => {
    const sectors = (withPhage: boolean) => {
      const w = world();
      if (withPhage) spawnEnemy(w, 'psychophage', 1400, 900);
      const pack = Array.from({ length: 10 }, (_, k) =>
        spawnEnemy(w, 'hormagaunt', 1300 + k * 20, 950 + (k % 2) * 20),
      );
      // keep the phage's aura on the pack: it sits with them
      let best = 0;
      for (let t = 0; t < 400; t++) {
        tick(w);
        const ph = w.enemies.find((e) => e.type === 'psychophage');
        if (ph) {
          ph.x = 1400;
          ph.y = 1330;
        }
        const inner = pack.filter((e) => Math.hypot(e.x - 1400, e.y - 1400) < 150);
        if (inner.length < 8) continue;
        // first moment most of the pack has arrived: how many 60° sides does it cover?
        best = new Set(
          inner.map((e) =>
            Math.floor(((Math.atan2(e.y - 1400, e.x - 1400) + Math.PI) / (2 * Math.PI)) * 6),
          ),
        ).size;
        break;
      }
      return best;
    };
    const plain = sectors(false);
    const stimmed = sectors(true);
    expect(stimmed).toBeGreaterThan(plain);
    expect(stimmed).toBeGreaterThanOrEqual(3); // at least half way round (6 sides)
  });

  it('joins wave 5 and every 3rd wave after, never a Carnifex wave', () => {
    const w = world();
    const has = (wave: number) => buildRoster(w, wave).some((g) => g.type === 'psychophage');
    expect([3, 4, 5, 6, 7, 8, 9, 11].map(has)).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
      false,
      true,
    ]);
    const n = buildRoster(w, 8)
      .filter((g) => g.type === 'psychophage')
      .reduce((s, g) => s + g.n, 0);
    expect(n).toBe(1);
  });

  it('finds its way round walls to the marine (no wave softlock)', () => {
    const w = world([{ x: 900, y: 1000, w: 900, h: 30, kind: 'full' }]);
    const ph = spawnEnemy(w, 'psychophage', 1400, 600);
    tick(w, Math.round(40 / TICK_DT));
    expect(Math.hypot(ph.x - 1400, ph.y - 1400)).toBeLessThan(500);
  });
});
