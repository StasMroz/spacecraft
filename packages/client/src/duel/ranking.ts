/**
 * Ranked 1v1 duel board in Firestore (REST, no SDK — same pattern as the hive
 * leaderboard and Vox Relay). Writes never throw into the game loop: a failed
 * save is logged and ignored. Does not touch boards/.../highscores.
 */
import {
  DUEL_MATCH_QUERY_LIMIT,
  DUEL_RANKING_LIMIT,
  FIRESTORE_DUEL_MATCHES,
  FIRESTORE_DUEL_RATINGS,
  isDuelRankedResult,
  ratingsFromMatches,
  sortDuelRatings,
  toDuelMatchRecord,
  type DuelMatchRecord,
  type DuelRatingRow,
  type RunResult,
  type SubmitStatus,
} from '@sms/shared';
import { config } from '../config.js';

/** Same shape as the public web Firebase config already in `config.firebase`. */
export interface DuelFirebaseConfig {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
}

const FIRESTORE_REST = 'https://firestore.googleapis.com/v1';
const documentsPath = (projectId: string) => `projects/${projectId}/databases/(default)/documents`;

export type { DuelRatingRow };

type Value = { stringValue: string } | { integerValue: string } | { timestampValue: string };
type Fields = Record<string, Value>;

const str = (s: string): Value => ({ stringValue: s });
const int = (n: number): Value => ({ integerValue: String(n) });

const cfgOf = (cfg?: DuelFirebaseConfig | null): DuelFirebaseConfig | null =>
  cfg === undefined ? config.firebase : cfg;

const baseUrl = (cfg: DuelFirebaseConfig) => (cfg.baseUrl ?? FIRESTORE_REST).replace(/\/$/, '');

const docs = (cfg: DuelFirebaseConfig) => documentsPath(cfg.projectId);

const endpoint = (cfg: DuelFirebaseConfig, method: 'commit' | 'runQuery') =>
  `${baseUrl(cfg)}/${docs(cfg)}:${method}?key=${encodeURIComponent(cfg.apiKey)}`;

export const duelMatchDocName = (cfg: DuelFirebaseConfig, matchId: string) =>
  `${docs(cfg)}/${FIRESTORE_DUEL_MATCHES}/${matchId}`;

export const duelRatingDocName = (cfg: DuelFirebaseConfig, name: string) =>
  `${docs(cfg)}/${FIRESTORE_DUEL_RATINGS}/${encodeURIComponent(name)}`;

export function duelMatchCommitBody(cfg: DuelFirebaseConfig, match: DuelMatchRecord) {
  const fields: Fields = {
    winner: str(match.winner),
    loser: str(match.loser),
    winnerKills: int(match.winnerKills),
    loserKills: int(match.loserKills),
    version: str(match.version),
    mode: str(match.mode),
  };
  return {
    writes: [
      {
        update: { name: duelMatchDocName(cfg, match.id), fields },
        updateTransforms: [{ fieldPath: 'timestamp', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      },
    ],
  };
}

export function duelRatingsCommitBody(
  cfg: DuelFirebaseConfig,
  rows: DuelRatingRow[],
  exists: boolean[],
) {
  return {
    writes: rows.map((row, i) => ({
      update: {
        name: duelRatingDocName(cfg, row.name),
        fields: {
          name: str(row.name),
          rating: int(row.rating),
          wins: int(row.wins),
          losses: int(row.losses),
        } satisfies Fields,
      },
      updateTransforms: [{ fieldPath: 'timestamp', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: exists[i]! },
    })),
  };
}

function ratingsQuery(limit: number) {
  return {
    structuredQuery: {
      from: [{ collectionId: FIRESTORE_DUEL_RATINGS }],
      orderBy: [{ field: { fieldPath: 'rating' }, direction: 'DESCENDING' }],
      limit,
    },
  };
}

function matchesQuery(limit: number) {
  return {
    structuredQuery: {
      from: [{ collectionId: FIRESTORE_DUEL_MATCHES }],
      orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'ASCENDING' }],
      limit,
    },
  };
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function readStr(f: Record<string, unknown>, k: string): string | null {
  const v = obj(f[k])?.stringValue;
  return typeof v === 'string' ? v : null;
}

function readInt(f: Record<string, unknown>, k: string): number | null {
  const v = obj(f[k])?.integerValue;
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
  return null;
}

function readTs(f: Record<string, unknown>): string | undefined {
  const v = obj(f.timestamp)?.timestampValue;
  return typeof v === 'string' ? v : undefined;
}

function parseRatingRows(json: unknown): DuelRatingRow[] {
  if (!Array.isArray(json)) return [];
  const out: DuelRatingRow[] = [];
  for (const row of json) {
    const doc = obj(obj(row)?.document);
    const f = obj(doc?.fields);
    if (!f) continue;
    const name = readStr(f, 'name');
    const rating = readInt(f, 'rating');
    const wins = readInt(f, 'wins');
    const losses = readInt(f, 'losses');
    if (name === null || rating === null || wins === null || losses === null) continue;
    out.push({ name, rating, wins, losses });
  }
  return out;
}

function parseMatches(json: unknown): DuelMatchRecord[] {
  if (!Array.isArray(json)) return [];
  const out: DuelMatchRecord[] = [];
  for (const row of json) {
    const doc = obj(obj(row)?.document);
    const f = obj(doc?.fields);
    if (!doc || !f) continue;
    const name = typeof doc.name === 'string' ? doc.name : '';
    const id = name.slice(name.lastIndexOf('/') + 1);
    const winner = readStr(f, 'winner');
    const loser = readStr(f, 'loser');
    const winnerKills = readInt(f, 'winnerKills');
    const loserKills = readInt(f, 'loserKills');
    const version = readStr(f, 'version');
    const mode = readStr(f, 'mode');
    if (
      !id ||
      winner === null ||
      loser === null ||
      winnerKills === null ||
      loserKills === null ||
      version === null ||
      (mode !== 'p2p' && mode !== 'dedicated')
    )
      continue;
    out.push({
      id,
      winner,
      loser,
      winnerKills,
      loserKills,
      version,
      mode,
      timestamp: readTs(f),
    });
  }
  return out;
}

class DuelHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function post(
  cfg: DuelFirebaseConfig,
  method: 'commit' | 'runQuery',
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const res = await fetchImpl(endpoint(cfg, method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const e = ((await res.json()) as { error?: { status?: string; message?: string } }).error;
      detail = [e?.status, e?.message].filter(Boolean).join(': ');
    } catch {
      /* not JSON */
    }
    throw new DuelHttpError(res.status, `firestore ${method}: ${res.status} ${detail}`.trim());
  }
  return res.json();
}

/**
 * Ranked 1v1 table for the menu: name, Elo, wins, losses. Sorted by rating
 * descending. Empty when Firestore is off or the write/read is denied.
 */
export async function fetchDuelRanking(
  cfg?: DuelFirebaseConfig | null,
  opts?: { limit?: number; fetch?: typeof fetch },
): Promise<DuelRatingRow[]> {
  const firebase = cfgOf(cfg);
  const limit = Math.max(
    1,
    Math.min(DUEL_RANKING_LIMIT, Math.floor(opts?.limit ?? DUEL_RANKING_LIMIT)),
  );
  if (!firebase) return [];
  const f = opts?.fetch ?? fetch;
  try {
    const rated = parseRatingRows(await post(firebase, 'runQuery', ratingsQuery(limit), f));
    if (rated.length) return sortDuelRatings(rated).slice(0, limit);
  } catch (err) {
    console.warn('[duel] ratings query failed, trying match replay', err);
  }
  try {
    const matches = parseMatches(
      await post(firebase, 'runQuery', matchesQuery(DUEL_MATCH_QUERY_LIMIT), f),
    );
    return sortDuelRatings(ratingsFromMatches(matches).values()).slice(0, limit);
  } catch (err) {
    console.warn('[duel] ranking read failed', err);
    return [];
  }
}

/**
 * Host writes one create-only match document (id = runId). Then best-effort
 * rating rows. Never throws; returns whether the match document was accepted
 * (including 409 already-exists = idempotent success).
 */
export async function submitDuelMatch(
  result: RunResult,
  cfg?: DuelFirebaseConfig | null,
  opts?: { fetch?: typeof fetch },
): Promise<boolean> {
  const match = toDuelMatchRecord(result);
  if (!match || !isDuelRankedResult(result)) return false;
  const firebase = cfgOf(cfg);
  if (!firebase) return false;
  const f = opts?.fetch ?? fetch;
  try {
    await post(firebase, 'commit', duelMatchCommitBody(firebase, match), f);
  } catch (err) {
    if (!(err instanceof DuelHttpError && err.status === 409)) {
      console.warn('[duel] match write failed', err);
      return false;
    }
  }
  void refreshRatings(firebase, f).catch((err) => console.warn('[duel] rating write failed', err));
  return true;
}

async function refreshRatings(cfg: DuelFirebaseConfig, f: typeof fetch): Promise<void> {
  const matches = parseMatches(
    await post(cfg, 'runQuery', matchesQuery(DUEL_MATCH_QUERY_LIMIT), f),
  );
  const rows = sortDuelRatings(ratingsFromMatches(matches).values());
  if (!rows.length) return;
  // Try a single create-or-update per row? Firestore commit can't branch on exists.
  // Write each as update first (exists: true), fall back to create.
  for (const row of rows) {
    try {
      await post(cfg, 'commit', duelRatingsCommitBody(cfg, [row], [true]), f);
    } catch {
      try {
        await post(cfg, 'commit', duelRatingsCommitBody(cfg, [row], [false]), f);
      } catch (err) {
        console.warn('[duel] rating upsert failed', row.name, err);
      }
    }
  }
}

/** HostSession.submitResult hook: records a ranked 1v1, otherwise no-ops. Never rejects. */
export async function submitGameResult(
  result: RunResult,
): Promise<{ status: SubmitStatus; rank?: number }> {
  try {
    if (!isDuelRankedResult(result)) return { status: 'local' };
    const ok = await submitDuelMatch(result);
    return { status: ok ? 'server' : 'failed' };
  } catch (err) {
    console.warn('[duel] submit failed', err);
    return { status: 'failed' };
  }
}
