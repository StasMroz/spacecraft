/**
 * Menu-facing entry for the 1v1 duel ladder. The game host writes through
 * `src/duel/ranking.ts` so the hive leaderboard store stays out of the game bundle.
 *
 *   import { fetchDuelRanking } from '../../packages/client/src/highscores/duelRanking.ts';
 *   const rows = await fetchDuelRanking();
 *   // { name: string; rating: number; wins: number; losses: number }[]
 */
export { fetchDuelRanking, submitDuelMatch, type DuelRatingRow } from '../duel/ranking.js';
