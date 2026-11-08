import type { DirectorConfig } from './types.js';

/**
 * v0.5.3: share of the v0.5.0 per-marine Tyranid HP bonus that is kept (0.5 = halved, so a
 * +30% bonus for a squad of 3 becomes +15%). Solo stays at 1.0; it still grows with squad size.
 */
export const TEAM_HP_SCALING_FACTOR = 0.5;
/**
 * v0.5.3: share of the v0.5.0 per-marine spawn-pace increase that is kept (0.5 = halved).
 * Measured from the solo value so solo pace (0.85) stays unchanged.
 */
export const TEAM_PACE_SCALING_FACTOR = 0.5;
/**
 * v0.6.0 hotfix: more supplies. Weapon crates +50% (per-wave budget and spawn interval) and
 * medkits +20% (per-wave budget and every Tyranid's drop chance, data/enemies.ts).
 */
export const CRATE_DROP_FACTOR = 1.5;
export const MEDKIT_DROP_FACTOR = 1.2;
const V050_TEAM_PACE = [0.85, 2.3, 4.22, 6.3, 9.0, 11.2, 12.9, 14.54];
const V050_TEAM_HP = [1, 1.15, 1.3, 1.4, 1.55, 1.7, 1.75, 1.75];

/**
 * Spawn director tuning: finite Tyranid waves. Each wave has a fixed enemy budget; the next one
 * starts only after the whole wave (children included) is dead. Index-by-team-size arrays cover
 * squads of 1..8 marines (MAX_PLAYERS).
 */
export const DIRECTOR: DirectorConfig = {
  // Squad size 1..8. v0.5: bigger squads face more, tougher and more elite Tyranids.
  teamScaling: {
    budget: [0.85, 2.0, 3.3, 4.5, 6.0, 7.0, 7.5, 7.9],
    pace: V050_TEAM_PACE.map(
      (v) => V050_TEAM_PACE[0] + (v - V050_TEAM_PACE[0]) * TEAM_PACE_SCALING_FACTOR,
    ),
    maxAlive: [1, 1.9, 2.9, 3.9, 4.9, 5.7, 6.3, 6.8],
    children: [0.85, 2.0, 3.3, 4.5, 6.0, 7.0, 7.5, 7.9],
    hp: V050_TEAM_HP.map((v) => 1 + (v - 1) * TEAM_HP_SCALING_FACTOR),
    elite: [1, 1.5, 1.9, 2.3, 2.7, 3.1, 3.4, 3.8],
    eliteThreat: 3,
  },
  waves: {
    firstDelay: 4,
    breather: 8,
    budget: { base: 14, perWave: 9, exponent: 1.2 },
    pace: { base: 2.2, perWave: 0.5 },
    flankPoints: [2, 3],
    hpScalePerWave: 0.06,
    maxChildren: 10,
    reveal: { remaining: 6, fraction: 0.08, afterSec: 30, speedMul: 1.35 },
    forceNextAfter: 240,
  },
  maxAlive: { base: 40, perWave: 10, cap: 320 },
  // Six hive breaches: four in the bulkheads at the arena edges, two floor vents inside.
  spawnPoints: [
    { id: 'north', x: 1600, y: 130, kind: 'breach' },
    { id: 'east', x: 3070, y: 980, kind: 'tunnel' },
    { id: 'south', x: 1720, y: 2070, kind: 'breach' },
    { id: 'west', x: 130, y: 1220, kind: 'tunnel' },
    { id: 'vent_nw', x: 860, y: 600, kind: 'vent' },
    { id: 'vent_se', x: 2380, y: 1600, kind: 'vent' },
  ],
  spawn: {
    telegraph: 1.1,
    bossTelegraph: 2.2,
    pointMinDistance: 430,
    // minDistance / maxDistance: burrowing Raveners (and crates) still use a ring around a marine.
    minDistance: 620,
    maxDistance: 900,
    groupMin: 2,
    groupMax: 6,
    groupSpread: 60,
  },
  drops: {
    // v0.6.0: medkits 2 + 0.5/marine, crates 1 + 0.25/marine; hotfix: ×1.2 / ×1.5
    medkits: { base: 2 * MEDKIT_DROP_FACTOR, perMarine: 0.5 * MEDKIT_DROP_FACTOR },
    crates: { base: 1 * CRATE_DROP_FACTOR, perMarine: 0.25 * CRATE_DROP_FACTOR },
  },
  // v0.6.0: a crate every 20-32 s; hotfix: interval / 1.5 (so the timer doesn't cap the budget)
  crates: {
    firstAfter: 10,
    intervalMin: 20 / CRATE_DROP_FACTOR,
    intervalMax: 32 / CRATE_DROP_FACTOR,
    minDistance: 220,
    maxDistance: 520,
  },
  // A Carnifex leads wave 3 and every 3rd wave after it.
  bosses: {
    enemy: 'carnifex',
    firstWave: 3,
    everyWave: 3,
    count: [1, 1, 2, 2, 2, 3, 3, 3],
    extraPerAppearance: 1,
  },
  // A Psychophage (support boss) joins wave 5 and every 3rd wave after it (never a Carnifex wave).
  support: { enemy: 'psychophage', firstWave: 5, everyWave: 3 },
  waveTable: [
    { fromWave: 1, weights: { hormagaunt: 10, ripper: 3 } },
    { fromWave: 2, weights: { hormagaunt: 10, termagant: 5, ripper: 3 } },
    { fromWave: 3, weights: { hormagaunt: 9, termagant: 5, ripper: 3, genestealer: 2 } },
    {
      fromWave: 4,
      weights: { hormagaunt: 9, termagant: 5, ripper: 2, genestealer: 2, warrior: 1 },
    },
    {
      fromWave: 5,
      weights: { hormagaunt: 9, termagant: 5, ripper: 2, genestealer: 3, warrior: 1, ravener: 1.2 },
    },
    {
      fromWave: 6,
      weights: {
        hormagaunt: 8,
        termagant: 5,
        ripper: 2,
        genestealer: 3,
        warrior: 1.5,
        ravener: 1.5,
        biovore: 1,
        spore_mine: 1.5,
      },
    },
    {
      fromWave: 8,
      weights: {
        hormagaunt: 8,
        termagant: 6,
        ripper: 2,
        genestealer: 4,
        warrior: 2,
        ravener: 2,
        biovore: 1.5,
        spore_mine: 2,
        carnifex: 0.25,
      },
    },
    {
      fromWave: 11,
      weights: {
        hormagaunt: 7,
        termagant: 6,
        ripper: 2,
        genestealer: 5,
        warrior: 3,
        ravener: 2.5,
        biovore: 2,
        spore_mine: 2,
        carnifex: 0.5,
      },
    },
  ],
};
