import {
  GAME_VERSION,
  MAX_CATCHUP_TICKS,
  MAX_PLAYERS,
  NET,
  PLAYER,
  PROTOCOL_VERSION,
  TICK_DT,
} from '../constants.js';
import { defaultContent, type ContentRegistry } from '../data/index.js';
import { sanitizeName } from '../highscore/limits.js';
import type { RunMode, RunResult, SubmitStatus } from '../highscore/types.js';
import { randomSeed } from '../math/rng.js';
import type { Link } from '../net/link.js';
import {
  isClientMessage,
  type ClientMessage,
  type HostMessage,
  type LobbyPlayer,
  type PlayerSummary,
  type SquadSummary,
  type SessionPhase,
} from '../net/protocol.js';
import { applyInput, stepWorld } from '../sim/simulation.js';
import { buildSnapshot } from '../sim/snapshot.js';
import { marineMoveSpeed, stepFireSlow, stepPlayerMovement } from '../sim/systems/movement.js';
import { trackStillness } from '../sim/systems/players.js';
import type { GameEvent, PlayerInput, World } from '../sim/types.js';
import { createWorld } from '../sim/world.js';
import { makeRunId } from '../util/ids.js';
import { realScheduler, type Scheduler } from './scheduler.js';

export interface HostSessionOptions {
  roomCode: string;
  mode: RunMode;
  maxPlayers?: number;
  content?: ContentRegistry;
  /**
   * Registered map id (maps/index.ts); omitted = the map of `content` (the wave map). Host-only
   * for now: clients are not told the map yet (wire `start` carries no map id), so only the
   * default map works in multiplayer until a picker + optional wire field are added.
   */
  mapId?: string;
  scheduler?: Scheduler;
  /** Called once per finished run; returns where it was stored. */
  submitResult?: (result: RunResult) => Promise<{ status: SubmitStatus; rank?: number }>;
  /** Called when the session has no members left (dedicated servers clean up rooms). */
  onEmpty?: () => void;
  seed?: () => number;
  /** Ticks per snapshot for network sessions (default NET.snapshotEvery; tools/tests). */
  snapshotEvery?: number;
  log?: (...args: unknown[]) => void;
  /** Voice chat enabled for the room (host choice, sent to everyone in 'lobby'). Default off. */
  voice?: boolean;
}

interface Member {
  link: Link;
  playerId: number;
  name: string;
  chapter: number;
  inputs: PlayerInput[];
}

const MAX_QUEUED_INPUTS = 12;

/**
 * Authoritative game host: lobby, fixed-tick simulation, snapshot broadcast and
 * run submission. Knows nothing about the transport — feed it Links.
 */
export class HostSession {
  phase: SessionPhase = 'lobby';
  world: World | null = null;
  readonly roomCode: string;
  private readonly opts: HostSessionOptions;
  private voiceOn: boolean;
  private readonly content: ContentRegistry;
  private readonly scheduler: Scheduler;
  private members = new Map<string, Member>();
  private pending = new Set<Link>();
  private ownerId = -1;
  private nextPlayerId = 1;
  private cancelLoop: (() => void) | null = null;
  private lastTime = 0;
  private acc = 0;
  private closed = false;
  private pendingEvents: GameEvent[] = [];

  constructor(opts: HostSessionOptions) {
    this.opts = opts;
    this.voiceOn = opts.voice === true;
    this.roomCode = opts.roomCode;
    const content = opts.content ?? defaultContent;
    this.content = opts.mapId === undefined ? content : content.withMap(opts.mapId);
    this.scheduler = opts.scheduler ?? realScheduler;
  }

  get maxPlayers(): number {
    return Math.min(MAX_PLAYERS, this.opts.maxPlayers ?? MAX_PLAYERS);
  }

  get playerCount(): number {
    return this.members.size;
  }

  /** Accept a new connection. It becomes a player once it sends `join`. */
  addLink(link: Link): void {
    if (this.closed) {
      link.close();
      return;
    }
    this.pending.add(link);
    link.onMessage((raw) => this.onMessage(link, raw));
    link.onClose(() => this.onClose(link));
  }

  private send(link: Link, msg: HostMessage): void {
    if (link.open) link.send(msg);
  }

  private broadcast(msg: HostMessage): void {
    for (const m of this.members.values()) this.send(m.link, msg);
  }

  private onMessage(link: Link, raw: unknown): void {
    if (!isClientMessage(raw)) {
      this.send(link, { t: 'error', code: 'bad_message', message: 'Malformed message' });
      return;
    }
    const msg: ClientMessage = raw;
    const member = this.members.get(link.id);
    if (!member) {
      if (msg.t === 'join') this.handleJoin(link, msg.name, msg.protocol, msg.chapter);
      return;
    }
    switch (msg.t) {
      case 'chapter': {
        if (this.phase === 'playing') break;
        const idx = this.content.chapterIndex(msg.id);
        if (idx < 0 || idx === member.chapter) break;
        if ([...this.members.values()].some((o) => o !== member && o.chapter === idx)) break;
        member.chapter = idx;
        this.broadcastLobby();
        break;
      }
      case 'input':
        member.inputs.push(msg.i);
        if (member.inputs.length > MAX_QUEUED_INPUTS)
          member.inputs.splice(0, member.inputs.length - MAX_QUEUED_INPUTS);
        break;
      case 'start':
        if (member.playerId !== this.ownerId)
          this.send(link, {
            t: 'error',
            code: 'not_owner',
            message: 'Only the room owner can start',
          });
        else this.start();
        break;
      case 'toLobby':
        if (member.playerId === this.ownerId && this.phase === 'over') this.toLobby();
        break;
      case 'ping':
        this.send(link, { t: 'pong', ts: msg.ts });
        break;
    }
  }

  private handleJoin(link: Link, rawName: string, protocol: number, chapterId?: string): void {
    if (protocol !== PROTOCOL_VERSION) {
      this.send(link, {
        t: 'error',
        code: 'protocol',
        message: `Protocol mismatch (host ${PROTOCOL_VERSION}, client ${protocol}). Refresh the page.`,
      });
      link.close();
      return;
    }
    if (this.phase === 'playing') {
      this.send(link, {
        t: 'error',
        code: 'in_progress',
        message: 'A run is in progress. Try again after it ends.',
      });
      link.close();
      return;
    }
    if (this.members.size >= this.maxPlayers) {
      this.send(link, {
        t: 'error',
        code: 'full',
        message: `Room is full (${this.maxPlayers} marines max).`,
      });
      link.close();
      return;
    }
    this.pending.delete(link);
    const used = new Set([...this.members.values()].map((m) => m.chapter));
    const wanted = chapterId === undefined ? -1 : this.content.chapterIndex(chapterId);
    let chapter = wanted >= 0 && !used.has(wanted) ? wanted : 0;
    while (used.has(chapter)) chapter++;
    const member: Member = {
      link,
      playerId: this.nextPlayerId++,
      name: sanitizeName(rawName) || `Marine ${this.nextPlayerId - 1}`,
      chapter,
      inputs: [],
    };
    this.members.set(link.id, member);
    if (this.ownerId < 0) this.ownerId = member.playerId;
    this.send(link, {
      t: 'welcome',
      playerId: member.playerId,
      room: this.roomCode,
      protocol: PROTOCOL_VERSION,
    });
    this.opts.log?.(
      `[room ${this.roomCode}] ${member.name} joined (${this.members.size}/${this.maxPlayers})`,
    );
    this.broadcastLobby();
  }

  private onClose(link: Link): void {
    this.pending.delete(link);
    const member = this.members.get(link.id);
    if (!member) return;
    this.members.delete(link.id);
    this.opts.log?.(`[room ${this.roomCode}] ${member.name} left`);
    if (this.world) {
      const p = this.world.players.find((x) => x.id === member.playerId);
      if (p) p.connected = false;
    }
    if (member.playerId === this.ownerId) {
      const next = this.members.values().next().value as Member | undefined;
      this.ownerId = next ? next.playerId : -1;
    }
    if (this.members.size === 0) {
      this.stopLoop();
      if (this.phase === 'playing') this.phase = 'lobby';
      this.opts.onEmpty?.();
      return;
    }
    this.broadcastLobby();
  }

  lobbyPlayers(): LobbyPlayer[] {
    return [...this.members.values()].map((m) => ({
      id: m.playerId,
      name: m.name,
      chapter: m.chapter,
    }));
  }

  private broadcastLobby(): void {
    this.broadcast({
      t: 'lobby',
      room: this.roomCode,
      ownerId: this.ownerId,
      phase: this.phase,
      maxPlayers: this.maxPlayers,
      players: this.lobbyPlayers(),
      ...(this.voice ? { voice: true } : {}),
    });
  }

  /** Host's voice-chat opt-in for the room (rebroadcasts the lobby). */
  get voice(): boolean {
    return this.voiceOn;
  }

  setVoice(on: boolean): void {
    if (this.voiceOn === on || this.closed) return;
    this.voiceOn = on;
    this.broadcastLobby();
  }

  start(): boolean {
    if (this.phase === 'playing' || this.members.size === 0 || this.closed) return false;
    const seed = (this.opts.seed ?? randomSeed)();
    const players = this.lobbyPlayers();
    this.world = createWorld(players, seed, this.content);
    this.pendingEvents = [];
    for (const m of this.members.values()) m.inputs = [];
    this.phase = 'playing';
    this.broadcast({ t: 'start', seed, players });
    this.broadcastLobby();
    this.opts.log?.(
      `[room ${this.roomCode}] run started with ${players.length} marine(s), seed ${seed}`,
    );
    this.lastTime = this.scheduler.now();
    this.acc = 0;
    this.stopLoop();
    this.cancelLoop = this.scheduler.every(1000 / 60, () => this.frame());
    return true;
  }

  /** Solo pause (leave-game dialog): the loop keeps running but simulates nothing. */
  paused = false;

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.lastTime = this.scheduler.now();
    this.acc = 0;
  }

  private frame(): void {
    const now = this.scheduler.now();
    if (this.paused) {
      this.lastTime = now;
      return;
    }
    this.acc += (now - this.lastTime) / 1000;
    this.lastTime = now;
    let ticks = 0;
    while (this.acc >= TICK_DT && ticks < MAX_CATCHUP_TICKS) {
      this.acc -= TICK_DT;
      ticks++;
      this.tick();
      if (this.phase !== 'playing') return;
    }
    // Drop time we could not simulate (e.g. throttled background tab) instead of spiralling.
    if (this.acc > TICK_DT * MAX_CATCHUP_TICKS) this.acc = 0;
  }

  /** Runs exactly one simulation tick (public for tests & headless runs). */
  tick(): void {
    const world = this.world;
    if (!world || this.phase !== 'playing') return;
    for (const m of this.members.values()) {
      // If inputs piled up (jitter/lag), fast-forward movement of the oldest one.
      if (m.inputs.length > 4) {
        const extra = m.inputs.shift()!;
        const p = world.players.find((x) => x.id === m.playerId);
        if (p && p.state === 'alive') {
          trackStillness(p, extra.mx, extra.my, TICK_DT);
          p.fireSlow = stepFireSlow(p.fireSlow, extra.fire, TICK_DT);
          stepPlayerMovement(
            p,
            extra.mx,
            extra.my,
            marineMoveSpeed(this.content.weapon(p.current), p.fireSlow),
            TICK_DT,
            world.map,
          );
          p.lastInputSeq = Math.max(p.lastInputSeq, extra.seq);
        }
      }
      const next = m.inputs.shift();
      if (next) applyInput(world, m.playerId, next);
      else {
        // No input this tick: hold aim/trigger, stop moving (client reconciles).
        const p = world.players.find((x) => x.id === m.playerId);
        if (p) p.input = { ...p.input, mx: 0, my: 0, slot: 0, reload: false };
      }
    }
    stepWorld(world, TICK_DT);
    // Network hosts snapshot every NET.snapshotEvery ticks (events of skipped ticks ride
    // along); solo keeps every tick. The last snapshot of a run always goes out.
    for (const ev of world.events) this.pendingEvents.push(ev);
    const every = this.opts.mode === 'local' ? 1 : (this.opts.snapshotEvery ?? NET.snapshotEvery);
    if (world.tick % every === 0 || world.over) {
      const snap = buildSnapshot(world, PLAYER.bleedOutTime);
      snap.events = this.pendingEvents;
      this.pendingEvents = [];
      this.broadcast({ t: 'snap', s: snap });
    }
    if (world.over) this.finish();
  }

  private finish(): void {
    const world = this.world!;
    this.phase = 'over';
    this.stopLoop();
    const result: RunResult = {
      runId: makeRunId(),
      teamSize: world.teamSize,
      players: world.players.map((p) => p.name),
      survivalMs: Math.round(world.time * 1000),
      wave: world.director.wave,
      kills: world.stats.kills,
      playerScores: world.players.map((p) => p.score),
      playerKills: world.players.map((p) => p.kills),
      endedAt: new Date().toISOString(),
      version: GAME_VERSION,
      mode: this.opts.mode,
    };
    const summary: PlayerSummary[] = world.players.map((p) => ({
      id: p.id,
      name: p.name,
      kills: p.kills,
      score: p.score,
      killsByType: { ...p.killsByType },
      damage: Math.round(p.damageDealt),
      diedAtMs: p.diedAt === null ? null : Math.round(p.diedAt * 1000),
    }));
    const squad: SquadSummary = { killsByType: { ...world.stats.killsByType } };
    this.broadcast({ t: 'over', result, summary, squad });
    this.broadcastLobby();
    this.opts.log?.(
      `[room ${this.roomCode}] run over: ${(result.survivalMs / 1000).toFixed(1)}s, ${result.kills} kills`,
    );
    const submit = this.opts.submitResult;
    if (submit && result.survivalMs >= 1000) {
      submit(result)
        .then((r) =>
          this.broadcast({ t: 'submitted', runId: result.runId, status: r.status, rank: r.rank }),
        )
        .catch(() => this.broadcast({ t: 'submitted', runId: result.runId, status: 'failed' }));
    } else {
      this.broadcast({ t: 'submitted', runId: result.runId, status: 'failed' });
    }
  }

  toLobby(): void {
    if (this.phase !== 'over') return;
    this.phase = 'lobby';
    this.world = null;
    this.broadcastLobby();
  }

  private stopLoop(): void {
    this.cancelLoop?.();
    this.cancelLoop = null;
  }

  close(): void {
    this.closed = true;
    this.stopLoop();
    for (const m of this.members.values()) {
      this.send(m.link, { t: 'error', code: 'closed', message: 'Host closed the room' });
      m.link.close();
    }
    for (const l of this.pending) l.close();
    this.members.clear();
    this.pending.clear();
  }
}
