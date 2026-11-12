import { describe, expect, it } from 'vitest';
import { PLAYER, TICK_DT } from '../src/constants.js';
import { countsForLeaderboard, getMission } from '../src/data/missions.js';
import {
  applyInput,
  createWorld,
  damagePlayer,
  duelScore,
  duelTeam,
  emptyInput,
  isDuel,
  stepWorld,
  type World,
} from '../src/sim/index.js';
import { HostSession } from '../src/session/hostSession.js';

const pair = () => [
  { id: 1, name: 'A', chapter: 0 },
  { id: 2, name: 'B', chapter: 1 },
];

function duelWorld(n = 2, seed = 3): World {
  const players = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `M${i + 1}`,
    chapter: i,
  }));
  const w = createWorld(players, seed, undefined, undefined, 'duel');
  for (const p of w.players) p.invuln = 0;
  return w;
}

describe('PvP duel', () => {
  it('is a non-ranked catalogue entry and HostSession.setMission accepts it', () => {
    expect(getMission('duel').kind).toBe('duel');
    expect(getMission('duel').map).toBe('duel');
    expect(getMission('duel').duelTo).toBe(2);
    expect(countsForLeaderboard('duel')).toBe(false);
    const h = new HostSession({ roomCode: 'DUEL', mode: 'local' });
    h.setMission('duel');
    expect(h.getMissionId()).toBe('duel');
  });

  it('drops both marines in opposite corners with a full chapter loadout and no xenos', () => {
    const w = createWorld(pair(), 1, undefined, undefined, 'duel');
    expect(isDuel(w)).toBe(true);
    expect(w.director.idle).toBe(true);
    expect(w.enemies).toHaveLength(0);
    expect(w.reinforce.left).toBe(0);
    const [a, b] = w.players;
    expect(a!.x).toBeLessThan(w.map.arena.width / 2);
    expect(b!.x).toBeGreaterThan(w.map.arena.width / 2);
    expect(duelTeam(w, a!.id)).toBe(0);
    expect(duelTeam(w, b!.id)).toBe(1);
    expect(a!.weapons.length).toBeGreaterThan(2);
    expect(a!.weapons.some((id) => w.content.weapon(id).melee)).toBe(true);
  });

  it("a marine's bolt hits the opponent and does not hit a teammate", () => {
    const w = duelWorld(2, 4);
    const [a, b] = w.players;
    a!.x = 200;
    a!.y = 400;
    a!.aim = 0;
    b!.x = 500;
    b!.y = 400;
    b!.invuln = 0;
    a!.current = a!.weapons.find((id) => w.content.weapon(id).id === 'bolt_rifle') ?? a!.current;
    const hp = b!.hp;
    applyInput(w, 1, { ...emptyInput(), seq: 1, fire: true, aim: 0 });
    for (let t = 0; t < 20; t++) stepWorld(w, TICK_DT);
    expect(b!.hp).toBeLessThan(hp);

    const four = duelWorld(4, 5);
    const ally = four.players[2]!; // team 0 with player 1
    const foe = four.players[1]!;
    expect(duelTeam(four, four.players[0]!.id)).toBe(0);
    expect(duelTeam(four, ally.id)).toBe(0);
    expect(duelTeam(four, foe.id)).toBe(1);
    four.players[0]!.x = 200;
    four.players[0]!.y = 400;
    four.players[0]!.aim = 0;
    four.players[0]!.invuln = 0;
    ally.x = 500;
    ally.y = 400;
    ally.invuln = 0;
    foe.x = 1600;
    foe.y = 400;
    const allyHp = ally.hp;
    applyInput(four, 1, { ...emptyInput(), seq: 1, fire: true, aim: 0 });
    for (let t = 0; t < 20; t++) stepWorld(four, TICK_DT);
    expect(ally.hp).toBe(allyHp);
  });

  it('a kill credits the shooter, the loser respawns in their corner, and first to 2 ends the match', () => {
    const w = duelWorld(2, 6);
    const [a, b] = w.players;
    b!.invuln = 0;
    b!.hp = 5;
    damagePlayer(w, b!, 80, { fromX: a!.x, fromY: a!.y, playerId: a!.id });
    expect(b!.state).toBe('downed');
    expect(a!.kills).toBe(1);
    expect(duelScore(w)).toEqual([1, 0]);
    const cornerX = b!.x;
    for (let t = 0; t < 60; t++) stepWorld(w, TICK_DT);
    expect(b!.state).toBe('alive');
    expect(b!.hp).toBe(PLAYER.maxHp);
    expect(b!.x).toBeGreaterThan(w.map.arena.width / 2);
    // still the east corner (maybe not exact same if they were moved mid-fight)
    expect(Math.abs(b!.x - (w.map.arena.width - 140))).toBeLessThan(5);

    b!.invuln = 0;
    b!.hp = 5;
    damagePlayer(w, b!, 80, { fromX: a!.x, fromY: a!.y, playerId: a!.id });
    expect(a!.kills).toBe(2);
    stepWorld(w, TICK_DT);
    expect(w.over).toBe(true);
    expect(w.mission.outcome).toBe('victory');
    expect(duelScore(w)).toEqual([2, 0]);
    void cornerX;
  });
});
