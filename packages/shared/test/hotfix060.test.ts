/** v0.6.0 hotfix: weapons unlock by wave (not time), more crates (+50%) and medkits (+20%). */
import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { CRATE_DROP_FACTOR, defaultContent, MEDKIT_DROP_FACTOR } from '../src/data/index.js';
import { createWorld, dropCaps, dropRates, stepWorld, type World } from '../src/sim/index.js';
import { killEnemy } from '../src/sim/systems/combat.js';

const cfg = defaultContent.director;
const ticks = (sec: number) => Math.ceil(sec / TICK_DT);

function world(teamSize = 1, seed = 7): World {
  return createWorld(
    Array.from({ length: teamSize }, (_, i) => ({ id: i + 1, name: `M${i + 1}` })),
    seed,
  );
}
const immortal = (w: World) => {
  for (const p of w.players) {
    p.maxHp = 1e9;
    p.hp = 1e9;
  }
};

describe('weapon unlocks by wave (v0.6.0 hotfix)', () => {
  it('every weapon is a starter, a wave unlock (integer) or crate-only', () => {
    for (const w of defaultContent.weaponOrder) {
      if (w.unlockAtWave !== null) expect(Number.isInteger(w.unlockAtWave)).toBe(true);
    }
    const rows = defaultContent.weaponOrder.map((w) => [w.id, w.unlockAtWave]);
    expect(rows).toContainEqual(['bolt_rifle', 0]);
    expect(rows).toContainEqual(['heavy_bolter', 3]);
    expect(rows).toContainEqual(['flamer', 4]);
    expect(rows).toContainEqual(['frost_axe', 2]);
    expect(rows).toContainEqual(['power_sword', 2]);
    expect(rows).toContainEqual(['thunder_hammer', 2]);
    expect(rows).not.toContainEqual(['chainsword', 2]);
    expect(rows).not.toContainEqual(['power_axe', 5]);
    expect(defaultContent.weapon('flamer').chapter).toBe('salamanders');
  });

  it('time alone unlocks nothing: 400 s without a new wave keeps the starting arsenal', () => {
    const w = world(2);
    w.director.idle = true; // the wave counter never advances
    const wave0 = w.director.wave;
    const owned0 = w.players.map((p) => [...p.weapons]);
    for (let i = 0; i < ticks(400); i++) {
      immortal(w);
      stepWorld(w, TICK_DT);
      expect(w.events.some((e) => e.e === 'unlock')).toBe(false);
    }
    expect(w.director.wave).toBe(wave0);
    expect(w.players.map((p) => [...p.weapons])).toEqual(owned0);
  });

  it('each weapon unlocks for every marine on the tick its wave starts (deterministic)', () => {
    const play = () => {
      const w = world(2);
      const log: string[] = [];
      for (let i = 0; i < ticks(2400) && w.director.wave < 8; i++) {
        immortal(w);
        for (const e of w.enemies) if (!e.dead) killEnemy(w, e, w.players[0]);
        const before = w.director.wave;
        stepWorld(w, TICK_DT);
        for (const e of w.events)
          if (e.e === 'unlock') {
            expect(w.director.wave).toBe(defaultContent.weapon(e.w).unlockAtWave);
            expect(w.director.wave).toBe(before + 1); // the start of that wave
            log.push(`${w.tick}:${e.p}:${e.w}`);
          }
      }
      expect(w.director.wave).toBeGreaterThanOrEqual(7);
      for (const p of w.players) {
        const ch = defaultContent.chapter(p.chapter).id;
        expect(p.weapons.length).toBe(defaultContent.weaponsForChapter(ch).length);
        expect(p.weapons).toContain(defaultContent.chapter(p.chapter).specialWeapon);
        for (const wpn of p.weapons) {
          const def = defaultContent.weapon(wpn);
          if (def.chapter) expect(def.chapter).toBe(ch);
        }
      }
      return log;
    };
    const a = play();
    // 2 marines × (own melee, HB, own special, plasma, melta, frag)
    expect(a).toHaveLength(2 * 6);
    expect(play()).toEqual(a);
  });
});

describe('drops (v0.6.0 hotfix: crates ×1.5, medkits ×1.2)', () => {
  it('per-wave rates scale the v0.6.0 values for every team size', () => {
    expect(CRATE_DROP_FACTOR).toBe(1.5);
    expect(MEDKIT_DROP_FACTOR).toBe(1.2);
    for (let n = 1; n <= 8; n++) {
      const r = dropRates(cfg, n);
      expect(r.medkits).toBeCloseTo((2 + 0.5 * (n - 1)) * 1.2, 9);
      expect(r.crates).toBeCloseTo((1 + 0.25 * (n - 1)) * 1.5, 9);
    }
    expect(cfg.crates.intervalMin).toBeCloseTo(20 / 1.5, 9);
    expect(cfg.crates.intervalMax).toBeCloseTo(32 / 1.5, 9);
  });

  it('fractional rates carry between waves: the average is exact, not rounded away', () => {
    for (let n = 1; n <= 8; n++) {
      const r = dropRates(cfg, n);
      let med = 0;
      let cr = 0;
      for (let wave = 1; wave <= 10; wave++) {
        const c = dropCaps(cfg, n, wave);
        expect(Number.isInteger(c.medkits) && Number.isInteger(c.crates)).toBe(true);
        med += c.medkits;
        cr += c.crates;
      }
      expect(med).toBe(Math.round(r.medkits * 10));
      expect(cr).toBe(Math.round(r.crates * 10));
    }
    // solo: 1.5 crates → 2, 1, 2, 1 ...; 2.4 medkits → 2, 3, 2, 3, 2 ...
    expect([1, 2, 3, 4].map((k) => dropCaps(cfg, 1, k).crates)).toEqual([2, 1, 2, 1]);
    expect([1, 2, 3, 4, 5].map((k) => dropCaps(cfg, 1, k).medkits)).toEqual([2, 3, 2, 3, 2]);
  });

  it('Tyranid medkit drop chances are ×1.2 (capped at 100%)', () => {
    const chance = (id: string) => defaultContent.enemy(id).medkitDropChance;
    expect(chance('termagant')).toBeCloseTo(0.012, 9);
    expect(chance('genestealer')).toBeCloseTo(0.036, 9);
    expect(chance('warrior')).toBeCloseTo(0.18, 9);
    expect(chance('carnifex')).toBe(1);
  });
});
