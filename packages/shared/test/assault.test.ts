import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { getMission } from '../src/data/missions.js';
import { createWorld, stepWorld } from '../src/sim/index.js';
import { damageEnemy } from '../src/sim/systems/combat.js';
import { damageObjective } from '../src/sim/systems/mission.js';

function world(mission: string, seed = 3) {
  const w = createWorld([{ id: 1, name: 'A' }], seed, undefined, undefined, mission);
  w.director.idle = false;
  return w;
}

const steps = (w: ReturnType<typeof world>, n: number) => {
  for (let i = 0; i < n; i++) stepWorld(w, TICK_DT);
};

describe('assault missions', () => {
  it('hive_siege still starts empty and eventually opens a wave from the edge', () => {
    const w = world('hive_siege', 1);
    expect(getMission('hive_siege').assault).toBeUndefined();
    expect(w.enemies.length).toBe(0);
    expect(w.director.wave).toBe(0);
    steps(w, Math.ceil(8 / TICK_DT));
    expect(w.director.wave).toBeGreaterThanOrEqual(1);
  });

  it('each chapter catalogue field used by the menu is present (special + melee)', () => {
    // smoke: assault file shouldn't have broken the default content import path
    expect(getMission('hold_the_line').assault).toBe(true);
    expect(getMission('synapse_purge').nests).toBeTruthy();
  });

  it('hold_the_line lands the squad at the drop zone among already-placed Tyranids and a boss', () => {
    const w = world('hold_the_line');
    const def = getMission('hold_the_line');
    expect(w.enemies.length).toBeGreaterThan(5);
    expect(w.director.wave).toBe(0);
    const p = w.players[0]!;
    expect(Math.hypot(p.x - def.start![0], p.y - def.start![1])).toBeLessThan(80);
    const boss = w.enemies.find((e) => e.id === w.mission.bossId);
    expect(boss?.type).toBe('carnifex');
    expect(boss!.maxHp).toBeGreaterThan(1000);
    expect(w.mission.extractOpen).toBe(false);
    const wave0 = w.director.wave;
    const n0 = w.enemies.length;
    steps(w, Math.ceil(10 / TICK_DT));
    expect(w.director.wave).toBe(wave0);
    // no edge-wave roster dump — count shouldn't explode
    expect(w.enemies.filter((e) => !e.dead).length).toBeLessThan(n0 + 8);
  });

  it('killing the hunt boss opens extract, and holding the zone wins', () => {
    const w = world('hold_the_line', 4);
    const boss = w.enemies.find((e) => e.id === w.mission.bossId)!;
    boss.hp = 1;
    damageEnemy(w, boss, 5000, { strength: 10, ap: 4, sourcePlayerId: 1 });
    expect(boss.dead).toBe(true);
    steps(w, 3);
    expect(w.mission.extractOpen).toBe(true);
    w.enemies.length = 0;
    const p = w.players[0]!;
    p.x = w.mission.extractX;
    p.y = w.mission.extractY;
    steps(w, Math.ceil((w.mission.extractHold + 0.2) / TICK_DT));
    expect(w.mission.outcome).toBe('victory');
  });

  it('synapse_purge pre-places enemies and a destroyed nest stops spawning', () => {
    const w = world('synapse_purge', 7);
    expect(w.enemies.length).toBeGreaterThan(5);
    expect(w.map.id).toBe('jungle');
    const nest = w.mission.targets[0]!;
    for (const t of w.mission.targets.slice(1)) damageObjective(w, t, t.hp);
    for (const e of w.enemies) {
      e.hp = 0;
      e.dead = true;
    }
    const alive = () => w.enemies.filter((e) => !e.dead).length;
    const before = alive();
    steps(w, Math.ceil(16 / TICK_DT));
    expect(alive()).toBeGreaterThan(before);
    damageObjective(w, nest, nest.hp);
    expect(nest.hp).toBe(0);
    const frozen = alive();
    steps(w, Math.ceil(16 / TICK_DT));
    expect(alive()).toBeLessThanOrEqual(frozen);
  });
});
