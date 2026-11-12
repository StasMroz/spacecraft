/**
 * Squad reinforcements (Helldivers-inspired, 40k drop-pod flavour).
 *
 * Shared budget for the whole squad. A dead marine returns in a drop pod after a cooldown,
 * either called by a living brother (ahead of his aim) or automatically if nobody is left
 * standing. The cooldown grows with a death streak and decays if the squad holds. Pods
 * always work, including on warp-shadow missions that suppress supply crates — they are
 * reinforcements, not resupply.
 *
 * Defeat only when the budget is empty, nobody is alive, and no pod is still falling.
 */
export const REINFORCE = {
  /** Solo starting budget. */
  budgetBase: 5,
  /** Extra lives per teammate beyond the first. */
  budgetPerExtra: 2,
  /** Seconds after a call before the next pod can be requested. */
  cooldownBaseS: 8,
  /** Extra cooldown per death in the current streak. */
  cooldownPerStreakS: 4,
  cooldownCapS: 28,
  /** Seconds without a call after which the streak drops by one. */
  streakDecayS: 20,
  /** Fall time of the pod. */
  landS: 1.4,
  /** Blast that kills Tyranids at the landing site (marines are safe). */
  impactDamage: 70,
  impactRadius: 80,
  impactStrength: 6,
  impactAp: 0,
  /** Invulnerability after stepping out of the pod. */
  invulnS: 2,
  /** How far ahead of the caller's aim the pod tries to land. */
  throwRange: 200,
} as const;

export const reinforceBudget = (teamSize: number): number =>
  REINFORCE.budgetBase + REINFORCE.budgetPerExtra * Math.max(0, teamSize - 1);

export const reinforceCooldown = (streak: number): number =>
  Math.min(
    REINFORCE.cooldownCapS,
    REINFORCE.cooldownBaseS + Math.max(0, streak) * REINFORCE.cooldownPerStreakS,
  );
