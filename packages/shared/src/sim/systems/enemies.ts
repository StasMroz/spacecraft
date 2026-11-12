import { PLAYER } from '../../constants.js';
import type { EnemyDef, ProjectileSpec } from '../../data/index.js';
import { clamp, dist2 } from '../../math/vec.js';
import type { SpatialHash } from '../spatialHash.js';
import { allocId } from '../world.js';
import type { Enemy, Player, World } from '../types.js';
import { biteAlly } from './allies.js';
import { damagePlayer, explode } from './combat.js';
import {
  buildFlowField,
  flowDirection,
  pushOutOfWalls,
  segmentBlocked,
  type FlowField,
} from '../walls.js';

/** Path field towards the marines, rebuilt every FLOW_TICKS ticks. */
const FLOW_TICKS = 6;
const flowCache = new WeakMap<World, { tick: number; field: FlowField }>();

/** Shared path field towards the alive marines (also used by Guardsmen following them). */
export const marineFlowField = (world: World): FlowField => flowField(world);

function flowField(world: World): FlowField {
  const c = flowCache.get(world);
  if (c && world.tick - c.tick < FLOW_TICKS) return c.field;
  const goals = world.players.filter((p) => p.state === 'alive');
  const field = buildFlowField(world.map.arena, world.map.walls, goals);
  flowCache.set(world, { tick: world.tick, field });
  return field;
}

/**
 * Where to head for the target: straight at it with a per-enemy flank angle while the way is
 * clear (the swarm fans out instead of trailing in one line), else down the path field.
 */
function heading(
  world: World,
  e: Enemy,
  r: number,
  target: Player,
  nx: number,
  ny: number,
  d: number,
): { x: number; y: number } {
  const walls = world.map.walls;
  if (walls.length && segmentBlocked(walls, e.x, e.y, target.x, target.y, undefined, r * 0.8)) {
    const f = flowDirection(flowField(world), e.x, e.y);
    if (f) return f;
  }
  if ((e.stimTaken ?? 1) < 1 && d > SURROUND.near) {
    // Golden-angle slots spread a pack evenly round the marine (cut off the retreat).
    const slot = ((e.id * 0.6180339887) % 1) * Math.PI * 2;
    const R = Math.min(SURROUND.maxRing, d * SURROUND.ring);
    const gx = target.x + Math.cos(slot) * R - e.x;
    const gy = target.y + Math.sin(slot) * R - e.y;
    const gl = Math.hypot(gx, gy) || 1;
    return { x: gx / gl, y: gy / gl };
  }
  const spread = FLANK.maxAngle * Math.min(1, Math.max(0, (d - FLANK.near) / FLANK.far));
  const a = (((e.id * 0.6180339887) % 1) - 0.5) * 2 * spread;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return { x: nx * c - ny * sn, y: nx * sn + ny * c };
}

/** Fan-out while closing in: up to ±maxAngle (rad) beyond `near` px, full at near + far. */
const FLANK = { maxAngle: 0.5, near: 120, far: 360 } as const;
/** Personal space as a multiple of the touching distance; overlap is also corrected directly. */
const SEPARATION = { space: 1.25, steer: 1.6, correct: 0.35 } as const;

function nearestAlivePlayer(world: World, x: number, y: number): Player | undefined {
  let best: Player | undefined;
  let bestD = Infinity;
  for (const p of world.players) {
    if (p.state !== 'alive') continue;
    const d = dist2(x, y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Synapse creatures buff every other (non-synapse) Tyranid within their radius. */
function applySynapse(world: World, hash: SpatialHash<Enemy>): void {
  for (const e of world.enemies) {
    e.synSpeed = 1;
    e.synDamage = 1;
    e.stimTaken = 1;
  }
  for (const s of world.enemies) {
    if (s.dead || s.burrowed) continue;
    const syn = world.content.enemy(s.type).synapse;
    if (!syn) continue;
    const r2 = syn.radius * syn.radius;
    hash.query(s.x, s.y, syn.radius, (o) => {
      if (o === s || o.dead || world.content.enemy(o.type).synapse) return;
      if (dist2(s.x, s.y, o.x, o.y) > r2) return;
      o.synSpeed = Math.max(o.synSpeed, syn.speedMul);
      o.synDamage = Math.max(o.synDamage, syn.damageMul);
    });
  }
  for (const s of world.enemies) {
    if (s.dead || s.burrowed) continue;
    const st = world.content.enemy(s.type).stim;
    if (!st) continue;
    const r2 = st.radius * st.radius;
    hash.query(s.x, s.y, st.radius, (o) => {
      if (o === s || o.dead || world.content.enemy(o.type).stim) return;
      if (dist2(s.x, s.y, o.x, o.y) > r2) return;
      if (segmentBlocked(world.map.walls, s.x, s.y, o.x, o.y, 'full')) return;
      o.synSpeed = Math.max(o.synSpeed, st.speedMul);
      o.synDamage = Math.max(o.synDamage, st.damageMul);
      o.stimTaken = Math.min(o.stimTaken ?? 1, st.damageTakenMul);
    });
  }
}

/** Stimmed melee swarm: each beast heads for its own slot on a ring round the target. */
const SURROUND = { ring: 0.9, maxRing: 300, near: 60 } as const;

/** Charge state machine. Returns true while the charge controls movement. */
function updateCharge(
  world: World,
  e: Enemy,
  def: EnemyDef,
  target: Player,
  d: number,
  nx: number,
  ny: number,
  dt: number,
): boolean {
  const c = def.charge!;
  e.chargeCooldown = Math.max(0, e.chargeCooldown - dt);
  if (e.chargePhase === 0) {
    if (e.chargeCooldown > 0 || d > c.triggerDistance || d < c.minDistance) return false;
    e.chargePhase = 1;
    e.chargeTimer = c.windup;
    world.events.push({ e: 'charge', x: Math.round(e.x), y: Math.round(e.y), t: e.type });
  }
  e.chargeTimer -= dt;
  if (e.chargePhase === 1) {
    // Rear up and keep tracking the target until the dash starts.
    e.chargeDx = nx;
    e.chargeDy = ny;
    e.vx *= 0.8;
    e.vy *= 0.8;
    if (e.chargeTimer <= 0) {
      e.chargePhase = 2;
      e.chargeTimer = c.duration;
      world.events.push({ e: 'leap', x: Math.round(e.x), y: Math.round(e.y), t: e.type });
    }
    return true;
  }
  const v = def.speed * e.synSpeed * c.speedMul;
  e.vx = e.chargeDx * v;
  e.vy = e.chargeDy * v;
  e.angle = Math.atan2(e.chargeDy, e.chargeDx);
  if (e.chargeTimer <= 0) {
    e.chargePhase = 0;
    e.chargeCooldown = c.cooldown * world.rng.range(0.85, 1.15);
  }
  return true;
}

/** Enemy AI: steering + behaviour-specific attacks, separation, collisions. */
export function updateEnemies(world: World, hash: SpatialHash<Enemy>, dt: number): void {
  applySynapse(world, hash);
  wakeSleepers(world);
  for (const e of world.enemies) {
    if (e.dead) continue;
    if (e.asleep) {
      e.vx = 0;
      e.vy = 0;
      continue;
    }
    const def = world.content.enemy(e.type);
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    e.attackAnim = Math.max(0, e.attackAnim - dt);
    const target = nearestAlivePlayer(world, e.x, e.y);
    // End-of-wave hunt: the stragglers close in faster (no hiding from the last xenos).
    const speed =
      def.speed * e.synSpeed * (e.hunt ? world.content.director.waves.reveal.speedMul : 1);

    let desiredX = 0;
    let desiredY = 0;
    let charging = false;
    if (target) {
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      e.angle = Math.atan2(dy, dx);

      if (e.burrowed) {
        // Tunnelling: straight at the target, fast, no attacks, no collisions.
        const v = speed * def.burrow!.speedMul;
        e.vx = nx * v;
        e.vy = ny * v;
        e.x = clamp(e.x + e.vx * dt, def.radius, world.map.arena.width - def.radius);
        e.y = clamp(e.y + e.vy * dt, def.radius, world.map.arena.height - def.radius);
        if (d <= def.burrow!.emergeDistance) {
          e.burrowed = false;
          pushOutOfWalls(e, def.radius, world.map.walls);
          e.attackCooldown = 0.35;
          e.vx = nx * speed * 1.5;
          e.vy = ny * speed * 1.5;
          world.events.push({ e: 'emerge', x: Math.round(e.x), y: Math.round(e.y), t: e.type });
        }
        continue;
      }

      if (def.charge) charging = updateCharge(world, e, def, target, d, nx, ny, dt);

      if (!charging) {
        switch (def.behavior) {
          case 'melee':
          case 'kamikaze': {
            const h = heading(world, e, def.radius, target, nx, ny, d);
            desiredX = h.x * speed;
            desiredY = h.y * speed;
            break;
          }
          case 'ranged': {
            const r = def.ranged!;
            if (segmentBlocked(world.map.walls, e.x, e.y, target.x, target.y, 'full')) {
              const h = heading(world, e, def.radius, target, nx, ny, d);
              desiredX = h.x * speed;
              desiredY = h.y * speed;
              break;
            }
            // Synapse makes shooters bolder: they close in further.
            const pref = r.preferredDistance * (e.synSpeed > 1 ? 0.7 : 1) * (e.hunt ? 0.5 : 1);
            let radial = 0;
            if (d > pref + 60) radial = 1;
            else if (d < pref - 60) radial = -0.8;
            desiredX = (nx * radial - ny * e.strafe * 0.6) * speed;
            desiredY = (ny * radial + nx * e.strafe * 0.6) * speed;
            if (world.rng.chance(dt * 0.3)) e.strafe = -e.strafe;
            if (d <= r.range && e.attackCooldown <= 0) {
              e.attackCooldown = r.cooldown * world.rng.range(0.85, 1.15);
              spit(world, e, target, def.radius, r.projectile, d);
            }
            break;
          }
        }
        const lob = def.lobAttack;
        if (lob) {
          e.lobCooldown = Math.max(0, (e.lobCooldown ?? lob.cooldown * 0.5) - dt);
          if (
            e.chargePhase === 0 &&
            e.lobCooldown <= 0 &&
            d >= lob.minDistance &&
            d <= lob.range &&
            !segmentBlocked(world.map.walls, e.x, e.y, target.x, target.y, 'full')
          ) {
            e.lobCooldown = lob.cooldown * world.rng.range(0.85, 1.15);
            spit(world, e, target, def.radius, lob.projectile, d);
          }
        }
      }

      // Melee contact damage (dashing uses the charge damage).
      const reach = def.radius + PLAYER.radius + 4;
      const contact = e.chargePhase === 2 ? def.charge!.damage : def.contactDamage;
      if (
        contact > 0 &&
        d <= reach &&
        e.attackCooldown <= 0 &&
        !segmentBlocked(world.map.walls, e.x, e.y, target.x, target.y)
      ) {
        e.attackCooldown = def.contactCooldown;
        e.attackAnim = 0.3;
        damagePlayer(world, target, contact * e.synDamage, { fromX: e.x, fromY: e.y });
        world.events.push({ e: 'bite', p: target.id, t: e.type });
        // A Hormagaunt leap ends on impact; a Carnifex ploughs on.
        if (e.chargePhase === 2 && def.charge!.duration < 0.5) e.chargeTimer = 0;
      } else if (
        contact > 0 &&
        e.attackCooldown <= 0 &&
        world.allies.length &&
        biteAlly(world, e.x, e.y, def.radius + 4, contact * e.synDamage)
      ) {
        // A Guardsman in reach gets bitten instead (Tyranids still hunt the marines).
        e.attackCooldown = def.contactCooldown;
        e.attackAnim = 0.3;
      }

      // Kamikaze fuse.
      if (def.explode && def.behavior === 'kamikaze') {
        if (e.fuse < 0 && d <= def.explode.triggerDistance + def.radius) e.fuse = def.explode.fuse;
        if (e.fuse >= 0) {
          desiredX *= 0.3;
          desiredY *= 0.3;
        }
      }
    }

    if (e.fuse >= 0) {
      e.fuse -= dt;
      if (e.fuse <= 0 && def.explode) {
        e.dead = true;
        world.events.push({ e: 'die', t: e.type, x: Math.round(e.x), y: Math.round(e.y) });
        explode(world, e.x, e.y, def.explode, { hurtsPlayers: true, hurtsEnemies: true });
        continue;
      }
    }

    if (!charging) {
      // Separation from neighbours.
      let sx = 0;
      let sy = 0;
      hash.query(e.x, e.y, (def.radius + 40) * SEPARATION.space, (o) => {
        if (o === e || o.dead || o.burrowed) return;
        const or = world.content.enemy(o.type).radius;
        const minD = (def.radius + or) * SEPARATION.space;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD * minD && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (minD - d) / minD;
          sx += (dx / d) * push;
          sy += (dy / d) * push;
        }
      });
      desiredX += sx * speed * SEPARATION.steer;
      desiredY += sy * speed * SEPARATION.steer;

      // Steering towards desired velocity (knockback decays naturally).
      const k = Math.min(1, def.accel * dt);
      e.vx += (desiredX - e.vx) * k;
      e.vy += (desiredY - e.vy) * k;
    }
    e.x = e.x + e.vx * dt;
    e.y = e.y + e.vy * dt;
    if (!charging) resolveOverlap(world, e, def.radius, hash);
    pushOutOfWalls(e, def.radius, world.map.walls);
    e.x = clamp(e.x, def.radius, world.map.arena.width - def.radius);
    e.y = clamp(e.y, def.radius, world.map.arena.height - def.radius);

    // Enemies never push marines (keeps client prediction exact); push the enemy out instead.
    for (const p of world.players) {
      if (p.state === 'dead') continue;
      const minD = def.radius + PLAYER.radius;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD) {
        const d = Math.sqrt(d2) || 1;
        e.x = p.x + (dx / d) * minD;
        e.y = p.y + (dy / d) * minD;
      }
    }
  }
  world.enemies = world.enemies.filter((e) => !e.dead);
}

/** Moves `e` part of the way out of any body it still overlaps (no stacking in a tight swarm). */
function resolveOverlap(world: World, e: Enemy, r: number, hash: SpatialHash<Enemy>): void {
  let px = 0;
  let py = 0;
  hash.query(e.x, e.y, r + 40, (o) => {
    if (o === e || o.dead || o.burrowed) return;
    const minD = r + world.content.enemy(o.type).radius;
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD) return;
    if (d2 < 1e-6) {
      // Exactly stacked: split deterministically by id.
      px += e.id < o.id ? -minD : minD;
      return;
    }
    const d = Math.sqrt(d2);
    px += (dx / d) * (minD - d);
    py += (dy / d) * (minD - d);
  });
  e.x += px * SEPARATION.correct;
  e.y += py * SEPARATION.correct;
}

function spit(
  world: World,
  e: Enemy,
  target: Player,
  radius: number,
  spec: ProjectileSpec,
  d: number,
): void {
  e.attackAnim = 0.3;
  // Aim straight with a little spread; marines can dodge by moving. Lobbed spores lead a bit.
  const a = Math.atan2(target.y - e.y, target.x - e.x) + world.rng.range(-0.08, 0.08);
  world.projectiles.push({
    id: allocId(world),
    owner: 'enemy',
    ownerId: e.id,
    ox: e.x,
    oy: e.y,
    kind: spec.kind,
    x: e.x + Math.cos(a) * radius,
    y: e.y + Math.sin(a) * radius,
    vx: Math.cos(a) * spec.speed,
    vy: Math.sin(a) * spec.speed,
    life: spec.lob ? Math.min(spec.lifetime, Math.max(0, d - radius) / spec.speed) : spec.lifetime,
    radius: spec.radius,
    damage: spec.damage * e.synDamage,
    pierceLeft: 0,
    ap: 0,
    drag: spec.drag ?? 0,
    knockback: 0,
    explosion: spec.explosion,
    ...(spec.pool ? { pool: spec.pool } : {}),
    ...(spec.ignoreLow ? { ignoreLow: true } : {}),
    hit: [],
    dead: false,
  });
  world.events.push({ e: 'spit', x: Math.round(e.x), y: Math.round(e.y), t: e.type });
}

const SEE_R2 = 140 * 140;
const SHOT_R2 = 180 * 180;
const CHAIN_R2 = 200 * 200;

function wakeSleepers(world: World): void {
  const slept = world.enemies.filter((e) => !e.dead && e.asleep);
  if (!slept.length) return;
  const wake = (e: Enemy, x: number, y: number, r2: number): void => {
    if (e.asleep && dist2(e.x, e.y, x, y) < r2) e.asleep = false;
  };
  for (const e of slept) {
    for (const p of world.players) {
      if (p.state === 'alive') wake(e, p.x, p.y, SEE_R2);
    }
  }
  for (const pr of world.projectiles) {
    for (const e of slept) wake(e, pr.x, pr.y, SHOT_R2);
  }
  // Cascade only through groups that started this tick asleep (awake patrols do not auto-raise the map).
  for (let n = 0; n < 4; n++) {
    const newly = slept.filter((e) => !e.asleep);
    if (!newly.length) break;
    for (const a of newly) {
      for (const e of slept) wake(e, a.x, a.y, CHAIN_R2);
    }
  }
}
