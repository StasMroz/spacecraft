import type { ContentRegistry } from '../data/index.js';
import type { ReferencedAssetKeys } from './manifest.js';

/** Sounds the client plays for game events / UI (not tied to content data). */
export const CORE_SOUNDS = [
  'player_hurt',
  'player_down',
  'revive',
  'pickup',
  'unlock',
  'surge',
  'crate_drop',
  'ui_click',
  'explosion',
  'bolt_impact',
  'overheat',
  'boss_horn',
  'armour_hit',
  'carapace_ricochet',
  'amb_swarm',
  'amb_hive',
  'dust_land',
  'nid_hiss',
  'breach_telegraph',
  'breach_burst',
] as const;

/** Terrain / prop / FX sprites the renderer uses regardless of content. */
export const CORE_SPRITES = [
  'medkit',
  'shadow',
  'fx_explosion',
  'fx_muzzle',
  'fx_particle',
  'fx_ring',
  'fx_burrow',
  'fx_synapse',
  'fx_spark',
  'decal_scorch_0',
  'decal_scorch_1',
  'tile_floor_0',
  'tile_floor_1',
  'tile_floor_2',
  'tile_floor_3',
  'tile_grate',
  'tile_hazard',
  'tile_seal',
  'prop_rubble_0',
  'prop_rubble_1',
  'prop_pillar',
  'prop_skull_pile',
  'prop_barricade',
  'creep_0',
  'creep_1',
  'creep_2',
  'ui_emblem',
  'ally_guardsman',
] as const;

/** Animation names a sprite may define (manifest `anims`); see docs/ADDING_CONTENT.md. */
export const ENEMY_ANIMS = ['walk', 'attack', 'death'] as const;
export const MARINE_ANIMS = ['walk'] as const;

/** Music tracks the client expects. */
export const CORE_MUSIC = ['menu', 'combat', 'combat_drive', 'boss', 'gameover'] as const;

export const DECAL_VARIANTS = 3;

/** Collects every sprite / sound key the given content (plus the core client) references. */
export function referencedAssetKeys(content: ContentRegistry): ReferencedAssetKeys {
  const sprites = new Set<string>(CORE_SPRITES);
  const sounds = new Set<string>(CORE_SOUNDS);
  for (const c of content.chapters) {
    sprites.add(`marine_${c.id}`);
    sprites.add(`marine_${c.id}_top`);
    sprites.add(`marine_${c.id}_down`);
    sprites.add(`badge_${c.id}`);
  }
  for (const w of content.weapons.values()) {
    sprites.add(w.sprites.icon);
    sprites.add(w.sprites.pickup);
    sprites.add(w.sprites.held);
    for (const v of Object.values(w.sfx)) if (typeof v === 'string') sounds.add(v);
  }
  for (const k of content.projectileKinds) sprites.add(`proj_${k}`);
  for (const e of content.enemies.values()) {
    sprites.add(e.sprite);
    for (const v of Object.values(e.sfx)) if (typeof v === 'string') sounds.add(v);
    if (e.decal) for (let i = 0; i < DECAL_VARIANTS; i++) sprites.add(`decal_${e.decal}_${i}`);
  }
  return { sprites: [...sprites].sort(), sounds: [...sounds].sort() };
}
