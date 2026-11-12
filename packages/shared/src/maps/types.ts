import type { DirectorConfig } from '../data/types.js';

/** Playfield size in world px. Everything (marines, Tyranids, shots) is clamped into it. */
export interface ArenaSize {
  width: number;
  height: number;
}

/**
 * Axis-aligned wall block (world px, top-left + size). Both kinds block movement and melee for
 * marines and Tyranids alike. `full` also blocks shots, blasts and line of sight; `low` cover can
 * be seen and shot over, and shots fly over it near the shooter, otherwise may stop on it (COVER in maps/walls.ts).
 */
export interface WallDef {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'full' | 'low';
}

/**
 * Where the squad deploys: marines stand on a ring around (x, y) whose radius grows with the
 * squad, max(ringMin, teamSize * ringPerMarine); a lone marine stands exactly on (x, y).
 */
export interface PlayerSpawnDef {
  x: number;
  y: number;
  ringMin: number;
  ringPerMarine: number;
}

/**
 * A map / scenario: the playfield plus everything about how the swarm comes at the squad there.
 * Maps are plain data, registered in `maps/index.ts` (MAPS). The sim reads the active map from
 * `world.map` (== `world.content.map`); `world.content.director` is that map's director.
 *
 * Future maps (harder variants of the wave map) are new entries, typically a spread of the wave
 * map with a tuned `director` / `arena` (see `defineMap`). Not yet modelled, add fields here
 * when a map needs them: floor theme / scenery for the renderer, per-map player stats or weapon
 * pools.
 */
export interface MapDef {
  /** Stable id (future wire / leaderboard key). Lowercase, [a-z0-9_-]. Never rename once released. */
  id: string;
  /** Display name. */
  name: string;
  /** Difficulty tier for ordering in a future map picker: 1 = the original wave map. */
  tier: number;
  description?: string;
  arena: ArenaSize;
  playerSpawn: PlayerSpawnDef;
  walls: readonly WallDef[];
  /** Waves, squad-size scaling, breaches (spawn points), drops, bosses and the wave table. */
  director: DirectorConfig;
  /**
   * Optional floor/theme for the client renderer. Missing = hive deck (existing tile art).
   * Other biomes skip the hive tiles and use the given floor colours.
   */
  theme?: MapTheme;
}

export type MapBiome = 'hive' | 'jungle' | 'ice' | 'hulk' | 'city' | 'desert' | 'volcanic' | 'ship';

export interface MapTheme {
  biome: MapBiome;
  /** Main floor fill (css hex). */
  floorA: string;
  /** Alternate / grid colour. */
  floorB: string;
  /** Arena edge / vignette. */
  edge: string;
}
