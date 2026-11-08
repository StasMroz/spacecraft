/**
 * Directional power armour (v0.5.3-dev): a marine's front plate shrugs off more than his
 * flanks, and the backpack/rear is the weak spot. "Front" is the marine's facing, which is his
 * aim direction (`Player.aim`). The incoming direction is the damage source: the attacker for
 * melee/charges, the incoming travel direction for projectiles, the blast centre for explosions.
 *
 * Arcs are measured from the facing: within ±frontArcDeg → `front`; within ±rearArcDeg of
 * directly behind → `rear`; everything in between → `side`. Hits with no source position
 * (overheat self-damage, a blast centred exactly on the marine) use `side` (= unmodified).
 */
export const MARINE_DIRECTIONAL_ARMOUR = {
  /** Half-width of the front arc, degrees (front arc = 90° total). */
  frontArcDeg: 45,
  /** Half-width of the rear arc, degrees (rear arc = 90° total, centred on the back). */
  rearArcDeg: 45,
  front: 0.7,
  side: 1.0,
  rear: 1.3,
} as const;

export type ArmourArc = 'front' | 'side' | 'rear';

const DEG = Math.PI / 180;
const FRONT_COS = Math.cos(MARINE_DIRECTIONAL_ARMOUR.frontArcDeg * DEG);
const REAR_COS = -Math.cos(MARINE_DIRECTIONAL_ARMOUR.rearArcDeg * DEG);

/**
 * Which armour arc a hit lands on. `facing` = marine aim (radians); (dx, dy) = vector from the
 * marine towards the damage source (need not be normalised). Zero vector → 'side'.
 * Pure arithmetic (dot product, no RNG) so it's deterministic on host and in replays.
 */
export function armourArc(facing: number, dx: number, dy: number): ArmourArc {
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-6)) return 'side';
  const c = (Math.cos(facing) * dx + Math.sin(facing) * dy) / len;
  // Boundaries are inclusive for the front/rear arcs (exactly 45° counts as front).
  if (c >= FRONT_COS - 1e-9) return 'front';
  if (c <= REAR_COS + 1e-9) return 'rear';
  return 'side';
}

/**
 * Damage multiplier for a hit from (dx, dy) relative to the marine, given its facing.
 * Optional `frontOverride` (e.g. MARINE_GUARD.frontMul while guarding) replaces the idle
 * front multiplier; side/rear are unchanged. Keeps armour.ts free of a cycle on guard.ts.
 */
export function armourMul(facing: number, dx: number, dy: number, frontOverride?: number): number {
  const arc = armourArc(facing, dx, dy);
  if (arc === 'front' && frontOverride !== undefined) return frontOverride;
  return MARINE_DIRECTIONAL_ARMOUR[arc];
}

/**
 * Front-plate deflection: an enemy projectile (not melee, not blasts) striking the FRONT arc may
 * ricochet off the ceramite with an explicit per-projectile chance (`chanceByProjectile`, keyed by
 * projectile kind). A direct-fire projectile kind missing from the table uses `defaultChance`.
 * Explosive shells (Biovore spore) and harmless shots never deflect, whatever the table says:
 * they burst on impact. Synapse buffs don't change the odds. A deflected shot does no damage, is
 * mirrored off the plate (small seeded jitter, slowed), turns harmless to everyone and fades out
 * within `fadeTime` seconds.
 */
export const MARINE_DEFLECTION = {
  /** Chance per enemy projectile kind (front-arc hits only). */
  chanceByProjectile: {
    /** Termagant fleshborer, the weakest shot (v0.6.0: 30 %, doubled). */
    fleshborer: 0.6,
    /** Tyranid Warrior deathspitter, the stronger shot (v0.6.0: 21 %, −30 %). */
    deathspitter: 0.147,
    /** Carnifex acid glob: a bucket of acid, not a bolt — nothing to ricochet. */
    bioacid: 0,
    /** Psychophage psychoclastic ash: a gout, not a bolt — never ricochets. */
    psyash: 0,
  } as Readonly<Record<string, number>>,
  /** Any future direct-fire projectile not in the table. */
  defaultChance: 0.15,
  /** Max ± rotation (radians) applied to the mirrored direction. */
  jitter: 0.35,
  /** Speed multiplier of the ricochet. */
  speedMul: 0.6,
  /** Seconds the harmless ricochet lives before vanishing. */
  fadeTime: 0.25,
} as const;

/** Minimal slice of an enemy def used here (keeps this file free of the registry). */
interface RangedEnemyLike {
  ranged?: { projectile: { kind: string; damage: number; explosion?: unknown } };
}

/** Deflection chance for one projectile spec (0 for explosive / harmless shots). */
export function projectileDeflectChance(spec: {
  kind: string;
  damage: number;
  explosion?: unknown;
}): number {
  if (spec.explosion || !(spec.damage > 0)) return 0;
  const { chanceByProjectile, defaultChance } = MARINE_DEFLECTION;
  return Object.prototype.hasOwnProperty.call(chanceByProjectile, spec.kind)
    ? chanceByProjectile[spec.kind]!
    : defaultChance;
}

/** Deflection chance per enemy projectile kind (0 for explosive / harmless shots). */
export function enemyProjectileDeflectChances(
  enemies: Iterable<RangedEnemyLike>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of enemies)
    if (e.ranged) out[e.ranged.projectile.kind] = projectileDeflectChance(e.ranged.projectile);
  return out;
}
