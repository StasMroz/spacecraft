import { getMission, type MissionDef } from '../../data/missions.js';
import { clamp, dist, dist2 } from '../../math/vec.js';
import type { MissionState, MissionTarget, World } from '../types.js';

export const EXTRACT_RADIUS = 90;
export const TARGET_RADIUS = 36;

type Landmark = {
  extract: [number, number];
  targets?: [number, number][];
  relic?: [number, number];
};

/** Hand-placed landmarks per map so extract / objectives sit in open, readable spots. */
const LANDMARKS: Record<string, Landmark> = {
  wave: {
    extract: [2700, 400],
    targets: [
      [700, 400],
      [2600, 1800],
      [500, 1700],
    ],
    relic: [700, 400],
  },
  jungle: {
    extract: [2500, 1700],
    targets: [
      [500, 1650],
      [2550, 450],
      [2500, 1700],
    ],
  },
  ice: { extract: [2700, 1800], relic: [600, 450] },
  hulk: { extract: [2700, 1100] },
};

function circleHitsWall(world: World, x: number, y: number, r: number): boolean {
  for (const w of world.map.walls) {
    const cx = clamp(x, w.x, w.x + w.w);
    const cy = clamp(y, w.y, w.y + w.h);
    if (dist2(x, y, cx, cy) < r * r) return true;
  }
  return false;
}

function place(world: World, x: number, y: number, r: number): { x: number; y: number } {
  const { width, height } = world.map.arena;
  const pad = r + 20;
  const px = clamp(x, pad, width - pad);
  const py = clamp(y, pad, height - pad);
  if (!circleHitsWall(world, px, py, r)) return { x: px, y: py };
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const d = 80 + (i % 6) * 40;
    const nx = clamp(px + Math.cos(a) * d, pad, width - pad);
    const ny = clamp(py + Math.sin(a) * d, pad, height - pad);
    if (!circleHitsWall(world, nx, ny, r)) return { x: nx, y: ny };
  }
  return { x: px, y: py };
}

export function initMission(world: World, missionId: string): MissionState {
  const def = getMission(missionId);
  const marks = LANDMARKS[def.map] ?? LANDMARKS.wave!;
  const ex = place(world, marks.extract[0], marks.extract[1], EXTRACT_RADIUS);
  const targets: MissionTarget[] = [];
  if (def.kind === 'destroy' && def.targets && def.targetHp) {
    const pts = marks.targets ?? [];
    for (let i = 0; i < def.targets; i++) {
      const raw = pts[i] ?? [
        world.map.arena.width * (0.2 + 0.3 * (i % 3)),
        world.map.arena.height * (0.25 + 0.3 * Math.floor(i / 3)),
      ];
      const p = place(world, raw[0], raw[1], TARGET_RADIUS);
      targets.push({
        id: world.nextId++,
        x: p.x,
        y: p.y,
        r: TARGET_RADIUS,
        hp: def.targetHp,
        maxHp: def.targetHp,
      });
    }
  }
  let relicX: number | undefined;
  let relicY: number | undefined;
  if (def.kind === 'retrieve' && def.relic) {
    const raw = marks.relic ?? [world.map.arena.width * 0.2, world.map.arena.height * 0.2];
    const p = place(world, raw[0], raw[1], def.relic.radius + 8);
    relicX = p.x;
    relicY = p.y;
  }
  return {
    id: def.id,
    kind: def.kind,
    timeLimit: def.timeLimit,
    extractOpensAt: def.extractOpensAt,
    extractWindow: def.extractWindow,
    extractHold: def.extractHold,
    extractX: ex.x,
    extractY: ex.y,
    extractR: EXTRACT_RADIUS,
    extractOpen: def.extractOpensAt === 0,
    extractProgress: 0,
    crates: def.crates,
    crash: def.crash,
    targets,
    relicX,
    relicY,
    relicR: def.relic?.radius,
    relicCarryMul: def.relic?.carryMul,
    relicCarrier: def.kind === 'retrieve' ? null : undefined,
    outcome: undefined,
  };
}

export const missionDefOf = (world: World): MissionDef => getMission(world.mission.id);

export function relicCarryMul(world: World, playerId: number): number {
  const m = world.mission;
  if (m.relicCarrier !== playerId) return 1;
  return m.relicCarryMul ?? 1;
}

export function livingPlayers(world: World) {
  return world.players.filter((p) => p.state === 'alive');
}

export function allLivingInExtract(world: World, requireCarrier = false): boolean {
  const m = world.mission;
  const living = livingPlayers(world);
  if (living.length === 0) return false;
  if (requireCarrier && m.relicCarrier == null) return false;
  const r2 = m.extractR * m.extractR;
  for (const p of living) {
    if (dist2(p.x, p.y, m.extractX, m.extractY) > r2) return false;
  }
  if (requireCarrier) {
    const c = world.players.find((p) => p.id === m.relicCarrier);
    if (!c || c.state !== 'alive') return false;
  }
  return true;
}

export function damageObjective(world: World, target: MissionTarget, amount: number): void {
  if (target.hp <= 0 || amount <= 0) return;
  target.hp = Math.max(0, target.hp - amount);
  world.events.push({ e: 'obj', x: Math.round(target.x), y: Math.round(target.y) });
  if (target.hp <= 0)
    world.events.push({ e: 'objd', x: Math.round(target.x), y: Math.round(target.y) });
}

/** Called from projectiles / explosions: damage every live target the circle overlaps. */
export function damageObjectivesAt(
  world: World,
  x: number,
  y: number,
  r: number,
  amount: number,
): void {
  if (amount <= 0) return;
  for (const t of world.mission.targets) {
    if (t.hp <= 0) continue;
    if (dist(x, y, t.x, t.y) <= r + t.r) damageObjective(world, t, amount);
  }
}

function dropRelic(world: World, pId: number): void {
  const m = world.mission;
  if (m.relicCarrier !== pId) return;
  const p = world.players.find((x) => x.id === pId);
  m.relicCarrier = null;
  if (p) {
    m.relicX = p.x;
    m.relicY = p.y;
  }
}

function tryPickupRelic(world: World): void {
  const m = world.mission;
  if (m.relicCarrier !== null || m.relicX === undefined || m.relicY === undefined || !m.relicR)
    return;
  const r2 = (m.relicR + 18) * (m.relicR + 18);
  let best: { id: number; d: number } | null = null;
  for (const p of livingPlayers(world)) {
    const d = dist2(p.x, p.y, m.relicX, m.relicY);
    if (d <= r2 && (!best || d < best.d)) best = { id: p.id, d };
  }
  if (best) {
    m.relicCarrier = best.id;
    world.events.push({ e: 'relic', p: best.id });
  }
}

export function bossDown(world: World): boolean {
  const id = world.mission.bossId;
  if (id == null) return true;
  const b = world.enemies.find((e) => e.id === id);
  return !b || b.dead;
}

function extractEligible(world: World): boolean {
  const m = world.mission;
  if (m.kind === 'endless') return false;
  if (m.kind === 'destroy' && m.targets.some((t) => t.hp > 0)) return false;
  if (m.kind === 'retrieve' && m.relicCarrier == null) return false;
  if (!bossDown(world)) return false;
  return m.extractHold > 0;
}

function refreshExtractOpen(world: World): void {
  const m = world.mission;
  if (m.kind === 'endless' || m.extractHold <= 0) {
    m.extractOpen = false;
    return;
  }
  if (m.kind === 'destroy' && m.targets.some((t) => t.hp > 0)) {
    m.extractOpen = false;
    return;
  }
  if (!bossDown(world)) {
    m.extractOpen = false;
    return;
  }
  if (m.extractOpensAt === null && (m.kind === 'destroy' || m.bossId != null)) {
    // Opens once the last nest dies / the hunt target is down.
    m.extractOpen = true;
    return;
  }
  const opens = m.extractOpensAt ?? 0;
  if (world.time < opens) {
    m.extractOpen = false;
    return;
  }
  if (m.extractWindow !== null && world.time > opens + m.extractWindow) {
    // Window closed: still "open" if the squad is currently holding, else stay closed.
    m.extractOpen = m.extractProgress > 0;
    return;
  }
  m.extractOpen = true;
}

function inLastChance(world: World): boolean {
  const m = world.mission;
  if (m.timeLimit === null) return false;
  return world.time >= m.timeLimit && m.extractOpen && m.extractProgress > 0;
}

function fail(world: World): void {
  if (world.over) return;
  world.mission.outcome = 'defeat';
  world.over = true;
  world.events.push({ e: 'fail' });
}

function win(world: World): void {
  if (world.over) return;
  world.mission.outcome = 'victory';
  world.over = true;
  world.events.push({ e: 'win' });
}

export function updateMission(world: World, dt: number): void {
  const m = world.mission;
  if (m.outcome) return;

  // Relic follows the carrier; drop if they go down or die.
  if (m.kind === 'retrieve') {
    if (m.relicCarrier != null) {
      const c = world.players.find((p) => p.id === m.relicCarrier);
      if (!c || c.state !== 'alive') dropRelic(world, m.relicCarrier);
      else {
        m.relicX = c.x;
        m.relicY = c.y;
      }
    } else {
      tryPickupRelic(world);
    }
  }

  refreshExtractOpen(world);

  if (m.extractOpen && extractEligible(world) && allLivingInExtract(world, m.kind === 'retrieve')) {
    m.extractProgress = Math.min(m.extractHold, m.extractProgress + dt);
    if (m.extractProgress >= m.extractHold) {
      win(world);
      return;
    }
  } else if (m.extractProgress > 0) {
    m.extractProgress = Math.max(0, m.extractProgress - dt * 0.5);
  }

  if (m.timeLimit !== null && world.time >= m.timeLimit && !inLastChance(world)) fail(world);
}

/** Remaining seconds on the mission clock (null = no clock). Can go to 0. */
export function missionTimeLeft(world: World): number | null {
  const lim = world.mission.timeLimit;
  if (lim === null) return null;
  return Math.max(0, lim - world.time);
}
