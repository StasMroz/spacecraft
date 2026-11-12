import {
  BREACH_STATE,
  defaultContent,
  MARINE_SPRINT,
  MUZZLE_CONVERGE_PX,
  muzzleBlend,
  muzzleDef,
  muzzlePoint,
  PLAYER,
  ENEMY_FLAG,
  type WallDef,
  type ChapterDef,
  type ContentRegistry,
  type EnemyDef,
  type PlayerSnap,
  type Snapshot,
  type SprintState,
  CRASH,
  GUARDSMAN,
  snapWalls,
  findMission,
} from '@sms/shared';
import { lerp, lerpAngle } from '../game/interpolation.js';
import { drawBreach } from './breaches.js';
import { chapterUiColor } from './colors.js';
import { drawMeleeTrail, meleeImpactBurst, meleeTrailMotes, swingPose } from './melee.js';
import type { Assets } from './assets.js';
import { Camera } from './camera.js';
import { Particles } from './particles.js';
import { visibleTo } from './visibility.js';
import {
  DEFAULT_ENEMY_VISUAL,
  DEFAULT_PROJECTILE_VISUAL,
  ENEMY_VISUALS,
  PROJECTILE_TRACERS,
  PROJECTILE_VISUALS,
  type EnemyVisual,
} from './visuals.js';

/** Everything the renderer needs for one frame. */
export interface RenderFrame {
  a: Snapshot;
  b: Snapshot;
  t: number;
  myId: number;
  /** Predicted local position + aim (overrides interpolated state for our marine). */
  me: { x: number; y: number; aim: number; sprint?: SprintState | null; guarding?: boolean } | null;
  nowMs: number;
  dt: number;
}

const DECAL_SCALE = 0.5;
const TILE = 64;

/** Per-enemy client-side animation state. */
interface EnemyTrack {
  x: number;
  y: number;
  ang: number;
  dist: number;
  key: string;
  vis: EnemyVisual;
  r: number;
  /** Time the current attack animation started, or -1. */
  atk0: number;
  burrowed: boolean;
  /** Time the current charge wind-up started, or -1. */
  wind0: number;
  /** Time the current dash started, or -1. */
  dash0: number;
  /** Next paw-the-ground dust puff (Carnifex wind-up). */
  nextPaw: number;
}

/** Leap / charge landing (dash ended), drained by the client for the thud + dust sound. */
export interface Landing {
  x: number;
  y: number;
  r: number;
  t: string;
}

const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

interface Corpse {
  key: string;
  x: number;
  y: number;
  ang: number;
  t0: number;
  vis: EnemyVisual;
  r: number;
}

interface Prop {
  key: string;
  x: number;
  y: number;
  ang: number;
  scale: number;
}

const hash2 = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/** Canvas2D world renderer (floor, decals, entities, particles). HUD is in hud.ts. */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  readonly particles = new Particles();
  private dpr = 1;
  private decals: HTMLCanvasElement;
  private decalCtx: CanvasRenderingContext2D;
  private hitFlash = new Map<number, number>();
  private lastHp = new Map<number, number>();
  private walk = new Map<number, { x: number; y: number; dist: number }>();
  private allyWalk = new Map<number, { x: number; y: number; dist: number }>();
  private trailAcc = new Map<number, number>();
  private vignette: CanvasGradient | null = null;
  private tracks = new Map<number, EnemyTrack>();
  /** Dash landings since the last drain (see GameClient enemy audio). */
  readonly landings: Landing[] = [];
  private corpses: Corpse[] = [];
  private recoil = new Map<number, number>();
  /** Last swing progress per marine, to fire impact FX once when the blade crosses the arc. */
  private swingProg = new Map<number, number>();
  /** Held-weapon transform as last drawn, per player (muzzle FX + shot origins use it). */
  private heldPose = new Map<
    number,
    { x: number; y: number; a: number; back: number; rot: number; scale: number; w: string }
  >();
  /** Recent shots: sim muzzle + visual muzzle, to anchor the first frames of new projectiles. */
  private pendingShots: {
    sx: number;
    sy: number;
    a: number;
    mx: number;
    my: number;
    t: number;
  }[] = [];
  /** Per projectile: offset from its sim path to the visual muzzle (null = enemy / unmatched). */
  private projMuzzle = new Map<
    number,
    { sx: number; sy: number; ox: number; oy: number; mx: number; my: number } | null
  >();
  private playerProjKinds: Set<string> | null = null;
  private props: Prop[] = [];
  private creep: { x: number; y: number; v: number; ang: number; s: number }[] = [];
  private time = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly assets: Assets,
    readonly content: ContentRegistry = defaultContent,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.decals = document.createElement('canvas');
    this.decals.width = this.content.map.arena.width * DECAL_SCALE;
    this.decals.height = this.content.map.arena.height * DECAL_SCALE;
    this.decalCtx = this.decals.getContext('2d')!;
    this.buildScenery();
    this.resize();
  }

  /** Ruined hive-city dressing around the arena + creep patches (deterministic). */
  /** Local marine's eye, for full-wall line of sight (null = spectating: see everything). */
  private viewer: { x: number; y: number } | null = null;

  /** Map walls + wreck walls of the frame being drawn. */
  private walls: readonly WallDef[] = [];

  private hiddenFromViewer(x: number, y: number): boolean {
    return !visibleTo(this.walls, this.viewer, x, y);
  }

  /** Darkness cast away from the local marine by every full wall. */
  private drawSightShadows(): void {
    const v = this.viewer;
    if (!v) return;
    const { ctx } = this;
    const far = 6000;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 3, 2, 0.88)';
    ctx.beginPath();
    for (const w of this.walls) {
      if (w.kind !== 'full') continue;
      const corners: [number, number][] = [
        [w.x, w.y],
        [w.x + w.w, w.y],
        [w.x + w.w, w.y + w.h],
        [w.x, w.y + w.h],
      ];
      // Silhouette corners: extreme angles around the direction to the wall's centre.
      const mid = Math.atan2(w.y + w.h / 2 - v.y, w.x + w.w / 2 - v.x);
      const rel = (p: [number, number]) => {
        let d = Math.atan2(p[1] - v.y, p[0] - v.x) - mid;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return d;
      };
      const sorted = [...corners].sort((p, q) => rel(p) - rel(q));
      const a = sorted[0]!;
      const b = sorted[3]!;
      const out = (p: [number, number]): [number, number] => {
        const l = Math.hypot(p[0] - v.x, p[1] - v.y) || 1;
        return [p[0] + ((p[0] - v.x) / l) * far, p[1] + ((p[1] - v.y) / l) * far];
      };
      // Same winding for every wall so overlapping shadows union under 'nonzero'.
      const fa = out(a);
      const fb = out(b);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(fa[0], fa[1]);
      ctx.lineTo(fb[0], fb[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.closePath();
    }
    ctx.fill('nonzero');
    ctx.restore();
  }

  private drawWalls(): void {
    const { ctx } = this;
    for (const w of this.walls) this.drawWall(ctx, w);
  }

  private drawWall(ctx: CanvasRenderingContext2D, w: WallDef): void {
    ctx.save();
    if (w.kind === 'full') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(w.x + 6, w.y + 8, w.w, w.h);
      ctx.fillStyle = '#3b3a3f';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = '#5c5b63';
      ctx.fillRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6);
      ctx.strokeStyle = '#18171b';
      ctx.lineWidth = 3;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = '#2a292e';
      const horiz = w.w >= w.h;
      for (let t = 24; t < (horiz ? w.w : w.h) - 8; t += 48)
        if (horiz) ctx.fillRect(w.x + t, w.y + 3, 4, w.h - 6);
        else ctx.fillRect(w.x + 3, w.y + t, w.w - 6, 4);
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(w.x + 3, w.y + 4, w.w, w.h);
      ctx.fillStyle = '#6e5a3a';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.beginPath();
      ctx.rect(w.x, w.y, w.w, w.h);
      ctx.clip();
      ctx.strokeStyle = '#d8a530';
      ctx.lineWidth = 6;
      for (let t = -w.h; t < w.w + w.h; t += 22) {
        ctx.beginPath();
        ctx.moveTo(w.x + t, w.y + w.h);
        ctx.lineTo(w.x + t + w.h, w.y);
        ctx.stroke();
      }
      ctx.strokeStyle = '#2b2116';
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    }
    ctx.restore();
  }

  private buildScenery(): void {
    const W = this.content.map.arena.width;
    const H = this.content.map.arena.height;
    const props: Prop[] = [];
    // gothic pillars along the arena wall
    for (let x = 0; x <= W; x += 200) {
      props.push({ key: 'prop_pillar', x, y: -40, ang: 0, scale: 1 });
      props.push({ key: 'prop_pillar', x, y: H + 40, ang: Math.PI, scale: 1 });
    }
    for (let y = 200; y < H; y += 200) {
      props.push({ key: 'prop_pillar', x: -40, y, ang: -Math.PI / 2, scale: 1 });
      props.push({ key: 'prop_pillar', x: W + 40, y, ang: Math.PI / 2, scale: 1 });
    }
    // rubble, skull piles and barricades in the ruined band outside + hugging the edge
    const kinds = ['prop_rubble_0', 'prop_rubble_1', 'prop_skull_pile', 'prop_barricade'];
    for (let i = 0; i < 150; i++) {
      const h = hash2(i, 991);
      const side = h % 4;
      const along = (hash2(i, 17) % 10000) / 10000;
      const depth = -150 + (hash2(i, 31) % 190); // -150..+40 (slightly inside)
      const x = side < 2 ? along * W : side === 2 ? -depth : W + depth;
      const y = side >= 2 ? along * H : side === 0 ? -depth : H + depth;
      const key = kinds[hash2(i, 5) % (depth > 0 ? 3 : 4)]!;
      props.push({ key, x, y, ang: (hash2(i, 7) % 628) / 100, scale: 0.8 + (h % 40) / 100 });
    }
    this.props = props;
    for (let gy = 0; gy < H; gy += 256) {
      for (let gx = 0; gx < W; gx += 256) {
        const h = hash2(gx + 7, gy + 13);
        if (h % 100 > 30) continue;
        this.creep.push({
          x: gx + (h % 256),
          y: gy + ((h >>> 8) % 256),
          v: h % 3,
          ang: ((h >>> 4) % 628) / 100,
          s: 0.9 + ((h >>> 12) % 60) / 100,
        });
      }
    }
  }

  /** Kick the held weapon back (recoil) — called by the FX layer on shots. */
  kick(playerId: number, px: number): void {
    this.recoil.set(playerId, px);
  }

  /**
   * World barrel tip of a marine's weapon as currently drawn (local: predicted pose; remote:
   * interpolated), incl. recoil slide and the post-sprint raise. Null if not drawn yet.
   */
  muzzleWorld(playerId: number, weaponId?: string): { x: number; y: number; a: number } | null {
    const h = this.heldPose.get(playerId);
    if (!h) return null;
    return muzzlePoint(h.x, h.y, h.a, weaponId ?? h.w, h);
  }

  /**
   * A shot left the sim muzzle (sx, sy) along `a`; it is drawn leaving the visual muzzle (mx, my).
   * New projectiles on that ray blend from the visual muzzle into their sim path.
   */
  registerShot(sx: number, sy: number, a: number, mx: number, my: number): void {
    this.pendingShots.push({ sx, sy, a, mx, my, t: this.time });
    if (this.pendingShots.length > 64) this.pendingShots.splice(0, this.pendingShots.length - 64);
  }

  /** Match a newly seen player projectile at (x, y) to the shot it came from. */
  private matchShot(x: number, y: number): (typeof this.pendingShots)[number] | null {
    let best: (typeof this.pendingShots)[number] | null = null;
    let bestPerp = Infinity;
    for (const s of this.pendingShots) {
      if (this.time - s.t > 0.4) continue;
      const dx = x - s.sx;
      const dy = y - s.sy;
      const c = Math.cos(s.a);
      const n = Math.sin(s.a);
      const along = dx * c + dy * n;
      const perp = Math.abs(-dx * n + dy * c);
      if (along < -3 || along > MUZZLE_CONVERGE_PX * 1.5) continue;
      if (perp > 6 + along * 0.6) continue; // within any weapon's spread cone
      if (perp < bestPerp) {
        bestPerp = perp;
        best = s;
      }
    }
    return best;
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.resize(w, h);
    this.vignette = null;
  }

  clearWorld(): void {
    this.decalCtx.clearRect(0, 0, this.decals.width, this.decals.height);
    this.particles.clear();
    this.hitFlash.clear();
    this.lastHp.clear();
    this.walk.clear();
    this.tracks.clear();
    this.corpses = [];
    this.recoil.clear();
    this.heldPose.clear();
    this.pendingShots = [];
    this.projMuzzle.clear();
  }

  /** Sprite world width (atlas px / scale). */
  private spriteWorldW(key: string): number {
    const m = this.assets.manifest?.sprites[key];
    return m ? m.w / (m.scale ?? 1) : 0;
  }

  /** Paints a persistent decal (blood, acid, scorch) onto the floor layer. */
  addDecal(key: string, x: number, y: number, scale = 1, alpha = 0.85): void {
    const c = this.decalCtx;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x * DECAL_SCALE, y * DECAL_SCALE);
    c.rotate(Math.random() * Math.PI * 2);
    c.scale(scale * DECAL_SCALE, scale * DECAL_SCALE);
    if (!this.assets.draw(c, key, 0, 0, 0)) {
      c.fillStyle = key.includes('acid') ? '#6a8a20' : key.includes('scorch') ? '#111' : '#4a1030';
      c.beginPath();
      c.arc(0, 0, 18, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  render(f: RenderFrame): void {
    const { ctx, camera } = this;
    const mine = f.b.players.find((p) => p.id === f.myId);
    this.viewer = f.me ?? (mine && mine.st === 'alive' ? { x: mine.x, y: mine.y } : null);
    this.particles.update(f.dt);
    this.time = f.nowMs / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.dpr * camera.zoom;
    ctx.setTransform(
      s,
      0,
      0,
      s,
      (camera.width / 2) * this.dpr - (camera.x + camera.shakeX) * s,
      (camera.height / 2) * this.dpr - (camera.y + camera.shakeY) * s,
    );
    ctx.imageSmoothingEnabled = true;

    this.walls = snapWalls(this.content.map.walls, f.b.wk);
    this.drawFloor();
    this.drawCreep(f.b.time);
    ctx.drawImage(this.decals, 0, 0, this.content.map.arena.width, this.content.map.arena.height);
    this.drawArenaEdge();
    // Terrain layer: pillars, rubble and edge boulders always sit UNDER every unit.
    this.drawProps();
    this.drawMission(f.b, f.nowMs / 1000);
    // Breach holes / vents (spawn points) are part of the terrain too.
    this.drawBreaches();
    this.drawAcid(f);
    this.drawCrashSite(f);
    this.drawPickups(f);
    this.drawCorpses();
    this.drawEnemies(f);
    this.drawAllies(f);
    this.drawPlayers(f);
    this.drawProjectiles(f);
    this.drawParticles();
    this.drawSightShadows();
    this.drawWalls();
    this.drawFallingShip(f);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawVignette();
  }

  private drawFloor(): void {
    const { ctx } = this;
    const theme = this.content.map.theme;
    if (theme && theme.biome !== 'hive') {
      this.drawThemedFloor(theme.floorA, theme.floorB, theme.edge);
      return;
    }
    const v = this.camera.view(TILE);
    const tx0 = Math.max(0, Math.floor(v.x0 / TILE));
    const ty0 = Math.max(0, Math.floor(v.y0 / TILE));
    const tx1 = Math.min(this.content.map.arena.width / TILE, Math.ceil(v.x1 / TILE));
    const ty1 = Math.min(this.content.map.arena.height / TILE, Math.ceil(v.y1 / TILE));
    const hasTiles = this.assets.has('tile_floor_0');
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        const h = hash2(tx, ty);
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        const roll = h % 1000;
        // Imperial deck: plain plates, worn plates, drain grates, hazard strips,
        // and a seal plate in the very centre.
        const centre =
          Math.abs(cx - this.content.map.arena.width / 2) < TILE &&
          Math.abs(cy - this.content.map.arena.height / 2) < TILE;
        const key = centre
          ? 'tile_seal'
          : roll < 25
            ? 'tile_grate'
            : roll < 33
              ? 'tile_hazard'
              : `tile_floor_${roll < 680 ? 0 : 1 + (h % 3)}`;
        if (hasTiles) this.assets.draw(ctx, key, 0, cx, cy);
        else {
          ctx.fillStyle = (tx + ty) % 2 ? '#1a2026' : '#1d242b';
          ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    }
  }

  private drawThemedFloor(a: string, b: string, edge: string): void {
    const { ctx } = this;
    const v = this.camera.view(TILE);
    const { width, height } = this.content.map.arena;
    const tx0 = Math.max(0, Math.floor(v.x0 / TILE));
    const ty0 = Math.max(0, Math.floor(v.y0 / TILE));
    const tx1 = Math.min(width / TILE, Math.ceil(v.x1 / TILE));
    const ty1 = Math.min(height / TILE, Math.ceil(v.y1 / TILE));
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        ctx.fillStyle = (tx + ty) % 2 ? a : b;
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    // faint vignette toward the edge colour
    ctx.fillStyle = edge;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, 80);
    ctx.fillRect(v.x0, v.y1 - 80, v.x1 - v.x0, 80);
    ctx.globalAlpha = 1;
  }

  private drawMission(snap: Snapshot, now: number): void {
    const mi = snap.mi;
    if (!mi) return;
    const { ctx } = this;
    const def = findMission(mi.id);
    ctx.save();
    if (def && def.extractHold > 0) {
      const pulse = mi.eo ? 0.55 + 0.25 * Math.sin(now * 4) : 0.22;
      ctx.beginPath();
      ctx.arc(mi.ex, mi.ey, mi.er, 0, Math.PI * 2);
      ctx.fillStyle = mi.eo
        ? `rgba(80, 200, 120, ${0.12 + 0.08 * pulse})`
        : 'rgba(180, 180, 80, 0.08)';
      ctx.fill();
      ctx.setLineDash([16, 12]);
      ctx.lineWidth = 6;
      ctx.strokeStyle = mi.eo ? `rgba(120, 230, 150, ${pulse})` : 'rgba(200, 190, 80, 0.35)';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '700 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = mi.eo ? 'rgba(180, 255, 200, 0.9)' : 'rgba(220, 210, 140, 0.6)';
      ctx.fillText(mi.eo ? 'EKSTRAKCJA' : 'STREFA EWAKUACJI', mi.ex, mi.ey - mi.er - 12);
    }
    for (const t of mi.tg) {
      if (t.hp <= 0) continue;
      const pulse = 0.7 + 0.3 * Math.sin(now * 3 + t.id);
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120, 40, 160, ${0.35 * pulse})`;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgba(210, 80, 255, ${pulse})`;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#4a1860';
      ctx.fill();
      const frac = t.maxHp > 0 ? t.hp / t.maxHp : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(t.x - t.r, t.y + t.r + 8, t.r * 2, 8);
      ctx.fillStyle = '#d060ff';
      ctx.fillRect(t.x - t.r, t.y + t.r + 8, t.r * 2 * frac, 8);
    }
    if (mi.rx !== undefined && mi.ry !== undefined && mi.rr !== undefined && !mi.rc) {
      const pulse = 0.7 + 0.3 * Math.sin(now * 5);
      ctx.beginPath();
      ctx.arc(mi.rx, mi.ry, mi.rr + 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(230, 190, 60, ${0.35 * pulse})`;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mi.rx, mi.ry - mi.rr);
      ctx.lineTo(mi.rx + mi.rr * 0.7, mi.ry);
      ctx.lineTo(mi.rx, mi.ry + mi.rr);
      ctx.lineTo(mi.rx - mi.rr * 0.7, mi.ry);
      ctx.closePath();
      ctx.fillStyle = '#e8c040';
      ctx.strokeStyle = '#fff4c0';
      ctx.lineWidth = 3;
      ctx.fill();
      ctx.stroke();
    }
    for (const pod of snap.rf?.pods ?? []) {
      const [, , x, y, t] = pod;
      const drop = Math.max(0, Math.min(1, 1 - t / 1.4));
      const alt = (1 - drop) * 280;
      ctx.beginPath();
      ctx.arc(x, y, 70, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 180, 60, ${0.35 + 0.4 * drop})`;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#c45a20';
      ctx.strokeStyle = '#f0d080';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y - 28 - alt);
      ctx.lineTo(x + 18, y + 10 - alt);
      ctx.lineTo(x - 18, y + 10 - alt);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // shadow on the ground
      ctx.beginPath();
      ctx.ellipse(x, y, 16, 8, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,0,0,${0.25 + 0.4 * drop})`;
      ctx.fill();
    }
    ctx.restore();
  }

  private drawArenaEdge(): void {
    const { ctx } = this;
    const W = this.content.map.arena.width;
    const H = this.content.map.arena.height;
    ctx.save();
    // broken hab-block wall: dark masonry band + brass-capped parapet
    ctx.fillStyle = '#17130f';
    ctx.fillRect(-260, -260, W + 520, 236);
    ctx.fillRect(-260, H + 24, W + 520, 236);
    ctx.fillRect(-260, -24, 236, H + 48);
    ctx.fillRect(W + 24, -24, 236, H + 48);
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#2b241c';
    ctx.strokeRect(-12, -12, W + 24, H + 24);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(176,138,62,0.55)';
    ctx.strokeRect(-3, -3, W + 6, H + 6);
    ctx.restore();
  }

  /** Tyranid creep: organic carpet that thickens and spreads as the siege goes on. */
  private drawCreep(simTime: number): void {
    if (!this.assets.has('creep_0')) return;
    const { ctx } = this;
    const v = this.camera.view(200);
    const grow = Math.min(1, simTime / 420);
    ctx.globalAlpha = 0.35 + 0.5 * grow;
    for (const c of this.creep) {
      if (c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) continue;
      this.assets.draw(ctx, `creep_${c.v}`, 0, c.x, c.y, c.ang, c.s * (0.55 + 0.75 * grow));
    }
    ctx.globalAlpha = 1;
  }

  private drawProps(): void {
    const { ctx } = this;
    const v = this.camera.view(120);
    for (const p of this.props) {
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      this.assets.draw(ctx, p.key, 0, p.x, p.y, p.ang, p.scale);
    }
  }

  /**
   * Spawn points: holes, tunnels and vents with creep and tendrils (terrain layer). Always drawn
   * idle: no telegraph glow / pulse, so nothing on the map tells where the next wave comes from.
   */
  private drawBreaches(): void {
    const v = this.camera.view(260);
    const pts = this.content.director.spawnPoints;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      drawBreach(this.ctx, p, i, BREACH_STATE.idle, this.time);
    }
  }

  private drawShadow(x: number, y: number, r: number): void {
    const { ctx } = this;
    if (this.assets.has('shadow')) {
      this.assets.draw(ctx, 'shadow', 0, x, y + r * 0.35, 0, r / 22);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.35, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Crash warning on the floor (falling) and the smoking impact crater (smoke). */
  private drawCrashSite(f: RenderFrame): void {
    const cr = f.b.cr;
    if (!cr) return;
    const [x, y, ph, t] = cr;
    const { ctx } = this;
    const time = f.nowMs / 1000;
    ctx.save();
    if (ph === 1) {
      const k = 1 - Math.min(1, t / CRASH.fallTime);
      ctx.strokeStyle = `rgba(255,70,40,${0.5 + 0.4 * Math.sin(time * 12)})`;
      ctx.lineWidth = 4;
      ctx.setLineDash([18, 12]);
      ctx.lineDashOffset = -time * 40;
      ctx.beginPath();
      ctx.arc(x, y, CRASH.impact.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // the ship's shadow grows as it comes down
      ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.4 * k})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 30 + 90 * k, 14 + 40 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const g = ctx.createRadialGradient(x, y, 10, x, y, CRASH.impact.radius);
      g.addColorStop(0, 'rgba(255,140,40,0.55)');
      g.addColorStop(0.5, 'rgba(60,30,20,0.6)');
      g.addColorStop(1, 'rgba(20,15,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, CRASH.impact.radius, 0, Math.PI * 2);
      ctx.fill();
      if (Math.random() < f.dt * 30)
        this.particles.spawn({
          x: x + (Math.random() - 0.5) * 120,
          y: y + (Math.random() - 0.5) * 120,
          vx: (Math.random() - 0.5) * 30,
          vy: -20 - Math.random() * 30,
          maxLife: 2.2,
          size: 14,
          grow: 3,
          color: Math.random() < 0.2 ? '#7a4a20' : '#3a3632',
          shape: 'smoke',
          additive: false,
        });
    }
    ctx.restore();
  }

  /** The burning Imperial ship diving in from `from`, trailing fire and smoke. */
  private drawFallingShip(f: RenderFrame): void {
    const cr = f.b.cr;
    if (!cr || cr[2] !== 1) return;
    const [x, y, , t, from] = cr;
    const { ctx } = this;
    const k = Math.min(1, t / CRASH.fallTime); // 1 = far away, 0 = impact
    const sx = x + Math.cos(from) * 1400 * k;
    const sy = y + Math.sin(from) * 1400 * k - 500 * k;
    const ang = Math.atan2(y - sy, x - sx);
    const scale = 1.6 - 0.6 * k;
    if (Math.random() < f.dt * 60)
      this.particles.spawn({
        x: sx - Math.cos(ang) * 50 * scale,
        y: sy - Math.sin(ang) * 50 * scale,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        maxLife: 1.4,
        size: 16,
        grow: 2.5,
        color: Math.random() < 0.5 ? '#ff8a20' : '#2a2622',
        shape: 'smoke',
        additive: Math.random() < 0.5,
      });
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang);
    ctx.scale(scale, scale);
    // hull: a gothic wedge with a prow, engine block and fins
    ctx.fillStyle = '#5a5850';
    ctx.strokeStyle = '#1a1816';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(70, 0);
    ctx.lineTo(20, -22);
    ctx.lineTo(-50, -26);
    ctx.lineTo(-60, -40);
    ctx.lineTo(-70, -26);
    ctx.lineTo(-70, 26);
    ctx.lineTo(-60, 40);
    ctx.lineTo(-50, 26);
    ctx.lineTo(20, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b8902a'; // aquila stripe
    ctx.fillRect(-20, -4, 50, 8);
    // fire licking along the hull
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(60, 0, 4, 40, 0, 70);
    g.addColorStop(0, 'rgba(255,240,180,0.9)');
    g.addColorStop(0.4, 'rgba(255,120,30,0.7)');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(40, 0, 70, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Guardsmen: khaki flak armour, dark helmet, lasgun; small HP bar; gold ring = follows you. */
  /** Last-resort human Guardsman if the atlas is missing: helmet, vest, legs, lasgun. */
  private drawGuardsmanFallback(x: number, y: number, a: number, dist: number): void {
    const { ctx } = this;
    const step = Math.sin(dist / 10);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = '#4a4428';
    for (const [side, ph] of [
      [-1, 1],
      [1, -1],
    ] as const) {
      const fx = ph * step * 5;
      ctx.fillRect(-4 + fx, side * 5 - 2.4, 10, 4.8);
      ctx.fillStyle = '#2c2a22';
      ctx.fillRect(4 + fx, side * 5 - 2, 4.5, 4);
      ctx.fillStyle = '#4a4428';
    }
    ctx.fillStyle = '#8a7d52';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3e4a32';
    ctx.fillRect(-6, -7, 12, 14);
    ctx.strokeStyle = '#2a2a24';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(3, 2);
    ctx.lineTo(20, 2);
    ctx.stroke();
    ctx.fillStyle = '#4a5238';
    ctx.beginPath();
    ctx.arc(6, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1e14';
    ctx.fillRect(8.4, -2, 2, 4);
    ctx.restore();
  }

  private drawAllies(f: RenderFrame): void {
    const { ctx } = this;
    const r = GUARDSMAN.radius;
    const key = 'ally_guardsman';
    const seen = new Set<number>();
    for (const [id, x, y, a, hp, follow] of f.b.al ?? []) {
      seen.add(id);
      if (this.hiddenFromViewer(x, y)) continue;
      const w = this.allyWalk.get(id) ?? { x, y, dist: 0 };
      w.dist += Math.hypot(x - w.x, y - w.y);
      w.x = x;
      w.y = y;
      this.allyWalk.set(id, w);
      this.drawShadow(x, y, r);
      const walkA = this.assets.anim(key, 'walk');
      const frame = walkA
        ? walkA[0] + (Math.floor(w.dist / 10) % walkA[1])
        : Math.floor(w.dist / 10) % 6;
      if (!this.assets.draw(ctx, key, frame, x, y, a)) this.drawGuardsmanFallback(x, y, a, w.dist);
      if (follow) {
        ctx.strokeStyle = 'rgba(230,190,80,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (hp < 100) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - r, y - r - 8, r * 2, 3);
        ctx.fillStyle = '#6ac040';
        ctx.fillRect(x - r, y - r - 8, (r * 2 * hp) / 100, 3);
      }
    }
    for (const id of [...this.allyWalk.keys()]) if (!seen.has(id)) this.allyWalk.delete(id);
  }

  /** Acid pools: bright toxic green with a bubbling rim, fading as they dry up. */
  private drawAcid(f: RenderFrame): void {
    const { ctx } = this;
    const time = f.nowMs / 1000;
    for (const [id, x, y, r, life, dur] of f.b.ac ?? []) {
      const fade = Math.min(1, life / Math.max(0.5, dur * 0.35));
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.6 * fade;
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(190,255,60,0.85)');
      g.addColorStop(0.7, 'rgba(120,210,30,0.6)');
      g.addColorStop(1, 'rgba(80,140,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(210,255,90,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -time * 12;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // a few bubbles
      ctx.fillStyle = 'rgba(230,255,150,0.8)';
      for (let k = 0; k < 3 + Math.floor(r / 20); k++) {
        const a = id * 1.7 + k * 2.39;
        const rr = r * 0.6 * ((k * 0.37 + id * 0.13) % 1);
        const s = 1.5 + 2 * Math.abs(Math.sin(time * 3 + k + id));
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawPickups(f: RenderFrame): void {
    const { ctx } = this;
    const time = f.nowMs / 1000;
    for (const p of f.b.pickups) {
      if (p.life < 6 && Math.floor(time * 6) % 2 === 0) continue; // blink before despawn
      const bob = Math.sin(time * 3 + p.id) * 3;
      const glowColor = p.k === 'medkit' ? 'rgba(90,255,120,' : 'rgba(255,200,60,';
      const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 42);
      g.addColorStop(0, glowColor + '0.35)');
      g.addColorStop(1, glowColor + '0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 42, p.y - 42, 84, 84);
      this.drawShadow(p.x, p.y + 6, 16);
      const key =
        p.k === 'medkit' ? 'medkit' : (this.content.weapons.get(p.w ?? '')?.sprites.pickup ?? '');
      const frame = Math.floor(time * 2) % 2;
      if (!this.assets.draw(ctx, key, frame, p.x, p.y + bob)) {
        ctx.fillStyle = p.k === 'medkit' ? '#e8e8e8' : '#b07a2a';
        ctx.fillRect(p.x - 14, p.y - 14 + bob, 28, 28);
        ctx.fillStyle = p.k === 'medkit' ? '#e33' : '#222';
        ctx.fillRect(p.x - 3, p.y - 10 + bob, 6, 20);
        ctx.fillRect(p.x - 10, p.y - 3 + bob, 20, 6);
      }
      if (p.k === 'weapon' && p.w) {
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd87a';
        ctx.fillText(this.content.weapons.get(p.w)?.name.toUpperCase() ?? p.w, p.x, p.y - 26 + bob);
      }
    }
  }

  /** Death animations play out, then the carcass is baked into the decal layer. */
  private drawCorpses(): void {
    const keep: Corpse[] = [];
    for (const c of this.corpses) {
      const a = this.assets.anim(c.key, 'death');
      const dur = a ? a[1] / c.vis.deathFps : 0.4;
      const age = this.time - c.t0;
      const frame = this.assets.animFrame(c.key, 'death', age, c.vis.deathFps, false);
      if (age >= dur + 0.05) {
        if (c.vis.corpse && a) this.bakeSprite(c.key, a[0] + a[1] - 1, c.x, c.y, c.ang, 0.8);
        continue;
      }
      if (!this.assets.draw(this.ctx, c.key, frame, c.x, c.y, c.ang)) continue;
      keep.push(c);
    }
    this.corpses = keep;
  }

  private bakeSprite(
    key: string,
    frame: number,
    x: number,
    y: number,
    ang: number,
    alpha: number,
  ): void {
    const c = this.decalCtx;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x * DECAL_SCALE, y * DECAL_SCALE);
    c.scale(DECAL_SCALE, DECAL_SCALE);
    this.assets.draw(c, key, frame, 0, 0, ang);
    c.restore();
  }

  /**
   * Wind-up telegraph on the creature itself. Gaunts: crouch (squashed along the facing,
   * splayed wide), pull back, tremble harder as the spring loads, eyes flare red, feet kick up
   * dust. Carnifex: rears up (grows, lifts off its shadow, leans back), sways, paws the deck
   * with dust bursts at the front feet.
   */
  private windupPose(
    pose: { dx: number; dy: number; sx: number; sy: number; rot: number; glow: number },
    tr: EnemyTrack,
    id: number,
    p: number,
    big: boolean,
    time: number,
    dt: number,
  ): void {
    const c = Math.cos(tr.ang);
    const s = Math.sin(tr.ang);
    const r = tr.r;
    if (big) {
      const e = easeInOut(Math.min(1, p / 0.7));
      const lift = r * 0.32 * e;
      pose.sx = 1 + 0.1 * e;
      pose.sy = 1 + 0.18 * e;
      pose.dx = -c * r * 0.22 * e;
      pose.dy = -s * r * 0.22 * e - lift;
      pose.rot = Math.sin(time * 9 + id) * 0.06 * e;
      pose.glow = 0.4 + 0.6 * e;
      if (time >= tr.nextPaw && p > 0.15) {
        // paw the ground: alternating front feet
        tr.nextPaw = time + 0.28;
        const side = Math.floor(time / 0.28) % 2 ? 1 : -1;
        const fx = tr.x + c * r * 0.75 - s * r * 0.45 * side;
        const fy = tr.y + s * r * 0.75 + c * r * 0.45 * side;
        this.particles.burst(fx, fy, 6, {
          speed: 90,
          color: '#5a4a38',
          maxLife: 0.7,
          size: 6,
          grow: 2.5,
          shape: 'smoke',
          drag: 3,
        });
        this.particles.burst(fx, fy, 3, {
          speed: 160,
          color: '#3a3026',
          maxLife: 0.4,
          size: 2,
          drag: 4,
        });
      }
    } else {
      const e = easeOut(p);
      pose.sx = 1 - 0.24 * e;
      pose.sy = 1 + 0.16 * e;
      const tremble = (0.8 + 1.8 * p) * Math.sin(time * 75 + id * 1.7);
      pose.dx = -c * r * 0.4 * e - s * tremble;
      pose.dy = -s * r * 0.4 * e + c * tremble;
      pose.glow = 0.3 + 0.7 * e;
      if (Math.random() < dt * 22)
        this.particles.spawn({
          x: tr.x - c * r * 0.6 + (Math.random() - 0.5) * r,
          y: tr.y - s * r * 0.6 + (Math.random() - 0.5) * r,
          vx: -c * 60 + (Math.random() - 0.5) * 30,
          vy: -s * 60 + (Math.random() - 0.5) * 30,
          maxLife: 0.45,
          size: 3,
          grow: 2.5,
          color: '#5a4a38',
          shape: 'smoke',
          additive: false,
        });
    }
  }

  /** Red menace glow under the body (before) and flaring eyes (after the sprite). */
  private menaceGlow(
    x: number,
    y: number,
    ang: number,
    r: number,
    k: number,
    time: number,
    id: number,
    eyes: boolean,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.85 + 0.15 * Math.sin(time * 40 + id);
    if (!eyes) {
      const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.6);
      g.addColorStop(0, `rgba(255,40,20,${0.32 * k * flick})`);
      g.addColorStop(1, 'rgba(255,40,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
    } else {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const hx = x + c * r * 0.55;
      const hy = y + s * r * 0.55;
      const er = Math.max(2, r * 0.13) * (0.8 + 0.5 * k);
      for (const side of [-1, 1]) {
        const ex = hx - s * r * 0.17 * side;
        const ey = hy + c * r * 0.17 * side;
        const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, er * 2.4);
        g.addColorStop(0, `rgba(255,230,200,${0.9 * k * flick})`);
        g.addColorStop(0.35, `rgba(255,60,30,${0.75 * k * flick})`);
        g.addColorStop(1, 'rgba(255,30,10,0)');
        ctx.fillStyle = g;
        ctx.fillRect(ex - er * 2.4, ey - er * 2.4, er * 4.8, er * 4.8);
      }
    }
    ctx.restore();
  }

  /** Dust ring + grit where a leap / charge lands. */
  private landingDust(x: number, y: number, ang: number, r: number): void {
    const big = r > 24;
    this.particles.burst(x, y, big ? 22 : 9, {
      speed: big ? 170 : 100,
      color: '#5a4a38',
      maxLife: big ? 0.9 : 0.55,
      size: big ? 8 : 4,
      grow: 2.5,
      shape: 'smoke',
      drag: 4,
    });
    this.particles.burst(x + Math.cos(ang) * r * 0.5, y + Math.sin(ang) * r * 0.5, big ? 10 : 4, {
      speed: big ? 240 : 150,
      color: '#3a3026',
      maxLife: 0.4,
      size: 2,
      drag: 5,
    });
    if (big) {
      const d = Math.hypot(x - this.camera.x, y - this.camera.y);
      this.camera.addShake(Math.max(0, 6 - d / 110));
    }
  }

  private drawEnemies(f: RenderFrame): void {
    const { ctx } = this;
    const prev = new Map(f.a.enemies.map((e) => [e[0], e]));
    const time = this.time;
    const v = this.camera.view(140);
    const seen = new Set<number>();
    const synapseAuras: { x: number; y: number; r: number }[] = [];
    const stimAuras: { x: number; y: number; r: number }[] = [];
    for (const e of f.b.enemies) {
      const [id, typeIdx, bx, by, ba, hp, flags] = e;
      seen.add(id);
      const pa = prev.get(id);
      const x = pa ? lerp(pa[2], bx, f.t) : bx;
      const y = pa ? lerp(pa[3], by, f.t) : by;
      const ang = pa ? lerpAngle(pa[4], ba, f.t) : ba;
      const last = this.lastHp.get(id);
      if (last !== undefined && hp < last) this.hitFlash.set(id, 0.08);
      this.lastHp.set(id, hp);
      if (this.hiddenFromViewer(x, y)) continue;
      const typeId = this.content.enemyIds[typeIdx] ?? '';
      const def: EnemyDef | undefined = this.content.enemies.get(typeId);
      const vis = ENEMY_VISUALS[typeId] ?? DEFAULT_ENEMY_VISUAL;
      const r = def?.radius ?? 16;
      const key = def?.sprite ?? '';
      let tr = this.tracks.get(id);
      if (!tr) {
        tr = {
          x,
          y,
          ang,
          dist: (id * 37) % 50,
          key,
          vis,
          r,
          atk0: -1,
          burrowed: false,
          wind0: -1,
          dash0: -1,
          nextPaw: 0,
        };
        this.tracks.set(id, tr);
      }
      tr.dist += Math.hypot(x - tr.x, y - tr.y);
      tr.x = x;
      tr.y = y;
      tr.ang = ang;
      const burrowed = (flags & ENEMY_FLAG.burrowed) !== 0;
      tr.burrowed = burrowed;
      const attacking = (flags & ENEMY_FLAG.attacking) !== 0;
      if (attacking && tr.atk0 < 0) tr.atk0 = time;
      else if (!attacking) tr.atk0 = -1;
      const windup = (flags & ENEMY_FLAG.windup) !== 0;
      const dashing = (flags & ENEMY_FLAG.dashing) !== 0;
      if (windup && tr.wind0 < 0) tr.wind0 = time;
      else if (!windup) tr.wind0 = -1;
      if (dashing && tr.dash0 < 0) tr.dash0 = time;
      else if (!dashing && tr.dash0 >= 0) {
        tr.dash0 = -1;
        this.landings.push({ x, y, r, t: typeId });
        if (this.landings.length > 16) this.landings.shift();
        this.landingDust(x, y, ang, r);
      }
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;

      if (burrowed) {
        // tunnelling ravener: only a moving mound of broken deck plates
        if (!this.assets.draw(ctx, 'fx_burrow', Math.floor(time * 10 + id), x, y, ang, r / 22)) {
          ctx.fillStyle = '#3a2e22';
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.6, ang, 0, Math.PI * 2);
          ctx.fill();
        }
        if (Math.random() < f.dt * 14)
          this.particles.spawn({
            x: x + (Math.random() - 0.5) * r,
            y: y + (Math.random() - 0.5) * r,
            vx: (Math.random() - 0.5) * 40,
            vy: (Math.random() - 0.5) * 40,
            maxLife: 0.6,
            size: 4,
            grow: 2.5,
            color: '#5a4a38',
            shape: 'smoke',
            additive: false,
          });
        continue;
      }
      if (def?.synapse) synapseAuras.push({ x, y, r: def.synapse.radius });
      if (def?.stim) stimAuras.push({ x, y, r: def.stim.radius });
      if (flags & ENEMY_FLAG.stim) {
        // Bio-stimulus: violet halo on every buffed beast
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 6 + id);
        ctx.strokeStyle = '#c070ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      this.drawShadow(x, y, r);
      const fuse = (flags & ENEMY_FLAG.fuse) !== 0;
      const pulse = fuse ? 1 + Math.sin(time * 30) * 0.08 : 1;
      if (fuse) {
        const g = ctx.createRadialGradient(x, y, 2, x, y, r * 2.4);
        g.addColorStop(0, 'rgba(200,255,60,0.55)');
        g.addColorStop(1, 'rgba(200,255,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
      }
      let frame: number;
      if (tr.atk0 >= 0) frame = this.assets.animFrame(key, 'attack', time - tr.atk0, vis.attackFps);
      else if (windup) frame = this.assets.animFrame(key, 'attack', 0, 1, false);
      else {
        const a = this.assets.anim(key, 'walk');
        frame = a ? a[0] + (Math.floor(tr.dist / vis.stride) % a[1]) : Math.floor(time * 8 + id);
      }
      // ---- body pose: wind-up crouch / rear, dash stretch (replaces the old red lane)
      const big = r > 24;
      const pose = { dx: 0, dy: 0, sx: pulse, sy: pulse, rot: 0, glow: 0 };
      if (windup && def?.charge) {
        const p = Math.min(1, (time - tr.wind0) / Math.max(0.05, def.charge.windup));
        this.windupPose(pose, tr, id, p, big, time, f.dt);
      } else if (dashing) {
        // lunging: stretched along the facing, scythes forward
        const k = Math.min(1, (time - tr.dash0) / 0.08);
        pose.sx = 1 + 0.28 * k;
        pose.sy = 1 - 0.14 * k;
        pose.glow = 0.5;
      }
      const cx = x + pose.dx;
      const cy = y + pose.dy;
      const da = ang + pose.rot;
      if (dashing) {
        ctx.globalAlpha = 0.22;
        for (let k = 1; k <= 3; k++)
          this.assets.drawXform(
            ctx,
            key,
            frame,
            cx - Math.cos(ang) * 13 * k,
            cy - Math.sin(ang) * 13 * k,
            da,
            pose.sx,
            pose.sy,
          );
        ctx.globalAlpha = 1;
      }
      if (pose.glow > 0) this.menaceGlow(cx, cy, da, r, pose.glow, time, id, false);
      const drawn =
        pose.sx === pose.sy && pose.rot === 0
          ? this.assets.draw(ctx, key, frame, cx, cy, da, pose.sx)
          : this.assets.drawXform(ctx, key, frame, cx, cy, da, pose.sx, pose.sy);
      if (!drawn && typeId === 'psychophage') {
        // Atlas missing: hunched body, six legs, dorsal chimneys and a front maw — not a disc.
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(da);
        ctx.fillStyle = vis.color;
        for (const [lx, ly] of [
          [-0.55, 0.7],
          [0.05, 0.95],
          [0.55, 0.75],
        ]) {
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(r * lx * 0.4, 0);
            ctx.lineTo(r * lx, s * r * ly);
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#2a1840';
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.ellipse(-r * 0.1, 0, r * 0.85, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5a2a80';
        for (const [hx, hy] of [
          [-0.55, -0.25],
          [-0.7, 0],
          [-0.55, 0.25],
        ]) {
          ctx.beginPath();
          ctx.arc(r * hx, r * hy, r * 0.16, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#1a0610';
        ctx.beginPath();
        ctx.ellipse(r * 0.7, 0, r * 0.38, r * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d090ff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        for (let k = 0; k < 6; k++) {
          const ta = (k - 2.5) * 0.35;
          ctx.beginPath();
          ctx.moveTo(r * 0.7, 0);
          ctx.quadraticCurveTo(
            r * 1.15,
            Math.sin(ta + time * 6) * r * 0.4,
            r * 1.4,
            Math.sin(ta) * r * 0.7,
          );
          ctx.stroke();
        }
        ctx.restore();
      } else if (!drawn) {
        ctx.fillStyle = vis.color;
        ctx.beginPath();
        ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(da) * r, cy + Math.sin(da) * r);
        ctx.stroke();
      }
      if (pose.glow > 0) this.menaceGlow(cx, cy, da, r, pose.glow, time, id, true);
      const flash = this.hitFlash.get(id) ?? 0;
      if (flash > 0) {
        this.hitFlash.set(id, flash - f.dt);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        if (!this.assets.drawXform(ctx, key, frame, cx, cy, da, pose.sx, pose.sy)) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // HP bar for damaged big enemies (bosses get the HUD bar instead)
      if (hp < 100 && (def?.hp ?? 0) >= 150 && !def?.boss) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - r, y - r - 10, r * 2, 4);
        ctx.fillStyle = '#b02020';
        ctx.fillRect(x - r, y - r - 10, (r * 2 * hp) / 100, 4);
      }
    }
    // Bio-stimulus range: a slow dashed violet ring so marines can read (and leave) the aura
    for (const a of stimAuras) {
      ctx.save();
      ctx.strokeStyle = 'rgba(190,110,255,0.45)';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -time * 20;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(150,60,220,0.07)';
      ctx.fill();
      ctx.restore();
    }
    // synapse auras drawn additively on top so the "commander" reads at a glance
    if (synapseAuras.length) {
      const w = this.spriteWorldW('fx_synapse') || 128;
      ctx.globalCompositeOperation = 'lighter';
      for (const a of synapseAuras) {
        ctx.globalAlpha = 0.16 + 0.06 * Math.sin(time * 3);
        this.assets.draw(
          ctx,
          'fx_synapse',
          Math.floor(time * 8),
          a.x,
          a.y,
          time * 0.3,
          ((a.r * 2) / w) * 0.5,
        );
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const [id, tr] of this.tracks) {
      if (seen.has(id)) continue;
      this.tracks.delete(id);
      this.lastHp.delete(id);
      this.hitFlash.delete(id);
      if (!tr.burrowed && this.assets.anim(tr.key, 'death'))
        this.corpses.push({
          key: tr.key,
          x: tr.x,
          y: tr.y,
          ang: tr.ang,
          t0: time,
          vis: tr.vis,
          r: tr.r,
        });
    }
    if (this.corpses.length > 120) this.corpses.splice(0, this.corpses.length - 120);
  }

  private playerPose(f: RenderFrame, p: PlayerSnap): { x: number; y: number; a: number } {
    if (p.id === f.myId && f.me && p.st === 'alive') return { x: f.me.x, y: f.me.y, a: f.me.aim };
    const pa = f.a.players.find((q) => q.id === p.id);
    if (!pa) return { x: p.x, y: p.y, a: p.a };
    return { x: lerp(pa.x, p.x, f.t), y: lerp(pa.y, p.y, f.t), a: lerpAngle(pa.a, p.a, f.t) };
  }

  /**
   * Braced heavy weapon: feet planted wide (mag-clamp marks either side), a tight amber firing
   * cone ahead and a bipod stub at the muzzle — readable at a glance for the whole squad.
   */
  private drawBraceStance(x: number, y: number, a: number, time: number, weaponId: string): void {
    const { ctx } = this;
    const c = Math.cos(a);
    const s = Math.sin(a);
    ctx.save();
    // firing cone
    const g = ctx.createRadialGradient(x, y, 20, x, y, 190);
    g.addColorStop(0, 'rgba(255,190,80,0.28)');
    g.addColorStop(1, 'rgba(255,190,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + c * 18, y + s * 18);
    ctx.arc(x, y, 190, a - 0.16, a + 0.16);
    ctx.closePath();
    ctx.fill();
    // planted feet: two clamp plates perpendicular to the aim, with a pulsing gold rim
    const pulse = 0.65 + 0.35 * Math.sin(time * 6);
    for (const side of [-1, 1]) {
      const fx = x - s * side * 19 - c * 6;
      const fy = y + c * side * 19 - s * 6;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(20,18,14,0.85)';
      ctx.fillRect(-9, -5, 18, 10);
      ctx.strokeStyle = `rgba(232,196,106,${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(-9, -5, 18, 10);
      ctx.restore();
    }
    // bracing arc behind the marine
    ctx.strokeStyle = `rgba(232,196,106,${0.5 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 30, a + Math.PI - 0.9, a + Math.PI + 0.9);
    ctx.stroke();
    // bipod at the muzzle
    const md = muzzleDef(weaponId);
    const mx = x + c * (md.forward - 8) - s * md.lateral;
    const my = y + s * (md.forward - 8) + c * md.lateral;
    ctx.strokeStyle = 'rgba(40,36,30,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mx - s * 9 + c * 4, my + c * 9 + s * 4);
    ctx.lineTo(mx, my);
    ctx.lineTo(mx + s * 9 + c * 4, my - c * 9 + s * 4);
    ctx.stroke();
    ctx.restore();
  }

  private drawPlayers(f: RenderFrame): void {
    const { ctx } = this;
    const time = this.time;
    for (const p of f.b.players) {
      if (p.st === 'dead') continue;
      const { x, y, a } = this.playerPose(f, p);
      const ch: ChapterDef = this.content.chapter(p.c);
      const color = chapterUiColor(ch);
      const w = this.walk.get(p.id) ?? { x, y, dist: 0 };
      const stepX = x - w.x;
      const stepY = y - w.y;
      w.dist += Math.hypot(stepX, stepY);
      w.x = x;
      w.y = y;
      this.walk.set(p.id, w);
      const mine = p.id === f.myId && f.me?.sprint;
      const sprinting = p.st === 'alive' && (mine ? f.me!.sprint!.sprinting : p.sp === 1);

      if (p.br && p.st === 'alive') this.drawBraceStance(x, y, a, time, p.w);
      const guarding = p.st === 'alive' && (p.id === f.myId ? !!f.me?.guarding : p.gd === 1);
      if (sprinting) this.drawSprintTrail(p, x, y, a, f.dt);
      this.drawShadow(x, y, PLAYER.radius + 6);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 25, 16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (p.st !== 'alive') this.heldPose.delete(p.id);
      if (p.st === 'downed') {
        if (!this.assets.draw(ctx, `marine_${ch.id}_down`, 0, x, y, 0)) {
          ctx.fillStyle = ch.primary;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(x, y, PLAYER.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        const bleed = Math.max(0, p.bo / PLAYER.bleedOutTime);
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(255,60,60,${0.5 + 0.5 * Math.sin(time * 8)})`;
        ctx.beginPath();
        ctx.arc(x, y, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * bleed);
        ctx.stroke();
        if (p.rv > 0) {
          ctx.strokeStyle = '#e8c46a';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(x, y, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.rv));
          ctx.stroke();
        }
        ctx.font = 'bold 12px Georgia, "Times New Roman", serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff6a6a';
        ctx.fillText('REVIVE ME', x, y - 48);
      } else {
        // three layers: legs/torso/backpack → weapon + gauntlets (with recoil) → pauldrons/helmet
        const body = `marine_${ch.id}`;
        const walkA = this.assets.anim(body, 'walk');
        const frame = walkA
          ? walkA[0] + (Math.floor(w.dist / 9) % walkA[1])
          : Math.floor(w.dist / 14) % 4;
        const rec = this.recoil.get(p.id) ?? 0;
        if (rec !== 0) {
          const next = rec * Math.exp(-f.dt * 22);
          if (Math.abs(next) < 0.1) this.recoil.delete(p.id);
          else this.recoil.set(p.id, next);
        }
        const held = this.content.weapons.get(p.w)?.sprites.held ?? '';
        const pose =
          p.st === 'alive'
            ? weaponPose(sprinting, mine ? f.me!.sprint!.weaponDelay : (p.wd ?? 0))
            : 1;
        // Guard (option B — leading shoulder): stock body + weapon + `_top`, modest twist,
        // `_top` shifted toward the threat so the lead pauldron reads as cover; gun at the hip.
        // No blob-arm primitives and `_top` is never skipped.
        const guardTwist = guarding ? -0.3 : 0;
        const bodyA = a + guardTwist;
        if (this.assets.draw(ctx, body, frame, x, y, bodyA)) {
          // Weapon: held in the aim direction. v0.6.0 hotfix: while sprinting it is NOT drawn
          // at all (the back-slung pose looked odd); over the ready delay it fades in and
          // raises from a lowered, pulled-in pose to the aim. Same for local and remote marines.
          // While guarding the gun sits at the hip/side (still readable), matching brace-options B.
          const e = pose * pose * (3 - 2 * pose);
          const guardTuck = guarding ? 1 : 0;
          const back = rec * e + 6 * (1 - e) + 10 * guardTuck;
          let wRot = (1 - e) * 0.7 + 0.7 * guardTuck;
          const wScale = (0.9 + 0.1 * e) * (1 - 0.05 * guardTuck);
          const def = this.content.weapons.get(p.w);
          const prevP = f.a.players.find((q) => q.id === p.id);
          const swingRem =
            (p.sw ?? 0) > 0 || (prevP?.sw ?? 0) > 0 ? lerp(prevP?.sw ?? 0, p.sw ?? 0, f.t) : 0;
          const poseSwing = def ? swingPose(def, swingRem) : null;
          if (poseSwing && weaponDrawn(pose)) {
            wRot = poseSwing.angle;
            drawMeleeTrail(ctx, x, y, a, def!, poseSwing.u);
            meleeTrailMotes(this.particles, x, y, a, def!, poseSwing.u, f.dt);
            const impactAt = def!.meleeFx?.impactAt ?? 0.42;
            const prevU = this.swingProg.get(p.id) ?? 0;
            if (prevU < impactAt && poseSwing.u >= impactAt) {
              meleeImpactBurst(this.particles, x, y, a, def!, poseSwing.u);
              const shake = def!.meleeFx?.shake ?? 0;
              if (shake > 0) this.camera.addShake(shake);
            }
            this.swingProg.set(p.id, poseSwing.u);
          } else {
            this.swingProg.delete(p.id);
          }
          this.heldPose.set(p.id, {
            x,
            y,
            a,
            back,
            rot: wRot,
            scale: wScale,
            w: p.w,
          });
          if (weaponDrawn(pose)) {
            ctx.globalAlpha = e;
            this.assets.draw(
              ctx,
              held,
              0,
              x - Math.cos(a) * back + Math.sin(a) * 10 * guardTuck,
              y - Math.sin(a) * back - Math.cos(a) * 10 * guardTuck,
              a + wRot,
              wScale,
            );
            ctx.globalAlpha = 1;
          }
          if (pose < 1) this.drawRunningArms(ch, x, y, a, w.dist, 1 - pose);
          // Always draw stock `_top` (pauldrons/helmet). While guarding, offset a few px toward
          // the threat (perp to aim) so the leading shoulder reads as cover.
          if (guarding) {
            const lead = 6;
            const cA = Math.cos(a);
            const sA = Math.sin(a);
            this.assets.draw(
              ctx,
              `${body}_top`,
              0,
              x - sA * lead + cA * 2,
              y + cA * lead + sA * 2,
              bodyA,
            );
          } else {
            this.assets.draw(ctx, `${body}_top`, 0, x, y, bodyA);
          }
        } else {
          ctx.fillStyle = ch.primary;
          ctx.beginPath();
          ctx.arc(x, y, PLAYER.radius, 0, Math.PI * 2);
          ctx.fill();
          if (pose > 0) {
            ctx.strokeStyle = ch.trim;
            ctx.lineWidth = 5;
            ctx.globalAlpha = pose;
            const reach = guarding ? 14 : 26;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * reach * pose, y + Math.sin(a) * reach * pose);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
      if (p.id !== f.myId) {
        ctx.font = '600 12px Georgia, "Times New Roman", serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillText(p.name, x + 1, y - 37);
        ctx.fillStyle = color;
        ctx.fillText(p.name, x, y - 38);
      }
      if (p.st === 'alive') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - 18, y - 33, 36, 4);
        ctx.fillStyle = p.hp / p.mhp > 0.35 ? '#c8a64a' : '#d03030';
        ctx.fillRect(x - 18, y - 33, (36 * p.hp) / p.mhp, 4);
        if (p.ht !== undefined && p.ht > 0) {
          // plasma coil heat
          ctx.fillStyle = p.vt ? '#ff5030' : '#6fd8ff';
          ctx.fillRect(x - 18, y - 28, 36 * Math.min(1, p.ht), 2);
        }
        if (p.id === f.myId && f.me?.sprint) this.drawStaminaBar(f.me.sprint, x, y, time);
      }
    }
  }

  /** Cheap run pose: two armoured fists pumping alternately beside the torso. */
  private drawRunningArms(
    ch: ChapterDef,
    x: number,
    y: number,
    a: number,
    dist: number,
    k: number,
  ): void {
    const { ctx } = this;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const swing = Math.sin(dist / 7) * 7;
    ctx.globalAlpha = k;
    for (const side of [-1, 1]) {
      const fwd = 3 + swing * side;
      const px = x + c * fwd - s * 12 * side;
      const py = y + s * fwd + c * 12 * side;
      ctx.fillStyle = ch.primary;
      ctx.strokeStyle = ch.trim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Sprint feedback seen by everyone: kicked-up dust behind the boots and a faint afterimage
   * trailing the marine (subtle; no extra network data beyond the sprint flag).
   */
  private drawSprintTrail(p: PlayerSnap, x: number, y: number, a: number, dt: number): void {
    const { ctx } = this;
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (Math.random() < dt * 20)
      this.particles.spawn({
        x: x - c * 14 + (Math.random() - 0.5) * 14,
        y: y - s * 14 + (Math.random() - 0.5) * 14 + 6,
        vx: -c * 40 + (Math.random() - 0.5) * 24,
        vy: -s * 40 + (Math.random() - 0.5) * 24,
        maxLife: 0.5,
        size: 3.5,
        grow: 2.6,
        color: '#6b5a44',
        shape: 'smoke',
        additive: false,
      });
    const body = `marine_${this.content.chapter(p.c).id}`;
    for (const [k, alpha] of [
      [1, 0.16],
      [2, 0.07],
    ] as const) {
      ctx.globalAlpha = alpha;
      const gx = x - c * 11 * k;
      const gy = y - s * 11 * k;
      if (!this.assets.draw(ctx, body, 0, gx, gy, a)) {
        ctx.fillStyle = this.content.chapter(p.c).primary;
        ctx.beginPath();
        ctx.arc(gx, gy, PLAYER.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Local marine's sprint stamina: a thin bar under the boots, hidden while full and idle. */
  private drawStaminaBar(sp: SprintState, x: number, y: number, time: number): void {
    const max = MARINE_SPRINT.staminaMaxS;
    if (!sp.sprinting && sp.stamina >= max - 1e-6) return;
    const { ctx } = this;
    const frac = Math.max(0, Math.min(1, sp.stamina / max));
    const low = !sp.sprinting && sp.stamina < MARINE_SPRINT.minToStartS;
    const bx = x - 18;
    const by = y + 26;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, 38, 5);
    ctx.fillStyle = low
      ? `rgba(220,90,60,${0.65 + 0.35 * Math.sin(time * 10)})`
      : sp.sprinting
        ? '#f2e3b0'
        : '#9fc7e8';
    ctx.fillRect(bx, by, 36 * frac, 3);
    // restart threshold tick
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(bx + (36 * MARINE_SPRINT.minToStartS) / max, by - 1, 1, 5);
  }

  private isPlayerKind(kind: string): boolean {
    if (!this.playerProjKinds) {
      this.playerProjKinds = new Set();
      for (const w of this.content.weapons.values()) {
        this.playerProjKinds.add(w.projectile.kind);
        this.playerProjKinds.add(`${w.projectile.kind}_super`);
      }
    }
    return this.playerProjKinds.has(kind);
  }

  private drawProjectiles(f: RenderFrame): void {
    const { ctx } = this;
    const prev = new Map(f.a.projectiles.map((p) => [p[0], p]));
    const seen = new Set<number>();
    for (const p of f.b.projectiles) {
      const [id, kindIdx, bx, by, ang] = p;
      seen.add(id);
      const pa = prev.get(id);
      const simX = pa ? lerp(pa[2], bx, f.t) : bx;
      const simY = pa ? lerp(pa[3], by, f.t) : by;
      const kind = this.content.projectileKinds[kindIdx] ?? '';
      // Melee hits are a slash projectile; the visible arc is the weapon swing, not this blob.
      if (kind === 'slash' || kind.startsWith('slash')) continue;
      // Player shots: drawn leaving the visual barrel tip, blending into the sim path.
      let m = this.projMuzzle.get(id);
      if (m === undefined) {
        const shot = this.isPlayerKind(kind) ? this.matchShot(simX, simY) : null;
        m = shot
          ? {
              sx: shot.sx,
              sy: shot.sy,
              ox: shot.mx - shot.sx,
              oy: shot.my - shot.sy,
              mx: shot.mx,
              my: shot.my,
            }
          : null;
        this.projMuzzle.set(id, m);
      }
      let x = simX;
      let y = simY;
      if (m) {
        const k = muzzleBlend(Math.hypot(simX - m.sx, simY - m.sy));
        x += m.ox * k;
        y += m.oy * k;
        const tr = PROJECTILE_TRACERS[kind];
        if (tr) {
          // streak behind the shot, clipped at the barrel tip
          const len = Math.min(tr.len, Math.hypot(x - m.mx, y - m.my));
          if (len > 0.5) {
            const c = Math.cos(ang);
            const s = Math.sin(ang);
            const g = ctx.createLinearGradient(x - c * len, y - s * len, x, y);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, tr.color);
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = g;
            ctx.lineWidth = tr.width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x - c * len, y - s * len);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }
      const vis = PROJECTILE_VISUALS[kind] ?? DEFAULT_PROJECTILE_VISUAL;
      if (vis.trail > 0) {
        const acc = (this.trailAcc.get(id) ?? 0) + vis.trail * f.dt;
        let n = Math.floor(acc);
        this.trailAcc.set(id, acc - n);
        while (n-- > 0)
          this.particles.spawn({
            x: x + (Math.random() - 0.5) * 4,
            y: y + (Math.random() - 0.5) * 4,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 20,
            maxLife: 0.35,
            size: vis.trailShape === 'smoke' ? 5 : 2.5,
            grow: vis.trailShape === 'smoke' ? 3 : 0.3,
            color: vis.trailColor ?? vis.color,
            shape: vis.trailShape ?? 'dot',
            additive: vis.trailShape !== 'smoke',
          });
      }
      if (vis.glow) ctx.globalCompositeOperation = 'lighter';
      if (
        !this.assets.draw(
          ctx,
          `proj_${kind}`,
          Math.floor(this.time * 12 + id),
          x,
          y,
          ang,
          vis.scale ?? 1,
        )
      ) {
        ctx.fillStyle = vis.color;
        ctx.beginPath();
        ctx.arc(x, y, vis.fallbackRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const id of this.trailAcc.keys()) if (!seen.has(id)) this.trailAcc.delete(id);
    for (const id of this.projMuzzle.keys()) if (!seen.has(id)) this.projMuzzle.delete(id);
    this.pendingShots = this.pendingShots.filter((s) => this.time - s.t <= 0.4);
  }

  private drawParticles(): void {
    const { ctx } = this;
    for (const p of this.particles.list) {
      const t = 1 - p.life / p.maxLife;
      const size = p.size * (1 + (p.grow - 1) * t);
      ctx.globalAlpha = p.shape === 'smoke' ? 0.45 * (1 - t) : Math.min(1, (1 - t) * 1.5);
      ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      if (p.shape === 'sprite' && p.sprite) {
        const frames = this.assets.frameCount(p.sprite);
        if (
          frames &&
          this.assets.draw(
            ctx,
            p.sprite,
            Math.min(frames - 1, Math.floor(t * frames)),
            p.x,
            p.y,
            p.angle,
            size,
          )
        )
          continue;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 40 * size * (0.5 + t), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawVignette(): void {
    const { ctx, canvas } = this;
    if (!this.vignette) {
      const r = Math.hypot(canvas.width, canvas.height) / 2;
      const g = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        r * 0.45,
        canvas.width / 2,
        canvas.height / 2,
        r,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      this.vignette = g;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** Full-screen red flash when the local marine takes damage. */
  damageOverlay(amount: number): void {
    if (amount <= 0) return;
    const { ctx, canvas } = this;
    ctx.fillStyle = `rgba(200,0,0,${Math.min(0.35, amount)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  get pixelRatio(): number {
    return this.dpr;
  }
}

/**
 * How far the weapon is raised (0 = hidden, 1 = held): hidden while sprinting, fading in and
 * raising over the post-sprint weapon-ready delay. Pure (unit tested).
 */
export function weaponPose(sprinting: boolean, weaponDelay: number): number {
  if (sprinting) return 0;
  if (weaponDelay <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - weaponDelay / MARINE_SPRINT.weaponReadyDelayS));
}

/** v0.6.0 hotfix: the weapon sprite is drawn only when raised at all (never while sprinting). */
export const weaponDrawn = (pose: number): boolean => pose > 0;
