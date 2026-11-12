import { getMission } from '../../data/missions.js';
import { grantWeapon } from './weapons.js';
import type { World } from '../types.js';

/** Default frag target: first to 2 is a best-of-3. */
export const DUEL_FRAGS = 2;
export const DUEL_RESPAWN = 1.5;
export const DUEL_INVULN = 1.2;
const CORNER_PAD = 140;

export const isDuel = (world: World): boolean => world.mission.kind === 'duel';

/** Team 0 holds the west corners, team 1 the east. 1v1 = first vs second joiner. */
export function duelTeam(world: World, playerId: number): 0 | 1 {
  const i = world.players.findIndex((p) => p.id === playerId);
  if (i < 0) return 0;
  if (world.players.length <= 2) return i === 0 ? 0 : 1;
  return (i % 2) as 0 | 1;
}

export function duelScore(world: World): [number, number] {
  const s: [number, number] = [0, 0];
  for (const p of world.players) s[duelTeam(world, p.id)] += p.kills;
  return s;
}

export function duelCorner(world: World, team: 0 | 1, slot: number): { x: number; y: number } {
  const { width: W, height: H } = world.map.arena;
  const pad = CORNER_PAD;
  const pts =
    team === 0
      ? [
          { x: pad, y: pad },
          { x: pad, y: H - pad },
        ]
      : [
          { x: W - pad, y: pad },
          { x: W - pad, y: H - pad },
        ];
  return pts[slot % 2]!;
}

export function setupDuel(world: World): void {
  if (!isDuel(world)) return;
  world.director.idle = true;
  world.reinforce.left = 0;
  world.enemies = [];
  const slots: [number, number] = [0, 0];
  for (const p of world.players) {
    const team = duelTeam(world, p.id);
    const pos = duelCorner(world, team, slots[team]++);
    p.x = pos.x;
    p.y = pos.y;
    p.aim = team === 0 ? 0 : Math.PI;
    p.invuln = 1;
    const ch = world.content.chapter(p.chapter);
    for (const w of world.content.weaponsForChapter(ch.id)) {
      grantWeapon(world, p, w.id, { announce: false });
    }
  }
}

export function creditDuelKill(world: World, victimId: number, killerId: number): void {
  if (!isDuel(world) || killerId === victimId) return;
  if (duelTeam(world, killerId) === duelTeam(world, victimId)) return;
  const k = world.players.find((p) => p.id === killerId);
  if (!k) return;
  k.kills += 1;
  world.stats.kills += 1;
}

export function updateDuel(world: World, dt: number): void {
  if (!isDuel(world) || world.over) return;
  const to = getMission(world.mission.id).duelTo ?? DUEL_FRAGS;
  const slots: [number, number] = [0, 0];
  const slotOf = new Map<number, number>();
  for (const p of world.players) {
    const team = duelTeam(world, p.id);
    slotOf.set(p.id, slots[team]++);
  }
  for (const p of world.players) {
    if (p.state !== 'downed') continue;
    p.downedTime += dt;
    if (p.downedTime < DUEL_RESPAWN) continue;
    const team = duelTeam(world, p.id);
    const pos = duelCorner(world, team, slotOf.get(p.id) ?? 0);
    p.x = pos.x;
    p.y = pos.y;
    p.hp = p.maxHp;
    p.state = 'alive';
    p.downedTime = 0;
    p.reviveProgress = 0;
    p.invuln = DUEL_INVULN;
    p.aim = team === 0 ? 0 : Math.PI;
  }
  const [a, b] = duelScore(world);
  if (a >= to || b >= to) {
    world.mission.outcome = 'victory';
    world.over = true;
    world.events.push({ e: 'win' });
  }
}
