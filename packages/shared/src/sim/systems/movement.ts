import { PLAYER } from '../../constants.js';
import { clamp } from '../../math/vec.js';
import { MARINE_SPRINT, sprintWeaponReady, type SprintState } from '../../data/sprint.js';
import type { ArenaSize, WallDef } from '../../maps/types.js';
import { WAVE_MAP } from '../../maps/wave.js';
import { pushOutOfWalls } from '../walls.js';

/**
 * Player movement for one input frame. Pure & deterministic: the client calls
 * the exact same function for prediction, so keep it free of world state.
 */
export function stepPlayerMovement(
  pos: { x: number; y: number },
  mx: number,
  my: number,
  speed: number,
  dt: number,
  /** Map playfield and walls; defaults to the wave map. */
  field: { arena: ArenaSize; walls: readonly WallDef[] } = WAVE_MAP,
): void {
  const { arena } = field;
  let dx = clamp(mx, -1, 1);
  let dy = clamp(my, -1, 1);
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l > 1) {
    dx /= l;
    dy /= l;
  }
  pos.x = clamp(pos.x + dx * speed * dt, PLAYER.radius, arena.width - PLAYER.radius);
  pos.y = clamp(pos.y + dy * speed * dt, PLAYER.radius, arena.height - PLAYER.radius);
  if (pushOutOfWalls(pos, PLAYER.radius, field.walls)) {
    pos.x = clamp(pos.x, PLAYER.radius, arena.width - PLAYER.radius);
    pos.y = clamp(pos.y, PLAYER.radius, arena.height - PLAYER.radius);
  }
}

export const playerMoveSpeed = (moveSpeedMul: number): number => PLAYER.speed * moveSpeedMul;

/**
 * Firing slow-down state for one tick: snaps to 1 while the trigger is held, then eases back to 0
 * over PLAYER.fireMoveRecover seconds. Pure, so the client predicts it from its own inputs.
 */
export function stepFireSlow(fireSlow: number, firing: boolean, dt: number): number {
  return firing ? 1 : Math.max(0, fireSlow - dt / PLAYER.fireMoveRecover);
}

/** Marine speed with the equipped weapon: carry penalty × (eased) firing penalty. */
export function marineMoveSpeed(
  weapon: { moveSpeedMul: number; fireMoveMul: number },
  fireSlow: number,
): number {
  return PLAYER.speed * weapon.moveSpeedMul * (1 - (1 - weapon.fireMoveMul) * fireSlow);
}

/** Sprint speed: MARINE_SPRINT.speedMul × base marine speed (no carry / firing penalty). */
export const marineSprintSpeed = (): number => PLAYER.speed * MARINE_SPRINT.speedMul;

/**
 * The trigger as the sim sees it: ignored while sprinting and during the post-sprint weapon
 * delay (so it doesn't fire or slow the marine down either).
 */
export const effectiveFire = (fire: boolean, sprint: SprintState): boolean =>
  fire && sprintWeaponReady(sprint);

/** Facing while sprinting: the movement direction (null = keep the aim). */
export function sprintFacing(sprint: SprintState, mx: number, my: number): number | null {
  return sprint.sprinting && (mx !== 0 || my !== 0) ? Math.atan2(my, mx) : null;
}

/** Movement input magnitude below this counts as standing still (stick drift / deadzone). */
export const STILL_INPUT = 0.15;

/** Real movement input (stick drift below STILL_INPUT counts as standing still). */
export const isMoving = (mx: number, my: number): boolean => Math.hypot(mx, my) > STILL_INPUT;
