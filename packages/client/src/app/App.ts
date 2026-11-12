import {
  defaultContent,
  findMission,
  getMission,
  DEFAULT_MISSION_ID,
  type ContentRegistry,
  type PlayerSummary,
  type SquadSummary,
  type RunResult,
} from '@sms/shared';
import { AudioEngine } from '../audio/AudioEngine.js';
import { config } from '../config.js';
import { GameClient } from '../game/GameClient.js';
import {
  connectDedicated,
  createLocalGame,
  hostPeerGame,
  joinPeerGame,
  type GameConnection,
} from '../net/connection.js';
import { Assets } from '../render/assets.js';
import { createGameOverScreen } from '../ui/screens/gameOver.js';
import { stripJoinParams } from '../net/joinUrl.js';
import { createJoinScreen } from '../ui/screens/join.js';
import { createMenuScreen } from '../ui/screens/menu.js';
import { createRoomScreen } from '../ui/screens/room.js';
import { stageHiveDemo } from '../game/demo.js';
import { attachVoice } from '../voice/index.js';

type Screen = 'boot' | 'menu' | 'join' | 'room' | 'game' | 'over';

/**
 * Top-level state machine: menu -> (room) -> game -> game over -> room/menu.
 * Owns the connection, the GameClient and the DOM overlay.
 */
export class App {
  screen: Screen = 'boot';
  private readonly assets = new Assets();
  private audio!: AudioEngine;
  private readonly content: ContentRegistry = config.names
    ? defaultContent.withNames(config.names)
    : defaultContent;
  private conn: GameConnection | null = null;
  private game: GameClient | null = null;
  private cleanup: Array<() => void> = [];
  private connCleanup: Array<() => void> = [];
  private leaving = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ui: HTMLElement,
  ) {}

  async boot(): Promise<void> {
    await this.assets.load();
    this.audio = new AudioEngine(this.assets.manifest, this.assets.baseUrl);
    (window as unknown as { __sms: App }).__sms = this; // debugging / smoke tests
    document.title = this.content.title;
    document.documentElement.style.setProperty(
      '--parchment',
      `url(${this.assets.baseUrl}ui/parchment.png)`,
    );
    if (config.demo) this.solo(config.autoName || 'Brother-Sergeant', true);
    else if (config.autoSolo) this.solo(config.autoName || 'Smoke');
    else if (config.joinCode) this.showJoin(config.joinCode);
    else this.showMenu();
  }

  private setUi(el: HTMLElement | null): void {
    for (const c of this.cleanup) c();
    this.cleanup = [];
    this.ui.replaceChildren(...(el ? [el] : []));
    this.ui.classList.toggle('hidden', !el);
  }

  /** Join progress line (under the JOIN button / in the menu's error slot). */
  private progress(message: string): void {
    const el = this.ui.querySelector<HTMLElement>('#err');
    if (!el) return;
    el.textContent = message;
    el.classList.add('progress');
  }

  /** Room code of an in-progress join-link flow (errors return to the join screen). */
  private linkJoin: string | null = null;

  /** Join flow from a QR / share link: only asks for a callsign. */
  showJoin(code: string, error?: string): void {
    this.disconnect();
    this.screen = 'join';
    this.linkJoin = code;
    this.audio.playMusic('menu');
    this.setUi(
      createJoinScreen(
        code,
        {
          join: (name) =>
            void this.connect(() =>
              config.useDedicatedHost
                ? connectDedicated(name, code)
                : joinPeerGame(code, name, (m) => this.progress(m)),
            ),
          menu: () => this.leaveJoinFlow(),
        },
        error,
      ),
    );
  }

  private leaveJoinFlow(): void {
    this.linkJoin = null;
    config.joinCode = '';
    history.replaceState(null, '', stripJoinParams(location.href));
    this.showMenu();
  }

  /** Error path: back to the join screen during a link join, else the menu. */
  private fail(message: string): void {
    if (this.linkJoin && this.screen !== 'game' && this.screen !== 'over')
      this.showJoin(this.linkJoin, message);
    else this.showMenu(message);
  }

  showMenu(error?: string): void {
    this.disconnect();
    this.linkJoin = null;
    this.screen = 'menu';
    this.audio.playMusic('menu');
    this.setUi(
      createMenuScreen(
        {
          solo: (name) => this.solo(name),
          host: (name) =>
            void this.connect(() =>
              config.useDedicatedHost ? connectDedicated(name) : hostPeerGame(name),
            ),
          join: (name, code) =>
            void this.connect(() =>
              config.useDedicatedHost
                ? connectDedicated(name, code)
                : joinPeerGame(code, name, (m) => this.progress(m)),
            ),
        },
        {
          content: this.content,
          baseUrl: this.assets.baseUrl,
          joinCode: config.joinCode,
          error,
          dedicated: config.useDedicatedHost,
          mixer: this.audio.mixerControls(),
        },
      ),
    );
  }

  private solo(name: string, demo = false): void {
    const conn = createLocalGame(name, undefined, config.mission || undefined);
    this.attach(conn);
    if (demo) {
      const off = conn.session.on('start', () => {
        const map = conn.host?.world?.map ?? this.content.map;
        if (conn.host?.world) stageHiveDemo(conn.host.world, this.content.withMap(map));
      });
      this.connCleanup.push(off);
    }
    // Solo skips the room screen: start as soon as the lobby exists.
    const off = conn.session.on('lobby', (l) => {
      if (l.phase === 'lobby' && conn.session.isOwner) conn.session.requestStart();
    });
    this.connCleanup.push(off);
  }

  private async connect(factory: () => Promise<GameConnection>): Promise<void> {
    try {
      const conn = await factory();
      this.attach(conn);
      this.showRoom();
      if (this.linkJoin) {
        // joined via link: drop ?join so leaving / reloading doesn't loop back into the room
        config.joinCode = '';
        history.replaceState(null, '', stripJoinParams(location.href));
      }
    } catch (err) {
      console.error(err);
      this.fail(err instanceof Error ? err.message : String(err));
    }
  }

  /** Wires session events that matter regardless of the current screen. */
  private attach(conn: GameConnection): void {
    this.conn = conn;
    this.leaving = false;
    const s = conn.session;
    this.connCleanup.push(attachVoice(conn)); // voice chat: only when the host opted in (P2P)
    this.connCleanup.push(
      s.on('start', (ev) => this.startGame(ev.mission)),
      s.on('lobby', (l) => {
        if (
          l.phase === 'lobby' &&
          (this.screen === 'over' || this.screen === 'game') &&
          conn.mode !== 'local'
        )
          this.showRoom();
      }),
      s.on('error', (e) => {
        if (e.code === 'full' || e.code === 'in_progress' || e.code === 'protocol')
          this.fail(e.message);
        else console.warn('[session]', e);
      }),
      s.on('closed', () => {
        if (!this.leaving)
          this.fail(conn.host ? 'Session closed.' : 'Lost connection to the squad host.');
      }),
    );
  }

  private disconnect(): void {
    this.game?.dispose();
    this.game = null;
    for (const c of this.connCleanup) c();
    this.connCleanup = [];
    if (this.conn) {
      this.leaving = true;
      this.conn.close();
      this.conn = null;
    }
  }

  private showRoom(): void {
    const conn = this.conn;
    if (!conn) return;
    this.game?.dispose();
    this.game = null;
    this.screen = 'room';
    this.audio.playMusic('menu');
    const host = conn.mode === 'p2p' ? conn.host : undefined;
    const room = createRoomScreen(conn.session, conn.roomCode, conn.mode, this.content, {
      leave: () => this.showMenu(),
      // Voice chat opt-in: the P2P host decides for the room (sent to all in 'lobby').
      ...(host ? { setVoice: (on: boolean) => host.setVoice(on) } : {}),
    });
    this.setUi(room.el);
    this.cleanup.push(room.dispose);
  }

  private startGame(missionId?: string): void {
    const conn = this.conn;
    if (!conn) return;
    this.game?.dispose();
    this.screen = 'game';
    this.linkJoin = null;
    this.gameOverUi = null;
    this.setUi(null);
    const mid = findMission(missionId)?.id ?? DEFAULT_MISSION_ID;
    const content = this.content.withMap(getMission(mid).map);
    const game = new GameClient(conn, this.canvas, this.assets, this.audio, content);
    game.on('over', (o) => setTimeout(() => this.showGameOver(o.result, o.summary, o.squad), 1600));
    // Escape / ⏸ -> "leave": close the connection (a leaving host closes the room, and the
    // squad takes the usual host-disconnect path) and go back to the main menu.
    game.on('leave', () => this.showMenu());
    game.start();
    this.game = game;
  }

  private gameOverUi: ReturnType<typeof createGameOverScreen> | null = null;

  private showGameOver(result: RunResult, summary: PlayerSummary[], squad?: SquadSummary): void {
    const conn = this.conn;
    if (!conn || this.screen !== 'game') return;
    this.screen = 'over';
    const colors = new Map(
      (conn.session.lobby?.players ?? []).map((p) => [p.id, this.content.chapter(p.chapter)]),
    );
    const ui = createGameOverScreen(
      result,
      summary,
      {
        canRestart: conn.session.isOwner,
        colors,
        content: this.content,
        squad,
        icon: (key) => this.assets.iconUrl(key),
      },
      {
        again: () => {
          // Back to lobby; solo auto-starts from there, squads return to the room screen.
          conn.session.requestLobby();
        },
        menu: () => this.showMenu(),
      },
    );
    this.gameOverUi = ui;
    this.setUi(ui.el);
  }
}
