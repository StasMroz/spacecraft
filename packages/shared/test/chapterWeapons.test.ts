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
      expect(list.filter((w) => w.melee).map((w) => w.id)).toEqual([c.meleeWeapon]);
      expect(list.some((w) => w.id === 'chainsword' || w.id === 'power_axe')).toBe(false);
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
    expect(seen.has('power_sword') || seen.has('heavy_bolter')).toBe(true);
  });

  it('melee swings do not spend ammo and stay ready', () => {
    const w = world();
    const p = w.players[0]!;
    const melee = w.content.chapter(p.chapter).meleeWeapon;
    grantWeapon(w, p, melee);
    p.current = melee;
    const ammo0 = p.ammo[melee];
    let slashes = 0;
    for (let i = 0; i < 12; i++) {
      applyInput(w, p.id, { ...emptyInput(), seq: i + 1, fire: true, aim: 0 });
      stepWorld(w, TICK_DT);
      slashes += w.projectiles.filter((pr) => pr.kind === 'slash').length;
    }
    expect(p.ammo[melee]).toBe(ammo0);
    expect(slashes).toBeGreaterThan(0);
    expect(p.reloadTimer).toBe(0);
    // Swing is set on the shot and counts down independently of recovery; check mid-cycle.
    const w2 = world();
    const p2 = w2.players[0]!;
    const melee2 = w2.content.chapter(p2.chapter).meleeWeapon;
    grantWeapon(w2, p2, melee2);
    p2.current = melee2;
    applyInput(w2, p2.id, { ...emptyInput(), seq: 1, fire: true, aim: 0 });
    stepWorld(w2, TICK_DT);
    expect(p2.swing).toBeGreaterThan(0);
    const dur = w2.content.weapon(melee2).meleeFx!.duration;
    expect(p2.swing).toBeLessThanOrEqual(dur);
    const mid = p2.swing;
    stepWorld(w2, TICK_DT);
    expect(p2.swing).toBeLessThan(mid);
  });

  it('each chapter has exactly one melee on slot 7, and the old three are gone', () => {
    const expected: Record<string, string> = {
      ultramarines: 'power_sword',
      blood_angels: 'encarmine_blade',
      dark_angels: 'heavenfall_blade',
      imperial_fists: 'thunder_hammer',
      space_wolves: 'frost_axe',
      salamanders: 'forge_hammer',
      white_scars: 'power_glaive',
      raven_guard: 'lightning_claws',
    };
    for (const gone of ['chainsword', 'power_axe']) {
      expect(defaultContent.weapons.has(gone)).toBe(false);
    }
    const melees = defaultContent.weaponOrder.filter((w) => w.melee);
    expect(melees).toHaveLength(defaultContent.chapters.length);
    const slots = new Set(melees.map((w) => w.slot));
    expect([...slots]).toEqual([7]);
    for (const c of defaultContent.chapters) {
      expect(c.meleeWeapon).toBe(expected[c.id]);
      const w = defaultContent.weapon(c.meleeWeapon);
      expect(w.melee).toBe(true);
      expect(w.chapter).toBe(c.id);
      expect(w.slot).toBe(7);
      expect(w.unlockAtWave).toBe(2);
      expect(w.meleeFx?.motion).toBeTruthy();
      expect(w.meleeFx?.duration).toBeGreaterThan(0);
    }
    expect(defaultContent.validate()).toEqual([]);
  });

  it('chapter melee profiles stay in the old speed-for-power band', () => {
    const claws = defaultContent.weapon('lightning_claws');
    const hammer = defaultContent.weapon('thunder_hammer');
    const axe = defaultContent.weapon('frost_axe');
    expect(claws.fireInterval).toBeLessThan(axe.fireInterval);
    expect(axe.fireInterval).toBeLessThan(hammer.fireInterval);
    expect(claws.projectile.damage).toBeLessThan(axe.projectile.damage);
    expect(axe.projectile.damage).toBeLessThan(hammer.projectile.damage);
    expect(claws.spread).toBeLessThan(hammer.spread);
    expect(defaultContent.weapon('power_glaive').spread).toBeGreaterThan(
      defaultContent.weapon('heavenfall_blade').spread,
    );
  });

  it('picking up another chapter melee grants your own instead', () => {
    const w = world(0); // ultramarines
    const p = w.players[0]!;
    expect(resolvePickupWeapon(w, p, 'frost_axe')).toBe('power_sword');
    expect(resolvePickupWeapon(w, p, 'storm_bolter')).toBe('storm_bolter');
    w.pickups.push({
      id: 10,
      kind: 'weapon',
      weapon: 'frost_axe',
      x: p.x,
      y: p.y,
      life: 10,
    });
    stepWorld(w, TICK_DT);
    expect(p.weapons).toContain('power_sword');
    expect(p.weapons).not.toContain('frost_axe');
  });
});
