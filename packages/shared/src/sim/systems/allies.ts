import { GUARDSMAN } from '../../data/crash.js';
import { clamp } from '../../math/vec.js';
import type { Ally, World } from '../types.js';
import { flowDirection, pushOutOfWalls, segmentBlocked } from '../walls.js';
import { allocId } from '../world.js';
import { marineFlowField } from './enemies.js';

/**
 * Guardsmen (data/crash.ts GUARDSMAN): shoot the nearest visible Tyranid in range with a lasgun.
 * During their crash wave they hold by the wreck; once that wave is survived they follow the
 * nearest marine (path field round walls) and keep fighting.
 */
export function updateAllies(world: World, dt: number): void {
  if (!world.allies.length) return;
  const g = GUARDSMAN;
  if (world.director.phase === 'breather') for (const a of world.allies) a.follow = true;
  for (const a of world.allies) {
    if (a.dead) continue;
    a.cooldown = Math.max(0, a.cooldown - dt);
    // --- move
    let gx = a.homeX;
    let gy = a.homeY;
    let keep: number = g.holdRadius;
    let lead = false;
    if (a.follow) {
      let best = Infinity;
      for (const p of world.players) {
        if (p.state !== 'alive') continue;
        const d = Math.hypot(p.x - a.x, p.y - a.y);
        if (d < best) {
          best = d;
          gx = p.x;
          gy = p.y;
        }
      }
      keep = best === Infinity ? 1e9 : g.followMax;
      lead = best !== Infinity;
    }
    const dx = gx - a.x;
    const dy = gy - a.y;
    const d = Math.hypot(dx, dy);
    if (d > keep) {
      let mx = dx / d;
      let my = dy / d;
      if (lead && segmentBlocked(world.map.walls, a.x, a.y, gx, gy, undefined, g.radius)) {
        const f = flowDirection(marineFlowField(world), a.x, a.y);
        if (f) {
          mx = f.x;
          my = f.y;
        }
      }
      a.x += mx * g.speed * dt;
      a.y += my * g.speed * dt;
    }
    // squad spacing
    for (const o of world.allies) {
      if (o === a || o.dead) continue;
      const sx = a.x - o.x;
      const sy = a.y - o.y;
      const s = Math.hypot(sx, sy);
      const min = g.radius * 2.4;
      if (s > 1e-6 && s < min) {
        a.x += (sx / s) * (min - s) * 0.5;
        a.y += (sy / s) * (min - s) * 0.5;
      }
    }
    pushOutOfWalls(a, g.radius, world.map.walls);
    a.x = clamp(a.x, g.radius, world.map.arena.width - g.radius);
    a.y = clamp(a.y, g.radius, world.map.arena.height - g.radius);
    // --- shoot
    let target: { x: number; y: number } | null = null;
    let td = g.range * g.range;
    for (const e of world.enemies) {
      if (e.dead || e.burrowed) continue;
      const d2 = (e.x - a.x) ** 2 + (e.y - a.y) ** 2;
      if (d2 >= td) continue;
      if (segmentBlocked(world.map.walls, a.x, a.y, e.x, e.y, 'full')) continue;
      td = d2;
      target = e;
    }
    if (!target) continue;
    a.aim = Math.atan2(target.y - a.y, target.x - a.x);
    if (a.cooldown > 0) continue;
    a.cooldown = g.fireInterval * world.rng.range(0.9, 1.1);
    fireLasgun(world, a);
  }
  world.allies = world.allies.filter((a) => !a.dead);
}

function fireLasgun(world: World, a: Ally): void {
  const l = GUARDSMAN.lasgun;
  const ang = a.aim + world.rng.range(-0.05, 0.05);
  world.projectiles.push({
    id: allocId(world),
    owner: 'player',
    ownerId: -a.id,
    ox: a.x,
    oy: a.y,
    kind: 'lasgun',
    x: a.x + Math.cos(ang) * GUARDSMAN.radius,
    y: a.y + Math.sin(ang) * GUARDSMAN.radius,
    vx: Math.cos(ang) * l.speed,
    vy: Math.sin(ang) * l.speed,
    life: l.lifetime,
    radius: l.radius,
    damage: l.damage,
    strength: l.strength,
    pierceLeft: 0,
    ap: l.ap,
    drag: 0,
    knockback: 0,
    hit: [],
    dead: false,
  });
}

/** Tyranid melee on a Guardsman (not through walls); returns true if one was struck. */
export function biteAlly(world: World, x: number, y: number, reach: number, dmg: number): boolean {
  for (const a of world.allies) {
    if (a.dead) continue;
    if (Math.hypot(a.x - x, a.y - y) > reach + GUARDSMAN.radius) continue;
    if (segmentBlocked(world.map.walls, x, y, a.x, a.y)) continue;
    a.hp -= dmg;
    world.events.push({ e: 'ahit', x: Math.round(a.x), y: Math.round(a.y) });
    if (a.hp <= 0) {
      a.dead = true;
      world.events.push({ e: 'adie', x: Math.round(a.x), y: Math.round(a.y) });
    }
    return true;
  }
  return false;
}
