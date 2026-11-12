export type RunMode = 'local' | 'p2p' | 'dedicated';

/** What the host submits at the end of a run. */
export interface RunResult {
  /** Unique id; resubmitting the same runId is idempotent. */
  runId: string;
  /** 1..MAX_PLAYERS (8) — each team size has its own leaderboard. */
  teamSize: number;
  players: string[];
  survivalMs: number;
  wave: number;
  kills: number;
  /**
   * v0.4+: personal score (sum of kill points) per marine, aligned with `players`.
   * Absent on older runs.
   */
  playerScores?: number[];
  /** v0.4+: kills per marine, aligned with `players`. */
  playerKills?: number[];
  /** ISO timestamp. */
  endedAt: string;
  version: string;
  mode: RunMode;
  /** v29+: mission id (absent on older runs). */
  mission?: string;
  /** v29+: victory / defeat (absent on older endless-only runs). */
  outcome?: 'victory' | 'defeat';
}

export interface HighscoreEntry extends RunResult {
  id: string;
  submittedAt: string;
}

export interface SubmitResponse {
  entry: HighscoreEntry;
  /** 1-based rank within the team-size table. */
  rank: number;
  duplicate: boolean;
}

export interface TopResponse {
  teamSize: number;
  entries: HighscoreEntry[];
}

export type SubmitStatus = 'server' | 'local' | 'failed';

/** One marine's personal score in a run (the individual leaderboard). */
export interface PlayerScoreEntry {
  /** `${runId}-${slot}` */
  id: string;
  runId: string;
  /** Index of the marine in the run's `players`. */
  slot: number;
  name: string;
  score: number;
  kills: number;
  teamSize: number;
  survivalMs: number;
  version: string;
  /** ISO timestamp. */
  at: string;
}

export interface TopPlayersResponse {
  /** 0 = all team sizes. */
  teamSize: number;
  entries: PlayerScoreEntry[];
}
