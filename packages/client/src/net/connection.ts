import { prefs } from '../ui/prefs.js';
import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import {
  ClientSession,
  createLocalLinkPair,
  HostSession,
  makeRoomCode,
  normalizeRoomCode,
  type RunMode,
  type RunResult,
  type SubmitStatus,
} from '@sms/shared';
import { config, getServerInfo } from '../config.js';
import { PeerLink } from './PeerLink.js';
import { BrowserWsLink } from './WsLink.js';
import { forceRelay, hasTurn, iceServers } from './ice.js';
import { classifyPeerError, JoinError, joinErrorMessage, type JoinFailure } from './joinErrors.js';

/**
 * A live connection to a game room. The UI only ever talks to `session`
 * (ClientSession); `host` exists when this browser is the host.
 */
export interface GameConnection {
  mode: RunMode;
  roomCode: string;
  session: ClientSession;
  host: HostSession | null;
  close(): void;
}

export type SubmitFn = (r: RunResult) => Promise<{ status: SubmitStatus; rank?: number }>;

const PEER_PREFIX = 'sms-v1-';
const peerIdFor = (code: string) => `${PEER_PREFIX}${code}`;

/** Solo play: host + client in the same tab over an in-memory link. */
export function createLocalGame(
  name: string,
  submit?: SubmitFn,
  missionId?: string,
): GameConnection {
  const host = new HostSession({
    roomCode: 'SOLO',
    mode: 'local',
    maxPlayers: 1,
    submitResult: submit,
    ...(missionId ? { missionId } : {}),
  });
  const [hostSide, clientSide] = createLocalLinkPair('local');
  host.addLink(hostSide);
  const session = new ClientSession(clientSide, name, prefs.chapter());
  session.join();
  return {
    mode: 'local',
    roomCode: 'SOLO',
    session,
    host,
    close: () => (session.close(), host.close()),
  };
}

async function peerOptions(): Promise<PeerOptions> {
  // Explicit ICE servers: PeerJS's default TURN relay is discontinued (see net/ice.ts).
  const base: PeerOptions = {
    debug: config.debug ? 2 : 0,
    config: {
      iceServers: await iceServers(),
      sdpSemantics: 'unified-plan',
      // ?relay=1 forces every connection through TURN (to verify the relay works).
      ...(forceRelay() ? { iceTransportPolicy: 'relay' } : {}),
    } as RTCConfiguration,
  };
  if (config.peerOverride) return { ...base, ...config.peerOverride };
  // The self-hosted signaling server (from /api/config) is only used in dev; production
  // builds use the public PeerJS cloud unless VITE_PEER_HOST points elsewhere.
  const info = import.meta.env.DEV ? await getServerInfo() : null;
  if (info?.peer) {
    return {
      ...base,
      host: info.peer.host ?? location.hostname,
      port: info.peer.port,
      path: info.peer.path,
      secure: location.protocol === 'https:',
    };
  }
  return base; // PeerJS public cloud (0.peerjs.com)
}

function openPeer(id: string | undefined, opts: PeerOptions): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, opts) : new Peer(opts);
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new JoinError('signaling', joinErrorMessage('signaling', '', false)));
    }, 10000);
    // Only errors before 'open' fail the open; afterwards callers handle them (a leftover
    // listener here used to destroy the peer on the first later error, e.g. a join retry's
    // 'peer-unavailable', or a host's transient signaling error).
    const onOpenError = (err: unknown) => {
      clearTimeout(timer);
      peer.destroy();
      const type = (err as { type?: string }).type;
      const kind = classifyPeerError(type);
      // unavailable-id is handled by the caller (room code collision → pick another code).
      reject(
        kind && kind !== 'not-found' && type !== 'unavailable-id'
          ? Object.assign(new JoinError(kind, joinErrorMessage(kind, '', false)), { type })
          : err,
      );
    };
    peer.once('open', () => {
      clearTimeout(timer);
      peer.off('error', onOpenError);
      resolve(peer);
    });
    peer.once('error', onOpenError);
  });
}

/** Host a P2P room in this browser. Other players connect over WebRTC. */
export async function hostPeerGame(name: string, submit?: SubmitFn): Promise<GameConnection> {
  const opts = await peerOptions();
  let peer: Peer | null = null;
  let code = '';
  for (let attempt = 0; attempt < 5 && !peer; attempt++) {
    code = makeRoomCode();
    try {
      peer = await openPeer(peerIdFor(code), opts);
    } catch (err) {
      if ((err as { type?: string }).type !== 'unavailable-id') throw err;
    }
  }
  if (!peer) throw new Error('Could not allocate a room code, try again.');
  const host = new HostSession({
    roomCode: code,
    mode: 'p2p',
    submitResult: submit,
    log: (...a) => console.info(...a),
    ...(config.mission ? { missionId: config.mission } : {}),
  });
  peer.on('connection', (conn) => {
    conn.on('open', () => host.addLink(new PeerLink(conn)));
  });
  // Lost the signaling server (e.g. the phone locked or the app switched to share the link):
  // existing WebRTC connections keep working, but new joins need it, so re-register the code as
  // soon as possible — on the event, when the page is visible again, and when back online.
  const live = peer;
  const reregister = () => {
    if (!live.destroyed && live.disconnected) {
      try {
        live.reconnect();
      } catch (e) {
        console.warn('[peer] reconnect failed', e);
      }
    }
  };
  live.on('disconnected', () => setTimeout(reregister, 500));
  const onVisible = () => document.visibilityState === 'visible' && reregister();
  document.addEventListener('visibilitychange', onVisible);
  addEventListener('online', reregister);
  live.on('error', (err) =>
    console.warn('[peer] host error', (err as { type?: string }).type, err),
  );
  const [hostSide, clientSide] = createLocalLinkPair('host-local');
  host.addLink(hostSide);
  const session = new ClientSession(clientSide, name, prefs.chapter());
  session.join();
  return {
    mode: 'p2p',
    roomCode: code,
    session,
    host,
    close: () => {
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener('online', reregister);
      host.close();
      session.close();
      live.destroy();
    },
  };
}

/** How long a join may take in total, and how long "room not found" is retried. */
export const JOIN_TIMEOUT_MS = 30000;
export const NOT_FOUND_RETRY_MS = 12000;
/** Extra wait after the retry window for a retried offer that is still being answered. */
export const NOT_FOUND_GRACE_MS = 3000;

/**
 * Join someone else's P2P room by code.
 *
 * Retries "peer-unavailable" for a few seconds (a phone host that briefly lost the signaling
 * server re-registers its code), watches the WebRTC connection itself (NegotiationFailed /
 * ICE "failed" are emitted on the DataConnection, not the Peer), and rejects with a JoinError
 * that tells the player what actually went wrong.
 */
export async function joinPeerGame(
  rawCode: string,
  name: string,
  onProgress?: (msg: string) => void,
): Promise<GameConnection> {
  const code = normalizeRoomCode(rawCode);
  if (code.length < 4) throw new Error('Enter a valid room code.');
  if (typeof RTCPeerConnection === 'undefined')
    throw new JoinError('unsupported', joinErrorMessage('unsupported', code, false));
  const opts = await peerOptions();
  const relay = hasTurn((opts.config?.iceServers as RTCIceServer[] | undefined) ?? []);
  onProgress?.('Łączenie z serwerem parowania…');
  const peer = await openPeer(undefined, opts);
  const started = Date.now();
  let conn: DataConnection | null = null;
  try {
    conn = await new Promise<DataConnection>((resolve, reject) => {
      let done = false;
      let current: DataConnection | null = null;
      let iceSeen = false; // the host answered and ICE checks started
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (kind: JoinFailure | null, ok?: DataConnection) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(retryTimer);
        clearTimeout(notFoundDeadline);
        peer.off('error', onPeerError);
        if (ok) resolve(ok);
        else reject(new JoinError(kind!, joinErrorMessage(kind!, code, relay)));
      };
      const timer = setTimeout(() => finish(iceSeen ? 'ice-failed' : 'timeout'), JOIN_TIMEOUT_MS);
      let notFoundSeen = false;
      let notFoundDeadline: ReturnType<typeof setTimeout> | undefined;
      const inRetryWindow = () => Date.now() - started < NOT_FOUND_RETRY_MS;
      const attempt = () => {
        if (done) return;
        // If the signaling socket dropped meanwhile, connect() would return undefined:
        // reconnect first (PeerJS queues signaling messages until the socket is open).
        if (peer.disconnected && !peer.destroyed) peer.reconnect();
        onProgress?.(`Szukanie pokoju ${code}…`);
        const c = peer.connect(peerIdFor(code), { reliable: true, serialization: 'raw' }) as
          DataConnection | undefined;
        if (!c) {
          if (inRetryWindow()) retryTimer = setTimeout(attempt, 500);
          else finish(notFoundSeen ? 'not-found' : 'signaling');
          return;
        }
        current = c;
        c.on('open', () => finish(null, c));
        c.on('error', (err) => {
          console.warn('[join] connection error', (err as { type?: string }).type, err);
          if (c === current)
            finish(classifyPeerError((err as { type?: string }).type) ?? 'ice-failed');
        });
        // PeerJS creates the RTCPeerConnection synchronously in connect(); watch ICE directly.
        const pc = c.peerConnection as RTCPeerConnection | undefined;
        pc?.addEventListener('iceconnectionstatechange', () => {
          const st = pc.iceConnectionState;
          if (st === 'checking') {
            iceSeen = true;
            onProgress?.(`Pokój ${code} znaleziony — zestawianie połączenia…`);
          }
          if (st === 'failed' && c === current) finish('ice-failed');
        });
      };
      const onPeerError = (err: unknown) => {
        const type = (err as { type?: string }).type;
        console.warn('[join] peer error', type, err);
        const kind = classifyPeerError(type) ?? 'timeout';
        if (kind === 'not-found' && !notFoundSeen) {
          notFoundSeen = true;
          // 0.peerjs.com reports an unknown id only once; later offers to it get no reply,
          // so give up as "not found" (not a 30 s timeout) unless a host answered meanwhile.
          notFoundDeadline = setTimeout(
            () => !iceSeen && finish('not-found'),
            started + NOT_FOUND_RETRY_MS + NOT_FOUND_GRACE_MS - Date.now(),
          );
        }
        if (kind === 'not-found' && inRetryWindow()) {
          current?.close();
          current = null;
          clearTimeout(retryTimer);
          retryTimer = setTimeout(attempt, 1500);
          return;
        }
        // A signaling drop while retrying "not found" is handled by the pending retry
        // (reconnect, or report not-found when the window ends) rather than as a network error.
        if (kind === 'signaling' && notFoundSeen) {
          if (!inRetryWindow()) finish('not-found');
          return;
        }
        finish(kind);
      };
      peer.on('error', onPeerError);
      attempt();
    });
  } catch (err) {
    peer.destroy();
    throw err;
  }
  onProgress?.('Połączono — dołączanie do drużyny…');
  const session = new ClientSession(new PeerLink(conn), name, prefs.chapter());
  session.join();
  return {
    mode: 'p2p',
    roomCode: code,
    session,
    host: null,
    close: () => (session.close(), peer.destroy()),
  };
}

/** EXPERIMENTAL: create/join a room on the dedicated WebSocket host (?ws=1). */
export async function connectDedicated(name: string, rawCode?: string): Promise<GameConnection> {
  const info = await getServerInfo();
  if (!config.apiUrl || !info?.wsGameHost)
    throw new Error('Dedicated host not available on the server.');
  const url = new URL(config.apiUrl.replace(/^http/, 'ws') + info.wsGameHost.path);
  if (rawCode) url.searchParams.set('room', normalizeRoomCode(rawCode));
  else url.searchParams.set('create', '1');
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener(
      'error',
      () =>
        reject(new Error(rawCode ? 'Room not found.' : 'Could not connect to the dedicated host.')),
      { once: true },
    );
  });
  const session = new ClientSession(new BrowserWsLink(ws), name, prefs.chapter());
  const welcomed = new Promise<string>((resolve) => session.on('welcome', (w) => resolve(w.room)));
  session.join();
  const roomCode = await welcomed;
  return { mode: 'dedicated', roomCode, session, host: null, close: () => session.close() };
}
