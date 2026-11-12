/**
 * Runtime configuration: build-time env (VITE_*) + URL params + /api/config
 * discovery from the highscore server.
 *   ?api=http://host:8787   override highscore server
 *   ?join=CODE              open the join flow for a room (QR / share link)
 *   ?ws=1                   use the experimental dedicated WebSocket host instead of P2P
 *   ?names=generic          display-name preset (content data/naming.ts), e.g. IP-neutral names
 *   ?demo=hive              solo showcase: staged late-game fight, nothing is submitted
 *   ?mission=id             solo / host mission id (hive_siege, hold_the_line, evacuation,
 *                           synapse_purge, relic_recovery). Unknown ids fall back to hive_siege.
 */
import { GAME_VERSION, leaderboardBoard } from '@sms/shared';
import { boardFor } from './devPreview.js';
import type { FirestoreConfig } from './highscores/firestore.js';
import { parseJoinCode } from './net/joinUrl.js';

const params = new URLSearchParams(location.search);

/** Dev default: the highscore server started by `npm run dev` on the page host, port 8787. */
function devApiUrl(): string {
  const host = location.hostname || 'localhost';
  const proto = location.protocol === 'https:' ? 'https:' : 'http:';
  return `${proto}//${host}:8787`;
}

/**
 * Highscore server base URL, or null when none is configured. Production builds only talk to
 * a server when VITE_HIGHSCORE_URL is set at build time (or ?api=... is passed); otherwise the
 * game runs fully static with local (browser) highscores.
 */
function resolveApiUrl(): string | null {
  const raw =
    params.get('api') ??
    import.meta.env.VITE_HIGHSCORE_URL ??
    (import.meta.env.DEV ? devApiUrl() : '');
  const url = raw.trim().replace(/\/$/, '');
  return url || null;
}

/**
 * Global leaderboard in Cloud Firestore (REST, public web config; firestore.rules does the
 * enforcing). Set VITE_FIREBASE_API_KEY + VITE_FIREBASE_PROJECT_ID at build time, e.g. in
 * .env.production (committed public defaults) or .env.production.local (repo root, gitignored).
 * VITE_FIRESTORE_URL points at an emulator. `?firestore=0` disables it for one session.
 * Board id comes from leaderboardBoard(GAME_VERSION) (per-release from v0.5.1, with BOARD_ALIASES
 * when a patch keeps the previous table — e.g. 0.6.1 → boards/0.6.0).
 */
function resolveFirebase(): FirestoreConfig | null {
  if (params.get('firestore') === '0') return null;
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;
  const baseUrl = import.meta.env.VITE_FIRESTORE_URL?.trim() || undefined;
  return { apiKey, projectId, baseUrl, board: boardFor(leaderboardBoard(GAME_VERSION)) };
}

const apiUrl = resolveApiUrl();
const firebase = resolveFirebase();
const apiParam = params.get('api')?.trim() || null;

export const config = {
  apiUrl,
  /** Firestore leaderboard config (takes precedence over apiUrl for highscores). */
  firebase,
  /** False on a static deploy: local-only highscores, no dedicated WS host. */
  hasServer: apiUrl !== null,
  /** Room code from a join link / QR (`?join=CODE`); cleared once used. */
  joinCode: parseJoinCode(location.search),
  /** `?api=` as given, forwarded in share links so joiners use the same server. */
  apiFromUrl: apiParam,
  /** ?ws=1 picks the dedicated WebSocket host; ignored when no server is configured. */
  useDedicatedHost: apiUrl !== null && params.get('ws') === '1',
  debug: params.get('debug') === '1',
  /** Auto-start a solo run (used by the headless browser smoke test). */
  autoSolo: params.get('autosolo') === '1',
  autoName: params.get('name') ?? '',
  /** Display-name preset id (see shared data/naming.ts); '' = content defaults. */
  names: params.get('names')?.trim() || import.meta.env.VITE_NAMES?.trim() || '',
  /** `?demo=hive` staged showcase fight (solo, never submitted). */
  demo: params.get('demo') === 'hive',
  /** `?mission=id` for solo / hosting without the menu picker. */
  mission: params.get('mission')?.trim() || '',
  peerOverride: import.meta.env.VITE_PEER_HOST
    ? {
        host: import.meta.env.VITE_PEER_HOST,
        port: Number(import.meta.env.VITE_PEER_PORT ?? 443),
        path: import.meta.env.VITE_PEER_PATH ?? '/',
        secure: (import.meta.env.VITE_PEER_SECURE ?? 'true') !== 'false',
      }
    : null,
};

export interface ServerInfo {
  version: string;
  protocol: number;
  peer: { host: string | null; port: number; path: string } | null;
  wsGameHost: { path: string } | null;
}

let serverInfo: Promise<ServerInfo | null> | null = null;

/** Fetches /api/config once (null if no server is configured or it is unreachable). */
export function getServerInfo(): Promise<ServerInfo | null> {
  if (!config.apiUrl) return Promise.resolve(null);
  serverInfo ??= fetch(`${config.apiUrl}/api/config`, { signal: AbortSignal.timeout(2500) })
    .then((r) => (r.ok ? (r.json() as Promise<ServerInfo>) : null))
    .catch(() => null);
  return serverInfo;
}
