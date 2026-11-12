import { PROTOCOL_VERSION } from '../constants.js';
import { DEFAULT_MISSION_ID } from '../data/missions.js';
import type { RunResult, SubmitStatus } from '../highscore/types.js';
import type { Link } from '../net/link.js';
import type {
  ErrorCode,
  HostMessage,
  LobbyPlayer,
  PlayerSummary,
  SessionPhase,
  SquadSummary,
} from '../net/protocol.js';
import type { Snapshot } from '../sim/snapshot.js';
import type { PlayerInput } from '../sim/types.js';
import { Emitter } from '../util/emitter.js';

export interface LobbyInfo {
  room: string;
  ownerId: number;
  phase: SessionPhase;
  maxPlayers: number;
  players: LobbyPlayer[];
  /** Host enabled voice chat (see HostMessage 'lobby'). */
  voice: boolean;
  /** Mission selected for the next / current run (protocol v10). */
  mission: string;
}

export type ClientSessionEvents = {
  welcome: { playerId: number; room: string };
  lobby: LobbyInfo;
  start: { seed: number; players: LobbyPlayer[]; mission: string };
  snapshot: Snapshot;
  over: { result: RunResult; summary: PlayerSummary[]; squad?: SquadSummary };
  submitted: { runId: string; status: SubmitStatus; rank?: number };
  error: { code: ErrorCode; message: string };
  pong: { rtt: number };
  closed: undefined;
};

/** Client-side protocol handling over any Link. UI/rendering subscribe to its events. */
export class ClientSession extends Emitter<ClientSessionEvents> {
  playerId = -1;
  lobby: LobbyInfo | null = null;
  rtt = 0;
  private nextSeq = 1;

  constructor(
    readonly link: Link,
    readonly name: string,
    /** Preferred chapter id (the host picks a free one if it's taken). */
    readonly chapter?: string,
  ) {
    super();
    link.onMessage((m) => this.handle(m as HostMessage));
    link.onClose(() => this.emit('closed', undefined));
  }

  /** Send the join request (call after the link is open). */
  join(): void {
    this.link.send({
      t: 'join',
      name: this.name,
      protocol: PROTOCOL_VERSION,
      ...(this.chapter ? { chapter: this.chapter } : {}),
    });
  }

  get isOwner(): boolean {
    return !!this.lobby && this.lobby.ownerId === this.playerId;
  }

  /** Sends an input frame; assigns and returns its sequence number. */
  sendInput(input: Omit<PlayerInput, 'seq'>): PlayerInput {
    const full: PlayerInput = { ...input, seq: this.nextSeq++ };
    this.link.send({ t: 'input', i: full });
    return full;
  }

  /** Asks the host for another chapter (lobby only; ignored if taken). */
  selectChapter(id: string): void {
    this.link.send({ t: 'chapter', id });
  }

  requestStart(): void {
    this.link.send({ t: 'start' });
  }

  requestLobby(): void {
    this.link.send({ t: 'toLobby' });
  }

  ping(): void {
    this.link.send({ t: 'ping', ts: Date.now() });
  }

  close(): void {
    this.link.close();
  }

  private handle(m: HostMessage): void {
    switch (m.t) {
      case 'welcome':
        this.playerId = m.playerId;
        this.emit('welcome', { playerId: m.playerId, room: m.room });
        break;
      case 'lobby':
        this.lobby = {
          room: m.room,
          ownerId: m.ownerId,
          phase: m.phase,
          maxPlayers: m.maxPlayers,
          players: m.players,
          voice: m.voice === true,
          mission: typeof m.mission === 'string' && m.mission ? m.mission : DEFAULT_MISSION_ID,
        };
        this.emit('lobby', this.lobby);
        break;
      case 'start':
        this.emit('start', {
          seed: m.seed,
          players: m.players,
          mission: typeof m.mission === 'string' && m.mission ? m.mission : DEFAULT_MISSION_ID,
        });
        break;
      case 'snap':
        this.emit('snapshot', m.s);
        break;
      case 'over':
        this.emit('over', { result: m.result, summary: m.summary, squad: m.squad });
        break;
      case 'submitted':
        this.emit('submitted', { runId: m.runId, status: m.status, rank: m.rank });
        break;
      case 'error':
        this.emit('error', { code: m.code, message: m.message });
        break;
      case 'pong':
        this.rtt = Date.now() - m.ts;
        this.emit('pong', { rtt: this.rtt });
        break;
    }
  }
}
