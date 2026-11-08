import {
  DECAL_VARIANTS,
  muzzleDef,
  weaponRolesLabel,
  type ContentRegistry,
  type GameEvent,
  type PlayerSnap,
} from '@sms/shared';
import type { AudioEngine } from '../audio/AudioEngine.js';
import type { Renderer } from '../render/Renderer.js';
import {
  DEFAULT_ENEMY_VISUAL,
  DEFAULT_WEAPON_VISUAL,
  ENEMY_VISUALS,
  WEAPON_VISUALS,
} from '../render/visuals.js';

export type NoticeKind = 'info' | 'good' | 'bad' | 'warn';

export interface FxContext {
  renderer: Renderer;
  audio: AudioEngine;
  content: ContentRegistry;
  myId: number;
  players: (id: number) => PlayerSnap | undefined;
  notify: (text: string, kind: NoticeKind) => void;
  /** Local damage flash intensity accumulator. */
  hurtFlash: (amount: number) => void;
}

/** Events about the local player are played on arrival (no interpolation delay) for responsiveness. */
export const isImmediate = (ev: GameEvent, myId: number): boolean =>
  (ev.e === 'shot' ||
    ev.e === 'hurt' ||
    ev.e === 'reload' ||
    ev.e === 'switch' ||
    ev.e === 'pickup' ||
    ev.e === 'unlock' ||
    ev.e === 'overheat') &&
  ev.p === myId;

/** Per-sound throttle so a heavy bolter stream / flamer wash doesn't saturate the mixer. */
const lastSfx = new Map<string, number>();
function throttled(key: string, ms: number): boolean {
  const now = performance.now();
  if (now - (lastSfx.get(key) ?? -1e9) < ms) return true;
  lastSfx.set(key, now);
  return false;
}

/** Projectile kind → impact sound, derived from weapon data (`sfx.impact`). */
let impactByKind: Map<string, string> | null = null;
let impactFor: ContentRegistry | null = null;
function impactSound(content: ContentRegistry, kind: string): string | undefined {
  if (impactFor !== content || !impactByKind) {
    impactFor = content;
    impactByKind = new Map();
    for (const w of content.weapons.values())
      if (w.sfx.impact) {
        impactByKind.set(w.projectile.kind, w.sfx.impact);
        impactByKind.set(`${w.projectile.kind}_super`, w.sfx.impact);
      }
  }
  return impactByKind.get(kind);
}

const decal = (prefix: string) => `decal_${prefix}_${Math.floor(Math.random() * DECAL_VARIANTS)}`;

/** Full width of the ricochet spark cone (radians, ~50°). */
const DEFLECT_CONE = 0.87;

/** Turns simulation events into particles, decals, sounds and HUD notices. */
export function playEvent(ev: GameEvent, fx: FxContext): void {
  const { renderer: r, audio, content } = fx;
  const P = r.particles;
  switch (ev.e) {
    case 'shot': {
      const w = content.weapons.get(ev.w);
      const vis = WEAPON_VISUALS[ev.w] ?? DEFAULT_WEAPON_VISUAL;
      const mine = ev.p === fx.myId;
      if (w?.sfx.loop)
        // held weapons (flamer): ignition → seamless roar while firing → tail on release
        audio.sustain(
          `held:${ev.p}`,
          { start: w.sfx.fire, loop: w.sfx.loop, end: w.sfx.end },
          ev.x,
          ev.y,
          mine ? 1 : 0.6,
        );
      else if (w)
        audio.play(ev.s && w.sfx.superFire ? w.sfx.superFire : w.sfx.fire, {
          x: ev.x,
          y: ev.y,
          volume: mine ? 1 : 0.6,
          priority: mine ? 8 : undefined,
        });
      // Visual barrel tip of the weapon as drawn (before this shot's recoil slide); falls back
      // to the sim muzzle (ev.x/ev.y, on the aim line) if the marine was not drawn yet.
      const tip = r.muzzleWorld(ev.p, ev.w) ?? { x: ev.x, y: ev.y, a: ev.a };
      const mx = tip.x;
      const my = tip.y;
      const dir = tip.a;
      r.registerShot(ev.x, ev.y, ev.a, mx, my);
      r.kick(ev.p, vis.recoil * (ev.s ? 1.6 : 1));
      if (ev.w === 'flamer') {
        P.burst(mx, my, 3, {
          speed: 70,
          dir,
          spread: 0.5,
          color: '#ffb050',
          maxLife: 0.22,
          size: 4,
          additive: true,
        });
        P.burst(mx, my, 1, {
          speed: 40,
          dir,
          color: '#3a2a20',
          maxLife: 0.9,
          size: 6,
          grow: 3,
          shape: 'smoke',
        });
      } else if (vis.muzzle > 0) {
        const big = ev.s ? 1.6 : 1;
        P.spawn({
          x: mx,
          y: my,
          shape: 'sprite',
          sprite: 'fx_muzzle',
          maxLife: 0.07,
          size: vis.muzzle * big,
          angle: dir,
          additive: true,
          drag: 0,
          color: vis.muzzleColor,
        });
        if (ev.w === 'plasma_gun' || ev.w === 'meltagun')
          P.burst(mx, my, ev.s ? 10 : 5, {
            speed: 120,
            dir,
            spread: 0.8,
            color: vis.muzzleColor,
            maxLife: 0.25,
            size: 2.5,
            additive: true,
          });
        if (vis.casing) {
          const side = dir + Math.PI / 2; // ejection port on the marine's right
          const breech = muzzleDef(ev.w).breech;
          P.spawn({
            x: mx - Math.cos(dir) * breech,
            y: my - Math.sin(dir) * breech,
            vx: Math.cos(side) * 130 + (Math.random() - 0.5) * 40,
            vy: Math.sin(side) * 130,
            maxLife: 0.55,
            size: ev.w === 'heavy_bolter' ? 2.2 : 1.7,
            color: '#c8962e',
            drag: 6,
          });
        }
      }
      if (mine && vis.shake) r.camera.addShake(vis.shake * (ev.s ? 1.8 : 1));
      break;
    }
    case 'hit': {
      // k = projectile kind that hit
      const k = ev.k;
      if (k === 'bolt' || k === 'heavy_bolt') {
        // mass-reactive: tiny detonation inside the target
        P.spawn({
          x: ev.x,
          y: ev.y,
          shape: 'sprite',
          sprite: 'fx_explosion',
          maxLife: 0.18,
          size: k === 'heavy_bolt' ? 0.38 : 0.26,
          additive: true,
          drag: 0,
          color: '#ffb050',
          angle: Math.random() * 6,
        });
      }
      const imp = impactSound(content, k);
      if (imp && !throttled(imp, k === 'slash' ? 70 : 45))
        audio.play(imp, { x: ev.x, y: ev.y, volume: k === 'slash' ? 0.8 : 0.5 });
      const color =
        k === 'deathspitter' || k === 'spore'
          ? '#9cff3a'
          : k === 'plasma' || k === 'plasma_super'
            ? '#7fe0ff'
            : k === 'melta' || k === 'flame'
              ? '#ff9040'
              : k === 'fleshborer'
                ? '#c08040'
                : '#7a1020';
      P.burst(ev.x, ev.y, 4, { speed: 160, color, maxLife: 0.35, size: 2.5, drag: 5 });
      P.burst(ev.x, ev.y, 2, {
        speed: 260,
        color: '#ffe0a0',
        maxLife: 0.12,
        size: 1.5,
        shape: 'spark',
        additive: true,
      });
      break;
    }
    case 'bnc': {
      // Armour bounced (the Tyranid made its save): a ricochet and a few white-hot sparks
      // glancing off. Deliberately no ring / marker on the enemy.
      if (!throttled('carapace_ricochet', 60))
        audio.play('carapace_ricochet', { x: ev.x, y: ev.y, volume: 0.55 });
      P.burst(ev.x, ev.y, 3, {
        speed: 320,
        color: '#fff2c0',
        maxLife: 0.14,
        size: 1.6,
        shape: 'spark',
        additive: true,
      });
      break;
    }
    case 'defl': {
      // Enemy shot glanced off a marine's front plate (`a` = ricochet direction). Kept small
      // and short so it reads on a phone without drowning the fight: a ~0.06 s pinpoint
      // flash, a tight ~50° cone of 5-7 sparks (white-hot core that burns out first, leaving
      // a yellow/orange tail; shrinking, quick drag, no gravity) and one faint streak for
      // the spent round. ~13 pooled particles per ricochet, no ring.
      if (!throttled('armour_deflect', 50))
        audio.play('carapace_ricochet', { x: ev.x, y: ev.y, volume: 0.8, rate: 1.35 });
      P.spawn({
        x: ev.x,
        y: ev.y,
        maxLife: 0.06,
        size: 2,
        grow: 0.5,
        additive: true,
        drag: 0,
        color: '#fffdf2',
      });
      const n = 5 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const a = ev.a + (Math.random() - 0.5) * DEFLECT_CONE;
        const sp = 240 + Math.random() * 200;
        const vx = Math.cos(a) * sp;
        const vy = Math.sin(a) * sp;
        const life = 0.15 + Math.random() * 0.13;
        // tail (yellow or orange), outlives the core
        P.spawn({
          x: ev.x,
          y: ev.y,
          vx,
          vy,
          maxLife: life,
          size: 1.5,
          grow: 0.3,
          drag: 5,
          color: i % 3 === 2 ? '#ff9a3c' : '#ffd25e',
          shape: 'spark',
          additive: true,
        });
        // white-hot core
        P.spawn({
          x: ev.x,
          y: ev.y,
          vx,
          vy,
          maxLife: life * 0.45,
          size: 1,
          grow: 0.6,
          drag: 5,
          color: '#fffbe6',
          shape: 'spark',
          additive: true,
        });
      }
      P.spawn({
        x: ev.x,
        y: ev.y,
        vx: Math.cos(ev.a) * 620,
        vy: Math.sin(ev.a) * 620,
        maxLife: 0.12,
        size: 1.1,
        grow: 0.5,
        drag: 2,
        color: '#7a5d33',
        shape: 'spark',
        additive: true,
      });
      break;
    }
    case 'die': {
      const def = content.enemies.get(ev.t);
      const vis = ENEMY_VISUALS[ev.t] ?? DEFAULT_ENEMY_VISUAL;
      const rad = def?.radius ?? 16;
      const big = rad > 24;
      if (def) audio.play(def.sfx.death, { x: ev.x, y: ev.y, volume: big ? 0.9 : 0.7 });
      P.burst(ev.x, ev.y, big ? 30 : 12, {
        speed: big ? 280 : 200,
        color: vis.ichor,
        maxLife: 0.6,
        size: big ? 4 : 3,
        drag: 4,
      });
      // chitin shards
      P.burst(ev.x, ev.y, big ? 10 : 4, {
        speed: 220,
        color: '#2a2440',
        maxLife: 0.5,
        size: 2,
        drag: 5,
      });
      r.addDecal(decal(def?.decal ?? 'blood'), ev.x, ev.y, Math.max(0.8, rad / 16) * 0.9);
      if (vis.deathShake) {
        const d = Math.hypot(ev.x - r.camera.x, ev.y - r.camera.y);
        r.camera.addShake(Math.max(0, vis.deathShake - d / 120));
      }
      break;
    }
    case 'boom': {
      if (ev.k === 'melta') {
        // Meltagun miss: a small heat flash where the beam runs out — white-hot core, a thin
        // orange heat ring, a red heat bloom, a few embers and a light scorch. No fireball, smoke or shake.
        const scale = ev.r / 64;
        audio.play('melta_impact', { x: ev.x, y: ev.y, volume: 0.45 });
        P.spawn({
          x: ev.x,
          y: ev.y,
          shape: 'sprite',
          sprite: 'fx_ring',
          maxLife: 0.28,
          size: scale * 0.35,
          grow: 3.2,
          additive: true,
          drag: 0,
          color: '#ff7040',
        });
        // heat bloom: stacked additive discs read as a soft red→orange gradient
        for (const [f, color, life] of [
          [0.6, '#4a1006', 0.34],
          [0.46, '#6a1c08', 0.3],
          [0.34, '#8a3010', 0.26],
        ] as const) {
          P.spawn({
            x: ev.x,
            y: ev.y,
            maxLife: life,
            size: ev.r * f,
            grow: 1.3,
            additive: true,
            drag: 0,
            color,
          });
        }
        P.spawn({
          x: ev.x,
          y: ev.y,
          maxLife: 0.2,
          size: ev.r * 0.18,
          additive: true,
          drag: 0,
          color: '#fff0c8',
        });
        P.burst(ev.x, ev.y, 9, {
          speed: 160,
          color: '#ffb070',
          maxLife: 0.45,
          size: 2,
          shape: 'spark',
          additive: true,
          drag: 4,
        });
        r.addDecal('decal_scorch_1', ev.x, ev.y, scale * 0.8, 0.6);
        break;
      }
      // bolt shells (r≈30) already have their impact crack; spore bursts squelch; frags boom
      if (ev.r >= 110) audio.play('explosion', { x: ev.x, y: ev.y });
      else if (ev.r >= 60) audio.play('nid_spore_burst', { x: ev.x, y: ev.y });
      const scale = ev.r / 64;
      P.spawn({
        x: ev.x,
        y: ev.y,
        shape: 'sprite',
        sprite: 'fx_explosion',
        maxLife: 0.45,
        size: scale * 1.3,
        additive: true,
        drag: 0,
        color: '#ff9030',
        angle: Math.random() * 6,
      });
      P.spawn({
        x: ev.x,
        y: ev.y,
        shape: 'sprite',
        sprite: 'fx_ring',
        maxLife: 0.3,
        size: scale * 0.5,
        grow: 4,
        additive: true,
        drag: 0,
        color: '#ffd080',
      });
      P.burst(ev.x, ev.y, Math.round(10 + 14 * Math.min(1, scale)), {
        speed: 520,
        color: '#ffc060',
        maxLife: 0.35,
        size: 2,
        shape: 'spark',
        additive: true,
        drag: 3,
      });
      P.burst(ev.x, ev.y, 10, {
        speed: 90,
        color: '#555',
        maxLife: 1.1,
        size: 10,
        grow: 2.5,
        shape: 'smoke',
        drag: 2,
      });
      r.addDecal('decal_scorch_0', ev.x, ev.y, scale, 0.7);
      // small blasts (spore mines, frag fragments) don't rattle the camera
      if (ev.r >= 60) {
        const d = Math.hypot(ev.x - r.camera.x, ev.y - r.camera.y);
        r.camera.addShake(Math.max(0, Math.min(10, ev.r / 9) - d / 70));
      }
      break;
    }
    case 'spit': {
      const def = ev.t ? content.enemies.get(ev.t) : undefined;
      audio.play(def?.sfx.attack ?? 'nid_spit', { x: ev.x, y: ev.y, volume: 0.55 });
      P.burst(ev.x, ev.y, 5, {
        speed: 90,
        color: ev.t === 'termagant' ? '#c08040' : '#9cff3a',
        maxLife: 0.3,
        size: 2.5,
        additive: ev.t !== 'termagant',
      });
      break;
    }
    case 'crash':
      fx.notify('⚠ OKRĘT IMPERIUM SPADA — zejdź z czerwonego kręgu!', 'warn');
      audio.play('explosion', { x: ev.x, y: ev.y, volume: 0.3 });
      break;
    case 'crashHit': {
      audio.play('explosion', { x: ev.x, y: ev.y });
      P.burst(ev.x, ev.y, 40, {
        speed: 380,
        color: '#ffa030',
        maxLife: 0.9,
        size: 5,
        additive: true,
      });
      P.burst(ev.x, ev.y, 24, { speed: 160, color: '#3a3430', maxLife: 1.6, size: 9 });
      const d = Math.hypot(ev.x - r.camera.x, ev.y - r.camera.y);
      r.camera.addShake(Math.max(0, 14 - d / 80));
      break;
    }
    case 'allies':
      if (ev.n > 0)
        fx.notify(`Ocaleni Gwardziści (${ev.n}) bronią wraku — po fali pójdą z wami`, 'good');
      break;
    case 'adie':
      P.burst(ev.x, ev.y, 8, { speed: 120, color: '#8a1010', maxLife: 0.5, size: 3 });
      break;
    case 'acid': {
      P.burst(ev.x, ev.y, 6 + Math.round(ev.r / 8), {
        speed: 60 + ev.r,
        color: '#b8ff3a',
        maxLife: 0.45,
        size: 3,
        additive: true,
      });
      break;
    }
    case 'bite': {
      const p = fx.players(ev.p);
      const def = ev.t ? content.enemies.get(ev.t) : undefined;
      if (p) audio.play(def?.sfx.attack ?? 'nid_slash', { x: p.x, y: p.y, volume: 0.6 });
      break;
    }
    case 'overheat': {
      const p = fx.players(ev.p);
      if (p) {
        audio.play('overheat', { x: p.x, y: p.y, volume: ev.p === fx.myId ? 1 : 0.6 });
        P.burst(p.x, p.y, 14, {
          speed: 80,
          color: '#cfefff',
          maxLife: 1,
          size: 6,
          grow: 3,
          shape: 'smoke',
          drag: 2,
        });
        P.burst(p.x, p.y, 10, {
          speed: 240,
          color: '#7fe0ff',
          maxLife: 0.3,
          size: 1.5,
          shape: 'spark',
          additive: true,
        });
      }
      if (ev.p === fx.myId) {
        fx.notify('PLASMA OVERHEAT — coils venting!', 'bad');
        r.camera.addShake(4);
      }
      break;
    }
    case 'emerge': {
      const def = content.enemies.get(ev.t);
      audio.play(def?.sfx.roar ?? 'nid_emerge', { x: ev.x, y: ev.y });
      P.burst(ev.x, ev.y, 18, { speed: 200, color: '#5a4a38', maxLife: 0.7, size: 3, drag: 4 });
      P.burst(ev.x, ev.y, 8, {
        speed: 70,
        color: '#4a3e30',
        maxLife: 1.2,
        size: 9,
        grow: 2.5,
        shape: 'smoke',
        drag: 2,
      });
      r.addDecal('decal_scorch_1', ev.x, ev.y, 0.8, 0.6);
      const d = Math.hypot(ev.x - r.camera.x, ev.y - r.camera.y);
      r.camera.addShake(Math.max(0, 5 - d / 100));
      break;
    }
    case 'charge': {
      const def = content.enemies.get(ev.t);
      // wind-up starts: crouch hiss (gaunts) / rearing roar (Carnifex)
      const key = def?.sfx.windup ?? def?.sfx.roar;
      if (key) audio.play(key, { x: ev.x, y: ev.y, priority: 8 });
      if ((def?.radius ?? 0) > 24) {
        const d = Math.hypot(ev.x - r.camera.x, ev.y - r.camera.y);
        r.camera.addShake(Math.max(0, 5 - d / 140));
      }
      break;
    }
    case 'leap': {
      const def = content.enemies.get(ev.t);
      if (def?.sfx.leap) audio.play(def.sfx.leap, { x: ev.x, y: ev.y, priority: 7 });
      const big = (def?.radius ?? 0) > 24;
      P.burst(ev.x, ev.y, big ? 16 : 7, {
        speed: big ? 150 : 90,
        color: '#5a4a38',
        maxLife: 0.6,
        size: big ? 7 : 4,
        grow: 2,
        shape: 'smoke',
        drag: 3,
      });
      if (big) {
        const d = Math.hypot(ev.x - r.camera.x, ev.y - r.camera.y);
        r.camera.addShake(Math.max(0, 7 - d / 120));
      }
      break;
    }
    case 'boss': {
      const def = content.enemies.get(ev.t);
      audio.play('boss_horn');
      fx.notify(`☠ A ${def?.name ?? 'monster'} approaches!`, 'warn');
      r.camera.addShake(5);
      break;
    }
    case 'hurt': {
      const p = fx.players(ev.p);
      if (!p) break;
      P.burst(p.x, p.y, 6, { speed: 150, color: '#c01818', maxLife: 0.4, size: 2.5 });
      if (!throttled(`armour:${ev.p}`, 90))
        audio.play('armour_hit', { x: p.x, y: p.y, volume: ev.p === fx.myId ? 0.9 : 0.5 });
      if (ev.p === fx.myId) {
        if (!throttled('player_hurt', 380) && ev.d >= 3) audio.play('player_hurt', { volume: 0.8 });
        fx.hurtFlash(Math.min(0.35, ev.d / 60));
        r.camera.addShake(Math.min(8, ev.d / 3));
      }
      break;
    }
    case 'down': {
      const p = fx.players(ev.p);
      audio.play('player_down', p ? { x: p.x, y: p.y } : {});
      fx.notify(
        ev.p === fx.myId
          ? 'You are DOWN — wait for a revive!'
          : `${p?.name ?? 'A marine'} is down! Stand next to them to revive.`,
        'bad',
      );
      break;
    }
    case 'revive': {
      const p = fx.players(ev.p);
      const by = fx.players(ev.by);
      audio.play('revive', p ? { x: p.x, y: p.y } : {});
      if (p)
        P.burst(p.x, p.y, 20, {
          speed: 180,
          color: '#6fff8a',
          maxLife: 0.6,
          size: 3,
          additive: true,
        });
      fx.notify(`${p?.name ?? 'Marine'} revived by ${by?.name ?? 'a teammate'}`, 'good');
      break;
    }
    case 'dead': {
      const p = fx.players(ev.p);
      fx.notify(
        ev.p === fx.myId ? 'You died. Spectating…' : `${p?.name ?? 'A marine'} has fallen.`,
        'bad',
      );
      break;
    }
    case 'unlock': {
      if (ev.p !== fx.myId) break;
      const w = content.weapons.get(ev.w);
      audio.play('unlock');
      fx.notify(
        `${w?.name ?? ev.w} unlocked — press ${w?.slot ?? '?'}${w ? ` · ${weaponRolesLabel(w)}` : ''}`,
        'good',
      );
      break;
    }
    case 'pickup': {
      const p = fx.players(ev.p);
      audio.play('pickup', p ? { x: p.x, y: p.y } : {});
      if (ev.p === fx.myId) {
        if (ev.k === 'medkit') fx.notify('+ Medicae kit', 'good');
        else {
          const w = content.weapons.get(ev.w ?? '');
          fx.notify(
            `${w?.name ?? 'Weapon'} acquired${w ? ` — ${weaponRolesLabel(w)}` : ' — ammo refilled'}`,
            'good',
          );
        }
      }
      break;
    }
    case 'crate':
      audio.play('crate_drop');
      fx.notify('Supply crate dropped! (see minimap)', 'info');
      P.burst(ev.x, ev.y, 16, {
        speed: 120,
        color: '#ffd060',
        maxLife: 0.8,
        size: 3,
        additive: true,
      });
      break;
    case 'surge':
      audio.play('surge');
      fx.notify(
        ev.f
          ? `⚠ WAVE ${ev.n} — the Hive will not wait! The swarm descends!`
          : `⚠ WAVE ${ev.n}${ev.total ? ` — ${ev.total} xenos` : ''} — the swarm descends!`,
        'warn',
      );
      r.camera.addShake(6);
      break;
    case 'cleared':
      audio.play('wave_cleared');
      fx.notify(`✠ WAVE ${ev.n} CLEARED — next wave in ${Math.ceil(ev.next)}s`, 'info');
      break;
    case 'hunt':
      audio.play('nid_shriek', { volume: 0.7 });
      fx.notify(`☠ The last ${ev.n} xenos are hunting you!`, 'warn');
      break;
    case 'reload': {
      const p = fx.players(ev.p);
      const w = content.weapons.get(ev.w);
      if (w)
        audio.play(w.sfx.reload, p ? { x: p.x, y: p.y, volume: ev.p === fx.myId ? 1 : 0.5 } : {});
      break;
    }
    case 'switch':
      if (ev.p === fx.myId) audio.play('ui_click', { volume: 0.5 });
      break;
    case 'breach':
      // wave telegraph: deliberately silent and invisible, the swarm's direction is a surprise
      break;
    case 'swarm': {
      const sp = content.director.spawnPoints[ev.i];
      if (!sp) break;
      audio.play('breach_burst', { x: sp.x, y: sp.y, volume: Math.min(1.2, 0.6 + ev.n * 0.05) });
      P.burst(sp.x, sp.y, 18 + Math.min(30, ev.n * 2), {
        speed: 200,
        color: '#6a4a3a',
        maxLife: 0.9,
        size: 4,
        drag: 3,
      });
      r.addDecal(decal('acid'), sp.x, sp.y, 1.4);
      break;
    }
    case 'brace': {
      const p = fx.players(ev.p);
      const w = content.weapons.get(ev.w);
      if (w?.sfx.brace)
        audio.play(w.sfx.brace, p ? { x: p.x, y: p.y, volume: ev.p === fx.myId ? 0.9 : 0.4 } : {});
      if (p)
        P.burst(p.x, p.y + 10, 8, { speed: 60, color: '#8a8070', maxLife: 0.5, size: 3, drag: 4 });
      break;
    }
  }
}
