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

const JUNGLE_THEME: MapTheme = {
  biome: 'jungle',
  floorA: '#142214',
  floorB: '#1b2c18',
  edge: '#0a140a',
};

const ICE_THEME: MapTheme = {
  biome: 'ice',
  floorA: '#1a2834',
  floorB: '#223544',
  edge: '#0c141c',
};

const HULK_THEME: MapTheme = {
  biome: 'hulk',
  floorA: '#1c1814',
  floorB: '#26201a',
  edge: '#0e0c0a',
};

/**
 * Infected biomass jungle: dense organic trunks (full) and vine ridges (low).
 * Openings stay clear of the six breaches and the centre deploy ring.
 */
export const JUNGLE_WALLS: readonly WallDef[] = [
  full(520, 380, 220, 80),
  full(900, 240, 80, 220),
  full(2480, 300, 260, 70),
  full(2700, 700, 90, 260),
  full(400, 1680, 260, 80),
  full(700, 1900, 80, 160),
  full(2300, 1760, 280, 80),
  full(2100, 1500, 80, 260),
  full(1180, 720, 90, 200),
  full(1960, 1280, 90, 200),
  low(700, 900, 200, 28),
  low(2100, 700, 220, 28),
  low(1000, 1500, 28, 200),
  low(2000, 400, 28, 180),
  low(1400, 300, 240, 28),
  low(1500, 1850, 240, 28),
  low(1780, 900, 28, 160),
  low(1280, 1280, 160, 28),
];

/**
 * Ice world: long sight-lines, low ice ridges, a few frozen outcrops.
 * The centre is mostly open so relic runs stay readable.
 */
export const ICE_WALLS: readonly WallDef[] = [
  low(600, 500, 320, 28),
  low(2200, 400, 360, 28),
  low(500, 1700, 360, 28),
  low(2100, 1800, 320, 28),
  low(400, 1000, 28, 280),
  low(2800, 900, 28, 300),
  low(1200, 800, 280, 28),
  low(1700, 1400, 280, 28),
  full(900, 300, 160, 60),
  full(2400, 1600, 160, 60),
  full(400, 1500, 60, 160),
  full(2700, 500, 60, 160),
];

/**
 * Space hulk wreck: tight corridors and bulkheads, a hangar-like west bay
 * (squad deploys there) and a long east run toward the evac lock.
 */
export const HULK_WALLS: readonly WallDef[] = [
  // northern hull, gap around the north breach
  full(200, 200, 1240, 48),
  full(1800, 200, 1200, 48),
  // southern hull, gap around the south breach
  full(200, 1950, 1240, 48),
  full(1800, 1950, 1200, 48),
  // west bay walls (open centre around spawn ~900,1100)
  full(200, 200, 48, 700),
  full(200, 1300, 48, 698),
  full(600, 500, 48, 280),
  full(600, 1420, 48, 280),
  // mid bulkheads with corridor gaps at deck height
  full(1300, 248, 48, 520),
  full(1300, 1420, 48, 530),
  full(1900, 248, 48, 420),
  full(1900, 1520, 48, 430),
  full(2500, 248, 48, 520),
  full(2500, 1420, 48, 530),
  // debris / low plating in corridors
  low(800, 800, 200, 28),
  low(800, 1370, 200, 28),
  low(1500, 900, 28, 200),
  low(2100, 1100, 200, 28),
  low(2700, 800, 28, 200),
];

export const JUNGLE_MAP: MapDef = {
  ...WAVE_MAP,
  id: 'jungle',
  name: 'Dżungla biomasy',
  tier: 2,
  description: 'Świat zainfekowany biomasą: gęste pnie i pnącza, ograniczona widoczność.',
  walls: JUNGLE_WALLS,
  theme: JUNGLE_THEME,
  playerSpawn: { x: 1600, y: 1100, ringMin: 50, ringPerMarine: 16 },
  director: {
    ...WAVE_MAP.director,
    spawnPoints: [
      { id: 'north', x: 1600, y: 130, kind: 'breach' },
      { id: 'east', x: 3070, y: 980, kind: 'tunnel' },
      { id: 'south', x: 1720, y: 2070, kind: 'breach' },
      { id: 'west', x: 130, y: 1220, kind: 'tunnel' },
      { id: 'vent_nw', x: 700, y: 700, kind: 'vent' },
      { id: 'vent_se', x: 2500, y: 1550, kind: 'vent' },
    ],
  },
};

export const ICE_MAP: MapDef = {
  ...WAVE_MAP,
  id: 'ice',
  name: 'Lodowy świat',
  tier: 2,
  description: 'Otwarte pole lodu i grzbiety osadów — dalekie linie ognia, mało osłon pełnych.',
  walls: ICE_WALLS,
  theme: ICE_THEME,
  playerSpawn: { x: 1600, y: 1100, ringMin: 50, ringPerMarine: 16 },
  director: {
    ...WAVE_MAP.director,
    spawnPoints: [
      { id: 'north', x: 1600, y: 130, kind: 'breach' },
      { id: 'east', x: 3070, y: 980, kind: 'tunnel' },
      { id: 'south', x: 1720, y: 2070, kind: 'breach' },
      { id: 'west', x: 130, y: 1220, kind: 'tunnel' },
      { id: 'vent_nw', x: 700, y: 400, kind: 'vent' },
      { id: 'vent_se', x: 2500, y: 1900, kind: 'vent' },
    ],
  },
};

export const HULK_MAP: MapDef = {
  ...WAVE_MAP,
  id: 'hulk',
  name: 'Wrak hulka',
  tier: 2,
  description:
    'Korytarze rozszarpanego hulka: ciasne grodzie, hangar na zachodzie, śluza na wschodzie.',
  walls: HULK_WALLS,
  theme: HULK_THEME,
  playerSpawn: { x: 900, y: 1100, ringMin: 40, ringPerMarine: 14 },
  director: {
    ...WAVE_MAP.director,
    spawnPoints: [
      { id: 'north', x: 1600, y: 280, kind: 'breach' },
      { id: 'east', x: 3000, y: 1100, kind: 'tunnel' },
      { id: 'south', x: 1600, y: 1880, kind: 'breach' },
      { id: 'west', x: 280, y: 1100, kind: 'tunnel' },
      { id: 'vent_nw', x: 900, y: 400, kind: 'vent' },
      { id: 'vent_se', x: 2300, y: 1700, kind: 'vent' },
    ],
  },
};
