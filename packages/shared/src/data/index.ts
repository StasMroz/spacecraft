import { MAX_PLAYERS } from '../constants.js';
import { CHAPTERS } from './chapters.js';
import { CRATE_DROP_FACTOR, DIRECTOR, MEDKIT_DROP_FACTOR } from './director.js';
import { ENEMIES } from './enemies.js';
import { applyNamePreset, DEFAULT_SUBTITLE, DEFAULT_TITLE, NAME_PRESETS } from './naming.js';
import type { ChapterDef, DirectorConfig, EnemyDef, WeaponDef } from './types.js';
import { WEAPONS } from './weapons.js';
import { getMap, validateMapGeometry, WAVE_MAP, type MapDef } from '../maps/index.js';

export * from './types.js';
export * from './naming.js';
export * from './profile.js';
export * from './armour.js';
export * from './sprint.js';
export * from './guard.js';
export * from './muzzle.js';
export * from './recoil.js';
export * from './crash.js';
export { WEAPONS, ENEMIES, DIRECTOR, CHAPTERS, CRATE_DROP_FACTOR, MEDKIT_DROP_FACTOR };

/**
 * Content registry: indexed lookups + validation. Gameplay code should go
 * through the registry instead of importing the raw tables.
 */
export class ContentRegistry {
  readonly weapons: ReadonlyMap<string, WeaponDef>;
  readonly enemies: ReadonlyMap<string, EnemyDef>;
  /** Weapons sorted by slot. */
  readonly weaponOrder: readonly WeaponDef[];
  /** Enemy ids in wire order. */
  readonly enemyIds: readonly string[];
  readonly projectileKinds: readonly string[];
  /** Player colour schemes in wire order. */
  readonly chapters: readonly ChapterDef[];
  /**
   * The active map (arena, player spawn, director). `director` is always `map.director`; a
   * registry built from a bare director (tests, tools) gets the wave map with that director.
   */
  readonly map: MapDef;

  constructor(
    weapons: WeaponDef[],
    enemies: EnemyDef[],
    readonly director: DirectorConfig,
    chapters: ChapterDef[] = CHAPTERS,
    readonly title = DEFAULT_TITLE,
    readonly subtitle = DEFAULT_SUBTITLE,
    map?: MapDef,
  ) {
    const base = map ?? WAVE_MAP;
    this.map = base.director === director ? base : { ...base, director };
    this.chapters = chapters;
    this.weapons = new Map(weapons.map((w) => [w.id, w]));
    this.enemies = new Map(enemies.map((e) => [e.id, e]));
    this.weaponOrder = [...weapons].sort((a, b) => a.slot - b.slot);
    this.enemyIds = enemies.map((e) => e.id);
    const kinds = new Set<string>();
    for (const w of weapons) {
      kinds.add(w.projectile.kind);
      // Supercharged heat-weapon shots get their own visual.
      if (w.heat) kinds.add(`${w.projectile.kind}_super`);
    }
    for (const e of enemies) {
      if (e.ranged) kinds.add(e.ranged.projectile.kind);
      if (e.lobAttack) kinds.add(e.lobAttack.projectile.kind);
    }
    kinds.add('lasgun');
    this.projectileKinds = [...kinds];
  }

  weapon(id: string): WeaponDef {
    const w = this.weapons.get(id);
    if (!w) throw new Error(`Unknown weapon '${id}'`);
    return w;
  }

  enemy(id: string): EnemyDef {
    const e = this.enemies.get(id);
    if (!e) throw new Error(`Unknown enemy '${id}'`);
    return e;
  }

  /** Chapter by wire index (wraps, so it never throws). */
  chapter(index: number): ChapterDef {
    const n = this.chapters.length;
    return this.chapters[((index % n) + n) % n]!;
  }

  chapterIndex(id: string): number {
    return this.chapters.findIndex((c) => c.id === id);
  }

  /** Same content with display names from a preset (see data/naming.ts). Unknown = unchanged. */
  withNames(presetId: string): ContentRegistry {
    const preset = NAME_PRESETS[presetId];
    if (!preset) return this;
    const t = applyNamePreset(
      {
        weapons: [...this.weapons.values()],
        enemies: [...this.enemies.values()],
        chapters: [...this.chapters],
      },
      preset,
    );
    return new ContentRegistry(
      t.weapons,
      t.enemies,
      this.director,
      t.chapters,
      preset.title ?? this.title,
      preset.subtitle ?? this.subtitle,
      this.map,
    );
  }

  /** Same content on another map (MapDef or registered map id). Same map = this registry. */
  withMap(mapOrId: MapDef | string): ContentRegistry {
    const map = typeof mapOrId === 'string' ? getMap(mapOrId) : mapOrId;
    if (map === this.map) return this;
    return new ContentRegistry(
      [...this.weapons.values()],
      [...this.enemies.values()],
      map.director,
      [...this.chapters],
      this.title,
      this.subtitle,
      map,
    );
  }

  startingWeapons(): string[] {
    return this.weaponOrder.filter((w) => w.unlockAtWave === 0).map((w) => w.id);
  }

  /** Weapons this chapter can use: shared arsenal plus its signature special. */
  weaponsForChapter(chapterId: string): WeaponDef[] {
    return this.weaponOrder.filter((w) => !w.chapter || w.chapter === chapterId);
  }

  /** Returns a list of human-readable problems; empty = valid. */
  validate(): string[] {
    const errors: string[] = [];
    const ids = new Set<string>();
    const slots = new Map<number, WeaponDef[]>();
    for (const w of this.weaponOrder) {
      if (ids.has(w.id)) errors.push(`duplicate weapon id ${w.id}`);
      ids.add(w.id);
      const list = slots.get(w.slot) ?? [];
      list.push(w);
      slots.set(w.slot, list);
      if (w.slot < 1 || w.slot > 9) errors.push(`weapon ${w.id} slot must be 1..9`);
      if (w.fireInterval <= 0) errors.push(`weapon ${w.id} fireInterval must be > 0`);
      if (w.magazine <= 0) errors.push(`weapon ${w.id} magazine must be > 0`);
      if (w.pellets < 1) errors.push(`weapon ${w.id} pellets must be >= 1`);
      if (w.unlockAtWave !== null && !(Number.isInteger(w.unlockAtWave) && w.unlockAtWave >= 0))
        errors.push(`weapon ${w.id} unlockAtWave must be an integer >= 0 or null`);
    }
    for (const [slot, list] of slots) {
      if (list.length === 1) continue;
      if (!list.every((w) => w.chapter))
        errors.push(`duplicate weapon slot ${slot} (${list.map((w) => w.id).join(', ')})`);
      const ch = new Set(list.map((w) => w.chapter));
      if (ch.size !== list.length) errors.push(`duplicate chapter special on slot ${slot}`);
    }
    if (this.startingWeapons().length === 0) errors.push('no starting weapon (unlockAtWave: 0)');
    const eids = new Set<string>();
    for (const e of this.enemies.values()) {
      if (eids.has(e.id)) errors.push(`duplicate enemy id ${e.id}`);
      eids.add(e.id);
      if (e.hp <= 0) errors.push(`enemy ${e.id} hp must be > 0`);
      if (e.threat <= 0) errors.push(`enemy ${e.id} threat must be > 0`);
      if (e.behavior === 'ranged' && !e.ranged)
        errors.push(`enemy ${e.id} is ranged but has no ranged spec`);
      if (e.behavior === 'kamikaze' && !e.explode)
        errors.push(`enemy ${e.id} is kamikaze but has no explode spec`);
      if (e.group && (e.group[0] < 1 || e.group[1] < e.group[0]))
        errors.push(`enemy ${e.id} group must be [min>=1, max>=min]`);
      if (e.charge && e.charge.minDistance >= e.charge.triggerDistance)
        errors.push(`enemy ${e.id} charge.minDistance must be < triggerDistance`);
    }
    for (const w of this.weaponOrder) {
      if (w.heat && (w.heat.superchargeAt <= 0 || w.heat.superchargeAt >= 1))
        errors.push(`weapon ${w.id} heat.superchargeAt must be within (0, 1)`);
      if (!(w.fireMoveMul > 0 && w.fireMoveMul <= 1))
        errors.push(`weapon ${w.id} fireMoveMul must be within (0, 1]`);
      if (!w.roles?.length) errors.push(`weapon ${w.id} needs at least one role tag`);
      if (w.projectile.strength === undefined && w.projectile.explosion?.strength === undefined)
        errors.push(`weapon ${w.id} needs a Strength (projectile.strength or explosion.strength)`);
      for (const n of [w.projectile.strength, w.projectile.explosion?.strength])
        if (n !== undefined && n <= 0) errors.push(`weapon ${w.id} strength must be > 0`);
      for (const n of [w.projectile.ap, w.projectile.explosion?.ap])
        if (n !== undefined && n < 0) errors.push(`weapon ${w.id} AP must be >= 0`);
    }
    for (const e of this.enemies.values()) {
      if (!(e.toughness > 0)) errors.push(`enemy ${e.id} toughness must be > 0`);
      if (!(Number.isInteger(e.save) && e.save >= 2 && e.save <= 7))
        errors.push(`enemy ${e.id} save must be an integer 2..7 (7 = no save)`);
    }
    if (!this.enemies.has(this.director.bosses.enemy))
      errors.push(`director.bosses.enemy '${this.director.bosses.enemy}' is unknown`);
    const cids = new Set<string>();
    for (const c of this.chapters) {
      if (cids.has(c.id)) errors.push(`duplicate chapter id ${c.id}`);
      cids.add(c.id);
      if (!c.specialWeapon) errors.push(`chapter ${c.id} needs a specialWeapon`);
      else if (!this.weapons.has(c.specialWeapon))
        errors.push(`chapter ${c.id} specialWeapon '${c.specialWeapon}' is unknown`);
      else if (this.weapons.get(c.specialWeapon)!.chapter !== c.id)
        errors.push(`chapter ${c.id} specialWeapon must set chapter: '${c.id}'`);
    }
    for (const e of this.enemies.values()) {
      if (e.spawner && !this.enemies.has(e.spawner.enemy))
        errors.push(`enemy ${e.id} spawner.enemy '${e.spawner.enemy}' is unknown`);
      if (e.spawner && this.enemies.get(e.spawner.enemy)?.spawner)
        errors.push(`enemy ${e.id} spawner child must not spawn children itself`);
    }
    if (this.chapters.length < MAX_PLAYERS)
      errors.push(
        `need ${MAX_PLAYERS} chapters so every marine in a full squad has their own colours`,
      );
    const d = this.director;
    const ts = d.teamScaling;
    for (const [name, arr] of [
      ['teamScaling.budget', ts.budget],
      ['teamScaling.pace', ts.pace],
      ['teamScaling.maxAlive', ts.maxAlive],
      ['teamScaling.children', ts.children],
      ['teamScaling.hp', ts.hp],
      ['teamScaling.elite', ts.elite],
      ['bosses.count', d.bosses.count],
    ] as const) {
      if (arr.some((v) => !(v > 0))) errors.push(`director.${name} entries must be > 0`);
      if (arr.length < MAX_PLAYERS)
        errors.push(`director.${name} needs ${MAX_PLAYERS} entries (team sizes 1..${MAX_PLAYERS})`);
    }
    let prev = 0;
    for (const entry of this.director.waveTable) {
      if (entry.fromWave <= prev) errors.push('waveTable must be sorted by fromWave ascending');
      prev = entry.fromWave;
      for (const id of Object.keys(entry.weights)) {
        if (!this.enemies.has(id)) errors.push(`waveTable references unknown enemy '${id}'`);
      }
    }
    if (this.director.waveTable[0]?.fromWave !== 1)
      errors.push('waveTable must start at fromWave 1');
    errors.push(...validateMapGeometry(this.map));
    return errors;
  }
}

export const defaultContent = new ContentRegistry(WEAPONS, ENEMIES, DIRECTOR);
