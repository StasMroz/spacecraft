import type { DirectorConfig } from '../data/types.js';
import type { MapDef } from './types.js';
import { WAVE_MAP } from './wave.js';

export * from './types.js';
export { COVER, WAVE_WALLS } from './walls.js';
export { WAVE_MAP };

/** Map played when nothing else is chosen (every current session, wire message and board). */
export const DEFAULT_MAP_ID = WAVE_MAP.id;

/**
 * Map registry, in picker order (tier ascending). To add a map: create `maps/<id>.ts` exporting
 * a MapDef (usually `defineMap(WAVE_MAP, {...})`), append it here, and the content tests validate
 * it automatically.
 */
export const MAPS: readonly MapDef[] = [WAVE_MAP];

const byId = new Map(MAPS.map((m) => [m.id, m]));

export const findMap = (id: string | undefined): MapDef | undefined =>
  id === undefined ? undefined : byId.get(id);

/** Map by id; undefined = the default map. Throws on an unknown id. */
export function getMap(id: string = DEFAULT_MAP_ID): MapDef {
  const m = byId.get(id);
  if (!m) throw new Error(`Unknown map '${id}'`);
  return m;
}

/** Overrides for `defineMap`: top-level fields plus a partial (one level deep) director. */
export type MapOverrides = Partial<Omit<MapDef, 'director'>> & {
  id: string;
  name: string;
  tier: number;
  director?: { [K in keyof DirectorConfig]?: Partial<DirectorConfig[K]> | DirectorConfig[K] };
};

/**
 * Derives a map from a base one, e.g. a harder wave map:
 *   defineMap(WAVE_MAP, { id: 'wave_hard', name: '…', tier: 2,
 *     director: { waves: { hpScalePerWave: 0.09 }, bosses: { firstWave: 2 } } })
 * Director sections are merged one level deep (arrays such as spawnPoints / waveTable replace).
 */
export function defineMap(base: MapDef, o: MapOverrides): MapDef {
  const director = { ...base.director } as Record<string, unknown>;
  for (const [k, v] of Object.entries(o.director ?? {})) {
    const cur = director[k];
    director[k] =
      v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object'
        ? { ...cur, ...v }
        : v;
  }
  return { ...base, ...o, director: director as unknown as DirectorConfig };
}

/** Problems with a map's own geometry (director content is checked by ContentRegistry). */
export function validateMapGeometry(m: MapDef): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9_-]+$/.test(m.id)) errors.push(`map id '${m.id}' must match [a-z0-9_-]+`);
  const { width: W, height: H } = m.arena;
  if (!(W > 0 && H > 0)) errors.push(`map ${m.id} arena must have a positive size`);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= W && y <= H;
  if (!inside(m.playerSpawn.x, m.playerSpawn.y))
    errors.push(`map ${m.id} playerSpawn is outside the arena`);
  if (!m.director.spawnPoints.length) errors.push(`map ${m.id} needs at least one spawn point`);
  const ids = new Set<string>();
  for (const sp of m.director.spawnPoints) {
    if (ids.has(sp.id)) errors.push(`map ${m.id} duplicate spawn point id ${sp.id}`);
    ids.add(sp.id);
    if (!inside(sp.x, sp.y)) errors.push(`map ${m.id} spawn point ${sp.id} is outside the arena`);
  }
  return errors;
}

/** Registry-level problems (duplicate ids, default map missing). */
export function validateMapRegistry(maps: readonly MapDef[] = MAPS): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const m of maps) {
    if (ids.has(m.id)) errors.push(`duplicate map id ${m.id}`);
    ids.add(m.id);
  }
  if (!ids.has(DEFAULT_MAP_ID)) errors.push(`default map '${DEFAULT_MAP_ID}' is not registered`);
  return errors;
}
