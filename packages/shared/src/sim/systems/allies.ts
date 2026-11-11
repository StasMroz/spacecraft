import { GUARDSMAN } from '../../data/crash.js';
import type { Ally, World } from '../types.js';
import { segmentBlocked } from '../walls.js';
import { allocId } from '../world.js';

/**
 * Guardsmen (data/crash.ts GUARDSMAN): shoot the nearest visible Tyranid in range with a lasgun.
 * They hold their ground where they landed (by the wreck) and never follow or walk; they only aim
 * and fire.
 */
export function updateAllies(world: World, dt: number): void {
  if (!world.allies.length) return;
  const g = GUARDSMAN;
  for (const a of world.allies) {
    if (a.dead) continue;
    a.follow = false;
    a.cooldown = Math.max(0, a.cooldown - dt);
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
