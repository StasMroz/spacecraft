import type { RunResult } from './types.js';
import { applyElo, ELO_START } from './elo.js';
import { HIGHSCORE_LIMITS, sanitizeName } from './limits.js';
import { nameProblem } from './names.js';

export const FIRESTORE_DUEL_MATCHES = 'duelMatches';
export const FIRESTORE_DUEL_RATINGS = 'duelRatings';
export const DUEL_RANKING_LIMIT = 50;
/** Matches replayed when aggregating ratings (oldest first). */
export const DUEL_MATCH_QUERY_LIMIT = 1000;

export interface DuelMatchRecord {
  id: string;
  winner: string;
  loser: string;
  winnerKills: number;
  loserKills: number;
  version: string;
  mode: 'p2p' | 'dedicated';
  /** ISO timestamp when known (server time on stored docs). */
  timestamp?: string;
}

export interface DuelRatingRow {
  name: string;
  rating: number;
  wins: number;
  losses: number;
}

/** True when this finished run should be written to the 1v1 duel board (not 2v2 / 2v1 / solo). */
export function isDuelRankedResult(result: RunResult): boolean {
  if (result.mission !== 'duel') return false;
  if (result.mode !== 'p2p' && result.mode !== 'dedicated') return false;
  if (result.teamSize !== 2 || result.players.length !== 2) return false;
  if (!HIGHSCORE_LIMITS.runIdPattern.test(result.runId)) return false;
  if (result.survivalMs < HIGHSCORE_LIMITS.minSurvivalMs) return false;
  const names = result.players.map((n) => sanitizeName(n));
  if (names[0] === names[1]) return false;
  if (names.some((n) => nameProblem(n))) return false;
  const parsed = duelOutcome(result);
  return parsed !== null;
}

export function duelOutcome(
  result: RunResult,
): { winner: string; loser: string; winnerKills: number; loserKills: number } | null {
  if (result.players.length !== 2) return null;
  const kills = result.playerKills ?? [0, 0];
  if (kills.length !== 2) return null;
  const a = kills[0] ?? 0;
  const b = kills[1] ?? 0;
  if (a === b || Math.max(a, b) < 2 || Math.min(a, b) < 0) return null;
  const winnerIdx = a > b ? 0 : 1;
  const loserIdx = 1 - winnerIdx;
  const winner = sanitizeName(result.players[winnerIdx]!);
  const loser = sanitizeName(result.players[loserIdx]!);
  if (!winner || !loser || winner === loser) return null;
  return {
    winner,
    loser,
    winnerKills: kills[winnerIdx]!,
    loserKills: kills[loserIdx]!,
  };
}

export function toDuelMatchRecord(result: RunResult): DuelMatchRecord | null {
  if (!isDuelRankedResult(result)) return null;
  const out = duelOutcome(result)!;
  return {
    id: result.runId,
    winner: out.winner,
    loser: out.loser,
    winnerKills: out.winnerKills,
    loserKills: out.loserKills,
    version: result.version,
    mode: result.mode === 'dedicated' ? 'dedicated' : 'p2p',
    timestamp: result.endedAt,
  };
}

/** Replay matches (oldest first) into a name → row map. */
export function ratingsFromMatches(
  matches: readonly DuelMatchRecord[],
): Map<string, DuelRatingRow> {
  const byName = new Map<string, DuelRatingRow>();
  const row = (name: string): DuelRatingRow => {
    let r = byName.get(name);
    if (!r) {
      r = { name, rating: ELO_START, wins: 0, losses: 0 };
      byName.set(name, r);
    }
    return r;
  };
  for (const m of matches) {
    const w = row(m.winner);
    const l = row(m.loser);
    const next = applyElo(w.rating, l.rating);
    w.rating = next.winner;
    l.rating = next.loser;
    w.wins += 1;
    l.losses += 1;
  }
  return byName;
}

export function sortDuelRatings(rows: Iterable<DuelRatingRow>): DuelRatingRow[] {
  return [...rows].sort(
    (a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name),
  );
}
