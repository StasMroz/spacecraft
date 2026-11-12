import { visibleTo } from './visibility.js';
import {
  PLAYER,
  ROLE_COLOR,
  ROLE_SHORT,
  weaponProfileLabel,
  weaponRolesLabel,
  MARINE_SPRINT,
  type ContentRegistry,
  type EnemyDef,
  type WeaponDef,
  type PlayerSnap,
  type Snapshot,
  snapWalls,
  findMission,
} from '@sms/shared';
import type { NoticeKind } from '../game/fx.js';
import { formatTime } from '../ui/format.js';
import type { StickView, TouchPadView } from '../input/TouchInput.js';
import {
  hitTouchPad,
  touchPadLayout,
  type TouchHit,
  type TouchPadLayout,
} from '../input/touchControls.js';
import type { Assets } from './assets.js';
import { chapterUiColor } from './colors.js';

/** Gothic HUD palette: smoked umber panels, brass frames, parchment text. */
export const HUD = {
  panel: 'rgba(18,12,7,0.78)',
  brass: '#b08a3e',
  brassDark: '#5a4520',
  parchment: '#e8d9b0',
  dim: '#a8956a',
  gold: '#e0b850',
  red: '#c83228',
  heat: '#6fd0ff',
  serif: "Georgia, 'Times New Roman', 'Liberation Serif', serif",
  mono: 'ui-monospace, Menlo, Consolas, monospace',
} as const;
const F = (weight: number, px: number, mono = false) =>
  `${weight} ${px}px ${mono ? HUD.mono : HUD.serif}`;

export interface Notice {
  text: string;
  kind: NoticeKind;
  /** Seconds remaining on screen. */
  ttl: number;
}

export interface HudState {
  snap: Snapshot;
  me: PlayerSnap | undefined;
  myPos: { x: number; y: number } | null;
  notices: Notice[];
  ping: number;
  fps: number;
  /** Crosshair in CSS px (mouse cursor, or projected aim on touch); null = hidden. */
  crosshair: { x: number; y: number } | null;
  /** Input point before aim recoil (faint dot while the reticle is kicked off it). */
  crosshairRaw?: { x: number; y: number } | null;
  /** Touch sticks when the touch layout is active; null = PC layout. */
  touch: StickView[] | null;
  /** Sprint button + weapon wheel state (touch only). */
  touchPad?: TouchPadView | null;
  /** Safe-area insets in CSS px (notches). */
  inset?: Insets;
  roomCode: string;
  mode: string;
  muted: boolean;
  debug: string | null;
  /** Camera centre (world px) + zoom (world px -> CSS px). */
  camera?: { x: number; y: number; zoom: number };
  /** Render clock, seconds (animations). */
  now?: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** HUD scale: 1 on desktop; on touch, shrink to fit small phone screens. */
export function hudScale(w: number, h: number, touch: boolean): number {
  if (!touch) return 1;
  return Math.max(0.6, Math.min(1, w / 900, h / 520));
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the DOM voice overlay may sit (CSS px); `align` = how its chips line up in it. */
export interface VoiceSlot {
  x: number;
  y: number;
  w: number;
  align: 'left' | 'center';
  compact: boolean;
}

/** Idle move-stick hint (centre, CSS px) — also where a thumb usually lands. */
export const MOVE_HINT = { x: 110, fromBottom: 100 };

/**
 * Compact phone layout: touch + short landscape viewport. The top-centre clock/score plates
 * move into a stacked block in the top-left corner (with the armour bar), which leaves the
 * top centre free for the voice overlay.
 */
export function compactTouch(cw: number, ch: number, touch: boolean): boolean {
  return touch && ch <= 500 && cw > ch;
}

export interface HudLayout {
  ui: number;
  compact: boolean;
  /** Compact only: the stacked top-left block (HUD units) and its rows. */
  block: (Rect & { armourY: number; heatY: number }) | null;
  team: { top: number; cols: 1 | 2; rowH: number; h: number } | null;
  /** Bottom of the left column in HUD units (last element drawn there). */
  leftBottom: number;
  voice: VoiceSlot;
  /**
   * Compact only: the free top-centre band (HUD units, x0..x1) between the corner block and the
   * minimap. Every centred message (boss bar, wave banner, downed/revive, notices) stacks down
   * from the top of it (v0.6.0 hotfix), under the voice row when that is shown.
   */
  topBand: { x0: number; x1: number } | null;
}

const TEAM_W = 200;
const BLOCK_W = 252;

/**
 * Pure HUD layout of the left column + the voice-overlay slot (testable without a canvas).
 * HUD units = CSS px / ui, inside the safe area.
 */
export function hudLayout(
  cw: number,
  ch: number,
  touch: boolean,
  ins: Insets,
  o: { players: number; me: boolean; heat: boolean },
): HudLayout {
  const ui = hudScale(cw, ch, touch);
  const compact = compactTouch(cw, ch, touch);
  const w = (cw - ins.left - ins.right) / ui;
  const showTeam = o.players >= 2;
  let block: HudLayout['block'] = null;
  let teamTop: number;
  let cols: 1 | 2 = 1;
  let rowH = o.players > 4 ? 19 : 26;
  if (compact) {
    // clock row 10..50, wave row ..62, armour bar 66..80, optional heat row 84..96
    const armourY = 66;
    const heatY = 86;
    const bottom = !o.me ? 66 : o.heat ? 104 : 88;
    block = { x: 10, y: 10, w: BLOCK_W, h: bottom - 10, armourY, heatY };
    teamTop = bottom + 6;
    // a big squad goes to two columns so the column never reaches the move stick
    cols = o.players > 4 ? 2 : 1;
    rowH = 22;
  } else teamTop = touch ? (o.me ? 76 : 10) : 10;
  const rows = cols === 2 ? Math.ceil(o.players / 2) : o.players;
  const team = showTeam ? { top: teamTop, cols, rowH, h: 14 + rows * rowH } : null;
  const leftBottom = team ? team.top + team.h : block ? block.y + block.h : touch && o.me ? 68 : 0;
  let voice: VoiceSlot;
  let topBand: HudLayout['topBand'] = null;
  if (compact) {
    // top centre, between the left block and the minimap (minimap panel: w-206 .. w-8)
    const x0 = 10 + BLOCK_W + 8;
    const x1 = w - 190 - 12 - 4 - 8;
    topBand = { x0, x1 };
    voice = {
      x: ins.left + x0 * ui,
      y: ins.top + 6,
      w: Math.max(0, (x1 - x0) * ui),
      align: 'center',
      compact: true,
    };
  } else {
    // under the team list / armour in the left column (desktop: armour is bottom-left)
    const y = (team ? leftBottom : touch && o.me ? 68 : 10) + 8;
    voice = {
      x: ins.left + 10 * ui,
      y: ins.top + y * ui,
      w: Math.min(420, Math.max(TEAM_W, w / 2 - 140)) * ui,
      align: 'left',
      compact: touch,
    };
  }
  return { ui, compact, block, team, leftBottom, voice, topBand };
}

interface SlotRect {
  slot: number;
  owned: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

const NOTICE_COLORS: Record<NoticeKind, string> = {
  info: '#e8d9b0',
  good: '#9be07a',
  bad: '#ff6a50',
  warn: '#f0c050',
};

function missionBrief(s: HudState): {
  name: string;
  objective: string;
  timer: string | null;
  reinf: string;
  urgent: boolean;
} {
  const mi = s.snap.mi;
  const def = findMission(mi?.id);
  const name = def?.name ?? 'Misja';
  let objective = def?.objective ?? '';
  if (mi) {
    if (mi.tg.length) {
      const done = mi.tg.filter((t) => t.hp <= 0).length;
      objective = `Kapilary synapsy: ${done}/${mi.tg.length}`;
    }
    if (mi.rx !== undefined) {
      objective = mi.rc ? 'Donieś relikwię do strefy ekstrakcji.' : 'Odzyskaj relikwię.';
    }
    const needRelic = mi.rx !== undefined && !mi.rc;
    const needTargets = mi.tg.some((t) => t.hp > 0);
    if (mi.eo && mi.out === 0 && !needRelic && !needTargets) {
      const need = def?.extractHold ?? 5;
      objective =
        mi.ep > 0 ? `Ekstrakcja ${mi.ep.toFixed(1)}/${need}s` : 'Wejdź do strefy ekstrakcji.';
    }
  }
  const urgent = !!mi && mi.tl >= 0 && mi.tl <= 30;
  const timer = mi && mi.tl >= 0 ? formatTime(mi.tl * 1000) : null;
  const left = s.snap.rf?.left ?? 0;
  const cd = s.snap.rf?.cd ?? 0;
  const reinf = cd > 0 ? `POSIŁKI ${left}  (${Math.ceil(cd)}s)` : `POSIŁKI ${left}`;
  return { name, objective, timer, reinf, urgent };
}

/** Screen-space HUD drawn on the game canvas. */
export class Hud {
  constructor(
    private readonly assets: Assets,
    private readonly content: ContentRegistry,
  ) {}

  /**
   * Weapon slot rects from the last frame, in CSS px (collected in HUD units while drawing,
   * converted at the end of draw()) - touch hit-testing compares clientX/Y against them.
   */
  private slotRects: SlotRect[] = [];
  private pad: TouchPadLayout | null = null;
  private padSlots: number[] = [];
  private padOwned = new Set<number>();
  /** Last frame's HUD scale + safe-area inset (HUD units -> CSS px; layout checks). */
  lastUi = 1;
  lastIns: Insets = NO_INSETS;
  /** Last drawn touch sticks (debug/test hook: the move stick's sprint feedback). */
  lastSticks: StickView[] | null = null;
  /** Compact: rects (HUD units) of the stacked top-centre messages drawn last frame (test hook). */
  topStack: Rect[] = [];
  private voiceBottomAt = -1e9;
  private voiceBottomCache = 0;
  /** Last frame's layout (debug / layout checks). */
  layout: HudLayout | null = null;
  private voiceKey = '';

  /**
   * Tell the DOM voice overlay (voice/VoiceOverlay.ts) where it may sit without covering the
   * HUD: CSS variables on <html>, written only when they change.
   */
  private publishVoiceSlot(v: VoiceSlot): void {
    const key = `${v.x.toFixed(1)}|${v.y.toFixed(1)}|${v.w.toFixed(1)}|${v.align}|${v.compact}`;
    if (key === this.voiceKey || typeof document === 'undefined') return;
    this.voiceKey = key;
    const st = document.documentElement.style;
    st.setProperty('--vx-x', `${v.x}px`);
    st.setProperty('--vx-y', `${v.y}px`);
    st.setProperty('--vx-w', `${v.w}px`);
    st.setProperty('--vx-tf', 'none');
    st.setProperty('--vx-jc', v.align === 'center' ? 'center' : 'flex-start');
    document.documentElement.toggleAttribute('data-vx-compact', v.compact);
  }

  /** Game over / left: the overlay goes back to its default spot (top centre). */
  dispose(): void {
    this.voiceKey = '';
    if (typeof document === 'undefined') return;
    const st = document.documentElement.style;
    for (const k of ['--vx-x', '--vx-y', '--vx-w', '--vx-tf', '--vx-jc']) st.removeProperty(k);
    document.documentElement.removeAttribute('data-vx-compact');
  }

  /**
   * Returns the owned weapon slot under a CSS-px point (touch clientX/Y), or 0.
   * `slotRects` are already converted to CSS px at the end of draw(), so compare directly
   * (v0.6.0 hotfix: converting the point to HUD units again made taps miss on phones).
   */
  slotAt(x: number, y: number): number {
    const pad = 6;
    const hit = this.slotRects.find(
      (r) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad,
    );
    return hit?.owned ? hit.slot : 0;
  }

  /**
   * SPRINT button, weapon-wheel handle, or a slice of the open wheel (CSS px).
   * Locked slices are ignored (finger can drag on).
   */
  hitControl(x: number, y: number, wheelOpen: boolean): TouchHit | null {
    if (!this.pad) return null;
    const hit = hitTouchPad(this.pad, x, y, { wheelOpen, slots: this.padSlots });
    if (hit?.kind === 'slot' && !this.padOwned.has(hit.slot)) return null;
    return hit;
  }

  draw(ctx: CanvasRenderingContext2D, dpr: number, cw: number, ch: number, s: HudState): void {
    const touch = !!s.touch;
    const ui = hudScale(cw, ch, touch);
    const ins = s.inset ?? NO_INSETS;
    this.lastUi = ui;
    this.lastIns = ins;
    this.lastSticks = s.touch ?? null;
    // Everything below works in "HUD units" = CSS px / ui, inside the safe area.
    const w = (cw - ins.left - ins.right) / ui;
    const h = (ch - ins.top - ins.bottom) / ui;
    ctx.save();
    ctx.setTransform(dpr * ui, 0, 0, dpr * ui, dpr * ins.left, dpr * ins.top);
    ctx.textBaseline = 'alphabetic';
    this.slotRects = [];
    this.pad = null;
    this.padSlots = [];
    this.padOwned.clear();
    const heat = !!s.me && s.me.st === 'alive' && !!this.content.weapons.get(s.me.w)?.heat;
    const L = hudLayout(cw, ch, touch, ins, {
      players: s.snap.players.length,
      me: !!s.me,
      heat,
    });
    this.layout = L;
    this.publishVoiceSlot(L.voice);
    if (L.block) this.compactBlock(ctx, L.block, s);
    else {
      this.timer(ctx, w, s);
      if (s.me) this.score(ctx, w, s.me);
    }
    this.minimap(ctx, w, s);
    if (L.block) {
      // armour bar lives inside the compact block
    } else if (touch) {
      if (s.me) this.health(ctx, 96, s.me);
    } else if (s.me) this.health(ctx, h, s.me);
    if (L.team) this.team(ctx, s, L.team.top, L.team.cols, L.team.rowH);
    if (s.me) {
      if (!touch) this.weapons(ctx, w, h, s.me);
      if (s.me.br && s.me.st === 'alive') this.braced(ctx, w, touch ? h - 24 : h - 122, s.now ?? 0);
    }
    if (L.topBand) {
      // compact phone: the clock left the top centre, so every centred message hugs the top of
      // the safe area (under the voice row when shown), stacking downward in the free band
      const band = L.topBand;
      const cx = (band.x0 + band.x1) / 2;
      const maxW = band.x1 - band.x0;
      let y = Math.max(6, (this.voiceBottom() - ins.top) / ui + 4);
      this.topStack = [];
      const push = (hgt: number) => {
        if (hgt > 0) {
          this.topStack.push({ x: band.x0, y, w: maxW, h: hgt });
          y += hgt + 4;
        }
      };
      push(this.missionPlate(ctx, cx, s, y, Math.min(420, maxW)));
      push(this.bossBar(ctx, cx, s, y + 4, Math.min(360, maxW - 16)));
      push(this.waveBanner(ctx, cx, h, s, y, maxW));
      if (s.me) push(this.stateBanner(ctx, cx, h, s.me, y, maxW));
      push(this.notices(ctx, cx, s.notices, y, maxW));
    } else {
      this.topStack = [];
      const boss = this.bossBar(ctx, w / 2, s, 104, 360) > 0;
      this.waveBanner(ctx, w / 2, h, s, null, 0);
      if (s.me) this.stateBanner(ctx, w / 2, h, s.me, null, 0);
      this.notices(ctx, w / 2, s.notices, boss ? 136 : 110, 0);
    }
    this.footer(ctx, w, h, s);
    // convert slot rects to CSS px
    for (const r of this.slotRects) {
      r.x = r.x * ui + ins.left;
      r.y = r.y * ui + ins.top;
      r.w *= ui;
      r.h *= ui;
    }
    // sticks + crosshair are positioned in raw CSS px
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (s.touch) {
      this.sticks(ctx, cw, ch, s.touch, s.me?.st === 'alive');
      if (s.me) this.touchPad(ctx, cw, ch, s.me, s.touchPad ?? null);
    }
    if (s.me?.st === 'alive' && s.crosshair) {
      if (s.crosshairRaw) this.crosshairDot(ctx, s.crosshairRaw);
      this.crosshair(ctx, s.crosshair);
    }
    ctx.restore();
  }

  /** Brass-framed smoked panel with rivets in the corners. */
  private panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = HUD.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = HUD.brassDark;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.strokeStyle = HUD.brass;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(176,138,62,0.35)';
    ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    ctx.fillStyle = HUD.brass;
    for (const [rx, ry] of [
      [x + 3, y + 3],
      [x + w - 3, y + 3],
      [x + 3, y + h - 3],
      [x + w - 3, y + h - 3],
    ])
      ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
  }

  /** Bar with a dark well and brass edge. */
  private bar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    frac: number,
    color: string,
  ): void {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), Math.max(1, h / 3));
    ctx.strokeStyle = HUD.brassDark;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  }

  private chapterColor(c: number): string {
    return chapterUiColor(this.content.chapter(c));
  }

  /** Full walls hide what is behind them from the local marine (minimap dots, boss HP). */
  private sees(s: HudState, x: number, y: number): boolean {
    const me = s.me && s.me.st === 'alive' ? s.me : null;
    return visibleTo(snapWalls(this.content.map.walls, s.snap.wk), me, x, y);
  }

  /** Boss health bar centred on `cx` (under the timer; compact: top of the band); returns its height (0 = none). */
  private bossBar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    s: HudState,
    y: number,
    bw: number,
  ): number {
    let def: EnemyDef | undefined;
    let hp = 0;
    let count = 0;
    for (const e of s.snap.enemies) {
      const d = this.content.enemies.get(this.content.enemyIds[e[1]] ?? '');
      if (!d?.boss || !this.sees(s, e[2], e[3])) continue;
      count++;
      if (!def || e[5] > hp) {
        def = d;
        hp = e[5];
      }
    }
    if (!def) return 0;
    const x = cx - bw / 2;
    this.panel(ctx, x - 8, y - 4, bw + 16, 34);
    ctx.textAlign = 'center';
    ctx.font = F(700, 12);
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(`☠ ${def.name.toUpperCase()}${count > 1 ? ` ×${count}` : ''} ☠`, cx, y + 10);
    this.bar(ctx, x + 4, y + 15, bw - 8, 8, hp / 100, '#a01818');
    return 34;
  }

  private timer(ctx: CanvasRenderingContext2D, w: number, s: HudState): void {
    const m = missionBrief(s);
    this.panel(ctx, w / 2 - 170, 8, 340, 86);
    ctx.globalAlpha = 0.28;
    this.assets.draw(ctx, 'ui_emblem', 0, w / 2, 36, 0, 1.05);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD.parchment;
    ctx.font = F(700, 24, true);
    const clock = m.timer ? m.timer : formatTime(s.snap.time * 1000);
    ctx.fillStyle = m.urgent ? '#ff8a60' : HUD.parchment;
    ctx.fillText(clock, w / 2, 36);
    ctx.font = F(700, 11);
    ctx.fillStyle = HUD.gold;
    ctx.fillText(m.name.toUpperCase(), w / 2, 52);
    ctx.font = F(600, 10);
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(m.objective, w / 2, 66);
    ctx.font = F(600, 10);
    const kills = s.snap.players.reduce((a, p) => a + p.k, 0);
    const wv = s.snap.wv;
    const status = !wv
      ? `${s.snap.enemies.length} XENOS`
      : wv.a
        ? `${wv.r} REMAINING`
        : `NEXT IN ${Math.ceil(wv.nx ?? 0)}s`;
    ctx.fillStyle = wv?.h ? '#ff8a60' : HUD.gold;
    ctx.fillText(`WAVE ${s.snap.wave}  ✠  ${status}  ✠  ${kills}  ✠  ${m.reinf}`, w / 2, 82);
  }

  /** Compact-phone mission / timer / reinforcement plate in the top band. */
  private missionPlate(
    ctx: CanvasRenderingContext2D,
    cx: number,
    s: HudState,
    y: number,
    maxW: number,
  ): number {
    const m = missionBrief(s);
    const bw = Math.min(400, maxW);
    const bh = 36;
    this.panel(ctx, cx - bw / 2, y, bw, bh);
    ctx.textAlign = 'center';
    ctx.font = F(700, 11);
    ctx.fillStyle = m.urgent ? '#ff8a60' : HUD.gold;
    const clock = m.timer ? `  ${m.timer}` : '';
    ctx.fillText(`${m.name.toUpperCase()}${clock}  ✠  ${m.reinf}`, cx, y + 14);
    ctx.font = F(600, 10);
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(m.objective, cx, y + 28);
    return bh;
  }

  /** Breather between waves: big "WAVE N CLEARED" plate with the countdown. */
  /**
   * Breather banner ("WAVE N CLEARED", countdown). Classic: at 30% height; compact (`top` set):
   * a shorter plate at `top` of the top band. Returns its height (0 = none).
   */
  private waveBanner(
    ctx: CanvasRenderingContext2D,
    cx: number,
    h: number,
    s: HudState,
    top: number | null,
    maxW: number,
  ): number {
    const wv = s.snap.wv;
    if (!wv || wv.a || s.snap.wave < 1) return 0;
    const compact = top !== null;
    const bw = compact ? Math.min(380, maxW) : 380;
    const bh = compact ? 46 : 64;
    const y = compact ? top + 30 : h * 0.3;
    this.panel(ctx, cx - bw / 2, y - (compact ? 30 : 34), bw, bh);
    ctx.textAlign = 'center';
    ctx.font = F(800, compact ? 18 : 24);
    ctx.fillStyle = HUD.gold;
    ctx.fillText(`✠ WAVE ${s.snap.wave} CLEARED ✠`, cx, y - (compact ? 8 : 2));
    ctx.font = F(600, compact ? 11 : 13);
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(
      `Wave ${s.snap.wave + 1} in ${Math.ceil(wv.nx ?? 0)}s — resupply, regroup`,
      cx,
      y + (compact ? 9 : 20),
    );
    return bh;
  }

  private team(
    ctx: CanvasRenderingContext2D,
    s: HudState,
    top: number,
    cols: 1 | 2,
    rowH: number,
  ): void {
    const players = s.snap.players;
    if (players.length < 2) return;
    // Up to 4 marines get roomy rows; a 5..8 squad packs into compact rows (or 2 columns).
    const tight = rowH < 22 || cols === 2;
    const colW = cols === 2 ? BLOCK_W / 2 : TEAM_W;
    const badge = tight ? 0.42 : 0.55;
    const rows = cols === 2 ? Math.ceil(players.length / 2) : players.length;
    this.panel(ctx, 10, top, cols === 2 ? BLOCK_W : TEAM_W, 14 + rows * rowH);
    ctx.textAlign = 'left';
    players.forEach((p, i) => {
      const col = cols === 2 ? i % 2 : 0;
      const row = cols === 2 ? Math.floor(i / 2) : i;
      const x = col * colW;
      const y = top + (rowH < 22 ? 9 : rowH < 26 ? 10 : 12) + row * rowH;
      const right = x + colW - (cols === 2 ? 6 : 0);
      const barW = right - 6 - (x + 34);
      const ch = this.content.chapter(p.c);
      if (!this.assets.draw(ctx, `badge_${ch.id}`, 0, x + 23, y + (tight ? 7 : 9), 0, badge)) {
        ctx.fillStyle = this.chapterColor(p.c);
        ctx.fillRect(x + 20, y, 6, tight ? 14 : 18);
      }
      ctx.font = F(600, tight ? 11 : 12);
      ctx.fillStyle = p.st === 'dead' ? '#6a6050' : HUD.parchment;
      const you = p.id === s.me?.id ? (cols === 2 ? '*' : ' (you)') : '';
      const label = p.st === 'alive' ? '' : p.st === 'downed' ? `DOWN ${Math.ceil(p.bo)}s` : 'KIA';
      const name = `${p.name}${you}`;
      if (cols === 2) {
        // two narrow columns: name clipped, then the score / state underneath the bar
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 30, y - 10, colW - 34, 14);
        ctx.clip();
        ctx.fillText(name, x + 34, y + 9);
        ctx.restore();
      } else ctx.fillText(name, x + 34, y + (tight ? 9 : 10));
      ctx.fillStyle = p.st === 'downed' ? '#ff6a50' : HUD.dim;
      ctx.textAlign = 'right';
      if (!label) ctx.font = F(600, 10, true);
      if (cols === 2) {
        ctx.font = F(600, 9, true);
        ctx.fillText(label || `${p.sc ?? 0}`, right, y + 9);
      } else ctx.fillText(label || `${p.sc ?? 0} pts`, right, y + (tight ? 9 : 10));
      ctx.textAlign = 'left';
      this.bar(
        ctx,
        x + 34,
        y + (tight ? 12 : 14),
        cols === 2 ? barW : 160,
        tight ? 2 : 3,
        p.st === 'alive' ? p.hp / p.mhp : p.bo / PLAYER.bleedOutTime,
        p.st === 'alive' ? HUD.gold : HUD.red,
      );
    });
  }

  /**
   * Compact phone layout: clock + wave status + own score + armour (+ plasma heat) stacked in
   * the top-left corner (the emblem watermark behind the clock), instead of the top-centre
   * plates and the separate armour panel.
   */
  private compactBlock(
    ctx: CanvasRenderingContext2D,
    b: NonNullable<HudLayout['block']>,
    s: HudState,
  ): void {
    const { x, y, w } = b;
    const me = s.me;
    this.panel(ctx, x, y, w, b.h);
    ctx.globalAlpha = 0.22;
    this.assets.draw(ctx, 'ui_emblem', 0, x + w / 2, y + 26, 0, 0.75);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.font = F(700, 24, true);
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(formatTime(s.snap.time * 1000), x + 10, y + 32);
    if (me) {
      ctx.textAlign = 'right';
      ctx.font = F(700, 8);
      ctx.fillStyle = HUD.gold;
      ctx.fillText('SCORE', x + w - 10, y + 16);
      ctx.font = F(800, 18, true);
      ctx.fillStyle = '#fff2c8';
      ctx.fillText(String(me.sc ?? 0), x + w - 10, y + 34);
    }
    ctx.textAlign = 'left';
    ctx.font = F(600, 10);
    const kills = s.snap.players.reduce((a, p) => a + p.k, 0);
    const wv = s.snap.wv;
    const status = !wv
      ? `${s.snap.enemies.length} XENOS`
      : wv.a
        ? `${wv.r} LEFT`
        : `NEXT IN ${Math.ceil(wv.nx ?? 0)}s`;
    ctx.fillStyle = wv?.h ? '#ff8a60' : HUD.gold;
    ctx.fillText(`WAVE ${s.snap.wave}  ✠  ${status}  ✠  ${kills} PURGED`, x + 10, y + 49);
    if (!me) return;
    const ay = b.armourY;
    const frac = me.st === 'alive' ? Math.max(0, me.hp / me.mhp) : 0;
    this.bar(
      ctx,
      x + 6,
      ay,
      w - 12,
      14,
      frac,
      frac > 0.5 ? '#c9a040' : frac > 0.25 ? '#d07a28' : HUD.red,
    );
    ctx.font = F(700, 11, true);
    ctx.fillStyle = '#fff6e0';
    ctx.fillText(`${Math.max(0, me.hp)} / ${me.mhp}`, x + 12, ay + 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(`☠ ${me.k}`, x + w - 12, ay + 11);
    const def = this.content.weapons.get(me.w);
    if (me.st === 'alive' && def?.heat) {
      const ht = me.ht ?? 0;
      const venting = !!me.vt;
      const hot = ht >= def.heat.superchargeAt;
      ctx.textAlign = 'left';
      ctx.font = F(700, 9);
      ctx.fillStyle = venting ? '#ff6a50' : hot ? '#bff0ff' : HUD.dim;
      ctx.fillText(venting ? 'VENTING' : hot ? 'SUPERCHARGED' : 'PLASMA HEAT', x + 8, b.heatY + 8);
      const bx = x + 110;
      const bw = w - 116;
      this.bar(ctx, bx, b.heatY + 1, bw, 8, ht, venting ? HUD.red : hot ? '#bff0ff' : HUD.heat);
      ctx.fillStyle = HUD.parchment;
      ctx.fillRect(bx + bw * def.heat.superchargeAt, b.heatY - 1, 1, 12);
    }
  }

  /** Own score: big, right of the clock (teammates' scores are small, in the team panel). */
  private score(ctx: CanvasRenderingContext2D, w: number, me: PlayerSnap): void {
    const x = w / 2 + 131;
    this.panel(ctx, x, 8, 110, 64);
    ctx.textAlign = 'center';
    ctx.font = F(700, 10);
    ctx.fillStyle = HUD.gold;
    ctx.fillText('YOUR SCORE', x + 55, 24);
    ctx.font = F(800, 26, true);
    ctx.fillStyle = '#fff2c8';
    ctx.fillText(String(me.sc ?? 0), x + 55, 54);
    ctx.font = F(600, 9);
    ctx.fillStyle = HUD.dim;
    ctx.fillText(`${me.k} KILLS`, x + 55, 66);
  }

  /** Heavy Bolter brace indicator. */
  private braced(ctx: CanvasRenderingContext2D, w: number, y: number, t: number): void {
    const text = '◆ BRACED · RATE OF FIRE UP ◆';
    ctx.textAlign = 'center';
    ctx.font = F(800, 14);
    const tw = ctx.measureText(text).width + 24;
    this.panel(ctx, w / 2 - tw / 2, y - 17, tw, 24);
    ctx.fillStyle = `rgba(255,${200 + Math.round(40 * Math.sin(t * 8))},110,1)`;
    ctx.fillText(text, w / 2, y);
  }

  private minimap(ctx: CanvasRenderingContext2D, w: number, s: HudState): void {
    const mw = 190;
    const mh = (mw * this.content.map.arena.height) / this.content.map.arena.width;
    const x0 = w - mw - 12;
    const y0 = 12;
    const k = mw / this.content.map.arena.width;
    this.panel(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8);
    ctx.fillStyle = 'rgba(40,30,20,0.6)';
    ctx.fillRect(x0, y0, mw, mh);
    // spawn points are plain map features: same dim dot whether idle, telegraphing or active
    ctx.fillStyle = 'rgba(120,70,120,0.55)';
    for (const p of this.content.director.spawnPoints) {
      ctx.beginPath();
      ctx.arc(x0 + p.x * k, y0 + p.y * k, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // every xeno looks the same (no straggler highlight)
    ctx.fillStyle = '#c05ad0';
    for (const e of s.snap.enemies)
      if (this.sees(s, e[2], e[3])) ctx.fillRect(x0 + e[2] * k - 1, y0 + e[3] * k - 1, 2, 2);
    ctx.fillStyle = '#e6c050'; // Guardsmen
    for (const a of s.snap.al ?? []) ctx.fillRect(x0 + a[1] * k - 1.5, y0 + a[2] * k - 1.5, 3, 3);
    for (const p of s.snap.pickups) {
      ctx.fillStyle = p.k === 'medkit' ? '#9be07a' : HUD.gold;
      ctx.fillRect(x0 + p.x * k - 2.5, y0 + p.y * k - 2.5, 5, 5);
    }
    for (const p of s.snap.players) {
      if (p.st === 'dead') continue;
      const pos = p.id === s.me?.id && s.myPos ? s.myPos : p;
      ctx.fillStyle = this.chapterColor(p.c);
      ctx.beginPath();
      ctx.arc(x0 + pos.x * k, y0 + pos.y * k, p.id === s.me?.id ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (p.id === s.me?.id) {
        ctx.strokeStyle = HUD.parchment;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  private health(ctx: CanvasRenderingContext2D, h: number, me: PlayerSnap): void {
    const def = this.content.weapons.get(me.w);
    const heat = !!def?.heat && me.st === 'alive';
    const x = 16;
    const y = h - 64 - (heat ? 22 : 0);
    this.panel(ctx, x - 6, y - 22, 252, 58 + (heat ? 22 : 0));
    ctx.textAlign = 'left';
    ctx.font = F(700, 11);
    ctx.fillStyle = HUD.gold;
    ctx.fillText('ARMOUR INTEGRITY', x + 2, y - 6);
    const frac = me.st === 'alive' ? Math.max(0, me.hp / me.mhp) : 0;
    this.bar(ctx, x, y, 240, 18, frac, frac > 0.5 ? '#c9a040' : frac > 0.25 ? '#d07a28' : HUD.red);
    ctx.font = F(700, 13, true);
    ctx.fillStyle = '#fff6e0';
    ctx.fillText(`${Math.max(0, me.hp)} / ${me.mhp}`, x + 6, y + 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(`☠ ${me.k}`, x + 236, y + 14);
    if (heat && def?.heat) {
      const ht = me.ht ?? 0;
      const venting = !!me.vt;
      const hot = ht >= def.heat.superchargeAt;
      ctx.textAlign = 'left';
      ctx.font = F(700, 10);
      ctx.fillStyle = venting ? '#ff6a50' : hot ? '#bff0ff' : HUD.dim;
      ctx.fillText(
        venting ? 'VENTING — COILS CRITICAL' : hot ? 'SUPERCHARGED' : 'PLASMA HEAT',
        x + 2,
        y + 32,
      );
      this.bar(ctx, x + 120, y + 25, 120, 8, ht, venting ? HUD.red : hot ? '#bff0ff' : HUD.heat);
      // supercharge threshold tick
      ctx.fillStyle = HUD.parchment;
      ctx.fillRect(x + 120 + 120 * def.heat.superchargeAt, y + 23, 1, 12);
    }
  }

  /** Defining role of a weapon as a small coloured tag, right-aligned at (x, y). */
  private roleTag(
    ctx: CanvasRenderingContext2D,
    def: WeaponDef,
    x: number,
    y: number,
    size: number,
  ): void {
    const role = def.roles[0];
    if (!role) return;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = F(800, size);
    ctx.fillStyle = ROLE_COLOR[role];
    ctx.fillText(ROLE_SHORT[role], x, y);
    ctx.restore();
  }

  private weapons(ctx: CanvasRenderingContext2D, w: number, h: number, me: PlayerSnap): void {
    const order = this.content.weaponsForChapter(this.content.chapter(me.c).id);
    const cell = order.length > 6 ? 80 : 86;
    const total = order.length * (cell + 6) - 6;
    let x = w / 2 - total / 2;
    const y = h - 78;
    const cur = this.content.weapons.get(me.w);
    if (cur && me.st === 'alive') {
      // Active weapon "tooltip": its 40k profile and every role tag.
      const label = `${cur.name.toUpperCase()}  ${weaponProfileLabel(cur)}  ·  ${weaponRolesLabel(cur)}`;
      ctx.font = F(700, 10);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(8,6,4,0.62)';
      ctx.fillRect(w / 2 - tw / 2 - 8, y - 46, tw + 16, 16);
      ctx.textAlign = 'center';
      ctx.fillStyle = ROLE_COLOR[cur.roles[0] ?? 'GENERALIST'];
      ctx.fillText(label, w / 2, y - 34);
    }
    for (const def of order) {
      const owned = me.ws.includes(def.id);
      const active = me.w === def.id;
      ctx.globalAlpha = owned ? 1 : 0.35;
      this.panel(ctx, x, y, cell, 64);
      if (active) {
        ctx.strokeStyle = HUD.gold;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cell - 2, 62);
      }
      ctx.textAlign = 'left';
      ctx.font = F(700, 11);
      ctx.fillStyle = active ? HUD.gold : HUD.dim;
      ctx.fillText(String(def.slot), x + 5, y + 13);
      this.roleTag(ctx, def, x + cell - 4, y + 12, 7.5);
      if (!this.assets.draw(ctx, def.sprites.icon, 0, x + cell / 2, y + 30)) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(x + cell / 2 - 24, y + 26, 48, 8);
      }
      ctx.textAlign = 'center';
      ctx.font = F(600, 9);
      ctx.fillStyle = HUD.parchment;
      ctx.fillText(
        owned
          ? def.name.toUpperCase()
          : def.unlockAtWave
            ? `UNLOCK WAVE ${def.unlockAtWave}`
            : 'CRATE ONLY',
        x + cell / 2,
        y + 56,
      );
      if (active) {
        // ammo / reload
        const by = y - 14;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, by, cell, 8);
        if (me.vt) {
          ctx.fillStyle = HUD.red;
          ctx.fillRect(x, by, cell * (me.ht ?? 1), 8);
          ctx.font = F(700, 11);
          ctx.fillText('VENTING', x + cell / 2, by - 4);
        } else if (me.rl > 0) {
          ctx.fillStyle = HUD.gold;
          ctx.fillRect(x, by, cell * (1 - me.rl / def.reloadTime), 8);
          ctx.font = F(700, 11);
          ctx.fillText('RELOADING', x + cell / 2, by - 4);
        } else {
          ctx.fillStyle = me.ammo / def.magazine < 0.25 ? '#ff6a50' : HUD.parchment;
          ctx.fillRect(x, by, (cell * me.ammo) / def.magazine, 8);
          ctx.font = F(700, 12, true);
          ctx.fillText(def.melee ? '∞' : `${me.ammo}/${def.magazine}`, x + cell / 2, by - 4);
        }
      }
      if (active) this.weaponLock(ctx, me, x, y, cell, 64);
      ctx.globalAlpha = 1;
      this.slotRects.push({ slot: def.slot, owned, x, y, w: cell, h: 64 });
      x += cell + 6;
    }
  }

  /**
   * Sprint weapon lock on the active slot: greyed out while sprinting ("SPRINT"), then a gold
   * fill rises over the MARINE_SPRINT.weaponReadyDelayS until the weapon is ready again.
   */
  private weaponLock(
    ctx: CanvasRenderingContext2D,
    me: PlayerSnap,
    x: number,
    y: number,
    cw: number,
    ch: number,
  ): void {
    const wd = me.wd ?? 0;
    if (!me.sp && wd <= 0) return;
    const ready = me.sp ? 0 : 1 - Math.min(1, wd / MARINE_SPRINT.weaponReadyDelayS);
    ctx.fillStyle = 'rgba(12,12,14,0.68)';
    ctx.fillRect(x + 2, y + 2, cw - 4, (ch - 4) * (1 - ready));
    ctx.fillStyle = 'rgba(232,196,106,0.85)';
    ctx.fillRect(x + 2, y + ch - 5, (cw - 4) * ready, 3);
    ctx.textAlign = 'center';
    ctx.font = F(700, 10);
    ctx.fillStyle = me.sp ? '#f2e3b0' : HUD.gold;
    ctx.fillText(me.sp ? 'SPRINT' : 'READY…', x + cw / 2, y + ch / 2 + 4);
  }

  /**
   * SPRINT button above AIM·FIRE, and the weapon-wheel handle above that (CSS px, same space as the sticks).
   */
  private touchPad(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    me: PlayerSnap,
    pad: { sprintHeld: boolean; wheelOpen: boolean; hoverSlot: number } | null,
  ): void {
    const L = touchPadLayout(w, h);
    this.pad = L;
    const chapterId = this.content.chapter(me.c).id;
    const order = this.content.weaponsForChapter(chapterId);
    this.padSlots = order.map((d) => d.slot);
    this.padOwned = new Set(order.filter((d) => me.ws.includes(d.id)).map((d) => d.slot));
    const held = !!pad?.sprintHeld || !!me.sp;
    const open = !!pad?.wheelOpen;
    const hover = pad?.hoverSlot ?? 0;

    const btn = (
      r: { x: number; y: number; w: number; h: number },
      label: string,
      lit: boolean,
      sub?: string,
    ) => {
      this.panel(ctx, r.x, r.y, r.w, r.h);
      if (lit) {
        ctx.strokeStyle = HUD.gold;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
      ctx.textAlign = 'center';
      ctx.font = F(800, 10);
      ctx.fillStyle = lit ? HUD.gold : HUD.parchment;
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + (sub ? -4 : 3));
      if (sub) {
        ctx.font = F(600, 8);
        ctx.fillStyle = HUD.dim;
        ctx.fillText(sub, r.x + r.w / 2, r.y + r.h / 2 + 10);
      }
    };

    btn(L.sprint, 'SPRINT', held, me.sp ? 'ON' : undefined);
    // stamina pip under the button
    const stm = me.stm ?? 0;
    const max = MARINE_SPRINT.staminaMaxS;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(L.sprint.x, L.sprint.y + L.sprint.h + 3, L.sprint.w, 4);
    ctx.fillStyle = held ? 'rgba(255,140,50,0.95)' : HUD.gold;
    ctx.fillRect(L.sprint.x, L.sprint.y + L.sprint.h + 3, L.sprint.w * Math.min(1, stm / max), 4);

    const cur = this.content.weapons.get(me.w);
    btn(L.wheel, 'ARMS', open, cur ? String(cur.slot) : undefined);

    if (open) {
      const n = order.length;
      const cx = L.wheelCenter.x;
      const cy = L.wheelCenter.y;
      const R = L.wheelRadius;
      for (let i = 0; i < n; i++) {
        const def = order[i]!;
        const a0 = -Math.PI / 2 + (i * Math.PI * 2) / n;
        const a1 = -Math.PI / 2 + ((i + 1) * Math.PI * 2) / n;
        const mid = (a0 + a1) / 2;
        const owned = me.ws.includes(def.id);
        const active = me.w === def.id;
        const hot = hover === def.slot;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a1);
        ctx.closePath();
        ctx.fillStyle = active
          ? 'rgba(40,28,10,0.88)'
          : owned
            ? 'rgba(18,12,7,0.82)'
            : 'rgba(10,8,6,0.55)';
        ctx.fill();
        ctx.strokeStyle = hot || active ? HUD.gold : 'rgba(176,138,62,0.55)';
        ctx.lineWidth = hot || active ? 2 : 1;
        ctx.stroke();
        const ix = cx + Math.cos(mid) * (R * 0.62);
        const iy = cy + Math.sin(mid) * (R * 0.62);
        ctx.globalAlpha = owned ? 1 : 0.4;
        if (!this.assets.draw(ctx, def.sprites.icon, 0, ix, iy - 4)) {
          ctx.fillStyle = '#ccc';
          ctx.fillRect(ix - 16, iy - 8, 32, 6);
        }
        ctx.textAlign = 'center';
        ctx.font = F(700, 8);
        ctx.fillStyle = active ? HUD.gold : HUD.parchment;
        const tag = owned
          ? def.name.toUpperCase()
          : def.unlockAtWave
            ? `W${def.unlockAtWave}`
            : 'CRATE';
        ctx.fillText(tag, ix, iy + 16);
        ctx.globalAlpha = 1;
      }
      // hole over the handle
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(18,12,7,0.92)';
      ctx.fill();
      ctx.strokeStyle = HUD.gold;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = F(800, 9);
      ctx.fillStyle = HUD.gold;
      ctx.fillText('ARMS', cx, cy + 3);
    } else if (cur && me.st === 'alive') {
      // compact ammo over the handle
      ctx.textAlign = 'center';
      ctx.font = F(700, 9);
      ctx.fillStyle = HUD.parchment;
      const ammo = cur.melee ? '∞' : `${me.ammo}/${cur.magazine}`;
      ctx.fillText(ammo, L.wheel.x + L.wheel.w / 2, L.wheel.y - 6);
    }
  }

  /** Floating stick bases/knobs (engaged) or faint hints where to put thumbs (idle). */
  private sticks(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sticks: StickView[],
    alive: boolean,
  ): void {
    if (!alive) return;
    for (const st of sticks) {
      if (st.kind === 'move' && st.sprintRing) {
        this.moveStick(ctx, st, h);
        continue;
      }
      const color = '224,184,80';
      if (!st.engaged) {
        const hx = w - 230;
        const hy = h - 100;
        ctx.strokeStyle = `rgba(${color},0.22)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, st.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = F(600, 11);
        ctx.fillStyle = `rgba(${color},0.5)`;
        ctx.fillText('AIM · FIRE', hx, hy + 4);
        continue;
      }
      ctx.fillStyle = `rgba(${color},0.12)`;
      ctx.strokeStyle = `rgba(${color},0.5)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(st.origin.x, st.origin.y, st.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(${color},${st.active ? 0.75 : 0.4})`;
      ctx.beginPath();
      ctx.arc(st.knob.x, st.knob.y, st.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Move stick (v0.6.0 hotfix feedback), from the centre out:
   *  - base disc with a solid "max walk" ring at the radius: ring + knob turn gold once the thumb
   *    reaches it (full walking speed);
   *  - an empty dead gap (radius .. sprintZone.enter × radius) so full speed never sprints by
   *    accident;
   *  - a dashed red-orange sprint band (enter .. outer, label »), lit solid only while the marine
   *    really sprints, greyed with "NO STAMINA" / "FIRING" when a sprint can't start.
   * The knob is clamped to the band's outer edge (the stick origin follows beyond it).
   */
  private moveStick(ctx: CanvasRenderingContext2D, st: StickView, h: number): void {
    const R = st.radius;
    const engaged = st.engaged;
    const ox = engaged ? st.origin.x : 110;
    const oy = engaged ? st.origin.y : h - 100;
    const inner = st.sprintRing ?? R * 1.2;
    const outer = st.sprintOuter ?? R * 1.5;
    const mode = engaged ? (st.sprintMode ?? 'off') : 'off';
    const maxWalk = engaged && !!st.maxWalk && mode !== 'on';
    const sprinting = mode === 'on';
    const blocked = mode === 'noStamina' || mode === 'fire';
    const a0 = engaged ? 1 : 0.45;
    ctx.save();
    // sprint band
    const mid = (inner + outer) / 2;
    ctx.lineWidth = outer - inner;
    ctx.setLineDash(sprinting ? [] : [7, 7]);
    ctx.strokeStyle = sprinting
      ? 'rgba(255,110,40,0.55)'
      : blocked
        ? 'rgba(140,140,140,0.22)'
        : `rgba(255,110,40,${0.16 * a0})`;
    if (sprinting) {
      ctx.shadowColor = 'rgba(255,120,40,0.9)';
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.arc(ox, oy, mid, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    // band edges: thin lines so the dead gap reads as a gap
    ctx.lineWidth = sprinting ? 2.5 : 1;
    ctx.strokeStyle = sprinting
      ? 'rgba(255,150,70,0.95)'
      : blocked
        ? 'rgba(160,160,160,0.4)'
        : `rgba(255,130,60,${0.45 * a0})`;
    for (const r of [inner, outer]) {
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.font = F(800, sprinting ? 14 : 12);
    ctx.fillStyle = sprinting
      ? 'rgba(255,214,150,1)'
      : blocked
        ? 'rgba(180,180,180,0.7)'
        : `rgba(255,150,80,${0.75 * a0})`;
    ctx.fillText('»', ox, oy - mid + 4);
    if (blocked) {
      ctx.font = F(700, 9);
      ctx.fillText(mode === 'fire' ? 'FIRING' : 'NO STAMINA', ox, oy - outer - 5);
    } else if (sprinting) {
      ctx.font = F(700, 9);
      ctx.fillText('SPRINT', ox, oy - outer - 5);
    }
    // base disc + max-walk ring
    ctx.fillStyle = `rgba(232,217,176,${engaged ? 0.12 : 0.04})`;
    ctx.strokeStyle = maxWalk ? HUD.gold : `rgba(232,217,176,${engaged ? 0.6 : 0.3})`;
    ctx.lineWidth = maxWalk ? 4 : 2;
    ctx.beginPath();
    ctx.arc(ox, oy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (!engaged) {
      ctx.font = F(600, 11);
      ctx.fillStyle = 'rgba(232,217,176,0.5)';
      ctx.fillText('MOVE', ox, oy + 4);
      ctx.restore();
      return;
    }
    // knob (clamped to the band's outer edge by VirtualStick.knob)
    ctx.fillStyle = sprinting
      ? 'rgba(255,130,50,0.9)'
      : maxWalk
        ? 'rgba(242,196,80,0.9)'
        : `rgba(232,217,176,${st.active ? 0.75 : 0.4})`;
    ctx.beginPath();
    ctx.arc(st.knob.x, st.knob.y, R * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Downed / fallen alert. Classic: above the centre; compact (`top` set): in the top band. Returns its height. */
  private stateBanner(
    ctx: CanvasRenderingContext2D,
    cx: number,
    h: number,
    me: PlayerSnap,
    top: number | null,
    maxW: number,
  ): number {
    if (me.st === 'alive') return 0;
    const compact = top !== null;
    const title = me.st === 'downed' ? 'BATTLE-BROTHER DOWN' : 'FALLEN IN SERVICE';
    const sub =
      me.st === 'downed'
        ? me.rv > 0
          ? `Being revived… ${Math.round(me.rv * 100)}%`
          : `Bleeding out in ${Math.ceil(me.bo)}s — a battle-brother must stand next to you`
        : 'Your squad fights on. Spectating…';
    ctx.textAlign = 'center';
    if (compact) {
      ctx.font = F(600, this.fitSize(ctx, sub, 600, 12, maxW - 16));
      const subFont = ctx.font;
      this.panel(ctx, cx - maxW / 2, top, maxW, 44);
      ctx.font = F(800, this.fitSize(ctx, title, 800, 20, maxW - 16));
      ctx.fillStyle = me.st === 'downed' ? '#e04a30' : HUD.dim;
      ctx.fillText(title, cx, top + 21);
      ctx.font = subFont;
      ctx.fillStyle = HUD.parchment;
      ctx.fillText(sub, cx, top + 37);
      return 44;
    }
    ctx.font = F(800, 34);
    ctx.fillStyle = me.st === 'downed' ? '#e04a30' : HUD.dim;
    ctx.fillText(title, cx, h / 2 - 90);
    ctx.font = F(600, 16);
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(sub, cx, h / 2 - 62);
    return 0;
  }

  /** Largest font size ≤ `size` (min 8) at which `text` fits `maxW`. */
  private fitSize(
    ctx: CanvasRenderingContext2D,
    text: string,
    weight: number,
    size: number,
    maxW: number,
  ): number {
    ctx.font = F(weight, size);
    const tw = ctx.measureText(text).width;
    return tw <= maxW ? size : Math.max(8, Math.floor((size * maxW) / tw));
  }

  /** Bottom (CSS px) of the voice overlay when it sits in the compact top band; 0 when absent. */
  private voiceBottom(): number {
    if (typeof document === 'undefined') return 0;
    const now = performance.now();
    if (now - this.voiceBottomAt < 250) return this.voiceBottomCache;
    this.voiceBottomAt = now;
    let b = 0;
    for (const el of Array.from(document.querySelectorAll('.vx > *'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) b = Math.max(b, r.bottom);
    }
    this.voiceBottomCache = b;
    return b;
  }

  /**
   * Notices (pickups, unlocks, host/connection messages…). Classic: `top` is the 1st baseline;
   * compact (`maxW` > 0): `top` is the top edge, smaller rows fitted to the band. Returns the
   * height used.
   */
  private notices(
    ctx: CanvasRenderingContext2D,
    cx: number,
    notices: Notice[],
    top: number,
    maxW: number,
  ): number {
    const compact = maxW > 0;
    const rowH = compact ? 21 : 26;
    const list = notices.slice(compact ? -4 : -5);
    ctx.textAlign = 'center';
    list.forEach((n, i) => {
      ctx.globalAlpha = Math.min(1, n.ttl);
      const weight = n.kind === 'warn' ? 800 : 700;
      const size = compact ? (n.kind === 'warn' ? 18 : 14) : n.kind === 'warn' ? 22 : 16;
      ctx.font = F(weight, compact ? this.fitSize(ctx, n.text, weight, size, maxW - 8) : size);
      const y = compact ? top + 16 + i * rowH : top + i * 26;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillText(n.text, cx + 1, y + 1);
      ctx.fillStyle = NOTICE_COLORS[n.kind];
      ctx.fillText(n.text, cx, y);
    });
    ctx.globalAlpha = 1;
    return compact && list.length ? 4 + list.length * rowH : 0;
  }

  private footer(ctx: CanvasRenderingContext2D, w: number, h: number, s: HudState): void {
    ctx.textAlign = 'right';
    ctx.font = F(500, 11, true);
    ctx.fillStyle = 'rgba(232,217,176,0.55)';
    const room = s.mode === 'local' ? 'SOLO' : `ROOM ${s.roomCode}`;
    ctx.fillText(
      `${room} · ${s.mode.toUpperCase()} · ping ${Math.round(s.ping)}ms · ${Math.round(s.fps)} fps${s.muted ? (s.touch ? ' · MUTED' : ' · MUTED (M)') : ''}`,
      w - 12,
      h - 10,
    );
    if (s.debug) {
      ctx.textAlign = 'left';
      ctx.fillText(s.debug, 12, h - 96);
    }
  }

  /** Where the mouse / stick really points while recoil has kicked the reticle off it. */
  private crosshairDot(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
    ctx.fillStyle = 'rgba(240,216,144,0.45)';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  private crosshair(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
    const { x, y } = pos;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#f0d890';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(x + dx * 5, y + dy * 5);
      ctx.lineTo(x + dx * 14, y + dy * 14);
    }
    ctx.stroke();
  }
}
