import type { Rng } from '../math/rng.js';
import type { ContentRegistry, ExplosionSpec, PierceBudget, SprintState } from '../data/index.js';
import type { MapDef } from '../maps/types.js';

export type PlayerState = 'alive' | 'downed' | 'dead';

/** One input frame. Each input represents exactly one simulation tick of movement. */
export interface PlayerInput {
  /** Monotonic sequence number (per client) used for prediction reconciliation. */
  seq: number;
  /** Movement direction, each in -1..1 (normalized by the sim). */
  mx: number;
  my: number;
  /** Aim angle in radians. */
  aim: number;
  fire: boolean;
  /** Weapon slot to switch to (1..9) or 0 for none. */
  slot: number;
  reload: boolean;
  /**
   * Sprint held (v0.5.3-dev). Optional so protocol v5 inputs without it stay valid
   * (missing = not sprinting).
   */
  sprint?: boolean;
  /**
   * Defensive stance held (dev). Optional so protocol v5 inputs without it stay valid
   * (missing = not guarding). Only takes effect while standing still.
   */
  guard?: boolean;
}

export const emptyInput = (): PlayerInput => ({
  seq: 0,
  mx: 0,
  my: 0,
  aim: 0,
  fire: false,
  slot: 0,
  reload: false,
});

export interface Player {
  id: number;
  name: string;
  /** Chapter (colour scheme) index into content.chapters. */
  chapter: number;
  x: number;
  y: number;
  aim: number;
  hp: number;
  maxHp: number;
  state: PlayerState;
  /** Seconds spent downed. */
  downedTime: number;
  /** 0..1 revive progress while a teammate is nearby. */
  reviveProgress: number;
  invuln: number;
  weapons: string[];
  current: string;
  ammo: Record<string, number>;
  fireCooldown: number;
  /** > 0 while reloading (seconds remaining). */
  reloadTimer: number;
  /** For semi-automatic weapons. */
  triggerWasDown: boolean;
  /** Heat per weapon id (heat weapons only), 0..heat.max. */
  heat: Record<string, number>;
  /** True while the current reload is an overheat vent. */
  venting: boolean;
  input: PlayerInput;
  lastInputSeq: number;
  connected: boolean;
  kills: number;
  /** Personal score: sum of `points` of every enemy this marine killed. */
  score: number;
  /** Kills per enemy type id. */
  killsByType: Record<string, number>;
  /** Seconds without moving (bracing weapons fire faster after braceDelay). */
  stillTime: number;
  /** Firing slow-down 0..1: 1 while the trigger is held, eases to 0 after release. */
  fireSlow: number;
  /** Aim recoil: lateral offset (rad) added to the input aim, recovers over time (data/recoil.ts). */
  recoil: number;
  /** Last tick's movement as a fraction 0..1 of the current walking speed (recoil scaling). */
  moveFrac: number;
  /** Sprint stamina / state / post-sprint weapon delay (see data/sprint.ts). */
  sprint: SprintState;
  /** Defensive stance active this tick (input held + standing still; see data/guard.ts). */
  guarding: boolean;
  damageDealt: number;
  /** Survival second this marine died (or null). */
  diedAt: number | null;
}

export interface Enemy {
  id: number;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  attackCooldown: number;
  /** -1 = not lit. */
  fuse: number;
  /** Lateral strafing direction for ranged enemies. */
  strafe: number;
  /** Charge state: 0 idle, 1 winding up, 2 dashing. */
  chargePhase: 0 | 1 | 2;
  /** Seconds left in the current charge phase. */
  chargeTimer: number;
  chargeCooldown: number;
  /** Locked dash direction. */
  chargeDx: number;
  chargeDy: number;
  /** Underground (untargetable) until it emerges. */
  burrowed: boolean;
  /** Synapse buff this tick (1 = none). */
  synSpeed: number;
  synDamage: number;
  /** > 0 for a moment after attacking (animation). */
  attackAnim: number;
  dead: boolean;
  /** Spawned by another enemy (spore mine from a Biovore...): counts toward the wave, never drops. */
  child: boolean;
  /** Children this enemy has spawned so far (capped by its `spawner.max`). */
  children: number;
  /** Seconds until it may spawn its next child. */
  spawnTimer: number;
  /** End-of-wave hunt: faster, closes in on the marines (no HUD marker). */
  hunt: boolean;
}

export type ProjectileOwner = 'player' | 'enemy';

export interface Projectile {
  id: number;
  owner: ProjectileOwner;
  ownerId: number;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  radius: number;
  damage: number;
  pierceLeft: number;
  /** Size-weighted pierce budget left (data ProjectileSpec.pierceBudget). */
  pierceBudgetLeft?: number;
  pierceBudget?: PierceBudget;
  /** 40k profile vs Tyranids (undefined strength = ignores Toughness / Save). */
  strength?: number;
  ap: number;
  drag: number;
  knockback: number;
  explosion?: ExplosionSpec;
  /** Burst where the shot runs out of range, if it hit nothing (data ProjectileSpec.endBurst). */
  endBurst?: ExplosionSpec;
  /**
   * Start of the swept-collision segment for the next tick. Set on spawn to the
   * shooter's position so point-blank targets inside the muzzle offset are hit.
   */
  sx?: number;
  sy?: number;
  /** Enemy ids already hit (so piercing shots hit each target once). */
  hit: number[];
  /** Ricocheted off a marine's front plate: harmless to everyone, fading out. */
  deflected?: boolean;
  dead: boolean;
}

export type PickupKind = 'weapon' | 'medkit';

export interface Pickup {
  id: number;
  kind: PickupKind;
  /** Weapon id for weapon crates. */
  weapon?: string;
  x: number;
  y: number;
  life: number;
}

/** Things that happened this tick; drive client FX/audio and HUD notifications. */
export type GameEvent =
  /** `s` = supercharged (heat weapons). */
  | { e: 'shot'; p: number; w: string; x: number; y: number; a: number; s?: 1 }
  | { e: 'hit'; x: number; y: number; k: string }
  | { e: 'die'; t: string; x: number; y: number }
  /** `k` = projectile kind for a end-of-range burst (e.g. 'melta'); absent = a normal blast. */
  | { e: 'boom'; x: number; y: number; r: number; k?: string }
  | { e: 'spit'; x: number; y: number; t?: string }
  | { e: 'bite'; p: number; t?: string }
  | { e: 'overheat'; p: number }
  | { e: 'emerge'; x: number; y: number; t: string }
  /** Charge / leap wind-up started (telegraph). */
  | { e: 'charge'; x: number; y: number; t: string }
  /** Wind-up finished: the dash / leap begins. */
  | { e: 'leap'; x: number; y: number; t: string }
  | { e: 'boss'; t: string; n: number }
  | { e: 'hurt'; p: number; d: number }
  | { e: 'down'; p: number }
  | { e: 'revive'; p: number; by: number }
  | { e: 'dead'; p: number }
  | { e: 'unlock'; p: number; w: string }
  | { e: 'pickup'; p: number; k: PickupKind; w?: string }
  | { e: 'crate'; x: number; y: number }
  /** Wave `n` begins: `total` enemies (before children); `f` = forced by the stall timeout. */
  | { e: 'surge'; n: number; total?: number; f?: 1 }
  /** Every enemy of wave `n` is dead; the next wave starts in `next` seconds. */
  | { e: 'cleared'; n: number; next: number }
  /** The last few enemies of the wave hunt the marines. */
  | { e: 'hunt'; n: number }
  /** A hive breach starts pulsing: a group emerges from spawn point `i` soon (`b` = boss). */
  | { e: 'breach'; i: number; t: string; b?: 1 }
  /** The group bursts out of spawn point `i`. */
  | { e: 'swarm'; i: number; n: number }
  /** A player shot hit a Tyranid but its armour save stopped it (spark + ricochet, no marker). */
  | { e: 'bnc'; x: number; y: number; k: string }
  /**
   * An enemy shot glanced off marine `p`'s front plate at (x, y); `a` = ricochet direction
   * (radians), `k` = projectile kind. JSON on the wire; clients that predate it ignore it.
   */
  | { e: 'defl'; p: number; x: number; y: number; a: number; k: string }
  /** Marine braced a bracing weapon (heavy bolter). */
  | { e: 'brace'; p: number; w: string }
  | { e: 'reload'; p: number; w: string }
  | { e: 'switch'; p: number; w: string };

/** A group waiting to emerge from a breach (spawn point) once its telegraph ends. */
export interface QueuedGroup {
  point: number;
  type: string;
  n: number;
  /** Survival second it emerges. */
  at: number;
  hpMul: number;
}

/** A group of the current wave not yet sent to a breach. */
export interface RosterGroup {
  type: string;
  n: number;
  boss?: boolean;
}

export interface DirectorState {
  /** Groups telegraphing at breaches. */
  queue: QueuedGroup[];
  /** Per spawn point: survival second until which it counts as active (emerging). */
  activeUntil: number[];
  /** Breaches the current wave flanks from. */
  surgePoints: number[];
  /** Current wave number (0 before the first wave). */
  wave: number;
  /** 'breather' = between waves (countdown to nextWaveAt), 'active' = a wave is being fought. */
  phase: 'breather' | 'active';
  nextWaveAt: number;
  waveStartedAt: number;
  /** The wave's fixed enemy budget still to be sent out, in dispatch order. */
  roster: RosterGroup[];
  /** Threat credit for pacing the dispatch of the roster. */
  dispatch: number;
  /** Enemies of this wave so far (roster + children spawned). */
  waveTotal: number;
  /** Children spawned this wave (capped by waves.maxChildren). */
  waveChildren: number;
  /** The last enemies are hunting. */
  hunting: boolean;
  /** Survival second the hunt starts anyway (-1 = roster not out yet). */
  huntAt: number;
  /** Drops used this wave (capped by DirectorConfig.drops). */
  drops: { medkits: number; crates: number };
  nextCrateAt: number;
  /** How many boss waves have arrived. */
  bossWaves: number;
  /** Tests / demo: the director spawns nothing and never advances waves. */
  idle: boolean;
}

export interface World {
  /** Content for this run; `content.map === map` and `content.director === map.director`. */
  content: ContentRegistry;
  /** The map being played (arena, player spawn, director). Static data, like `content`. */
  map: MapDef;
  seed: number;
  rng: Rng;
  tick: number;
  /** Survival time in seconds. */
  time: number;
  nextId: number;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  director: DirectorState;
  events: GameEvent[];
  teamSize: number;
  over: boolean;
  /** Totals for the run summary. */
  stats: {
    kills: number;
    shots: number;
    /** Every kill of the run per enemy type id, credited to a marine or not (chain blasts). */
    killsByType: Record<string, number>;
  };
}
