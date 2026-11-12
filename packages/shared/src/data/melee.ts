import type { MeleeMotion, WeaponDef } from './types.js';

/** Default arc of each melee motion (radians relative to aim; + = marine's right / raised). */
export const MELEE_MOTION: Record<MeleeMotion, { from: number; to: number; reach: number }> = {
  slash: { from: 1.15, to: -1.25, reach: 40 },
  chop: { from: 1.55, to: -0.35, reach: 42 },
  smash: { from: 1.75, to: 0.05, reach: 44 },
  sweep: { from: 1.45, to: -1.55, reach: 54 },
  rake: { from: 0.85, to: -0.95, reach: 30 },
};

export function meleeSwingDuration(def: WeaponDef): number {
  if (!def.melee) return 0;
  return def.meleeFx?.duration ?? def.fireInterval * 0.7;
}

/** 0 at the start of the swing, 1 at follow-through. */
export function meleeProgress(remaining: number, duration: number): number {
  if (duration <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - remaining / duration));
}

export function meleeAngle(motion: MeleeMotion, progress: number): number {
  const m = MELEE_MOTION[motion];
  const e = progress * progress * (3 - 2 * progress);
  return m.from + (m.to - m.from) * e;
}

export function meleeReach(def: WeaponDef): number {
  return def.meleeFx?.reach ?? MELEE_MOTION[def.meleeFx?.motion ?? 'slash'].reach;
}
