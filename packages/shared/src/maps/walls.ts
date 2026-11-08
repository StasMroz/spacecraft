import type { WallDef } from './types.js';

/**
 * Low cover, balance choice (not 40k canon): cover within `ignoreNear` px of where the shot was
 * fired is always fired over (your own barricade is free). Farther cover stops the shot ON the
 * cover with `stopChance`, rolled once per shot and wall; otherwise it flies on over it.
 */
export const COVER = { stopChance: 0.5, ignoreNear: 70 } as const;

const full = (x: number, y: number, w: number, h: number): WallDef => ({
  x,
  y,
  w,
  h,
  kind: 'full',
});
const low = (x: number, y: number, w: number, h: number): WallDef => ({ x, y, w, h, kind: 'low' });

/**
 * Hive Siege deck: a ring of low barricades around the deployment zone (gaps at the corners),
 * ruined bulkheads further out. Kept clear of the breaches, vents and the squad's deploy ring.
 */
export const WAVE_WALLS: readonly WallDef[] = [
  low(1400, 830, 180, 32),
  low(1640, 1340, 180, 32),
  low(1290, 1040, 32, 180),
  low(1880, 960, 32, 180),
  low(780, 1150, 240, 32),
  low(2280, 800, 240, 32),
  low(1900, 1820, 240, 32),
  low(1060, 340, 240, 32),
  full(1050, 760, 32, 320),
  full(2140, 1100, 32, 320),
  full(1250, 1560, 380, 32),
  full(1650, 600, 380, 32),
  full(480, 1500, 320, 32),
  full(480, 1532, 32, 260),
  full(2620, 470, 32, 320),
  full(2652, 470, 260, 32),
];
