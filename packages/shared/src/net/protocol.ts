import type { RunResult, SubmitStatus } from '../highscore/types.js';
import type { PlayerInput } from '../sim/types.js';
import type { Snapshot } from '../sim/snapshot.js';

/**
 * Wire protocol between a game host (browser host, local, or dedicated server)
 * and clients. Transport-agnostic: see net/link.ts.
 */

export type SessionPhase = 'lobby' | 'playing' | 'over';

export interface LobbyPlayer {
  id: number;
  name: string;
  /** Chapter index (content.chapters). Unique within a room. */
  chapter: number;
}

export interface PlayerSummary {
  id: number;
  name: string;
  kills: number;
  /** Personal score (sum of kill points). */
  score: number;
  /** Kills per enemy type id. */
  killsByType: Record<string, number>;
  damage: number;
  diedAtMs: number | null;
}

/** Squad-wide totals of a run (v0.6+; older hosts omit it). */
export interface SquadSummary {
  /**
   * Every kill per enemy type id, including the ones no marine was credited with
   * (e.g. Tyranids caught in a self-detonating Spore Mine's blast).
   */
  killsByType: Record<string, number>;
}

export type ClientMessage =
  /** `chapter` = preferred chapter id; the host picks a free one if taken. */
  | { t: 'join'; name: string; protocol: number; chapter?: string }
  /** Change chapter in the lobby (ignored if taken or not in the lobby). */
  | { t: 'chapter'; id: string }
  | { t: 'input'; i: PlayerInput }
  | { t: 'start' }
  | { t: 'toLobby' }
  | { t: 'ping'; ts: number };

export type HostMessage =
  | { t: 'welcome'; playerId: number; room: string; protocol: number }
  | {
      t: 'lobby';
      room: string;
      ownerId: number;
      phase: SessionPhase;
      maxPlayers: number;
      players: LobbyPlayer[];
      /**
       * Host enabled voice chat for this room (optional, v0.6+; absent = off). Voice runs on its
       * own PeerJS mesh, so older clients just ignore the field (protocol stays v5).
       */
      voice?: boolean;
      /** Chosen mission id (protocol v10). Absent = hive_siege. */
      mission?: string;
    }
  | { t: 'start'; seed: number; players: LobbyPlayer[]; mission?: string }
  | { t: 'snap'; s: Snapshot }
  | { t: 'over'; result: RunResult; summary: PlayerSummary[]; squad?: SquadSummary }
  | { t: 'submitted'; runId: string; status: SubmitStatus; rank?: number }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; ts: number };

export type ErrorCode =
  'full' | 'in_progress' | 'protocol' | 'not_owner' | 'bad_message' | 'closed';

const CLIENT_TYPES = new Set(['join', 'chapter', 'input', 'start', 'toLobby', 'ping']);

/** Cheap structural check for untrusted client messages. */
export function isClientMessage(m: unknown): m is ClientMessage {
  if (typeof m !== 'object' || m === null) return false;
  const t = (m as { t?: unknown }).t;
  if (typeof t !== 'string' || !CLIENT_TYPES.has(t)) return false;
  if (t === 'input') {
    const i = (m as { i?: Record<string, unknown> }).i;
    return (
      typeof i === 'object' &&
      i !== null &&
      typeof i.seq === 'number' &&
      typeof i.mx === 'number' &&
      typeof i.my === 'number' &&
      typeof i.aim === 'number' &&
      Number.isFinite(i.aim as number) &&
      // optional sprint bit (v5-compatible: older clients just never send it)
      (i.sprint === undefined || typeof i.sprint === 'boolean') &&
      (i.guard === undefined || typeof i.guard === 'boolean') &&
      (i.reinforce === undefined || typeof i.reinforce === 'boolean')
    );
  }
  if (t === 'join') {
    const j = m as { name?: unknown; chapter?: unknown };
    return typeof j.name === 'string' && (j.chapter === undefined || typeof j.chapter === 'string');
  }
  if (t === 'chapter') return typeof (m as { id?: unknown }).id === 'string';
  return true;
}
