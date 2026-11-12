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

export const DUEL_ARENA = { width: 2000, height: 1400 } as const;

const THEME: MapTheme = {
  biome: 'hive',
  floorA: '#1a1612',
  floorB: '#221c16',
  edge: '#0c0a08',
};

/** Tight 1v1 / 2v2 pit: open corners, a mid ruin and low barricades. */
export const DUEL_WALLS: readonly WallDef[] = [
  full(880, 560, 240, 280),
  full(420, 620, 80, 160),
  full(1500, 620, 80, 160),
  low(700, 400, 200, 28),
  low(1100, 972, 200, 28),
  low(300, 900, 28, 180),
  low(1672, 320, 28, 180),
  low(880, 160, 240, 28),
  low(880, 1172, 240, 28),
];

export const DUEL_MAP: MapDef = {
  ...WAVE_MAP,
  id: 'duel',
  name: 'Arena pojedynku',
  tier: 1,
  description: 'Mała arena z osłonami. Narożniki są punktami odrodzenia (1v1 lub 2v2).',
  arena: DUEL_ARENA,
  walls: DUEL_WALLS,
  theme: THEME,
  playerSpawn: { x: 250, y: 300, ringMin: 40, ringPerMarine: 14 },
  director: {
    ...WAVE_MAP.director,
    spawnPoints: [
      { id: 'north', x: 1000, y: 80, kind: 'breach' },
      { id: 'east', x: 1920, y: 700, kind: 'tunnel' },
      { id: 'south', x: 1000, y: 1320, kind: 'breach' },
      { id: 'west', x: 80, y: 700, kind: 'tunnel' },
    ],
  },
};
