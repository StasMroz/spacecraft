import { CRASH, GUARDSMAN } from '../../data/crash.js';
import type { WallDef } from '../../maps/types.js';
import type { World } from '../types.js';
import { buildFlowField, insideWall } from '../walls.js';
import { allocId } from '../world.js';
import { perTeam } from './director.js';
import { explode } from './combat.js';

export const isCrashWave = (wave: number): boolean =>
  wave >= CRASH.firstWave && (wave - CRASH.firstWave) % CRASH.everyWave === 0;

const alive = (world: World) => world.players.filter((p) => p.state === 'alive');

/**
 * Imperial ship crash (data/crash.ts): on a crash wave, `delay` s in, a burning ship falls for
 * `fallTime` s onto a site clear of every marine and breach (impact hurts Tyranids only), smokes
 * for `smokeTime` s, then leaves random wreck walls (never sealing a pocket) and Guardsmen.
 */
export function updateCrash(world: World, dt: number): void {
  const d = world.director;
  const c = world.crash;
  if (!c) {
    if (
      d.phase === 'active' &&
      isCrashWave(d.wave) &&
      world.crashWave !== d.wave &&
      world.time - d.waveStartedAt >= CRASH.delay
    ) {
      world.crashWave = d.wave;
      const site = pickSite(world);
      if (!site) return; // nowhere safe: no crash this wave
      world.crash = {
        ...site,
        phase: 'fall',
        t: CRASH.fallTime,
        from: world.rng.range(0, Math.PI * 2),
      };
      world.events.push({ e: 'crash', x: Math.round(site.x), y: Math.round(site.y) });
    }
    return;
  }
  c.t -= dt;
  if (c.t > 0) return;
  if (c.phase === 'fall') {
    c.phase = 'smoke';
    c.t = CRASH.smokeTime;
    world.events.push({ e: 'crashHit', x: Math.round(c.x), y: Math.round(c.y) });
    explode(world, c.x, c.y, CRASH.impact, { hurtsEnemies: true, hurtsPlayers: false });
    return;
  }
  placeWreck(world, c.x, c.y);
  spawnSoldiers(world, c.x, c.y);
  world.crash = null;
}

function pickSite(world: World): { x: number; y: number } | null {
  const { arena, walls, director } = world.map;
  const marines = alive(world);
  if (!marines.length) return null;
  for (let k = 0; k < 60; k++) {
    const x = world.rng.range(220, arena.width - 220);
    const y = world.rng.range(220, arena.height - 220);
    const near = Math.min(...marines.map((p) => Math.hypot(p.x - x, p.y - y)));
    if (near < CRASH.minPlayerDist || near > CRASH.maxPlayerDist) continue;
    if (director.spawnPoints.some((s) => Math.hypot(s.x - x, s.y - y) < CRASH.spawnClear)) continue;
    if (insideWall(walls, x, y, 120)) continue;
    return { x, y };
  }
  return null;
}

/** True when every open cell of the arena is reachable from the deploy point. */
function noPockets(world: World, walls: readonly WallDef[]): boolean {
  const f = buildFlowField(world.map.arena, walls, [world.map.playerSpawn]);
  for (let i = 0; i < f.dist.length; i++) {
    if (f.dist[i] !== -1) continue;
    const x = ((i % f.cols) + 0.5) * f.cell;
    const y = (Math.floor(i / f.cols) + 0.5) * f.cell;
    if (!insideWall(walls, x, y, 14)) return false;
  }
  return true;
}

function placeWreck(world: World, cx: number, cy: number): void {
  const want = world.rng.int(CRASH.pieces[0], CRASH.pieces[1]);
  const bodies = [
    ...world.players.map((p) => ({ x: p.x, y: p.y, r: 40 })),
    ...world.enemies.map((e) => ({ x: e.x, y: e.y, r: world.content.enemy(e.type).radius + 12 })),
    ...world.allies.map((a) => ({ x: a.x, y: a.y, r: 30 })),
    ...world.map.director.spawnPoints.map((s) => ({ x: s.x, y: s.y, r: 140 })),
    { x: world.map.playerSpawn.x, y: world.map.playerSpawn.y, r: 120 },
  ];
  let placed = 0;
  for (let k = 0; k < want * 6 && placed < want; k++) {
    if (world.wreck.length >= CRASH.maxPieces) return;
    const a = world.rng.range(0, Math.PI * 2);
    const dist = world.rng.range(40, 120);
    const long = world.rng.range(50, 100);
    const short = world.rng.range(18, 32);
    const horiz = world.rng.chance(0.5);
    const w = Math.round(horiz ? long : short);
    const h = Math.round(horiz ? short : long);
    const piece: WallDef = {
      x: Math.round(cx + Math.cos(a) * dist - w / 2),
      y: Math.round(cy + Math.sin(a) * dist - h / 2),
      w,
      h,
      kind: world.rng.chance(0.4) ? 'full' : 'low',
    };
    const { arena } = world.map;
    if (
      piece.x < 60 ||
      piece.y < 60 ||
      piece.x + w > arena.width - 60 ||
      piece.y + h > arena.height - 60
    )
      continue;
    // keep a Carnifex-wide gap (90 px) to every other wall: no tight slots, no new dead ends
    if (world.map.walls.some((o) => overlap(piece, o, 90))) continue;
    if (bodies.some((b) => insideWall([piece], b.x, b.y, b.r))) continue;
    const next = [...world.map.walls, piece];
    if (!noPockets(world, next)) continue;
    world.wreck.push(piece);
    world.map = { ...world.map, walls: next };
    placed++;
  }
}

const overlap = (a: WallDef, b: WallDef, pad: number): boolean =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

function spawnSoldiers(world: World, cx: number, cy: number): void {
  const live = world.allies.filter((a) => !a.dead).length;
  const n = Math.min(perTeam(CRASH.soldiers, world.teamSize), CRASH.maxAllies - live);
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + world.rng.range(-0.3, 0.3);
    let x = cx + Math.cos(a) * 30;
    let y = cy + Math.sin(a) * 30;
    for (let r = 30; r < 200 && insideWall(world.map.walls, x, y, GUARDSMAN.radius + 2); r += 15) {
      x = cx + Math.cos(a) * r;
      y = cy + Math.sin(a) * r;
    }
    world.allies.push({
      id: allocId(world),
      x,
      y,
      aim: a,
      hp: GUARDSMAN.hp,
      maxHp: GUARDSMAN.hp,
      cooldown: world.rng.range(0, GUARDSMAN.fireInterval),
      homeX: cx,
      homeY: cy,
      follow: false,
      dead: false,
    });
  }
  world.events.push({ e: 'allies', x: Math.round(cx), y: Math.round(cy), n });
}
