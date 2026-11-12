import { PICKUP, PLAYER } from '../../constants.js';
import {
  armourMul,
  MARINE_GUARD,
  saveChance,
  woundMul,
  type ExplosionSpec,
} from '../../data/index.js';
import { dist } from '../../math/vec.js';
import { allocId } from '../world.js';
import { dropCaps } from './director.js';
import { segmentBlocked } from '../walls.js';
import type { Enemy, Player, World } from '../types.js';
import { spawnAcid } from './acid.js';
import { damageObjectivesAt } from './mission.js';

export interface DamageOpts {
  /** 40k profile (data/profile.ts); strength omitted = ignores Toughness and Save. */
  strength?: number;
  ap?: number;
  sourcePlayerId?: number;
  /** Knockback impulse direction & magnitude. */
  kx?: number;
  ky?: number;
  knockback?: number;
}

export interface HitResult {
  dmg: number;
  /** The armour save stopped the hit ("armour bounced"). */
  saved: boolean;
}

/**
 * Applies a hit to an enemy: Strength vs Toughness scales the damage, the armour save (worsened
 * by AP) is rolled and stops the hit outright (see data/profile.ts). Then knockback and death.
 */
export function damageEnemy(
  world: World,
  enemy: Enemy,
  amount: number,
  opts: DamageOpts = {},
): HitResult {
  if (enemy.dead) return { dmg: 0, saved: false };
  const def = world.content.enemy(enemy.type);
  let dmg = amount;
  let saved = false;
  if (opts.strength !== undefined && amount > 0) {
    const sv = saveChance(def.save, opts.ap ?? 0);
    if (sv > 0 && world.rng.chance(sv)) {
      saved = true;
      dmg = 0;
    } else dmg = amount * woundMul(opts.strength, def.toughness);
  }
  dmg *= enemy.stimTaken ?? 1;
  enemy.hp -= dmg;
  if (opts.knockback && (opts.kx || opts.ky)) {
    const l = Math.hypot(opts.kx ?? 0, opts.ky ?? 0) || 1;
    // A bounced hit still shoves, a little.
    const k = (opts.knockback / def.mass) * (saved ? 0.4 : 1);
    enemy.vx += ((opts.kx ?? 0) / l) * k;
    enemy.vy += ((opts.ky ?? 0) / l) * k;
  }
  const shooter =
    opts.sourcePlayerId !== undefined
      ? world.players.find((p) => p.id === opts.sourcePlayerId)
      : undefined;
  if (shooter) shooter.damageDealt += dmg;
  if (shooter && dmg > 0 && shooter.swing > 0 && shooter.state === 'alive') {
    const steal = world.content.weapon(shooter.current).meleeLifesteal;
    if (steal) shooter.hp = Math.min(shooter.maxHp, shooter.hp + dmg * steal);
  }
  if (enemy.hp <= 0) killEnemy(world, enemy, shooter);
  return { dmg, saved };
}

export function killEnemy(world: World, enemy: Enemy, killer?: Player): void {
  if (enemy.dead) return;
  enemy.dead = true;
  const def = world.content.enemy(enemy.type);
  world.stats.kills++;
  world.stats.killsByType[enemy.type] = (world.stats.killsByType[enemy.type] ?? 0) + 1;
  if (killer) {
    killer.kills++;
    killer.score += def.points;
    killer.killsByType[enemy.type] = (killer.killsByType[enemy.type] ?? 0) + 1;
  }
  world.events.push({ e: 'die', t: enemy.type, x: Math.round(enemy.x), y: Math.round(enemy.y) });
  // A death blast (e.g. a shot Spore Mine) credits its kills to whoever popped it.
  if (def.explode?.onDeath)
    explode(world, enemy.x, enemy.y, def.explode, {
      hurtsPlayers: true,
      hurtsEnemies: true,
      creditPlayerId: killer?.id,
    });
  // Drops come out of the wave's medkit budget (bosses always drop); children never drop.
  const st = world.director;
  const roll = !enemy.child && world.rng.chance(def.medkitDropChance);
  const inBudget =
    st.drops.medkits < dropCaps(world.content.director, world.teamSize, st.wave).medkits;
  if (roll && (inBudget || def.boss)) {
    st.drops.medkits++;
    world.pickups.push({
      id: allocId(world),
      kind: 'medkit',
      x: enemy.x,
      y: enemy.y,
      life: PICKUP.lifetime,
    });
  }
}

/**
 * Where a hit on a marine comes from, for directional armour (data/armour.ts).
 * `fromX/fromY` = a point the damage comes from (attacker, blast centre);
 * `dirX/dirY` = the vector from the marine towards the source (e.g. minus a projectile's velocity).
 * Omitted = no direction (overheat etc.): unmodified damage.
 */
export type DamageSource = { fromX: number; fromY: number } | { dirX: number; dirY: number };

export function damagePlayer(
  world: World,
  player: Player,
  amount: number,
  source?: DamageSource,
  /** Damage over time (acid): ignores and grants no hurt i-frames, so it never shields a marine. */
  opts?: { dot?: boolean },
): void {
  if (player.state !== 'alive' || (player.invuln > 0 && !opts?.dot) || amount <= 0) return;
  if (source) {
    const dx = 'dirX' in source ? source.dirX : source.fromX - player.x;
    const dy = 'dirX' in source ? source.dirY : source.fromY - player.y;
    const front = player.guarding ? MARINE_GUARD.frontMul : undefined;
    amount *= armourMul(player.aim, dx, dy, front);
  }
  if (player.swing > 0 && !opts?.dot) {
    const resist = world.content.weapon(player.current).meleeResist;
    if (resist) amount *= 1 - resist;
  }
  player.hp -= amount;
  if (!opts?.dot) player.invuln = PLAYER.hurtInvuln;
  world.events.push({ e: 'hurt', p: player.id, d: Math.round(amount) });
  if (player.hp <= 0) {
    player.hp = 0;
    player.state = 'downed';
    player.downedTime = 0;
    player.reviveProgress = 0;
    player.reloadTimer = 0;
    world.events.push({ e: 'down', p: player.id });
  }
}

export interface ExplodeOpts {
  hurtsPlayers: boolean;
  hurtsEnemies: boolean;
  sourcePlayerId?: number;
  /**
   * Credits enemy kills/damage to this marine without making it a "player-fired" blast
   * (full damage to marines). Used for chain blasts set off by a kill.
   */
  creditPlayerId?: number;
  /** Projectile kind for an end-of-range burst (sent as the boom event's `k`, client FX). */
  kind?: string;
}

/** Radial damage with linear falloff to `edgeFactor` at the rim; the blast's own S / AP apply. */
export function explode(
  world: World,
  x: number,
  y: number,
  spec: ExplosionSpec,
  opts: ExplodeOpts,
): void {
  world.events.push({
    e: 'boom',
    x: Math.round(x),
    y: Math.round(y),
    r: spec.radius,
    ...(opts.kind ? { k: opts.kind } : {}),
  });
  const falloff = (d: number) =>
    spec.damage * (1 - (1 - spec.edgeFactor) * Math.min(1, d / spec.radius));
  if (opts.hurtsEnemies) {
    damageObjectivesAt(world, x, y, spec.radius, spec.damage);
    for (const enemy of world.enemies) {
      if (enemy.dead || enemy.burrowed) continue;
      const def = world.content.enemy(enemy.type);
      const d = dist(x, y, enemy.x, enemy.y) - def.radius;
      if (d > spec.radius) continue;
      if (segmentBlocked(world.map.walls, x, y, enemy.x, enemy.y, 'full')) continue;
      damageEnemy(world, enemy, falloff(Math.max(0, d)), {
        strength: spec.strength,
        ap: spec.ap,
        sourcePlayerId: opts.sourcePlayerId ?? opts.creditPlayerId,
        kx: enemy.x - x,
        ky: enemy.y - y,
        knockback: 260,
      });
    }
  }
  if (opts.hurtsPlayers) {
    for (const p of world.players) {
      if (p.state !== 'alive') continue;
      const d = dist(x, y, p.x, p.y) - PLAYER.radius;
      if (d > spec.radius) continue;
      if (segmentBlocked(world.map.walls, x, y, p.x, p.y, 'full')) continue;
      // Player-fired explosions deal reduced self/team damage.
      const mul = opts.sourcePlayerId !== undefined ? 0.25 : 1;
      damagePlayer(world, p, falloff(Math.max(0, d)) * mul, { fromX: x, fromY: y });
    }
  }
  if (spec.pool) spawnAcid(world, x, y, spec.pool);
}
