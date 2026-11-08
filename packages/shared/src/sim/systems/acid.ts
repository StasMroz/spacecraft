import { PLAYER } from '../../constants.js';
import type { AcidPoolSpec } from '../../data/index.js';
import type { World } from '../types.js';
import { segmentBlocked } from '../walls.js';
import { allocId } from '../world.js';
import { damagePlayer } from './combat.js';

/** Oldest pools dry up first past this many (bounds snapshot size and per-tick cost). */
export const ACID_MAX_POOLS = 48;

/** Leaves an acid pool at (x, y). */
export function spawnAcid(world: World, x: number, y: number, spec: AcidPoolSpec): void {
  world.acid.push({
    id: allocId(world),
    x,
    y,
    r: spec.radius,
    life: spec.duration,
    duration: spec.duration,
    damage: spec.damage,
    interval: spec.interval,
    // First burn a beat after landing: a marine can step out of a fresh splash.
    next: spec.interval,
  });
  if (world.acid.length > ACID_MAX_POOLS) world.acid.shift();
  world.events.push({ e: 'acid', x: Math.round(x), y: Math.round(y), r: spec.radius });
}

/** Burns marines standing in acid (touching the pool), never through a full wall; pools dry up. */
export function updateAcid(world: World, dt: number): void {
  for (const a of world.acid) {
    a.life -= dt;
    a.next -= dt;
    if (a.next > 0 || a.life <= 0) continue;
    a.next += a.interval;
    for (const p of world.players) {
      if (p.state !== 'alive') continue;
      const reach = a.r + PLAYER.radius * 0.5;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      if (segmentBlocked(world.map.walls, a.x, a.y, p.x, p.y, 'full')) continue;
      damagePlayer(world, p, a.damage, undefined, { dot: true });
    }
  }
  world.acid = world.acid.filter((a) => a.life > 0);
}
