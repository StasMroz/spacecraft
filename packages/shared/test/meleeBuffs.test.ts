import { describe, expect, it } from 'vitest';
import { PLAYER, TICK_DT } from '../src/constants.js';
import { defaultContent, sustainedDps } from '../src/data/index.js';
import {
  applyInput,
  createWorld,
  damagePlayer,
  emptyInput,
  grantWeapon,
  stepWorld,
  type World,
} from '../src/sim/index.js';
import { spawnEnemy } from '../src/sim/systems/director.js';

/** Burst / sustained DPS vs termagant / warrior / carnifex before this buff pass. */
const BEFORE: Record<string, [number, number, number]> = {
  power_sword: [46.5, 27.9, 9.3],
  encarmine_blade: [50.5, 30.3, 10.1],
  heavenfall_blade: [57.1, 35.7, 14.3],
  thunder_hammer: [75.5, 50.4, 15.1],
  frost_axe: [71.4, 47.6, 14.3],
  forge_hammer: [75.3, 50.2, 15.1],
  power_glaive: [48.1, 28.9, 9.6],
  lightning_claws: [73.9, 30.8, 9.2],
};

const REACH_BEFORE: Record<string, number> = {
  power_sword: 40,
  encarmine_blade: 38,
  heavenfall_blade: 44,
  thunder_hammer: 44,
  frost_axe: 42,
  forge_hammer: 43,
  power_glaive: 54,
  lightning_claws: 30,
};

const foes = ['termagant', 'warrior', 'carnifex'].map((id) => defaultContent.enemy(id));

function world(chapter = 0): World {
  const w = createWorld([{ id: 1, name: 'M1', chapter }], 3);
  w.director.idle = true;
  w.enemies = [];
  return w;
}

describe('chapter melee buffs', () => {
  it('every chapter melee is clearly stronger (~40–60% DPS) and reaches farther', () => {
    for (const [id, before] of Object.entries(BEFORE)) {
      const w = defaultContent.weapon(id);
      expect(w.melee).toBe(true);
      expect(w.meleeLifesteal).toBeGreaterThan(0);
      expect(w.meleeResist).toBeGreaterThan(0);
      expect(w.meleeFx!.reach!).toBeGreaterThan(REACH_BEFORE[id]!);
      const now = foes.map((e) => sustainedDps(w, e));
      for (let i = 0; i < 3; i++) {
        const ratio = now[i]! / before[i]!;
        expect(ratio, `${id} vs ${foes[i]!.id}`).toBeGreaterThanOrEqual(1.4);
        expect(ratio, `${id} vs ${foes[i]!.id} cap`).toBeLessThanOrEqual(1.7);
      }
    }
  });

  it('a connecting swing heals a fraction of the damage dealt', () => {
    const w = world(0);
    const p = w.players[0]!;
    grantWeapon(w, p, 'power_sword');
    p.current = 'power_sword';
    p.hp = 40;
    p.x = 600;
    p.y = 600;
    p.aim = 0;
    p.invuln = 0;
    const e = spawnEnemy(w, 'termagant', 640, 600);
    e.hp = e.maxHp = 1e9;
    const hp0 = p.hp;
    for (let t = 0; t < 20; t++) {
      applyInput(w, 1, { ...emptyInput(), seq: t + 1, fire: t === 0, aim: 0 });
      stepWorld(w, TICK_DT);
    }
    expect(e.hp).toBeLessThan(1e9);
    expect(p.hp).toBeGreaterThan(hp0);
    expect(p.hp).toBeLessThanOrEqual(PLAYER.maxHp);
  });

  it('incoming hits are reduced while the swing is in motion', () => {
    const w = world(0);
    const p = w.players[0]!;
    grantWeapon(w, p, 'power_sword');
    p.current = 'power_sword';
    p.x = 600;
    p.y = 600;
    p.invuln = 0;
    p.hp = 100;
    applyInput(w, 1, { ...emptyInput(), seq: 1, fire: true, aim: 0 });
    stepWorld(w, TICK_DT);
    expect(p.swing).toBeGreaterThan(0);
    p.invuln = 0;
    damagePlayer(w, p, 40);
    const resist = defaultContent.weapon('power_sword').meleeResist!;
    expect(p.hp).toBeCloseTo(100 - 40 * (1 - resist), 5);
  });
});
