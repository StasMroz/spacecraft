import { RECOIL_WIRE } from '../data/recoil.js';
import { round } from '../math/vec.js';
import { remainingEnemies } from './systems/director.js';
import { isBraced } from './systems/weapons.js';
import type { Enemy, Player, PlayerState, World } from './types.js';
import type { GameEvent, PickupKind } from './types.js';
import type { WallDef } from '../maps/types.js';

/** Per-player data sent every tick. */
export interface PlayerSnap {
  id: number;
  name: string;
  c: number;
  x: number;
  y: number;
  a: number;
  hp: number;
  mhp: number;
  st: PlayerState;
  w: string;
  ws: string[];
  ammo: number;
  /** Reload seconds remaining (0 = not reloading). */
  rl: number;
  /** Bleed-out seconds remaining while downed. */
  bo: number;
  rv: number;
  seq: number;
  k: number;
  /** Heat of the current weapon as a fraction 0..1 (heat weapons only). */
  ht?: number;
  /** Venting after an overheat (rl counts down the vent). */
  vt?: 1;
  /** Personal score (sum of kill points). */
  sc: number;
  /** Braced (bracing weapon equipped, standing still long enough). */
  br?: 1;
  /** Aim recoil offset (rad, 1/2000 steps; omitted when 0). The `a` above already includes it. */
  rc?: number;
  /** Sprinting (v0.5.3-dev; optional so v5 peers without it still decode). */
  sp?: 1;
  /** Sprint stamina in seconds (0..MARINE_SPRINT.staminaMaxS). Absent from older hosts. */
  stm?: number;
  /** Seconds until the weapon is ready again after a sprint (absent/0 = ready). */
  wd?: number;
  /** Defensive stance (guard) active. Optional so older peers ignore it. */
  gd?: 1;
  /** Melee swing remaining in seconds (omitted when idle). JSON fallback while set. */
  sw?: number;
}

/** Spawn point state in Snapshot.sp: idle, telegraphing (about to emerge), active (emerging). */
export const BREACH_STATE = { idle: 0, telegraph: 1, active: 2 } as const;

/** Bit flags in EnemySnap[6]. */
export const ENEMY_FLAG = {
  fuse: 1,
  synapse: 2,
  burrowed: 4,
  windup: 8,
  dashing: 16,
  attacking: 32,
  /** End-of-wave hunt: closing in faster (not marked on the HUD). */
  hunt: 64,
  /** Inside a Psychophage Bio-stimulus aura. */
  stim: 128,
} as const;

/** Finite-wave status. */
export interface WaveSnap {
  /** Enemies of the wave still to kill (alive + telegraphing + not yet sent). */
  r: number;
  /** Enemies in the wave so far (children included). */
  t: number;
  /** 1 = wave in progress, 0 = breather / countdown to the next wave. */
  a: 0 | 1;
  /** Breather: seconds until the next wave. */
  nx?: number;
  /** Stragglers hunting (not marked on the HUD). */
  h?: 1;
}

/** [id, enemyTypeIndex, x, y, angle, hp% (0-100), flags (ENEMY_FLAG bits)] */
export type EnemySnap = [number, number, number, number, number, number, number];
/** [id, projectileKindIndex, x, y, angle] */
export type ProjectileSnap = [number, number, number, number, number];

export interface PickupSnap {
  id: number;
  k: PickupKind;
  w?: string;
  x: number;
  y: number;
  life: number;
}

/** Acid on the floor: [id, x, y, radius, life s, duration s] (x/y/life 0.1 steps). */
export type AcidSnap = [number, number, number, number, number, number];

/** Guardsman: [id, x, y, aim, hp% (0-100), follows a marine (1) or holds the wreck (0)]. */
export type AllySnap = [number, number, number, number, number, number];
/** Crash in progress: [x, y, phase (1 falling, 2 smoking), seconds left, from-angle]. */
export type CrashSnap = [number, number, number, number, number];
/** Wreck wall: [x, y, w, h, kind (0 low, 1 full)]. */
export type WreckSnap = [number, number, number, number, number];

export interface Snapshot {
  tick: number;
  time: number;
  wave: number;
  wv: WaveSnap;
  over: boolean;
  players: PlayerSnap[];
  enemies: EnemySnap[];
  projectiles: ProjectileSnap[];
  pickups: PickupSnap[];
  /** Acid pools (optional so a JSON snapshot without it still reads). */
  ac?: AcidSnap[];
  /** Guardsmen (crash survivors). */
  al?: AllySnap[];
  cr?: CrashSnap;
  /** Wreck walls added this run (clients add them to the map walls). */
  wk?: WreckSnap[];
  /** BREACH_STATE per director spawn point (content.director.spawnPoints order). */
  sp: number[];
  events: GameEvent[];
  /** Mission + extract + objectives (protocol v10). */
  mi: MissionSnap;
  /** Reinforcement budget and falling pods (protocol v10). */
  rf: ReinforceSnap;
}

export interface MissionTargetSnap {
  id: number;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
}

export interface MissionSnap {
  id: string;
  /** Remaining seconds; -1 = no clock. Tenths. */
  tl: number;
  eo: 0 | 1;
  ep: number;
  ex: number;
  ey: number;
  er: number;
  tg: MissionTargetSnap[];
  /** Relic on the ground or carried (rc = player id, 0 = on ground). Absent = no relic. */
  rx?: number;
  ry?: number;
  rr?: number;
  rc?: number;
  /** 0 running, 1 victory, 2 defeat. */
  out: 0 | 1 | 2;
}

export interface ReinforceSnap {
  left: number;
  cd: number;
  pods: Array<[number, number, number, number, number]>; // id, playerId, x, y, t
}

export function breachStates(world: World): number[] {
  const st = world.director;
  return world.content.director.spawnPoints.map((_, i) =>
    st.queue.some((q) => q.point === i)
      ? BREACH_STATE.telegraph
      : (st.activeUntil[i] ?? -1) > world.time
        ? BREACH_STATE.active
        : BREACH_STATE.idle,
  );
}

export function waveSnap(world: World): WaveSnap {
  const st = world.director;
  const active = st.phase === 'active';
  return {
    r: remainingEnemies(world),
    t: st.waveTotal,
    a: active ? 1 : 0,
    ...(active ? {} : { nx: round(Math.max(0, st.nextWaveAt - world.time), 1) }),
    ...(st.hunting ? { h: 1 as const } : {}),
  };
}

function sprintFields(p: Player): { sp?: 1; stm: number; wd?: number } {
  const out: { sp?: 1; stm: number; wd?: number } = { stm: round(p.sprint.stamina, 2) };
  if (p.sprint.sprinting) out.sp = 1;
  if (p.sprint.weaponDelay > 0) out.wd = round(p.sprint.weaponDelay, 2);
  return out;
}

function recoilFields(p: Player): { rc?: number } {
  const rc = Math.round(p.recoil * RECOIL_WIRE.scale) / RECOIL_WIRE.scale;
  return rc !== 0 ? { rc } : {};
}

function heatFields(world: World, p: Player): { ht?: number; vt?: 1 } {
  const heat = world.content.weapon(p.current).heat;
  if (!heat) return {};
  const out: { ht?: number; vt?: 1 } = { ht: round((p.heat[p.current] ?? 0) / heat.max, 2) };
  if (p.venting) out.vt = 1;
  return out;
}

export function enemyFlags(e: Enemy): number {
  let f = 0;
  if (e.fuse >= 0) f |= ENEMY_FLAG.fuse;
  if (e.synSpeed > 1) f |= ENEMY_FLAG.synapse;
  if (e.burrowed) f |= ENEMY_FLAG.burrowed;
  if (e.chargePhase === 1) f |= ENEMY_FLAG.windup;
  if (e.chargePhase === 2) f |= ENEMY_FLAG.dashing;
  if (e.attackAnim > 0) f |= ENEMY_FLAG.attacking;
  if (e.hunt) f |= ENEMY_FLAG.hunt;
  if ((e.stimTaken ?? 1) < 1) f |= ENEMY_FLAG.stim;
  return f;
}

export function buildSnapshot(world: World, bleedOutTime: number): Snapshot {
  const c = world.content;
  return {
    tick: world.tick,
    time: round(world.time, 3),
    wave: world.director.wave,
    wv: waveSnap(world),
    over: world.over,
    players: world.players.map((p) => ({
      id: p.id,
      name: p.name,
      c: p.chapter,
      x: round(p.x, 2),
      y: round(p.y, 2),
      a: round(p.aim, 2),
      hp: Math.ceil(p.hp),
      mhp: p.maxHp,
      st: p.state,
      w: p.current,
      ws: p.weapons,
      ammo: p.ammo[p.current],
      rl: round(p.reloadTimer, 2),
      bo: p.state === 'downed' ? round(bleedOutTime - p.downedTime, 1) : 0,
      rv: round(p.reviveProgress, 2),
      seq: p.lastInputSeq,
      k: p.kills,
      sc: p.score,
      ...(isBraced(p, c.weapon(p.current)) ? { br: 1 as const } : {}),
      ...(p.guarding ? { gd: 1 as const } : {}),
      ...heatFields(world, p),
      ...sprintFields(p),
      ...recoilFields(p),
      ...(p.swing > 0 ? { sw: round(p.swing, 2) } : {}),
    })),
    enemies: world.enemies.map((e) => [
      e.id,
      c.enemyIds.indexOf(e.type),
      round(e.x),
      round(e.y),
      round(e.angle, 2),
      Math.max(0, Math.round((e.hp / e.maxHp) * 100)),
      enemyFlags(e),
    ]),
    projectiles: world.projectiles.map((p) => [
      p.id,
      c.projectileKinds.indexOf(p.kind),
      round(p.x),
      round(p.y),
      round(Math.atan2(p.vy, p.vx), 2),
    ]),
    pickups: world.pickups.map((p) => ({
      id: p.id,
      k: p.kind,
      w: p.weapon,
      x: round(p.x),
      y: round(p.y),
      life: round(p.life, 1),
    })),
    ac: world.acid.map((a) => [
      a.id,
      round(a.x),
      round(a.y),
      a.r,
      round(Math.max(0, a.life), 1),
      a.duration,
    ]),
    al: world.allies.map((a) => [
      a.id,
      round(a.x),
      round(a.y),
      round(a.aim, 2),
      Math.max(0, Math.round((a.hp / a.maxHp) * 100)),
      a.follow ? 1 : 0,
    ]),
    ...(world.crash
      ? {
          cr: [
            round(world.crash.x),
            round(world.crash.y),
            world.crash.phase === 'fall' ? 1 : 2,
            round(Math.max(0, world.crash.t), 1),
            round(world.crash.from, 2),
          ] as CrashSnap,
        }
      : {}),
    wk: world.wreck.map((w) => [w.x, w.y, w.w, w.h, w.kind === 'full' ? 1 : 0]),
    sp: breachStates(world),
    events: world.events,
    mi: missionSnap(world),
    rf: reinforceSnap(world),
  };
}

function missionSnap(world: World): MissionSnap {
  const m = world.mission;
  const tl = m.timeLimit === null ? -1 : round(Math.max(0, m.timeLimit - world.time), 1);
  const out: MissionSnap = {
    id: m.id,
    tl,
    eo: m.extractOpen ? 1 : 0,
    ep: round(m.extractProgress, 1),
    ex: round(m.extractX),
    ey: round(m.extractY),
    er: round(m.extractR),
    tg: m.targets.map((t) => ({
      id: t.id,
      x: round(t.x),
      y: round(t.y),
      r: t.r,
      hp: Math.max(0, Math.round(t.hp)),
      maxHp: t.maxHp,
    })),
    out: m.outcome === 'victory' ? 1 : m.outcome === 'defeat' ? 2 : 0,
  };
  if (m.relicX !== undefined && m.relicY !== undefined && m.relicR !== undefined) {
    out.rx = round(m.relicX);
    out.ry = round(m.relicY);
    out.rr = m.relicR;
    out.rc = m.relicCarrier ?? 0;
  }
  return out;
}

function reinforceSnap(world: World): ReinforceSnap {
  const rf = world.reinforce;
  return {
    left: rf.left,
    cd: round(rf.cooldown, 1),
    pods: rf.pods.map((p) => [p.id, p.playerId, round(p.x), round(p.y), round(p.t, 1)]),
  };
}

const wreckCache = new WeakMap<readonly WallDef[], { n: number; walls: readonly WallDef[] }>();

/** The map's walls plus the snapshot's wreck walls (wrecks only ever grow; cached by count). */
export function snapWalls(
  base: readonly WallDef[],
  wk: readonly WreckSnap[] | undefined,
): readonly WallDef[] {
  if (!wk?.length) return base;
  const c = wreckCache.get(base);
  if (c && c.n === wk.length) return c.walls;
  const walls = [
    ...base,
    ...wk.map(([x, y, w, h, k]): WallDef => ({ x, y, w, h, kind: k ? 'full' : 'low' })),
  ];
  wreckCache.set(base, { n: wk.length, walls });
  return walls;
}
