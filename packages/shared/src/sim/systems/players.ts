import { PLAYER } from '../../constants.js';
import { reinforceCooldown } from '../../data/reinforce.js';
import { isGuarding } from '../../data/guard.js';
import { stepSprint } from '../../data/sprint.js';
import { dist2 } from '../../math/vec.js';
import type { Player, World } from '../types.js';
import { relicCarryMul } from './mission.js';
import {
  effectiveFire,
  isMoving,
  marineMoveSpeed,
  marineSprintSpeed,
  stepFireSlow,
  stepPlayerMovement,
} from './movement.js';

export { STILL_INPUT } from './movement.js';

export function updatePlayerMovement(world: World, dt: number): void {
  for (const p of world.players) {
    if (p.state !== 'alive') {
      p.fireSlow = 0;
      p.moveFrac = 0;
      p.sprint.sprinting = false;
      p.sprint.weaponDelay = 0;
      p.guarding = false;
      continue;
    }
    p.invuln = Math.max(0, p.invuln - dt);
    const def = world.content.weapon(p.current);
    const { mx, my } = p.input;
    trackStillness(p, mx, my, dt);
    const moving = isMoving(mx, my);
    stepSprint(
      p.sprint,
      p.input.sprint === true,
      moving,
      !isReviving(world, p),
      dt,
      p.input.fire === true,
    );
    // Defensive stance: hold input while standing still. Any move cancels immediately.
    p.guarding = isGuarding(p.input.guard === true, true, moving);
    p.fireSlow = stepFireSlow(p.fireSlow, effectiveFire(p.input.fire, p.sprint), dt);
    const speed =
      (p.sprint.sprinting ? marineSprintSpeed() : marineMoveSpeed(def, p.fireSlow)) *
      relicCarryMul(world, p.id);
    const x0 = p.x;
    const y0 = p.y;
    stepPlayerMovement(p, mx, my, speed, dt, world.map);
    p.moveFrac = speed > 0 ? Math.min(1, Math.hypot(p.x - x0, p.y - y0) / (speed * dt)) : 0;
  }
}

/** True while this (alive) marine is in revive range of a downed squadmate. */
export function isReviving(world: World, p: Player): boolean {
  const rr = PLAYER.reviveRadius * PLAYER.reviveRadius;
  return world.players.some(
    (o) => o !== p && o.state === 'downed' && dist2(o.x, o.y, p.x, p.y) <= rr,
  );
}

/** Accumulates time spent not moving (bracing); any real movement input resets it. */
export function trackStillness(p: Player, mx: number, my: number, dt: number): void {
  if (isMoving(mx, my)) p.stillTime = 0;
  else p.stillTime += dt;
}

/** Downed / revive / bleed-out / disconnect handling and the game-over check. */
export function updatePlayerStatus(world: World, dt: number): void {
  const rr = PLAYER.reviveRadius * PLAYER.reviveRadius;
  for (const p of world.players) {
    if (!p.connected && p.state !== 'dead') kill(world, p.id);
    if (p.state !== 'downed') continue;
    p.downedTime += dt;
    const reviver = world.players.find(
      (o) => o !== p && o.state === 'alive' && dist2(o.x, o.y, p.x, p.y) <= rr,
    );
    if (reviver) {
      p.reviveProgress += dt / PLAYER.reviveTime;
      if (p.reviveProgress >= 1) {
        p.state = 'alive';
        p.hp = p.maxHp * PLAYER.reviveHpFraction;
        p.invuln = PLAYER.reviveInvuln;
        p.reviveProgress = 0;
        p.downedTime = 0;
        world.events.push({ e: 'revive', p: p.id, by: reviver.id });
        continue;
      }
    } else {
      p.reviveProgress = Math.max(0, p.reviveProgress - dt / PLAYER.reviveTime);
    }
    if (p.downedTime >= PLAYER.bleedOutTime) kill(world, p.id);
  }

  if (!world.players.some((p) => p.state === 'alive')) {
    for (const p of world.players) if (p.state !== 'dead') kill(world, p.id);
    // Last marine downed: they die immediately (no self-revive). Game-over is decided
    // after reinforcements run: a remaining budget or a falling pod keeps the mission alive.
    const rf = world.reinforce;
    if (rf.cooldown <= 0 && rf.left > 0 && rf.pods.length === 0) {
      rf.cooldown = reinforceCooldown(rf.streak);
    }
  }
}

function kill(world: World, id: number): void {
  const p = world.players.find((x) => x.id === id);
  if (!p || p.state === 'dead') return;
  p.state = 'dead';
  p.hp = 0;
  p.diedAt = world.time;
  world.events.push({ e: 'dead', p: p.id });
}
