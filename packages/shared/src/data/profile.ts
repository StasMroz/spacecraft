import type { EnemyDef, ProjectileSpec, WeaponDef, WeaponRole } from './types.js';

/**
 * Warhammer 40k-style damage profiles (10th-edition spirit, adapted to a real-time HP game).
 *
 * Every player weapon hit has Strength (S), Armour Penetration (AP, written as a positive number:
 * 2 = "AP-2") and Damage (the projectile / blast `damage`, in HP). Every Tyranid has Toughness (T)
 * and an armour Save (Sv, "4" = 4+, 7 = no save) on top of its wounds (`hp`).
 *
 *   wound multiplier (expected, no dice):  S >= 2T: 1.25   S > T: 1.0   S = T: 0.75
 *                                          S < T: 0.5     2S <= T: 0.25
 *   armour save (rolled per hit):          Sv + AP >= 7 never saves, otherwise saves on
 *                                          (7 - Sv - AP) / 6 (a 2+ save is the best: 5/6)
 *   damage dealt = damage × woundMul, or 0 if the save is made ("armour bounced").
 *
 * So small arms (S4 AP-1) shred gaunts but bounce off a Carnifex (T9 2+); a Meltagun (S9 AP-4)
 * goes straight through. High-damage shots are wasted on 1-wound gaunts (overkill is lost, see
 * `pierce`), so heavy weapons belong on multi-wound monsters. Hits without a Strength (enemy
 * spore blasts) ignore T and Sv.
 */
export interface HitProfile {
  strength?: number;
  ap?: number;
}

/** Damage multiplier from Strength vs Toughness (1 = wounds on 3+, the S > T case). */
export function woundMul(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 1.25;
  if (strength > toughness) return 1;
  if (strength === toughness) return 0.75;
  if (strength * 2 <= toughness) return 0.25;
  return 0.5;
}

/** Chance (0..5/6) that an enemy's armour save stops a hit with this AP. */
export function saveChance(save: number, ap: number): number {
  const need = Math.max(2, save + Math.max(0, ap));
  return need >= 7 ? 0 : (7 - need) / 6;
}

/** Expected fraction of a hit's damage that gets through (wound multiplier × failed saves). */
export function expectedHitMul(hit: HitProfile, enemy: EnemyDef): number {
  if (hit.strength === undefined) return 1;
  return woundMul(hit.strength, enemy.toughness) * (1 - saveChance(enemy.save, hit.ap ?? 0));
}

/** Expected HP of damage per shot (direct hit + blast centre), all pellets hitting. */
export function expectedShotDamage(w: WeaponDef, enemy: EnemyDef, supercharged = false): number {
  const p: ProjectileSpec = w.projectile;
  const sc = supercharged && w.heat ? w.heat : null;
  const direct: HitProfile = {
    strength: p.strength !== undefined ? p.strength + (sc?.superchargeStrength ?? 0) : undefined,
    ap: (p.ap ?? 0) + (sc?.superchargeAp ?? 0),
  };
  const mul = sc ? sc.superchargeDamageMul : 1;
  let dmg = p.damage * mul * expectedHitMul(direct, enemy);
  if (p.explosion) dmg += p.explosion.damage * expectedHitMul(p.explosion, enemy);
  return dmg * w.pellets;
}

/** Sustained expected DPS vs one target (ignores reloads, heat, range, bracing). */
export function expectedDps(w: WeaponDef, enemy: EnemyDef, supercharged = false): number {
  return expectedShotDamage(w, enemy, supercharged) / w.fireInterval;
}

/** Same including reloads: average over a full magazine cycle. */
export function sustainedDps(w: WeaponDef, enemy: EnemyDef): number {
  const cycle = w.magazine * w.fireInterval + w.reloadTime;
  return (expectedShotDamage(w, enemy) * w.magazine) / cycle;
}

/** Short role tag for compact UI (the first, defining role): HORDE / ELITE / TANK / ALL... */
export const ROLE_SHORT: Record<WeaponRole, string> = {
  GENERALIST: 'ALL-ROUND',
  'ANTI-HORDE': 'ANTI-HORDE',
  'ANTI-ELITE': 'ANTI-ELITE',
  'ANTI-TANK': 'ANTI-TANK',
  SUSTAINED: 'SUSTAINED',
  BLAST: 'BLAST',
  'SHORT RANGE': 'SHORT RANGE',
  OVERCHARGE: 'OVERCHARGE',
  MELEE: 'MELEE',
};

/** HUD colour per defining role (horde = amber, elite = cyan, tank = red, generalist = parchment). */
export const ROLE_COLOR: Record<WeaponRole, string> = {
  GENERALIST: '#e8dcc0',
  'ANTI-HORDE': '#ffb347',
  'ANTI-ELITE': '#7fe0ff',
  'ANTI-TANK': '#ff6a50',
  SUSTAINED: '#e8dcc0',
  BLAST: '#ffb347',
  'SHORT RANGE': '#bba98a',
  OVERCHARGE: '#7fe0ff',
  MELEE: '#d4c4a0',
};

/** "S5 AP-1" (the direct hit's profile; blast-only weapons show the blast's). */
export function weaponProfileLabel(w: WeaponDef): string {
  const p = w.projectile;
  const s = p.strength ?? p.explosion?.strength;
  const ap = p.strength !== undefined ? (p.ap ?? 0) : (p.explosion?.ap ?? 0);
  if (s === undefined) return '';
  return `S${s} AP${ap ? `-${ap}` : '0'}`;
}

/** "ANTI-HORDE · SUSTAINED" */
export const weaponRolesLabel = (w: WeaponDef): string => w.roles.join(' · ');
