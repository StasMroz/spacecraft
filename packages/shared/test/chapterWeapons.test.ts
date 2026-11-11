import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { defaultContent } from '../src/data/index.js';
import { createWorld, emptyInput, applyInput, stepWorld, type World } from '../src/sim/index.js';
import { grantWeapon } from '../src/sim/systems/weapons.js';
import { resolvePickupWeapon } from '../src/sim/systems/pickups.js';
import { spawnCrate } from '../src/sim/systems/director.js';

function world(chapter = 0, seed = 3): World {
  const w = createWorld([{ id: 1, name: 'M1', chapter }], seed);
  w.director.idle = true;
  return w;
}

describe('chapter specials and melee', () => {
  it('each chapter has a distinct slot-3 special, and weaponsForChapter hides the others', () => {
    const ids = defaultContent.chapters.map((c) => c.specialWeapon);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of defaultContent.chapters) {
      const list = defaultContent.weaponsForChapter(c.id);
      expect(list.filter((w) => w.slot === 3).map((w) => w.id)).toEqual([c.specialWeapon]);
      expect(list.some((w) => w.id === 'chainsword')).toBe(true);
      expect(list.some((w) => w.chapter && w.chapter !== c.id)).toBe(false);
    }
    expect(defaultContent.validate()).toEqual([]);
  });

  it('picking up another chapter special grants your own instead', () => {
    const w = world(0); // ultramarines
    const p = w.players[0]!;
    expect(resolvePickupWeapon(w, p, 'flamer')).toBe('storm_bolter');
    expect(resolvePickupWeapon(w, p, 'bolt_rifle')).toBe('bolt_rifle');
    w.pickups.push({
      id: 9,
      kind: 'weapon',
      weapon: 'flamer',
      x: p.x,
      y: p.y,
      life: 10,
    });
    stepWorld(w, TICK_DT);
    expect(p.weapons).toContain('storm_bolter');
    expect(p.weapons).not.toContain('flamer');
  });

  it('crates only roll a chapter special if a living marine of that chapter needs it', () => {
    const w = world(0, 11);
    const p = w.players[0]!;
    grantWeapon(w, p, 'storm_bolter', { announce: false });
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      w.pickups = [];
      spawnCrate(w);
      const pk = w.pickups[0];
      if (pk?.weapon) seen.add(pk.weapon);
    }
    expect(seen.has('storm_bolter')).toBe(false);
    expect(seen.has('flamer')).toBe(false); // no Salamander in this squad
    expect(seen.has('chainsword') || seen.has('heavy_bolter')).toBe(true);
  });

  it('melee swings do not spend ammo and stay ready', () => {
    const w = world();
    const p = w.players[0]!;
    grantWeapon(w, p, 'chainsword');
    p.current = 'chainsword';
    const ammo0 = p.ammo.chainsword;
    let slashes = 0;
    for (let i = 0; i < 12; i++) {
      applyInput(w, p.id, { ...emptyInput(), seq: i + 1, fire: true, aim: 0 });
      stepWorld(w, TICK_DT);
      slashes += w.projectiles.filter((pr) => pr.kind === 'slash').length;
    }
    expect(p.ammo.chainsword).toBe(ammo0);
    expect(slashes).toBeGreaterThan(0);
    expect(p.reloadTimer).toBe(0);
  });

  it('the three melee weapons trade speed for damage and arc', () => {
    const sword = defaultContent.weapon('chainsword');
    const axe = defaultContent.weapon('power_axe');
    const hammer = defaultContent.weapon('thunder_hammer');
    expect(sword.fireInterval).toBeLessThan(axe.fireInterval);
    expect(axe.fireInterval).toBeLessThan(hammer.fireInterval);
    expect(sword.projectile.damage).toBeLessThan(axe.projectile.damage);
    expect(axe.projectile.damage).toBeLessThan(hammer.projectile.damage);
    expect(sword.spread).toBeLessThan(axe.spread);
    expect(axe.spread).toBeLessThan(hammer.spread);
    expect(sword.melee && axe.melee && hammer.melee).toBe(true);
  });
});
