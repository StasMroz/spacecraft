import { countsForLeaderboard, type HighscoreEntry, type RunResult } from '@sms/shared';
import type {
  HighscoreStore,
  SubmitOutcome,
  TopPlayersResult,
  TopResult,
} from './HighscoreStore.js';
import { HttpError } from './HttpHighscoreStore.js';
import { mergePlayerScores, type LocalHighscoreStore } from './LocalHighscoreStore.js';

/** A rejection that retrying can't fix (bad run, denied by rules). 408/429 are transient. */
const isPermanentRejection = (err: unknown): err is HttpError =>
  err instanceof HttpError &&
  err.status >= 400 &&
  err.status < 500 &&
  err.status !== 429 &&
  err.status !== 408;

/**
 * Global board first (Firestore or the HTTP highscore server), localStorage as fallback + cache:
 *  - submit: send to the board; if unreachable, store locally (status 'local') and retry
 *    pending local runs next time the server answers.
 *  - top: server table (cached locally); cached/local table when offline.
 * With `remote = null` (no server configured, e.g. a static GitHub Pages deploy) it is a
 * quiet local-only store: no network requests, no warnings.
 */
export class FallbackHighscoreStore implements HighscoreStore {
  online: boolean | null = null;

  constructor(
    private readonly remote: HighscoreStore | null,
    private readonly local: LocalHighscoreStore,
  ) {}

  get localOnly(): boolean {
    return this.remote === null;
  }

  async submit(result: RunResult): Promise<SubmitOutcome> {
    // Other missions stay in this browser only — no Firebase / HTTP board write.
    if (!countsForLeaderboard(result.mission)) {
      const kept = await this.local.keep(result);
      return { status: 'local', rank: kept.rank };
    }
    if (!this.remote) return this.local.submit(result);
    try {
      const out = await this.remote.submit(result);
      this.online = true;
      this.local.rememberSubmitted(result, out.rank);
      void this.flushPending();
      return out;
    } catch (err) {
      // A 4xx means the board rejected the run (or, for Firestore, the rules aren't deployed
      // yet): don't pretend it counted, but keep it in this browser's table (not retried).
      if (isPermanentRejection(err)) {
        console.warn('[highscores] leaderboard rejected run', err.message);
        const kept = await this.local.keep(result);
        return { status: 'failed', rank: kept.rank };
      }
      this.online = false;
      console.warn('[highscores] leaderboard unreachable, saving locally', err);
      return this.local.submit(result);
    }
  }

  async top(teamSize: number, limit = 10): Promise<TopResult> {
    if (!this.remote) return this.local.top(teamSize, limit);
    try {
      const res = await this.remote.top(teamSize, limit);
      this.online = true;
      this.local.cacheTable(teamSize, res.entries);
      // Show still-pending local runs alongside server data.
      const merged = await this.local.top(teamSize, limit);
      return { entries: merged.entries, source: 'server' };
    } catch {
      this.online = false;
      return this.local.top(teamSize, limit);
    }
  }

  async topPlayers(teamSize: number, limit = 10): Promise<TopPlayersResult> {
    if (!this.remote) return this.local.topPlayers(teamSize, limit);
    try {
      const res = await this.remote.topPlayers(teamSize, limit);
      this.online = true;
      // Still-pending local runs show alongside the server rows.
      const pending = this.local.pending().filter((e) => teamSize === 0 || e.teamSize === teamSize);
      return { entries: mergePlayerScores(pending, res.entries, limit), source: 'server' };
    } catch {
      this.online = false;
      return this.local.topPlayers(teamSize, limit);
    }
  }

  private flushing = false;

  /** Re-submits runs that were stored locally while offline. */
  async flushPending(): Promise<void> {
    if (this.flushing || !this.remote) return;
    this.flushing = true;
    try {
      for (const e of this.local.pending()) {
        const { id: _id, submittedAt: _s, ...run } = e as HighscoreEntry;
        if (!countsForLeaderboard(run.mission)) {
          this.local.markKept(run.runId);
          continue;
        }
        try {
          const out = await this.remote.submit(run);
          this.local.markSynced(run.runId);
          this.local.rememberSubmitted(run, out.rank);
        } catch (err) {
          if (isPermanentRejection(err)) this.local.markKept(run.runId);
          else break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}
