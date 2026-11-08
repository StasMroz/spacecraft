import { ARENA } from '../constants.js';
import { DIRECTOR } from '../data/director.js';
import type { MapDef } from './types.js';
import { WAVE_WALLS } from './walls.js';

/**
 * The original game (v0.1 – v0.5.x): one hive-city deck, six breaches, endless finite waves.
 * Its tuning stays in data/director.ts (DIRECTOR) and constants.ts (ARENA); this entry only
 * bundles it. Changing anything here changes the live game.
 */
export const WAVE_MAP: MapDef = {
  id: 'wave',
  name: 'Hive Siege',
  tier: 1,
  description: 'The original survival deck: endless Tyranid waves from six breaches.',
  arena: ARENA,
  playerSpawn: { x: ARENA.width / 2, y: ARENA.height / 2, ringMin: 50, ringPerMarine: 16 },
  walls: WAVE_WALLS,
  director: DIRECTOR,
};
