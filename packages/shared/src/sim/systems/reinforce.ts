import { PLAYER } from '../../constants.js';
import { REINFORCE, reinforceBudget, reinforceCooldown } from '../../data/reinforce.js';
import { clamp } from '../../math/vec.js';
import { newSprintState } from '../../data/sprint.js';
import { pushOutOfWalls } from '../walls.js';
import { damageEnemy } from './combat.js';
import type { Player, ReinforcePod, ReinforceState, World } from '../types.js';

export function initReinforce(teamSize: number): ReinforceState {
  return {
    left: reinforceBudget(teamSize),
    cooldown: 0,
    streak: 0,
    streakAt: 0,
    pods: [],
  };
}

function resetMarine(p: Player, x: number, y: number): void {
  p.x = x;
  p.y = y;
  p.state = 'alive';
  p.hp = p.maxHp;
  p.downedTime = 0;
  p.reviveProgress = 0;
  p.invuln = REINFORCE.invulnS;
  p.fireCooldown = 0;
  p.reloadTimer = 0;
  p.triggerWasDown = false;
  p.venting = false;
  p.guarding = false;
  p.fireSlow = 0;
  p.moveFrac = 0;
  p.stillTime = 0;
  p.sprint = newSprintState();
  p.recoil = 0;
  p.diedAt = null;
}

function pickLanding(world: World, x: number, y: number): { x: number; y: number } {
  const { width, height } = world.map.arena;
  const r = PLAYER.radius;
  const pos = {
    x: clamp(x, r, width - r),
    y: clamp(y, r, height - r),
  };
  pushOutOfWalls(pos, r, world.map.walls);
  pos.x = clamp(pos.x, r, width - r);
  pos.y = clamp(pos.y, r, height - r);
  return pos;
}

function callerLanding(world: World, caller: Player): { x: number; y: number } {
  const r = REINFORCE.throwRange;
  return pickLanding(
    world,
    caller.x + Math.cos(caller.aim) * r,
    caller.y + Math.sin(caller.aim) * r,
  );
}

function autoLanding(world: World, p: Player): { x: number; y: number } {
  if (p.diedAt != null) return pickLanding(world, p.x, p.y);
  const s = world.map.playerSpawn;
  return pickLanding(world, s.x, s.y);
}

function nextDead(world: World): Player | undefined {
  const inflight = new Set(world.reinforce.pods.map((pod) => pod.playerId));
  return world.players
    .filter((p) => p.state === 'dead' && !inflight.has(p.id))
    .sort((a, b) => (a.diedAt ?? 0) - (b.diedAt ?? 0) || a.id - b.id)[0];
}

export function canCallReinforce(world: World): boolean {
  const rf = world.reinforce;
  if (world.over || rf.left <= 0 || rf.cooldown > 0) return false;
  return nextDead(world) !== undefined;
}

/**
 * Spends one reinforcement and queues a drop pod. Returns false if the call is rejected.
 * `at` omitted = auto (death/spawn) landing.
 */
export function callReinforce(world: World, at?: { x: number; y: number }): boolean {
  if (!canCallReinforce(world)) return false;
  const p = nextDead(world)!;
  const pos = at ? pickLanding(world, at.x, at.y) : autoLanding(world, p);
  const pod: ReinforcePod = {
    id: world.nextId++,
    playerId: p.id,
    x: pos.x,
    y: pos.y,
    t: REINFORCE.landS,
  };
  const rf = world.reinforce;
  rf.left -= 1;
  rf.cooldown = reinforceCooldown(rf.streak);
  rf.streak += 1;
  rf.streakAt = world.time;
  rf.pods.push(pod);
  world.events.push({ e: 'pod', x: Math.round(pod.x), y: Math.round(pod.y), p: p.id });
  return true;
}

function land(world: World, pod: ReinforcePod): void {
  const p = world.players.find((x) => x.id === pod.playerId);
  const pos = pickLanding(world, pod.x, pod.y);
  // Impact kills Tyranids in the landing zone; marines are not hurt (this is a friendly pod).
  for (const e of world.enemies) {
    if (e.dead || e.burrowed) continue;
    const def = world.content.enemy(e.type);
    const d = Math.hypot(e.x - pos.x, e.y - pos.y) - def.radius;
    if (d > REINFORCE.impactRadius) continue;
    const falloff = 1 - Math.min(1, Math.max(0, d) / REINFORCE.impactRadius);
    damageEnemy(world, e, REINFORCE.impactDamage * falloff, {
      strength: REINFORCE.impactStrength,
      ap: REINFORCE.impactAp,
      kx: e.x - pos.x,
      ky: e.y - pos.y,
      knockback: 280,
    });
  }
  if (p && p.state === 'dead') resetMarine(p, pos.x, pos.y);
  world.events.push({ e: 'land', x: Math.round(pos.x), y: Math.round(pos.y), p: pod.playerId });
}

export function updateReinforce(world: World, dt: number): void {
  const rf = world.reinforce;
  if (rf.cooldown > 0) rf.cooldown = Math.max(0, rf.cooldown - dt);
  if (rf.streak > 0 && rf.cooldown <= 0 && world.time - rf.streakAt >= REINFORCE.streakDecayS) {
    rf.streak -= 1;
    rf.streakAt = world.time;
  }

  for (const pod of rf.pods) {
    pod.t -= dt;
    if (pod.t <= 0) land(world, pod);
  }
  rf.pods = rf.pods.filter((pod) => pod.t > 0);

  if (world.over) return;

  // Living marine pressed the reinforce one-shot: drop a brother ahead of their aim.
  const callers = world.players
    .filter((p) => p.state === 'alive' && p.input.reinforce)
    .sort((a, b) => a.id - b.id);
  if (callers[0]) callReinforce(world, callerLanding(world, callers[0]));

  // If nobody is left standing, auto-call after the cooldown while the budget lasts.
  const anyoneAlive = world.players.some((p) => p.state === 'alive');
  if (!anyoneAlive) callReinforce(world);
}

/** True when the squad is wiped and no pod can still bring someone back. */
export function squadWiped(world: World): boolean {
  if (world.players.some((p) => p.state === 'alive')) return false;
  if (world.reinforce.pods.length > 0) return false;
  if (world.reinforce.left > 0) return false; // auto-call will fire once cooldown ends
  return true;
}
