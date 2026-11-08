import type { WallDef } from './types.js';

/**
 * Low cover, balance choice (not 40k canon): every shot flies over low cover (it never stops
 * there). A target hugging the far side (within `hugDist` px of a low wall the shot crossed) is
 * harder to hit: the shot misses it with `missChance` and flies on. Cover within `ignoreNear` px
 * of where the shot was fired doesn't count (firing over your own barricade is free).
 */
export const COVER = { missChance: 0.3, hugDist: 60, ignoreNear: 70 } as const;

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
