import { TICK_DT } from '../constants.js';
import { SpatialHash } from './spatialHash.js';
import { updateDirector } from './systems/director.js';
import { updateEnemies } from './systems/enemies.js';
import { updateAcid } from './systems/acid.js';
import { updatePickups } from './systems/pickups.js';
import { updatePlayerMovement, updatePlayerStatus } from './systems/players.js';
import { updateProjectiles } from './systems/projectiles.js';
import { unlockWaveWeapons, updatePlayerWeapon } from './systems/weapons.js';
import type { Enemy, PlayerInput, World } from './types.js';

const enemyHash = new SpatialHash<Enemy>(64);

/** Sets a player's input for the next tick. */
export function applyInput(world: World, playerId: number, input: PlayerInput): void {
  const p = world.players.find((x) => x.id === playerId);
  if (!p) return;
  p.input = input;
  if (input.seq > p.lastInputSeq) p.lastInputSeq = input.seq;
}

function rebuildHash(world: World): void {
  enemyHash.clear();
  for (const e of world.enemies) if (!e.dead) enemyHash.insert(e);
}

/**
 * Advances the world by one fixed tick. System order matters and is the main
 * extension point: add new systems here.
 */
export function stepWorld(world: World, dt: number = TICK_DT): void {
  if (world.over) return;
  world.events = [];
  world.tick++;
  world.time += dt;

  updatePlayerMovement(world, dt);
  for (const p of world.players) updatePlayerWeapon(world, p, dt);

  rebuildHash(world);
  const prevWave = world.director.wave;
  updateDirector(world, dt);
  // Weapons unlock at the start of their wave (after the director's 'surge' event).
  if (world.director.wave !== prevWave) unlockWaveWeapons(world, world.director.wave);
  updateEnemies(world, enemyHash, dt);

  rebuildHash(world);
  updateProjectiles(world, enemyHash, dt);
  updateAcid(world, dt);
  updatePickups(world, dt);
  updatePlayerStatus(world, dt);
  world.enemies = world.enemies.filter((e) => !e.dead);

  // One-shot inputs are consumed once per tick.
  for (const p of world.players) {
    p.input = { ...p.input, slot: 0, reload: false };
  }
}
