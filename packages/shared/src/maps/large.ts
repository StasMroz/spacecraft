import type { MapDef, MapTheme, WallDef } from './types.js';
import { WAVE_MAP } from './wave.js';

const full = (x: number, y: number, w: number, h: number): WallDef => ({
  x,
  y,
  w,
  h,
  kind: 'full',
});
const low = (x: number, y: number, w: number, h: number): WallDef => ({ x, y, w, h, kind: 'low' });

/** 2× the original hive deck — camera already follows the marine around it. */
export const LARGE_ARENA = { width: 6400, height: 4400 } as const;

const CITY_THEME: MapTheme = {
  biome: 'city',
  floorA: '#1a1816',
  floorB: '#24201c',
  edge: '#0c0a08',
};
const DESERT_THEME: MapTheme = {
  biome: 'desert',
  floorA: '#2a2418',
  floorB: '#332c1c',
  edge: '#14100a',
};
const VOLCANIC_THEME: MapTheme = {
  biome: 'volcanic',
  floorA: '#1c1010',
  floorB: '#261414',
  edge: '#100808',
};
const SHIP_THEME: MapTheme = {
  biome: 'ship',
  floorA: '#1a1216',
  floorB: '#241820',
  edge: '#0e0a0c',
};

const largeSpawns = (
  extras: Array<{ id: string; x: number; y: number; kind: 'breach' | 'tunnel' | 'vent' }>,
) => [
  { id: 'north', x: 3200, y: 180, kind: 'breach' as const },
  { id: 'east', x: 6220, y: 2200, kind: 'tunnel' as const },
  { id: 'south', x: 3300, y: 4220, kind: 'breach' as const },
  { id: 'west', x: 180, y: 2200, kind: 'tunnel' as const },
  ...extras,
];

/**
 * Hive city: a grid of hab-blocks with 200–280 px streets. The west avenue is the
 * drop zone; the east avenue runs out to extraction.
 */
export const CITY_WALLS: readonly WallDef[] = [
  // 4×4 hab-blocks (streets at x≈1540 and y≈1140 / 2240 / 3340)
  ...[400, 1680, 3080, 4480].flatMap((x) =>
    [280, 1280, 2380, 3480].map((y) => full(x, y, 1000, 720)),
  ),
  low(1460, 2180, 200, 28),
  low(2860, 2180, 200, 28),
  low(4260, 2180, 200, 28),
  low(2000, 1120, 220, 28),
  low(1540, 3280, 28, 200),
  low(4340, 1040, 28, 200),
  low(3180, 3320, 240, 28),
];

export const DESERT_WALLS: readonly WallDef[] = [
  full(1100, 700, 260, 140),
  full(4200, 900, 240, 160),
  full(5200, 2800, 280, 180),
  full(900, 3000, 320, 140),
  full(2800, 3400, 200, 160),
  full(5000, 600, 180, 200),
  full(2400, 1600, 220, 120),
  low(1800, 1200, 420, 28),
  low(3600, 2000, 480, 28),
  low(800, 2000, 28, 320),
  low(5600, 1800, 28, 360),
  low(3000, 800, 360, 28),
  low(2000, 3600, 400, 28),
];

export const VOLCANIC_WALLS: readonly WallDef[] = [
  // lava channels with crossing gaps
  full(200, 1360, 1900, 80),
  full(2500, 1360, 3700, 80),
  full(200, 2720, 3200, 80),
  full(4000, 2720, 2200, 80),
  full(3160, 200, 80, 1000),
  full(3160, 1600, 80, 960),
  full(3160, 2960, 80, 1240),
  full(4800, 200, 80, 700),
  full(1600, 3000, 80, 800),
  low(2100, 2000, 280, 28),
  low(3600, 2000, 280, 28),
  low(1100, 600, 240, 28),
  low(5200, 3600, 280, 28),
];

/** Space-hulk bioship: a 2× stretch of the original hulk corridors plus a longer east run. */
export const SHIP_WALLS: readonly WallDef[] = [
  full(400, 400, 2480, 96),
  full(3600, 400, 2400, 96),
  full(400, 3900, 2480, 96),
  full(3600, 3900, 2400, 96),
  full(400, 400, 96, 1400),
  full(400, 2600, 96, 1396),
  full(1200, 1000, 96, 560),
  full(1200, 2840, 96, 560),
  full(2600, 496, 96, 1040),
  full(2600, 2840, 96, 1060),
  full(3800, 496, 96, 840),
  full(3800, 3040, 96, 860),
  full(5000, 496, 96, 1040),
  full(5000, 2840, 96, 1060),
  low(1600, 1600, 400, 56),
  low(1600, 2740, 400, 56),
  low(3000, 1800, 56, 400),
  low(4200, 2200, 400, 56),
  low(5400, 1600, 56, 400),
];

export const CITY_MAP: MapDef = {
  ...WAVE_MAP,
  id: 'city',
  name: 'Miasto-ul',
  tier: 3,
  description:
    'Ruiny hab-bloków i szerokie aleje — dwa razy większa arena, trzeba przewijać kamerę.',
  arena: LARGE_ARENA,
  walls: CITY_WALLS,
  theme: CITY_THEME,
  playerSpawn: { x: 200, y: 2190, ringMin: 50, ringPerMarine: 16 },
  director: {
    ...WAVE_MAP.director,
    spawnPoints: [
      { id: 'north', x: 3200, y: 160, kind: 'breach' },
      { id: 'east', x: 6220, y: 2240, kind: 'tunnel' },
      { id: 'south', x: 3300, y: 4300, kind: 'breach' },
      { id: 'west', x: 180, y: 2240, kind: 'tunnel' },
      { id: 'vent_nw', x: 1540, y: 1140, kind: 'vent' },
      { id: 'vent_se', x: 4340, y: 3340, kind: 'vent' },
    ],
  },
};

export const DESERT_MAP: MapDef = {
  ...WAVE_MAP,
  id: 'desert',
  name: 'Pustynia',
  tier: 3,
  description:
    'Otwarte wydmy i skalne wychodnie — dalekie linie ognia na dwukrotnie większym polu.',
  arena: LARGE_ARENA,
  walls: DESERT_WALLS,
  theme: DESERT_THEME,
  playerSpawn: { x: 3200, y: 2200, ringMin: 50, ringPerMarine: 16 },
  director: {
    ...WAVE_MAP.director,
    spawnPoints: largeSpawns([
      { id: 'vent_nw', x: 1400, y: 1000, kind: 'vent' },
      { id: 'vent_se', x: 5000, y: 3400, kind: 'vent' },
    ]),
  },
};

export const VOLCANIC_MAP: MapDef = {
  ...WAVE_MAP,
  id: 'volcanic',
  name: 'Świat wulkaniczny',
  tier: 3,
  description: 'Kanały lawy przecinają skałę; przeprawy są wąskie, arena dwa razy większa.',
  arena: LARGE_ARENA,
  walls: VOLCANIC_WALLS,
  theme: VOLCANIC_THEME,
  playerSpawn: { x: 800, y: 800, ringMin: 50, ringPerMarine: 16 },
  director: {
    ...WAVE_MAP.director,
    spawnPoints: [
      { id: 'north', x: 2300, y: 180, kind: 'breach' },
      { id: 'east', x: 6280, y: 2000, kind: 'tunnel' },
      { id: 'south', x: 3600, y: 4300, kind: 'breach' },
      { id: 'west', x: 180, y: 2000, kind: 'tunnel' },
      { id: 'vent_nw', x: 800, y: 2000, kind: 'vent' },
      { id: 'vent_se', x: 5600, y: 3600, kind: 'vent' },
    ],
  },
};

export const SHIP_MAP: MapDef = {
  ...WAVE_MAP,
  id: 'ship',
  name: 'Statek-ul',
  tier: 3,
  description:
    'Wnętrze bio-okrętu: hangar na zachodzie, długie grodzie, śluza na wschodzie. Arena 2×.',
  arena: LARGE_ARENA,
  walls: SHIP_WALLS,
  theme: SHIP_THEME,
  playerSpawn: { x: 1800, y: 2200, ringMin: 40, ringPerMarine: 14 },
  director: {
    ...WAVE_MAP.director,
    spawnPoints: largeSpawns([
      { id: 'vent_nw', x: 1800, y: 800, kind: 'vent' },
      { id: 'vent_se', x: 4600, y: 3400, kind: 'vent' },
    ]),
  },
};
