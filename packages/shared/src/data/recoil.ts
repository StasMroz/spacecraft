/**
 * Aim recoil ("cursor shake"): every shot kicks the marine's aim sideways a little; the kick
 * recovers on its own. Computed in the shared sim (host-authoritative, seeded world RNG) and
 * mirrored by the client so the drawn reticle is exactly the aim the shots use:
 *   p.aim = input.aim + p.recoil          (projectiles, facing and directional armour)
 * The reticle is drawn rotated by p.recoil around the marine (and pushed out along the aim by
 * recoilPushPx, a display-only function of the same offset).
 *
 * Size of a kick = weapon kickDeg × movement multiplier:
 *   mul = standingMul + (walkingMul − standingMul) × speedFraction      (braced = standing)
 * Recovery is exponential: after t seconds exp(−recoveryPerS·t) of the offset is left
 * (recoveryPerS 3 → 70% back in 0.4 s), so a long burst still drifts — capped at maxDeg.
 */
const RAD = Math.PI / 180;

export interface WeaponRecoilDef {
  /** Lateral kick per shot (degrees, at walking pace). */
  kickDeg: number;
  /** Optional reticle push-out along the aim per kick-sized offset (px, display only). */
  kickDistPx?: number;
  /** Exponential recovery rate (1/s): exp(−rate·t) of the offset remains after t s. */
  recoveryPerS: number;
  /** Cap on the accumulated lateral offset (degrees). */
  maxDeg: number;
}

export const MARINE_AIM_RECOIL = {
  /** Kick multiplier standing still (and braced). */
  standingMul: 0.1,
  /** Kick multiplier at full walking speed. */
  walkingMul: 1.0,
  /** Probability shift towards a clockwise (to the marine's right) kick: P(+) = 0.5 + bias. */
  signBias: 0.15,
  /** Push-out cap = this × kickDistPx. */
  distCapMul: 3,
} as const;

export const WEAPON_RECOIL: Readonly<Record<string, WeaponRecoilDef>> = {
  bolt_rifle: { kickDeg: 0.6, kickDistPx: 1.5, recoveryPerS: 3, maxDeg: 3 },
  heavy_bolter: { kickDeg: 1.2, kickDistPx: 3, recoveryPerS: 3, maxDeg: 6 },
  flamer: { kickDeg: 0.05, recoveryPerS: 4, maxDeg: 0.3 },
  plasma_gun: { kickDeg: 2, kickDistPx: 4, recoveryPerS: 3, maxDeg: 5 },
  meltagun: { kickDeg: 6, kickDistPx: 10, recoveryPerS: 2.8, maxDeg: 7 },
  frag_grenade: { kickDeg: 2, recoveryPerS: 3, maxDeg: 4 },
  storm_bolter: { kickDeg: 0.7, kickDistPx: 1.8, recoveryPerS: 3.2, maxDeg: 4 },
  inferno_pistol: { kickDeg: 4, kickDistPx: 7, recoveryPerS: 2.8, maxDeg: 6 },
  plasma_caster: { kickDeg: 1.2, kickDistPx: 3, recoveryPerS: 3.2, maxDeg: 4 },
  siege_bolter: { kickDeg: 1.6, kickDistPx: 3.5, recoveryPerS: 2.8, maxDeg: 6 },
  plasma_pistol: { kickDeg: 2.4, kickDistPx: 5, recoveryPerS: 3, maxDeg: 5 },
  bolt_carbine: { kickDeg: 0.45, kickDistPx: 1.2, recoveryPerS: 3.4, maxDeg: 2.5 },
  stalker_bolter: { kickDeg: 1.4, kickDistPx: 3, recoveryPerS: 2.8, maxDeg: 4 },
};

/** Weapons without an entry (future content) kick like a bolt rifle. */
export const DEFAULT_RECOIL: WeaponRecoilDef = {
  kickDeg: 0.8,
  kickDistPx: 2,
  recoveryPerS: 3,
  maxDeg: 4,
};

export const weaponRecoil = (id: string): WeaponRecoilDef =>
  Object.prototype.hasOwnProperty.call(WEAPON_RECOIL, id) ? WEAPON_RECOIL[id]! : DEFAULT_RECOIL;

export interface RecoilState {
  /** Lateral aim offset (radians, + = clockwise on screen). */
  recoil: number;
}

/** Kick multiplier for a movement speed fraction 0..1 (braced counts as standing). */
export function recoilMoveMul(speedFraction: number, braced = false): number {
  const A = MARINE_AIM_RECOIL;
  const f = braced ? 0 : Math.min(1, Math.max(0, speedFraction));
  return A.standingMul + (A.walkingMul - A.standingMul) * f;
}

/** Recovery for dt seconds (pure; the host sim and the client mirror share it). */
export function stepRecoil(s: RecoilState, def: WeaponRecoilDef, dt: number): void {
  const k = Math.exp(-def.recoveryPerS * dt);
  s.recoil *= k;
  if (Math.abs(s.recoil) < 1e-5) s.recoil = 0;
}

/**
 * One shot's kick. `u` = a uniform 0..1 draw from the seeded world RNG (sign; slight bias to +).
 * Returns the signed angle added (radians, before the cap).
 */
export function applyRecoilKick(
  s: RecoilState,
  def: WeaponRecoilDef,
  mul: number,
  u: number,
): number {
  const sign = u < 0.5 + MARINE_AIM_RECOIL.signBias ? 1 : -1;
  const kick = sign * def.kickDeg * RAD * mul;
  const cap = def.maxDeg * RAD;
  s.recoil = Math.max(-cap, Math.min(cap, s.recoil + kick));
  return kick;
}

/**
 * Reticle push-out (px) for a lateral offset: kickDistPx per full kick of offset, capped at
 * distCapMul × kickDistPx. Display only; decays with the offset, so it needs no state.
 */
export function recoilPushPx(def: WeaponRecoilDef, recoil: number): number {
  if (!def.kickDistPx || def.kickDeg <= 0) return 0;
  const kicks = Math.abs(recoil) / (def.kickDeg * RAD);
  return Math.min(MARINE_AIM_RECOIL.distCapMul, kicks) * def.kickDistPx;
}

/** Wire coding of p.recoil in the player row flags (bits 21..30, offset binary, 0 = absent). */
export const RECOIL_WIRE = { shift: 21, mask: 0x3ff, scale: 2000, bias: 512 } as const;

/** Seconds for `fraction` (0..1) of an offset to recover. */
export const recoilRecoveryTime = (def: WeaponRecoilDef, fraction = 0.7): number =>
  -Math.log(1 - fraction) / def.recoveryPerS;
