/**
 * Sprint (v0.5.3-dev): a marine can run much faster than his normal armed pace for a few seconds,
 * but he can't shoot while sprinting and his weapon needs a moment to come back up afterwards.
 *
 * - Speed while sprinting = `speedMul` × the base marine speed (PLAYER.speed), regardless of the
 *   weapon's carry penalty or the firing slow-down.
 * - Stamina (seconds of sprint) drains at `drainPerS` while sprinting and regenerates whenever the
 *   marine is not sprinting: `regenStandingPerS` while standing still, `regenWalkingPerS` (half
 *   that) while walking. Sprint itself never regenerates stamina.
 * - Sprint starts instantly when the sprint input is held while moving and stamina ≥
 *   `minToStartS`; it stops when the input is released, the marine stops moving, he enters revive
 *   range of a downed squadmate (can't sprint while reviving), or stamina runs out (auto-stop;
 *   a restart needs `minToStartS` again).
 * - While sprinting the trigger is ignored (it does NOT cancel the sprint: release sprint to
 *   fight).
 * - v0.6.0 hotfix: a sprint does NOT start while the trigger is held (fire input: mouse/key or
 *   the touch aim stick firing). The request waits; once the trigger is released and sprint is
 *   still requested (while moving, with stamina), the sprint starts. After any sprint ends, the weapon is ready only after `weaponReadyDelayS`.
 * - While sprinting the marine faces where he runs (not the aim), so directional armour turns
 *   with him: running away exposes the rear plate.
 */
export const MARINE_SPRINT = {
  speedMul: 1.56, // v0.6.0 hotfix: bonus +70% → +56% (−20%)
  /** Full stamina, in seconds of sprint (v0.6.0 hotfix: 3 → 2.4 s, −20%). */
  staminaMaxS: 2.4,
  /** Stamina regained per second while standing still (full in 7 s). */
  regenStandingPerS: 2.4 / 7,
  /** Stamina regained per second while walking (not sprinting); half the standing rate. */
  regenWalkingPerS: 2.4 / 7 / 2,
  /** Stamina spent per second of sprint. */
  drainPerS: 1,
  /** Minimum stamina to (re)start a sprint. */
  minToStartS: 0.5,
  /** Seconds after a sprint ends before the weapon can fire again. */
  weaponReadyDelayS: 0.8,
} as const;

export interface SprintState {
  /** Seconds of sprint left (0..staminaMaxS). */
  stamina: number;
  sprinting: boolean;
  /** Seconds until the weapon is ready again after a sprint (0 = ready). */
  weaponDelay: number;
}

export const newSprintState = (): SprintState => ({
  stamina: MARINE_SPRINT.staminaMaxS,
  sprinting: false,
  weaponDelay: 0,
});

/**
 * One tick of the sprint state machine. Pure & deterministic (host sim and client prediction
 * share it). `moving` = real movement input (above the stick-drift threshold); `allowed` = false
 * while reviving a squadmate; `firing` = the raw fire input is held (blocks only the START of a
 * sprint; a sprint already running keeps going and ignores the trigger).
 */
export function stepSprint(
  s: SprintState,
  want: boolean,
  moving: boolean,
  allowed: boolean,
  dt: number,
  firing = false,
): void {
  const S = MARINE_SPRINT;
  const was = s.sprinting;
  const canRun = was ? s.stamina > 0 : !firing && s.stamina >= S.minToStartS;
  const sprint = want && moving && allowed && canRun;
  if (sprint) s.stamina = Math.max(0, s.stamina - S.drainPerS * dt);
  else {
    const regen = moving ? S.regenWalkingPerS : S.regenStandingPerS;
    s.stamina = Math.min(S.staminaMaxS, s.stamina + regen * dt);
  }
  if (sprint) s.weaponDelay = 0;
  else if (was) s.weaponDelay = S.weaponReadyDelayS;
  else s.weaponDelay = Math.max(0, s.weaponDelay - dt);
  s.sprinting = sprint;
}

/** True when the weapon may fire (not sprinting, post-sprint delay elapsed). */
export const sprintWeaponReady = (s: SprintState): boolean => !s.sprinting && s.weaponDelay <= 0;
