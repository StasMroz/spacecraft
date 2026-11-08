/**
 * Client-only presentation tables keyed by content ids. New weapons/enemies
 * work without an entry here (sane defaults); add one to tune their look.
 */
export interface ProjectileVisual {
  color: string;
  /** Additive blending (glowy). */
  glow: boolean;
  /** Trail particles per second. */
  trail: number;
  trailColor?: string;
  trailShape?: 'dot' | 'smoke';
  fallbackRadius: number;
  /** Sprite draw scale. */
  scale?: number;
}

export const PROJECTILE_VISUALS: Record<string, ProjectileVisual> = {
  bolt: { color: '#ffd27a', glow: true, trail: 12, trailColor: '#ffb050', fallbackRadius: 3 },
  heavy_bolt: { color: '#ffc060', glow: true, trail: 18, trailColor: '#ff9a40', fallbackRadius: 4 },
  slash: { color: '#9fe8ff', glow: true, trail: 0, fallbackRadius: 14 },
  flame: { color: '#ff8a2a', glow: true, trail: 0, fallbackRadius: 10 },
  plasma: { color: '#6fd8ff', glow: true, trail: 30, trailColor: '#7fe0ff', fallbackRadius: 7 },
  plasma_super: {
    color: '#b8f2ff',
    glow: true,
    trail: 60,
    trailColor: '#a0ecff',
    fallbackRadius: 10,
    scale: 1.2,
  },
  melta: { color: '#ffe0a0', glow: true, trail: 40, trailColor: '#ff7040', fallbackRadius: 8 },
  frag: {
    color: '#7a7a62',
    glow: false,
    trail: 25,
    trailColor: '#888',
    trailShape: 'smoke',
    fallbackRadius: 5,
  },
  fleshborer: {
    color: '#c08040',
    glow: false,
    trail: 10,
    trailColor: '#7a4a20',
    fallbackRadius: 4,
  },
  deathspitter: {
    color: '#c0ff40',
    glow: true,
    trail: 25,
    trailColor: '#a0e030',
    fallbackRadius: 6,
  },
  bioacid: {
    color: '#b8ff3a',
    glow: true,
    trail: 30,
    trailColor: '#7ac020',
    trailShape: 'smoke',
    fallbackRadius: 12,
  },
  psyash: {
    color: '#d8a0ff',
    glow: true,
    trail: 18,
    trailColor: '#9050c0',
    trailShape: 'smoke',
    fallbackRadius: 9,
  },
  spore: {
    color: '#a8c040',
    glow: false,
    trail: 12,
    trailColor: '#8aa030',
    trailShape: 'smoke',
    fallbackRadius: 9,
  },
};

export const DEFAULT_PROJECTILE_VISUAL: ProjectileVisual = {
  color: '#fff',
  glow: true,
  trail: 0,
  fallbackRadius: 4,
};

export interface EnemyVisual {
  color: string;
  /** Gore particle colour. */
  ichor: string;
  /** World px travelled per walk frame (stride). */
  stride: number;
  /** Attack / death animation speed. */
  attackFps: number;
  deathFps: number;
  /** Screen shake on death. */
  deathShake: number;
  /** Leave the last death frame on the floor as a corpse decal. */
  corpse: boolean;
}

/** Behemoth-fleet gore: dark red ichor; acid beasts spill green. */
export const ENEMY_VISUALS: Record<string, EnemyVisual> = {
  hormagaunt: {
    color: '#3a3a8a',
    ichor: '#6a1018',
    stride: 7,
    attackFps: 14,
    deathFps: 12,
    deathShake: 0,
    corpse: true,
  },
  termagant: {
    color: '#3a3a8a',
    ichor: '#6a1018',
    stride: 7,
    attackFps: 12,
    deathFps: 12,
    deathShake: 0,
    corpse: true,
  },
  ripper: {
    color: '#8a2a3a',
    ichor: '#6a1018',
    stride: 4,
    attackFps: 10,
    deathFps: 12,
    deathShake: 0,
    corpse: true,
  },
  genestealer: {
    color: '#6a3a9a',
    ichor: '#5a1030',
    stride: 8,
    attackFps: 16,
    deathFps: 12,
    deathShake: 0,
    corpse: true,
  },
  warrior: {
    color: '#3a3a8a',
    ichor: '#6a1018',
    stride: 10,
    attackFps: 10,
    deathFps: 9,
    deathShake: 3,
    corpse: true,
  },
  ravener: {
    color: '#3a3a8a',
    ichor: '#6a1018',
    stride: 9,
    attackFps: 12,
    deathFps: 9,
    deathShake: 3,
    corpse: true,
  },
  biovore: {
    color: '#4a6a20',
    ichor: '#7a9a20',
    stride: 9,
    attackFps: 8,
    deathFps: 9,
    deathShake: 0,
    corpse: true,
  },
  spore_mine: {
    color: '#9ab040',
    ichor: '#a8c040',
    stride: 30,
    attackFps: 8,
    deathFps: 14,
    deathShake: 0,
    corpse: false,
  },
  psychophage: {
    color: '#7a3a9a',
    ichor: '#5a0a40',
    stride: 14,
    attackFps: 9,
    deathFps: 8,
    deathShake: 7,
    corpse: false,
  },
  carnifex: {
    color: '#3a3a8a',
    ichor: '#5a0a10',
    stride: 12,
    attackFps: 9,
    deathFps: 7,
    deathShake: 9,
    corpse: true,
  },
};

export const DEFAULT_ENEMY_VISUAL: EnemyVisual = {
  color: '#8050a0',
  ichor: '#601030',
  stride: 8,
  attackFps: 10,
  deathFps: 10,
  deathShake: 0,
  corpse: true,
};

export interface WeaponVisual {
  /** Muzzle flash scale (0 = none). */
  muzzle: number;
  muzzleColor: string;
  /** Recoil kick in px (held weapon slides back). */
  recoil: number;
  /** Screen shake for the local shooter. */
  shake: number;
  /** Eject a brass casing. */
  casing: boolean;
}

export const WEAPON_VISUALS: Record<string, WeaponVisual> = {
  bolt_rifle: { muzzle: 1, muzzleColor: '#ffd070', recoil: 3, shake: 0.6, casing: true },
  heavy_bolter: { muzzle: 1.35, muzzleColor: '#ffc060', recoil: 4, shake: 1.6, casing: true },
  flamer: { muzzle: 0, muzzleColor: '#ff9030', recoil: 0.5, shake: 0, casing: false },
  plasma_gun: { muzzle: 1.1, muzzleColor: '#8fe4ff', recoil: 3, shake: 1.2, casing: false },
  meltagun: { muzzle: 1.4, muzzleColor: '#ffb070', recoil: 5, shake: 3, casing: false },
  frag_grenade: { muzzle: 0, muzzleColor: '#ffd070', recoil: -3, shake: 0, casing: false },
};

export const DEFAULT_WEAPON_VISUAL: WeaponVisual = {
  muzzle: 1,
  muzzleColor: '#ffd070',
  recoil: 2,
  shake: 0,
  casing: false,
};

/**
 * Muzzle-anchored tracer streak per player projectile kind (length px, colour): drawn behind the
 * shot but never further back than the barrel tip, so the first frames visibly leave the muzzle.
 */
export const PROJECTILE_TRACERS: Record<string, { len: number; color: string; width: number }> = {
  bolt: { len: 26, color: '#ffd070', width: 2 },
  heavy_bolt: { len: 34, color: '#ffc060', width: 2.6 },
  plasma: { len: 24, color: '#8fe4ff', width: 3 },
  plasma_super: { len: 32, color: '#c8f4ff', width: 4 },
  melta: { len: 30, color: '#ffb070', width: 3.4 },
};
