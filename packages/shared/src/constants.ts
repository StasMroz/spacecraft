/** Global tunables. Gameplay content (weapons, enemies, waves) lives in `data/`. */

export const GAME_VERSION = '0.6.1';
/** Bump whenever the wire protocol or data tables change incompatibly. */
export const PROTOCOL_VERSION = 10;

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
/** Max simulation ticks the host will run in one frame to catch up after a stall. */
export const MAX_CATCHUP_TICKS = 5;

/** Marines per squad / session (lobby, spawn ring, chapters, highscore boards 1..MAX_PLAYERS). */
export const MAX_PLAYERS = 8;
export const MIN_TEAM_SIZE = 1;

/**
 * Network tuning (see net/wire.ts). Snapshots go out as per-link delta-encoded binary;
 * enemies/projectiles outside a client's interest box (well beyond any screen) are only
 * refreshed every `farEvery`-th snapshot. `snapshotEvery` = sim ticks per snapshot for
 * network sessions (2 = 15 Hz at the 30 Hz sim; solo play snapshots every tick).
 */
export const NET = {
  snapshotEvery: 2,
  interest: { halfWidth: 1700, halfHeight: 1100, farEvery: 4 },
} as const;

export const ARENA = { width: 3200, height: 2200 } as const;

export const PLAYER = {
  radius: 16,
  speed: 230,
  maxHp: 100,
  /** Seconds a downed marine can wait for a revive before dying. */
  // v0.4: tripled (was 20 s) so squads have time to fight their way to a downed brother.
  bleedOutTime: 60,
  /** Seconds a teammate must stand next to a downed marine to revive them. */
  reviveTime: 3,
  reviveRadius: 70,
  /** HP restored on revive (fraction of max). */
  reviveHpFraction: 0.4,
  /** Short invulnerability after being hit / revived (seconds). */
  hurtInvuln: 0.25,
  reviveInvuln: 2,
  /** Seconds the firing slow-down (WeaponDef.fireMoveMul) takes to wear off after the trigger is released. */
  fireMoveRecover: 0.35,
} as const;

export const PICKUP = {
  radius: 30,
  lifetime: 35,
  medkitHeal: 40,
} as const;
