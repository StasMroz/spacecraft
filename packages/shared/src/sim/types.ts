import type { Rng } from '../math/rng.js';
import type {
  AcidPoolSpec,
  ContentRegistry,
  ExplosionSpec,
  PierceBudget,
  SprintState,
} from '../data/index.js';
import type { MapDef, WallDef } from '../maps/types.js';

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
  /**
   * One-shot: call a drop-pod reinforcement at the aim point (v10). Optional so older
   * inputs stay valid (missing = no call).
   */
  reinforce?: boolean;
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
  /** Visible melee swing remaining (seconds). 0 = idle. Synced on the snapshot as `sw`. */
  swing: number;
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
  /** Damage taken multiplier from a support aura (1 = none; < 1 = stimmed). */
  stimTaken?: number;
  /** > 0 for a moment after attacking (animation). */
  attackAnim: number;
  /** Cooldown of the secondary lobbed attack (EnemyDef.lobAttack). */
  lobCooldown?: number;
  dead: boolean;
  /** Sleeping until a marine or a shot gets too close (infiltration). */
  asleep?: boolean;
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

/** Astra Militarum survivor of a ship crash (data/crash.ts GUARDSMAN). */
export interface Ally {
  id: number;
  x: number;
  y: number;
  aim: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  /** Wreck it guards during the crash wave. */
  homeX: number;
  homeY: number;
  /** Survived its wave: now follows the nearest marine. */
  follow: boolean;
  dead: boolean;
}

/** A ship on its way down (fall) or the smoking impact site (smoke). */
export interface CrashState {
  x: number;
  y: number;
  phase: 'fall' | 'smoke';
  /** Seconds left in this phase. */
  t: number;
  /** Direction the ship comes from (rad). */
  from: number;
}

/** Acid on the floor (data AcidPoolSpec). */
export interface AcidPool {
  id: number;
  x: number;
  y: number;
  r: number;
  life: number;
  duration: number;
  damage: number;
  interval: number;
  /** Seconds to the next burn tick. */
  next: number;
}

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
  /** Where the shot was fired (low cover right next to it does not stop it). */
  ox?: number;
  oy?: number;
  /** Low-cover walls (map indices) this shot already crossed or rolled against (one roll each). */
  cover?: number[];
  /** Skip low-cover checks (Hive Guard impaler, psychic bolts). */
  ignoreLow?: boolean;
  /** Enemy ids already hit (so piercing shots hit each target once). */
  hit: number[];
  /** Ricocheted off a marine's front plate: harmless to everyone, fading out. */
  deflected?: boolean;
  dead: boolean;
  pool?: AcidPoolSpec;
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
  /** Imperial ship seen falling onto (x, y). */
  | { e: 'crash'; x: number; y: number }
  /** Ship impact at (x, y). */
  | { e: 'crashHit'; x: number; y: number }
  /** n Guardsmen climbed out of the wreck at (x, y). */
  | { e: 'allies'; x: number; y: number; n: number }
  /** Guardsman hurt / killed. */
  | { e: 'ahit'; x: number; y: number }
  | { e: 'adie'; x: number; y: number }
  /** Acid pool splashed down (radius r). */
  | { e: 'acid'; x: number; y: number; r: number }
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
  | { e: 'switch'; p: number; w: string }
  /** Reinforcement pod incoming at (x, y) for marine `p`. */
  | { e: 'pod'; x: number; y: number; p: number }
  /** Pod landed and the marine stepped out. */
  | { e: 'land'; x: number; y: number; p: number }
  /** Synapse capillary / objective took damage or was destroyed (`objd`). */
  | { e: 'obj'; x: number; y: number }
  | { e: 'objd'; x: number; y: number }
  /** Relic picked up by marine `p`. */
  | { e: 'relic'; p: number }
  | { e: 'win' }
  | { e: 'fail' };

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
  acid: AcidPool[];
  allies: Ally[];
  crash: CrashState | null;
  /** Last wave a crash was rolled for (-1 none). */
  crashWave: number;
  /** Wreck walls added to `map.walls` (also in the snapshot for clients). */
  wreck: WallDef[];
  director: DirectorState;
  events: GameEvent[];
  teamSize: number;
  over: boolean;
  mission: MissionState;
  reinforce: ReinforceState;
  /** Totals for the run summary. */
  stats: {
    kills: number;
    shots: number;
    /** Every kill of the run per enemy type id, credited to a marine or not (chain blasts). */
    killsByType: Record<string, number>;
  };
}

export interface MissionTarget {
  id: number;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
}

export interface MissionState {
  id: string;
  kind: string;
  timeLimit: number | null;
  extractOpensAt: number | null;
  extractWindow: number | null;
  extractHold: number;
  extractX: number;
  extractY: number;
  extractR: number;
  extractOpen: boolean;
  extractProgress: number;
  crates: boolean;
  crash: boolean;
  targets: MissionTarget[];
  relicX?: number;
  relicY?: number;
  relicR?: number;
  relicCarryMul?: number;
  /** Player id carrying the relic; null = on the ground; undefined = no relic. */
  relicCarrier?: number | null;
  outcome?: 'victory' | 'defeat';
  /** Hunt target (assault); extract opens when this enemy is dead or gone. */
  bossId?: number;
  /** Seconds until each destroy-target nest tries to spawn (assault). */
  nestNext?: number[];
  /** Cages already opened (rescue missions). */
  freed?: boolean[];
}

export interface ReinforcePod {
  id: number;
  playerId: number;
  x: number;
  y: number;
  /** Seconds remaining until landing. */
  t: number;
}

export interface ReinforceState {
  left: number;
  cooldown: number;
  streak: number;
  streakAt: number;
  pods: ReinforcePod[];
}
