import { PLAYER } from '../../constants.js';
import { dist2 } from '../../math/vec.js';
import type { SpatialHash } from '../spatialHash.js';
import {
  armourArc,
  enemyProjectileDeflectChances,
  guardDeflectChance,
  MARINE_DEFLECTION,
  MARINE_GUARD,
} from '../../data/index.js';
import { COVER } from '../../maps/walls.js';
import type { Enemy, Player, Projectile, World } from '../types.js';
import { segmentEntry } from '../walls.js';
import { damageEnemy, damagePlayer, explode } from './combat.js';

/** Largest enemy radius; used to pad broad-phase queries. */
const QUERY_PAD = 40;

export function updateProjectiles(world: World, enemyHash: SpatialHash<Enemy>, dt: number): void {
  for (const pr of world.projectiles) {
    if (pr.dead) continue;
    const x0 = pr.sx ?? pr.x;
    const y0 = pr.sy ?? pr.y;
    pr.sx = pr.sy = undefined;
    if (pr.drag > 0) {
      const f = Math.max(0, 1 - pr.drag * dt);
      pr.vx *= f;
      pr.vy *= f;
    }
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    const outside =
      pr.x < 0 || pr.y < 0 || pr.x > world.map.arena.width || pr.y > world.map.arena.height;
    if (pr.life <= 0 || outside) {
      detonate(world, pr, !outside);
      continue;
    }
    const wallT = wallStop(world, pr, x0, y0);
    if (wallT !== null) {
      // Stop just short of the wall; whatever stood before it this tick is still hit.
      pr.x = x0 + (pr.x - x0) * wallT;
      pr.y = y0 + (pr.y - y0) * wallT;
    }
    if (!pr.deflected) {
      if (pr.owner === 'player') hitEnemies(world, pr, x0, y0, enemyHash);
      else hitPlayers(world, pr, x0, y0);
    }
    if (wallT !== null && !pr.dead) {
      world.events.push({ e: 'bnc', x: Math.round(pr.x), y: Math.round(pr.y), k: pr.kind });
      detonate(world, pr, true);
    }
  }
  world.projectiles = world.projectiles.filter((p) => !p.dead);
}

/**
 * Swept test: squared distance from (px,py) to the segment (x0,y0)-(x1,y1).
 * Fast projectiles move ~35 px per tick, more than a small enemy's diameter,
 * so a point test would tunnel straight through targets.
 */
export function segmentDist2(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  px: number,
  py: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2)) : 0;
  return dist2(x0 + dx * t, y0 + dy * t, px, py);
}

function hitEnemies(
  world: World,
  pr: Projectile,
  x0: number,
  y0: number,
  hash: SpatialHash<Enemy>,
): void {
  const halfLen = Math.hypot(pr.x - x0, pr.y - y0) / 2;
  const hits: { enemy: Enemy; t: number }[] = [];
  hash.query((pr.x + x0) / 2, (pr.y + y0) / 2, halfLen + pr.radius + QUERY_PAD, (enemy) => {
    if (enemy.dead || enemy.burrowed || pr.hit.includes(enemy.id)) return;
    const r = world.content.enemy(enemy.type).radius + pr.radius;
    if (segmentDist2(x0, y0, pr.x, pr.y, enemy.x, enemy.y) > r * r) return;
    hits.push({ enemy, t: dist2(x0, y0, enemy.x, enemy.y) });
  });
  // Resolve nearest-first so a non-piercing shot hits the first enemy in its path.
  hits.sort((a, b) => a.t - b.t);
  for (const { enemy } of hits) {
    if (pr.dead) return;
    // Pierce spent but coasting to an end-of-range burst: ignore further targets.
    if (pr.pierceLeft < 0) return;
    if (pr.pierceBudget) {
      const cost = pr.pierceBudget.cost[world.content.enemy(enemy.type).size];
      if (cost > pr.pierceBudgetLeft!) {
        spendPierce(pr);
        return;
      }
      pr.pierceBudgetLeft! -= cost;
    }
    pr.hit.push(enemy.id);
    if (pr.explosion) {
      // Mass-reactive: direct hit (if any) and then the blast on the target.
      if (pr.damage > 0) {
        const res = damageEnemy(world, enemy, pr.damage, {
          strength: pr.strength,
          ap: pr.ap,
          sourcePlayerId: pr.ownerId,
          kx: pr.vx,
          ky: pr.vy,
          knockback: pr.knockback,
        });
        if (res.saved)
          world.events.push({
            e: 'bnc',
            x: Math.round(enemy.x),
            y: Math.round(enemy.y),
            k: pr.kind,
          });
      }
      pr.x = enemy.x;
      pr.y = enemy.y;
      detonate(world, pr);
      return;
    }
    const res = damageEnemy(world, enemy, pr.damage, {
      strength: pr.strength,
      ap: pr.ap,
      sourcePlayerId: pr.ownerId,
      kx: pr.vx,
      ky: pr.vy,
      knockback: pr.knockback,
    });
    if (res.saved) {
      // Armour bounced: spark + ricochet only (throttled for the flamer's many tiny hits).
      if (pr.kind !== 'flame' || world.rng.chance(0.08))
        world.events.push({ e: 'bnc', x: Math.round(enemy.x), y: Math.round(enemy.y), k: pr.kind });
    } else if (pr.kind !== 'flame' && pr.kind !== 'slash')
      world.events.push({ e: 'hit', x: Math.round(enemy.x), y: Math.round(enemy.y), k: pr.kind });
    if (pr.pierceBudget ? pr.pierceBudgetLeft! <= 0 : pr.pierceLeft-- <= 0) spendPierce(pr);
  }
}

/** Melta (endBurst) keeps flying to max range for the ground flash; other shots die here. */
function spendPierce(pr: Projectile): void {
  pr.pierceLeft = -1;
  if (!pr.endBurst) pr.dead = true;
}

function hitPlayers(world: World, pr: Projectile, x0: number, y0: number): void {
  for (const p of world.players) {
    if (p.state !== 'alive') continue;
    const r = PLAYER.radius + pr.radius;
    if (segmentDist2(x0, y0, pr.x, pr.y, p.x, p.y) <= r * r) {
      if (tryDeflect(world, pr, p)) return;
      if (pr.damage > 0) {
        // Armour faces the incoming shot: source direction = against its travel (or its
        // segment start if it has somehow stopped).
        const src = pr.vx || pr.vy ? { dirX: -pr.vx, dirY: -pr.vy } : { fromX: x0, fromY: y0 };
        const dx = pr.vx || pr.vy ? -pr.vx : x0 - p.x;
        const dy = pr.vx || pr.vy ? -pr.vy : y0 - p.y;
        let dmg = pr.damage;
        // A front hit that got past the plate while guarding takes a further −30%.
        if (p.guarding && armourArc(p.aim, dx, dy) === 'front') dmg *= MARINE_GUARD.landedDamageMul;
        damagePlayer(world, p, dmg, src);
      }
      if (pr.explosion) {
        detonate(world, pr);
        return;
      }
      world.events.push({ e: 'hit', x: Math.round(pr.x), y: Math.round(pr.y), k: pr.kind });
      pr.dead = true;
      return;
    }
  }
}

const deflectCache = new WeakMap<object, Record<string, number>>();

/** Deflection chance for an enemy projectile kind under this world's content (data/armour.ts). */
export function deflectChance(world: World, kind: string): number {
  let t = deflectCache.get(world.content);
  if (!t) {
    t = enemyProjectileDeflectChances(world.content.enemies.values());
    deflectCache.set(world.content, t);
  }
  return t[kind] ?? 0;
}

/**
 * Front-plate ricochet (data/armour.ts MARINE_DEFLECTION): only enemy shots striking the front
 * arc roll (seeded RNG); on success the shot is mirrored off the plate, harmless and fading.
 */
function tryDeflect(world: World, pr: Projectile, p: Player): boolean {
  if (pr.owner !== 'enemy' || pr.explosion || !(pr.vx || pr.vy)) return false;
  if (armourArc(p.aim, -pr.vx, -pr.vy) !== 'front') return false;
  let chance = deflectChance(world, pr.kind);
  if (p.guarding) chance = guardDeflectChance(chance);
  if (!(chance > 0) || !world.rng.chance(chance)) return false;
  // Mirror the velocity across the plate (normal = facing), then a little seeded jitter.
  const nx = Math.cos(p.aim);
  const ny = Math.sin(p.aim);
  const dot = pr.vx * nx + pr.vy * ny;
  const rx = pr.vx - 2 * dot * nx;
  const ry = pr.vy - 2 * dot * ny;
  const a =
    Math.atan2(ry, rx) + world.rng.range(-MARINE_DEFLECTION.jitter, MARINE_DEFLECTION.jitter);
  const sp = Math.hypot(rx, ry) * MARINE_DEFLECTION.speedMul;
  // Put it on the plate where it struck (towards the shooter) so it visibly leaves from there.
  const inL = Math.hypot(pr.vx, pr.vy);
  const hx = p.x - (pr.vx / inL) * (PLAYER.radius + pr.radius);
  const hy = p.y - (pr.vy / inL) * (PLAYER.radius + pr.radius);
  pr.x = hx;
  pr.y = hy;
  pr.vx = Math.cos(a) * sp;
  pr.vy = Math.sin(a) * sp;
  pr.damage = 0;
  pr.deflected = true;
  pr.life = Math.min(pr.life, MARINE_DEFLECTION.fadeTime);
  world.events.push({
    e: 'defl',
    p: p.id,
    x: Math.round(hx),
    y: Math.round(hy),
    a: Math.round(a * 100) / 100,
    k: pr.kind,
  });
  return true;
}

const WALL_GAP = 2;

/**
 * Where this tick's segment is stopped by a wall (t along it), or null. Full walls always stop
 * it; low cover rolls COVER.stopChance once per wall per shot, except next to the muzzle.
 */
function wallStop(world: World, pr: Projectile, x0: number, y0: number): number | null {
  const len = Math.hypot(pr.x - x0, pr.y - y0);
  if (len < 1e-6) return null;
  let best: number | null = null;
  world.map.walls.forEach((w, i) => {
    const t = segmentEntry(x0, y0, pr.x, pr.y, w);
    if (t === null || (best !== null && t >= best)) return;
    if (w.kind === 'low') {
      if (pr.cover?.includes(i)) return;
      (pr.cover ??= []).push(i);
      const ox = pr.ox ?? x0;
      const oy = pr.oy ?? y0;
      const cx = Math.max(w.x, Math.min(ox, w.x + w.w));
      const cy = Math.max(w.y, Math.min(oy, w.y + w.h));
      if (Math.hypot(ox - cx, oy - cy) <= COVER.ignoreNear) return;
      if (!world.rng.chance(COVER.stopChance)) return;
    }
    best = Math.max(0, t - WALL_GAP / len);
  });
  return best;
}

/** `atRange` = the projectile ran out of lifetime inside the arena (not a hit, not off-map). */
function detonate(world: World, pr: Projectile, atRange = false): void {
  if (pr.dead) return;
  pr.dead = true;
  if (pr.explosion) {
    explode(world, pr.x, pr.y, pr.explosion, {
      hurtsEnemies: pr.owner === 'player',
      hurtsPlayers: pr.owner === 'enemy' || !!pr.explosion.friendlyFire,
      sourcePlayerId: pr.owner === 'player' ? pr.ownerId : undefined,
    });
  } else if (atRange && pr.endBurst && !pr.deflected) {
    // End-of-range burst (meltagun): always at max range — misses and piercing hits alike.
    // No burst after a deflection or after leaving the arena (`atRange` is false off-map).
    // Same friendly-fire rule as other blasts: marine bursts hurt enemies only unless friendlyFire.
    explode(world, pr.x, pr.y, pr.endBurst, {
      hurtsEnemies: pr.owner === 'player',
      hurtsPlayers: pr.owner === 'enemy' || !!pr.endBurst.friendlyFire,
      sourcePlayerId: pr.owner === 'player' ? pr.ownerId : undefined,
      kind: pr.kind,
    });
  }
}
