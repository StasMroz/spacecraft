/** Starting rating for a marine who has never played a ranked 1v1 duel. */
export const ELO_START = 1000;
/** Classic Elo K-factor. */
export const ELO_K = 32;

/** Expected score of `rating` against `opponent` (0..1). */
export function eloExpected(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

export interface EloPair {
  winner: number;
  loser: number;
}

/**
 * New integer ratings after a decisive match (winner beat loser).
 * Equal 1000s move by ±16 (K/2).
 */
export function applyElo(winnerRating: number, loserRating: number, k: number = ELO_K): EloPair {
  const ev = eloExpected(winnerRating, loserRating);
  return {
    winner: Math.round(winnerRating + k * (1 - ev)),
    loser: Math.round(loserRating + k * (0 - (1 - ev))),
  };
}
