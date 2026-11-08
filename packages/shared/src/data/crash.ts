/**
 * Imperial ship crash event + Astra Militarum survivors (v19). Balance values, not 40k rules:
 * the lore only gives "Guardsmen with lasguns"; timings, counts and stats are game adaptation.
 */
export const CRASH = {
  /** Crash waves: `firstWave` and every `everyWave` after it (4, 7, 10…: never a boss wave). */
  firstWave: 4,
  everyWave: 3,
  /** Seconds after the wave starts that the ship is first seen falling. */
  delay: 4,
  /** Warning: burning ship falling + target ring, then impact. */
  fallTime: 3.5,
  /** Smoke after impact; wreck walls and survivors appear when it clears. */
  smokeTime: 4,
  /** Crash site: this far from every marine (never on top of anyone)… */
  minPlayerDist: 380,
  /** …but within this of the nearest one (you can see it). */
  maxPlayerDist: 800,
  /** Clear of breaches / vents. */
  spawnClear: 260,
  /** Impact blast: hurts Tyranids only (survivors and marines are far enough). */
  impact: { radius: 150, damage: 120, edgeFactor: 0.4 },
  /** Wreck walls per crash and in total for the run (bounded snapshot / pathing cost). */
  pieces: [3, 5] as const,
  maxPieces: 20,
  /** Survivors per crash by team size (index = marines - 1). */
  soldiers: [3, 4, 4, 5] as const,
  maxAllies: 6,
} as const;

/** Astra Militarum Guardsman with a lasgun. */
export const GUARDSMAN = {
  hp: 60,
  speed: 150,
  radius: 12,
  /** Shoots the nearest visible Tyranid within range. */
  range: 420,
  fireInterval: 0.5,
  lasgun: { speed: 950, lifetime: 0.45, radius: 3, damage: 8, strength: 3, ap: 0 },
  /** Wave of the crash: hold within this of the wreck. */
  holdRadius: 110,
  /** After surviving that wave: stay between these distances of the nearest marine. */
  followMin: 70,
  followMax: 150,
} as const;
