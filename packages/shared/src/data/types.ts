/**
 * Schema for data-driven game content. Adding a weapon / enemy normally means
 * adding one entry to `weapons.ts` / `enemies.ts` (+ sprites & sounds in tools/).
 * See docs/ADDING_CONTENT.md.
 */

export interface ExplosionSpec {
  radius: number;
  damage: number;
  /** Damage applied at the edge relative to the centre (0..1). */
  edgeFactor: number;
  /** Explosions can hurt players too (enemy explosions always do). */
  friendlyFire?: boolean;
  /** Blast Strength / AP vs Tyranid Toughness / Save (see data/profile.ts). Omit = ignores both. */
  strength?: number;
  ap?: number;
  /** Acid left on the floor at the blast centre (Biovore / spore mine). */
  pool?: AcidPoolSpec;
}

/**
 * One shot's pierce budget, spent per enemy hit by its size class, nearest first. A target that
 * costs more than what is left stops the shot without being hit; nothing behind it is hit either.
 */
export interface PierceBudget {
  total: number;
  cost: Readonly<Record<EnemySize, number>>;
}

export interface ProjectileSpec {
  /** Visual + audio key; the client maps it to sprites/particles. */
  kind: string;
  speed: number;
  /** Random +- fraction applied to speed per projectile. */
  speedJitter?: number;
  lifetime: number;
  radius: number;
  damage: number;
  /** How many *additional* enemies the projectile can pass through. */
  pierce: number;
  /** Size-weighted pierce: replaces `pierce` when set (see PierceBudget). */
  pierceBudget?: PierceBudget;
  /**
   * 40k-style profile vs Tyranids (data/profile.ts): Strength vs Toughness scales `damage`,
   * AP (positive, 2 = "AP-2") worsens their armour save. Omit strength = ignores both.
   */
  strength?: number;
  ap?: number;
  /** Velocity multiplier lost per second (0 = none, 0.9 = loses 90%/s). */
  drag?: number;
  knockback: number;
  explosion?: ExplosionSpec;
  /**
   * Burst at the end of the projectile's range (lifetime runs out inside the arena), e.g. the
   * meltagun's heat flash. Fires after a miss or after piercing hits — the beam keeps flying to
   * max range. Not after a deflection, not when it leaves the arena.
   */
  endBurst?: ExplosionSpec;
  /**
   * Acid pool left on the floor where the shot lands without hitting a marine (end of range or
   * stopped by a wall; not after a deflection or off-map). `onHit` also leaves it under a struck
   * marine (big lobbed globs). Burns marines inside it, never through a full wall.
   */
  pool?: AcidPoolSpec;
  /** Lobbed: lands at the target's position at firing time (lifetime capped to that distance). */
  lob?: boolean;
}

export interface AcidPoolSpec {
  radius: number;
  /** Seconds before it dries up. */
  duration: number;
  /** Damage per burn tick to every marine inside (armour ignored). */
  damage: number;
  /** Seconds between burn ticks. */
  interval: number;
  onHit?: boolean;
}

/**
 * Plasma-style heat: every shot adds heat, heat bleeds off over time. Above
 * `superchargeAt` shots are supercharged (more damage, bigger bolt); reaching `max` overheats
 * the weapon: the marine takes `selfDamage` and the weapon vents for `ventTime` seconds.
 */
export interface HeatSpec {
  perShot: number;
  max: number;
  coolPerSec: number;
  /** Fraction of max (0..1) from which shots are supercharged. */
  superchargeAt: number;
  superchargeDamageMul: number;
  /** Supercharged shots: +Strength and +AP (plasma overcharge). */
  superchargeStrength?: number;
  superchargeAp?: number;
  ventTime: number;
  selfDamage: number;
}

export type WeaponRole =
  | 'GENERALIST'
  | 'ANTI-HORDE'
  | 'ANTI-ELITE'
  | 'ANTI-TANK'
  | 'SUSTAINED'
  | 'BLAST'
  | 'SHORT RANGE'
  | 'OVERCHARGE'
  | 'MELEE';

export interface WeaponDef {
  id: string;
  /** Display name (see data/naming.ts to rename everything at once). */
  name: string;
  /** Number key used to select the weapon (1..9). Also defines HUD order. */
  slot: number;
  description: string;
  /** Battlefield role tags shown in the HUD / pickup tooltip, e.g. ['ANTI-HORDE']. */
  roles: WeaponRole[];
  /** Seconds between shots. */
  fireInterval: number;
  /** Hold to fire (true) vs click per shot (false). */
  automatic: boolean;
  magazine: number;
  reloadTime: number;
  /** Projectiles per shot. */
  pellets: number;
  /** Total spread cone in radians. */
  spread: number;
  /** Movement speed multiplier while this weapon is equipped. */
  moveSpeedMul: number;
  /**
   * Extra movement multiplier while the trigger is held (on top of moveSpeedMul); it eases back
   * to 1 over PLAYER.fireMoveRecover seconds after the trigger is released.
   */
  fireMoveMul: number;
  /**
   * Bracing (heavy weapons): after standing still for `braceDelay` seconds the weapon fires
   * `braceFireRateMult`× faster with `braceSpreadMult`× the spread. Omit braceDelay = no bracing.
   */
  braceDelay?: number;
  braceFireRateMult?: number;
  braceSpreadMult?: number;
  projectile: ProjectileSpec;
  heat?: HeatSpec;
  /**
   * Wave at whose start every marine unlocks it (v0.6.0 hotfix: waves, not survival time);
   * 0 = starting weapon; null = crate-only.
   */
  unlockAtWave: number | null;
  /** Relative weight when a weapon crate rolls its contents. 0 = never in crates. */
  crateWeight: number;
  /** Sound keys (recipes in tools/src/audio/recipes.ts). */
  sfx: {
    fire: string;
    reload: string;
    /** Supercharged shot (heat weapons). */
    superFire?: string;
    /** Held-trigger loop (flamer): `fire` is the ignition, `loop` roars while held, `end` is the tail. */
    loop?: string;
    end?: string;
    /** Projectile impact on a Tyranid. */
    impact?: string;
    /** Loop whose level follows the local player's heat (plasma whine). */
    heatLoop?: string;
    /** Played when the marine braces (bracing weapons). */
    brace?: string;
  };
  /** Sprite keys (see tools/src/sprites). */
  /** icon = HUD, pickup = crate, held = weapon + gauntlets overlay drawn on the marine. */
  sprites: { icon: string; pickup: string; held: string };
  /**
   * If set, only this chapter unlocks / finds the weapon (slot may be shared with the other
   * chapters' specials). Used for the wave-4 "instead of the flamer" signature weapons.
   */
  chapter?: string;
  /** Melee swing: no ammo, fireInterval is the swing recovery. */
  melee?: boolean;
  /** Visible swing style (chapter melee). Ignored on ranged weapons. */
  meleeFx?: MeleeFx;
}

/** How a melee weapon is swung in the renderer (pose is derived from remaining swing time). */
export type MeleeMotion = 'slash' | 'chop' | 'smash' | 'sweep' | 'rake';

export interface MeleeFx {
  motion: MeleeMotion;
  /** Primary smear / power-field colour. */
  trail: string;
  /** Secondary accent (frost, blood, sparks). */
  trail2?: string;
  /** Visible swing length in seconds (recovery may be longer). */
  duration: number;
  /** 0..1 along the swing when the blade crosses the damage arc. */
  impactAt?: number;
  /** Visual blade reach from the marine centre (px). */
  reach?: number;
  /** Camera shake added at impact (thunder / forge hammers). */
  shake?: number;
}

export type EnemySize = 'tiny' | 'small' | 'medium' | 'large';

export type EnemyBehavior = 'melee' | 'ranged' | 'kamikaze';

export interface EnemyRangedSpec {
  range: number;
  preferredDistance: number;
  cooldown: number;
  projectile: ProjectileSpec;
}

export interface EnemyExplodeSpec extends ExplosionSpec {
  /** Distance to a marine at which the fuse is lit. */
  triggerDistance: number;
  fuse: number;
  /** Also explode when killed. */
  onDeath: boolean;
  /** Acid left on the floor at the blast (Biovore / spore mine). */
  pool?: AcidPoolSpec;
}

/** Wind up, then dash in a straight line (Hormagaunt leap, Carnifex charge). */
export interface EnemyChargeSpec {
  /** Starts a charge when the target is between minDistance and triggerDistance. */
  triggerDistance: number;
  minDistance: number;
  windup: number;
  duration: number;
  speedMul: number;
  cooldown: number;
  /** Contact damage while dashing (replaces contactDamage). */
  damage: number;
}

/** Spawns underground, tunnels fast and untargetable, emerges next to a marine. */
export interface EnemyBurrowSpec {
  emergeDistance: number;
  speedMul: number;
}

/** Synapse creature: nearby swarm moves faster, hits harder and closes in more boldly. */
/** Spawns child enemies during the wave (e.g. a Biovore seeding spore mines). */
export interface EnemySpawnerSpec {
  enemy: string;
  /** Seconds between children. */
  interval: number;
  /** Children per parent, ever (no endless regeneration). */
  max: number;
  /** Only while a marine is within this distance. */
  range: number;
}

export interface EnemySynapseSpec {
  radius: number;
  speedMul: number;
  damageMul: number;
}

/**
 * Support aura (Psychophage "Bio-stimulus"): every other Tyranid within `radius` that the source
 * can see (full walls block it) moves and hits harder, takes less damage and — melee — closes in
 * from all sides instead of in a line. Never stacks: several sources / synapse take the best value.
 */
export interface EnemyStimSpec {
  radius: number;
  speedMul: number;
  damageMul: number;
  /** Damage taken multiplier (< 1). */
  damageTakenMul: number;
}

export interface EnemyDef {
  id: string;
  /** Display name (see data/naming.ts). */
  name: string;
  /** One-line flavour/role shown in docs and the sprite sheet. */
  role: string;
  /** Wounds, in HP. */
  hp: number;
  /** 40k Toughness vs weapon Strength (data/profile.ts). */
  toughness: number;
  /** Armour save: 4 = 4+, 2 = 2+ (best), 7 = none. Weapon AP worsens it. */
  save: number;
  speed: number;
  /** Steering responsiveness (1/s). */
  accel: number;
  radius: number;
  /** Body class for size-weighted pierce (ProjectileSpec.pierceBudget). */
  size: EnemySize;
  /** Knockback resistance; higher = harder to push. */
  mass: number;
  behavior: EnemyBehavior;
  contactDamage: number;
  contactCooldown: number;
  ranged?: EnemyRangedSpec;
  /**
   * Secondary ranged attack of a melee beast (Carnifex acid glob): fired at a visible marine
   * between `minDistance` and `range`, on its own cooldown, never while charging.
   */
  lobAttack?: EnemyRangedSpec & { minDistance: number };
  explode?: EnemyExplodeSpec;
  charge?: EnemyChargeSpec;
  burrow?: EnemyBurrowSpec;
  synapse?: EnemySynapseSpec;
  stim?: EnemyStimSpec;
  spawner?: EnemySpawnerSpec;
  /** Group size the director spawns (default: director spawn.groupMin..groupMax). */
  group?: [number, number];
  /** Boss: big HP bar + banner on the client. */
  boss?: boolean;
  /** Spawn director cost. */
  threat: number;
  /** Score awarded to the marine who lands the killing blow. */
  points: number;
  /** Chance to drop a medkit on death (within the wave's drop budget; children never drop). */
  medkitDropChance: number;
  sprite: string;
  /** death/attack + optional roar (charge / emerge / boss arrival). */
  sfx: {
    death: string;
    attack?: string;
    /** Emerge / boss roar. */
    roar?: string;
    /** Charge wind-up cue (played when the leap / charge telegraph starts). */
    windup?: string;
    /** Dash / leap start. */
    leap?: string;
    /** Footstep, played every `stepEvery` px moved (heavy beasts). */
    step?: string;
    stepEvery?: number;
    /** One-shot repeated while moving (skittering) or burrowed (rumble). */
    move?: string;
    moveEvery?: number;
    /** Looping drone while alive (synapse creatures); level follows distance. */
    aura?: string;
  };
  decal: 'blood' | 'acid';
}

export interface SpawnPointDef {
  id: string;
  x: number;
  y: number;
  /** Visual style: wall breach, floor tunnel mouth or vent. */
  kind: 'breach' | 'tunnel' | 'vent';
}

export interface WaveTableEntry {
  /** Entry applies from this wave number until the next entry. */
  fromWave: number;
  /** Relative spawn weights per enemy id. */
  weights: Record<string, number>;
}

/** Per team size 1..MAX_PLAYERS (index = teamSize - 1). */
export type PerTeamSize = readonly number[];

/**
 * How the swarm scales with squad size (every array: index = teamSize - 1, squads of 1..8).
 * Tuned with `npm run sim` so average survival stays roughly flat across squad sizes.
 */
export interface TeamScaling {
  /** Multiplier on each wave's threat budget (more enemies). */
  budget: PerTeamSize;
  /** Multiplier on the threat-per-second dispatch pace (enemies arrive faster). */
  pace: PerTeamSize;
  /** Multiplier on the max-alive cap. */
  maxAlive: PerTeamSize;
  /** Multiplier on the per-wave cap of spawner children (Rippers from Ravener tunnels...). */
  children: PerTeamSize;
  /** Multiplier on Tyranid HP (harder to kill), on top of the per-wave growth. */
  hp: PerTeamSize;
  /** Multiplier on the wave-table weight of elites (threat >= eliteThreat): more Warriors, Genestealers, Carnifexes. */
  elite: PerTeamSize;
  /** Enemies with at least this threat count as elites for `elite`. */
  eliteThreat: number;
}

export interface DirectorConfig {
  /** Squad-size scaling table (more enemies, tougher, more elites, faster). */
  teamScaling: TeamScaling;
  /**
   * Finite waves: wave n has a fixed threat budget of (base + perWave * (n-1)^exponent) * teamScaling.budget.
   * The next wave starts only when every enemy of the wave (children included) is dead.
   */
  waves: {
    /** Seconds before wave 1. */
    firstDelay: number;
    /** Breather between "WAVE N CLEARED" and the next wave. */
    breather: number;
    budget: { base: number; perWave: number; exponent: number };
    /** Threat per second sent to the breaches while the roster lasts: (base + perWave*(n-1)) * teamScaling.pace. */
    pace: { base: number; perWave: number };
    /** Breaches a wave flanks from, [min, max]. */
    flankPoints: [number, number];
    /** Enemy HP multiplier grows by this fraction per wave. */
    hpScalePerWave: number;
    /** Children (spawner enemies) per wave at most, times teamScaling.children. */
    maxChildren: number;
    /**
     * Anti-stall: once the roster is out and at most max(remaining, fraction * total) enemies are
     * left, or `afterSec` seconds passed since the roster ran out, the rest are revealed and hunt.
     */
    reveal: { remaining: number; fraction: number; afterSec: number; speedMul: number };
    /** Hard stall timeout: seconds after a wave started that force the next one. */
    forceNextAfter: number;
  };
  maxAlive: { base: number; perWave: number; cap: number };
  /**
   * Fixed hive breaches the swarm emerges from (arena coordinates). The director picks among
   * them (never one too close to a marine); a wave flanks from several at once.
   */
  spawnPoints: SpawnPointDef[];
  spawn: {
    /** Seconds a breach pulses before the group emerges (boss: bossTelegraph). */
    telegraph: number;
    bossTelegraph: number;
    /** A breach this close to a living marine is not used. */
    pointMinDistance: number;
    minDistance: number;
    maxDistance: number;
    groupMin: number;
    groupMax: number;
    groupSpread: number;
  };
  /** Per-wave drop budget, so kills and crates can't be farmed. */
  drops: {
    /**
     * Medkits from kills per wave: base + perMarine * (teamSize - 1); fractions carry over
     * between waves (sim dropCaps). Bosses always drop.
     */
    medkits: { base: number; perMarine: number };
    /** Weapon crates per wave: base + perMarine * (teamSize - 1); fractions carry over. */
    crates: { base: number; perMarine: number };
  };
  /** Weapon crate timing inside a wave (survival seconds after the wave starts). */
  crates: {
    firstAfter: number;
    intervalMin: number;
    intervalMax: number;
    minDistance: number;
    maxDistance: number;
  };
  /** Boss waves: wave `firstWave` and every `everyWave` waves after it. */
  bosses: {
    enemy: string;
    firstWave: number;
    everyWave: number;
    /** Bosses per appearance by team size (index = teamSize - 1). */
    count: PerTeamSize;
    /** Extra bosses per further appearance. */
    extraPerAppearance: number;
  };
  /** Support boss (one per appearance) on wave `firstWave` and every `everyWave` after it. */
  support?: { enemy: string; firstWave: number; everyWave: number };
  waveTable: WaveTableEntry[];
}

/** A player colour scheme (Space Marine chapter). Index order is used on the wire. */
export interface ChapterDef {
  id: string;
  /** Display name (see data/naming.ts). */
  name: string;
  /** Main armour colour. */
  primary: string;
  /** Pauldron trim / secondary colour. */
  trim: string;
  /** Small details: eye lenses, purity seals, icon fill. */
  detail: string;
  /** Eye-lens glow colour. */
  lens: string;
  /** Simple geometric shoulder icon (own design, not a chapter logo replica). */
  icon: 'chevron' | 'drop' | 'blade' | 'tower' | 'fang' | 'flame' | 'bolt' | 'feather';
  /** Our own flavour line shown in the lobby picker. */
  motto: string;
  /** Signature special (replaces the shared flamer at wave 4). */
  specialWeapon: string;
  /** Signature melee (shared slot 7, unlocks at wave 2). */
  meleeWeapon: string;
}
