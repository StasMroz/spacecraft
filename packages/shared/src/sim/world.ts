import { PLAYER } from '../constants.js';
import { defaultContent, newSprintState, type ContentRegistry } from '../data/index.js';
import { Rng } from '../math/rng.js';
import { emptyInput, type Player, type World } from './types.js';

export interface PlayerSetup {
  id: number;
  name: string;
  /** Chapter index; defaults to the player's position in the list. */
  chapter?: number;
}

export function createWorld(
  players: PlayerSetup[],
  seed: number,
  content: ContentRegistry = defaultContent,
  /** Registered map id; omitted = the map of `content` (the wave map by default). */
  mapId?: string,
): World {
  if (mapId !== undefined) content = content.withMap(mapId);
  const map = content.map;
  const d = content.director;
  const world: World = {
    content,
    map,
    seed,
    rng: new Rng(seed),
    tick: 0,
    time: 0,
    nextId: 1,
    players: [],
    enemies: [],
    projectiles: [],
    pickups: [],
    acid: [],
    allies: [],
    crash: null,
    crashWave: -1,
    wreck: [],
    director: {
      queue: [],
      activeUntil: d.spawnPoints.map(() => -1),
      surgePoints: [],
      wave: 0,
      phase: 'breather',
      nextWaveAt: d.waves.firstDelay,
      waveStartedAt: 0,
      roster: [],
      dispatch: 0,
      waveTotal: 0,
      waveChildren: 0,
      hunting: false,
      huntAt: -1,
      drops: { medkits: 0, crates: 0 },
      nextCrateAt: Infinity,
      bossWaves: 0,
      idle: false,
    },
    events: [],
    teamSize: players.length,
    over: false,
    stats: { kills: 0, shots: 0, killsByType: {} },
  };
  const spawn = map.playerSpawn;
  const cx = spawn.x;
  const cy = spawn.y;
  players.forEach((setup, i) => {
    const a = (i / Math.max(1, players.length)) * Math.PI * 2;
    // ring grows with the squad so up to MAX_PLAYERS (8) marines start apart, not overlapping
    const offset =
      players.length > 1 ? Math.max(spawn.ringMin, players.length * spawn.ringPerMarine) : 0;
    world.players.push(
      createPlayer(
        content,
        setup,
        setup.chapter ?? i,
        cx + Math.cos(a) * offset,
        cy + Math.sin(a) * offset,
      ),
    );
  });
  return world;
}

export function createPlayer(
  content: ContentRegistry,
  setup: PlayerSetup,
  chapter: number,
  x: number,
  y: number,
): Player {
  const weapons = content.startingWeapons();
  const ammo: Record<string, number> = {};
  for (const w of content.weaponOrder) ammo[w.id] = w.magazine;
  return {
    id: setup.id,
    name: setup.name,
    chapter,
    x,
    y,
    aim: 0,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    state: 'alive',
    downedTime: 0,
    reviveProgress: 0,
    invuln: 0,
    weapons,
    current: weapons[0],
    ammo,
    fireCooldown: 0,
    reloadTimer: 0,
    triggerWasDown: false,
    heat: {},
    venting: false,
    input: emptyInput(),
    lastInputSeq: 0,
    connected: true,
    kills: 0,
    score: 0,
    killsByType: {},
    stillTime: 0,
    fireSlow: 0,
    recoil: 0,
    moveFrac: 0,
    sprint: newSprintState(),
    guarding: false,
    damageDealt: 0,
    diedAt: null,
  };
}

export const allocId = (world: World): number => world.nextId++;

export const alivePlayers = (world: World): Player[] =>
  world.players.filter((p) => p.state === 'alive');
