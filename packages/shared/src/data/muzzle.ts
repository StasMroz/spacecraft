/**
 * Muzzle geometry per marine weapon, in the marine's own frame (+forward = aim direction,
 * +lateral = the marine's right, i.e. clockwise on screen; world px, marine centre = 0,0).
 * Values match the barrel tip of each held-weapon sprite (tools/src/sprites/weapons.ts, which
 * holds the gun in the right hand at GRIP_R = [11, 7]); a tools test renders every sprite and
 * checks the tip really is there.
 *
 * The SIM does not use these: projectiles still spawn on the aim line at `SIM_MUZZLE_FORWARD`
 * with a swept collision from the marine centre (balance + determinism unchanged). The client
 * draws the flash, casing, and the first ~`convergePx` of every shot from the visual muzzle,
 * blending into the true sim path, so shots always come out of the barrel.
 */
export interface MuzzleDef {
  /** Distance along the aim from the marine centre to the barrel tip. */
  forward: number;
  /** Sideways offset of the bore (+ = marine's right). */
  lateral: number;
  /** Ejection port / breech, back from the tip (casings, vents). */
  breech: number;
}

export const WEAPON_MUZZLE: Readonly<Record<string, MuzzleDef>> = {
  bolt_rifle: { forward: 44, lateral: 4, breech: 22 },
  heavy_bolter: { forward: 48, lateral: 3.75, breech: 26 },
  flamer: { forward: 43, lateral: 2.25, breech: 20 },
  plasma_gun: { forward: 45, lateral: 4, breech: 18 },
  meltagun: { forward: 43, lateral: 4, breech: 18 },
  /** Grenade thrown from the left hand (bolt pistol in the right). */
  frag_grenade: { forward: 26, lateral: 2, breech: 6 },
  storm_bolter: { forward: 35, lateral: 4, breech: 16 },
  inferno_pistol: { forward: 35, lateral: 4, breech: 16 },
  plasma_caster: { forward: 35, lateral: 4, breech: 16 },
  siege_bolter: { forward: 35, lateral: 4, breech: 16 },
  plasma_pistol: { forward: 35, lateral: 4, breech: 16 },
  bolt_carbine: { forward: 35, lateral: 4, breech: 16 },
  stalker_bolter: { forward: 35, lateral: 4, breech: 16 },
  chainsword: { forward: 35, lateral: 4, breech: 16 },
  power_axe: { forward: 35, lateral: 4, breech: 16 },
  thunder_hammer: { forward: 35, lateral: 4, breech: 16 },
};

/** Any future weapon without an entry (matches the generic held sprite: tip at x = 35). */
export const DEFAULT_MUZZLE: MuzzleDef = { forward: 35, lateral: 4, breech: 16 };

/** Where the sim spawns player projectiles (on the aim line; collision swept from the centre). */
export const SIM_MUZZLE_FORWARD = 26;

/** Client: distance (px of travel) over which a shot blends from the visual muzzle to its sim path. */
export const MUZZLE_CONVERGE_PX = 120;

export function muzzleDef(weaponId: string): MuzzleDef {
  return Object.prototype.hasOwnProperty.call(WEAPON_MUZZLE, weaponId)
    ? WEAPON_MUZZLE[weaponId]!
    : DEFAULT_MUZZLE;
}

/** Held-weapon pose as drawn: pulled back along the aim, extra rotation, uniform scale. */
export interface WeaponPoseXf {
  back?: number;
  rot?: number;
  scale?: number;
}

/**
 * World position of the barrel tip for a marine at (x, y) aiming `aim`, with the weapon drawn
 * pulled back by `back` px along the aim (recoil / raise), rotated by an extra `rot` around the
 * marine centre offset point and scaled by `scale` (the 0.8 s raise after a sprint).
 */
export function muzzlePoint(
  x: number,
  y: number,
  aim: number,
  weaponId: string,
  pose: WeaponPoseXf = {},
): { x: number; y: number; a: number } {
  const m = muzzleDef(weaponId);
  const back = pose.back ?? 0;
  const rot = pose.rot ?? 0;
  const k = pose.scale ?? 1;
  const cx = x - Math.cos(aim) * back;
  const cy = y - Math.sin(aim) * back;
  const a = aim + rot;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    x: cx + (c * m.forward - s * m.lateral) * k,
    y: cy + (s * m.forward + c * m.lateral) * k,
    a,
  };
}

/** Blend weight of the visual muzzle offset after `travelled` px (1 at the muzzle → 0). */
export function muzzleBlend(travelled: number, convergePx = MUZZLE_CONVERGE_PX): number {
  if (!(convergePx > 0)) return 0;
  const t = Math.min(1, Math.max(0, travelled / convergePx));
  return 1 - t * t * (3 - 2 * t);
}
