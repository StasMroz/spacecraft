import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, TICK_DT } from '../src/constants.js';
import {
  DEFAULT_MISSION_ID,
  MISSIONS,
  REINFORCE,
  defaultContent,
  countsForLeaderboard,
  findMission,
  getMission,
  reinforceBudget,
  reinforceCooldown,
  validateMissions,
} from '../src/data/index.js';
import { getMap, MAPS, validateMapRegistry } from '../src/maps/index.js';
import { HostSession } from '../src/session/hostSession.js';
import { applyInput, createWorld, spawnEnemy, stepWorld } from '../src/sim/index.js';
import { emptyInput, type PlayerInput } from '../src/sim/types.js';
import { damagePlayer } from '../src/sim/systems/combat.js';
import { callReinforce, canCallReinforce } from '../src/sim/systems/reinforce.js';

const one = (mission = DEFAULT_MISSION_ID, seed = 1) =>
  createWorld([{ id: 1, name: 'A' }], seed, defaultContent, undefined, mission);

const steps = (w: ReturnType<typeof createWorld>, n: number, input?: Partial<PlayerInput>) => {
  for (let i = 0; i < n; i++) {
    if (input) applyInput(w, 1, { ...emptyInput(), seq: i + 1, ...input });
    stepWorld(w, TICK_DT);
  }
};

describe('mission catalogue', () => {
  it('validates and every mission map is registered', () => {
    expect(validateMissions()).toEqual([]);
    expect(validateMapRegistry()).toEqual([]);
    expect(DEFAULT_MISSION_ID).toBe('hive_siege');
    expect(getMission().id).toBe('hive_siege');
    expect(findMission('nope')).toBeUndefined();
    for (const m of MISSIONS) {
      expect(
        MAPS.some((x) => x.id === m.map),
        m.map,
      ).toBe(true);
      expect(getMap(m.map).id).toBe(m.map);
    }
    expect(MISSIONS.map((m) => m.id)).toEqual([
      'hive_siege',
      'hold_the_line',
      'evacuation',
      'synapse_purge',
      'relic_recovery',
      'infiltration',
      'fortress_raid',
    ]);
  });

  it('createWorld defaults to hive siege on the wave map, with a reinforcement budget', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 3);
    expect(w.mission.id).toBe('hive_siege');
    expect(w.map.id).toBe('wave');
    expect(w.mission.crates).toBe(true);
    expect(w.mission.crash).toBe(true);
    expect(w.mission.timeLimit).toBeNull();
    expect(w.reinforce.left).toBe(reinforceBudget(1));
    expect(w.reinforce.left).toBe(5);
  });
});

describe('mission timer and extract', () => {
  it('hold_the_line fails when the time limit runs out with the hunt unfinished', () => {
    const w = one('hold_the_line');
    expect(w.mission.timeLimit).toBe(190);
    expect(w.mission.extractOpensAt).toBeNull();
    const ticks = Math.ceil(191 / TICK_DT);
    for (let i = 0; i < ticks && !w.over; i++) stepWorld(w, TICK_DT);
    expect(w.over).toBe(true);
    expect(w.mission.outcome).toBe('defeat');
  });

  it('extract succeeds when the marine stands in the open zone for the hold time', () => {
    const w = one('hold_the_line', 11);
    w.director.nextWaveAt = 1e9; // no swarm
    w.enemies.length = 0;
    const m = w.mission;
    m.extractOpensAt = 0;
    m.extractWindow = null;
    m.timeLimit = 30;
    m.extractOpen = true;
    const p = w.players[0]!;
    p.x = m.extractX;
    p.y = m.extractY;
    steps(w, Math.ceil((m.extractHold + 0.2) / TICK_DT));
    expect(w.over).toBe(true);
    expect(w.mission.outcome).toBe('victory');
  });

  it('a marine in the zone at the time limit gets a last chance to finish the hold', () => {
    const w = one('evacuation', 4);
    w.director.nextWaveAt = 1e9;
    w.enemies.length = 0;
    const m = w.mission;
    m.extractOpensAt = 0;
    m.extractWindow = 1;
    m.timeLimit = 1;
    m.extractHold = 0.4;
    m.extractOpen = true;
    const p = w.players[0]!;
    p.x = m.extractX;
    p.y = m.extractY;
    steps(w, Math.ceil(0.2 / TICK_DT));
    expect(w.over).toBe(false);
    expect(w.mission.extractProgress).toBeGreaterThan(0);
    steps(w, Math.ceil(0.5 / TICK_DT));
    expect(w.over).toBe(true);
    expect(w.mission.outcome).toBe('victory');
  });
});

describe('destroy and retrieve objectives', () => {
  it('synapse capillaries take damage and extract opens after the last one falls', () => {
    const w = one('synapse_purge', 2);
    expect(w.map.id).toBe('jungle');
    expect(w.mission.targets).toHaveLength(3);
    expect(w.mission.extractOpen).toBe(false);
    for (const t of w.mission.targets) t.hp = 0;
    steps(w, 3);
    expect(w.mission.extractOpen).toBe(true);
    const p = w.players[0]!;
    p.x = w.mission.extractX;
    p.y = w.mission.extractY;
    w.enemies.length = 0;
    w.director.nextWaveAt = 1e9;
    steps(w, Math.ceil((w.mission.extractHold + 0.2) / TICK_DT));
    expect(w.mission.outcome).toBe('victory');
  });

  it('the relic must be carried into the extract zone; it drops when the carrier is downed', () => {
    const w = one('relic_recovery', 5);
    expect(w.map.id).toBe('ice');
    expect(w.mission.crates).toBe(false);
    expect(w.mission.crash).toBe(false);
    expect(w.mission.relicCarrier).toBeNull();
    const p = w.players[0]!;
    p.x = w.mission.relicX!;
    p.y = w.mission.relicY!;
    steps(w, 4);
    expect(w.mission.relicCarrier).toBe(1);
    // downed (not last-alive? last alive becomes dead) — drop
    p.invuln = 0;
    damagePlayer(w, p, 10_000);
    steps(w, 2);
    expect(w.mission.relicCarrier).toBeNull();
    expect(w.mission.relicX).toBeDefined();
  });

  it('relic_recovery does not spawn supply crates (warp shadow)', () => {
    const w = one('relic_recovery', 8);
    for (let i = 0; i < Math.ceil(30 / TICK_DT); i++) stepWorld(w, TICK_DT);
    expect(w.pickups.some((p) => p.kind === 'weapon')).toBe(false);
    expect(w.director.nextCrateAt).toBe(Infinity);
  });
});

describe('reinforcements', () => {
  it('a solo death with budget left is not a wipe; a pod lands after the cooldown', () => {
    const w = one('hive_siege', 9);
    const p = w.players[0]!;
    p.invuln = 0;
    const left = w.reinforce.left;
    damagePlayer(w, p, 10_000);
    stepWorld(w, TICK_DT);
    expect(p.state).toBe('dead');
    expect(w.over).toBe(false);
    expect(w.reinforce.cooldown).toBeGreaterThan(0);
    expect(w.reinforce.left).toBe(left); // not spent until the auto-call
    const wait = Math.ceil((reinforceCooldown(0) + REINFORCE.landS + 0.2) / TICK_DT);
    for (let i = 0; i < wait && p.state !== 'alive'; i++) {
      w.enemies.length = 0;
      stepWorld(w, TICK_DT);
    }
    expect(p.state).toBe('alive');
    expect(p.hp).toBe(p.maxHp);
    expect(p.invuln).toBeGreaterThan(0);
    expect(w.reinforce.left).toBe(left - 1);
    expect(w.over).toBe(false);
  });

  it('wipe with an empty budget ends the mission', () => {
    const w = one('hive_siege', 6);
    w.reinforce.left = 0;
    const p = w.players[0]!;
    p.invuln = 0;
    damagePlayer(w, p, 10_000);
    stepWorld(w, TICK_DT);
    expect(p.state).toBe('dead');
    expect(w.over).toBe(true);
    expect(w.mission.outcome).toBe('defeat');
  });

  it('a living teammate can call a pod at their aim, and landing kills nearby xenos', () => {
    const w = createWorld(
      [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      3,
    );
    expect(w.reinforce.left).toBe(reinforceBudget(2));
    const a = w.players[0]!;
    const b = w.players[1]!;
    b.invuln = 0;
    // kill B only (A still alive — no auto)
    b.hp = 0;
    b.state = 'dead';
    b.diedAt = 0;
    a.x = 1600;
    a.y = 1100;
    a.aim = 0;
    expect(canCallReinforce(w)).toBe(true);
    applyInput(w, 1, { ...emptyInput(), seq: 1, reinforce: true, aim: 0 });
    stepWorld(w, TICK_DT);
    expect(w.reinforce.pods).toHaveLength(1);
    expect(w.reinforce.left).toBe(reinforceBudget(2) - 1);
    const pod = w.reinforce.pods[0]!;
    expect(pod.playerId).toBe(2);
    expect(pod.x).toBeGreaterThan(a.x);
    let landed = false;
    // Wait until the pod is about to hit, then park a ripper on the landing mark
    // (if we spawned earlier the AI would walk out of the blast).
    while (w.reinforce.pods[0] && w.reinforce.pods[0]!.t > TICK_DT + 1e-6) {
      stepWorld(w, TICK_DT);
    }
    const mark = w.reinforce.pods[0]!;
    spawnEnemy(w, 'ripper', mark.x, mark.y);
    stepWorld(w, TICK_DT);
    const revived = w.players.find((p) => p.id === 2)!;
    landed = w.events.some((e) => e.e === 'land') || revived.state === 'alive';
    expect(landed).toBe(true);
    expect(revived.state).toBe('alive');
    expect(revived.invuln).toBeGreaterThan(0);
    expect(w.enemies.filter((e) => e.type === 'ripper' && !e.dead)).toHaveLength(0);
  });

  it('cooldown grows with a death streak and the budget is shared', () => {
    expect(reinforceCooldown(0)).toBe(REINFORCE.cooldownBaseS);
    expect(reinforceCooldown(1)).toBe(REINFORCE.cooldownBaseS + REINFORCE.cooldownPerStreakS);
    expect(reinforceCooldown(99)).toBe(REINFORCE.cooldownCapS);
    const w = one('hive_siege', 2);
    w.players[0]!.state = 'dead';
    w.players[0]!.diedAt = 0;
    // living? no — auto will wait. Force a direct call after setting cooldown 0 and a dummy living?
    // callReinforce works without a living caller (auto path). First call:
    w.reinforce.cooldown = 0;
    expect(callReinforce(w)).toBe(true);
    const first = w.reinforce.cooldown;
    expect(first).toBe(reinforceCooldown(0));
    // land and die again
    w.reinforce.pods[0]!.t = 0;
    stepWorld(w, TICK_DT); // lands, then status... player is alive. kill again:
    w.players[0]!.state = 'dead';
    w.players[0]!.diedAt = w.time;
    w.reinforce.cooldown = 0;
    expect(callReinforce(w)).toBe(true);
    expect(w.reinforce.cooldown).toBe(reinforceCooldown(1));
    expect(w.reinforce.cooldown).toBeGreaterThan(first);
  });
});

describe('host / protocol API', () => {
  it('HostSession.setMission changes the lobby mission and start payload, protocol is 10', () => {
    expect(PROTOCOL_VERSION).toBe(10);
    const h = new HostSession({ roomCode: 'T', mode: 'local' });
    expect(h.getMissionId()).toBe('hive_siege');
    h.setMission('synapse_purge');
    expect(h.getMissionId()).toBe('synapse_purge');
    expect(() => h.setMission('nope')).toThrow();
  });
});

describe('ranked leaderboard mission', () => {
  it('hive_siege is the only ranked mission and legacy runs still count', () => {
    expect(getMission('hive_siege').ranked).toBe(true);
    expect(MISSIONS.filter((m) => m.ranked).map((m) => m.id)).toEqual(['hive_siege']);
    expect(countsForLeaderboard()).toBe(true);
    expect(countsForLeaderboard('hive_siege')).toBe(true);
    expect(countsForLeaderboard('hold_the_line')).toBe(false);
    expect(countsForLeaderboard('synapse_purge')).toBe(false);
    expect(validateMissions()).toEqual([]);
  });
});
