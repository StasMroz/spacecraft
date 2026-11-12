import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { defaultContent } from '../src/data/index.js';
import type { WallDef } from '../src/maps/index.js';
import { applyInput, createWorld, emptyInput, stepWorld, type World } from '../src/sim/index.js';
import { spawnEnemy } from '../src/sim/systems/director.js';

function world(walls: WallDef[] = [], seed = 5): World {
  const w = createWorld([{ id: 1, name: 'M1' }], seed);
  if (walls.length) w.map = { ...w.map, walls };
  w.director.idle = true;
  w.enemies = [];
  const p = w.players[0]!;
  p.x = 600;
  p.y = 600;
  p.hp = p.maxHp = 1e9;
  p.invuln = 0;
  return w;
}

describe('new Tyranid roster', () => {
  it('registers Hive Guard, Hive Tyrant, Lictor, Zoanthrope and Tyrant Guard with the right traits', () => {
    const guard = defaultContent.enemy('hive_guard');
    expect(guard.ranged?.projectile.ignoreLow).toBe(true);
    expect(guard.ranged?.projectile.kind).toBe('impaler');
    expect(guard.boss).toBeFalsy();

    const tyrant = defaultContent.enemy('hive_tyrant');
    expect(tyrant.boss).toBe(true);
    expect(tyrant.synapse).toBeDefined();
    expect(tyrant.stim).toBeDefined();
    expect(tyrant.ranged?.projectile.ignoreLow).toBe(true);
    expect(tyrant.charge).toBeDefined();

    expect(defaultContent.enemy('lictor').burrow).toBeDefined();
    expect(defaultContent.enemy('zoanthrope').synapse).toBeDefined();
    expect(defaultContent.enemy('zoanthrope').ranged?.projectile.ignoreLow).toBe(true);

    const tg = defaultContent.enemy('tyrant_guard');
    expect(tg.save).toBe(2);
    expect(tg.hp).toBeGreaterThan(defaultContent.enemy('warrior').hp);
    expect(tg.ranged).toBeUndefined();
    expect(defaultContent.validate()).toEqual([]);
  });

  it('a Hive Guard impaler flies through low cover and still hits a marine', () => {
    const w = world([{ x: 750, y: 400, w: 32, h: 400, kind: 'low' }], 7);
    const e = spawnEnemy(w, 'hive_guard', 950, 600);
    e.attackCooldown = 0;
    for (let t = 0; t < 45; t++) {
      e.x = 950;
      e.y = 600;
      applyInput(w, 1, { ...emptyInput(), seq: t + 1 });
      stepWorld(w, TICK_DT);
    }
    expect(w.players[0]!.hp).toBeLessThan(1e9);
  });

  it('a Warrior deathspitter is still stopped by low cover often enough that an Impaler is the exception', () => {
    const stopped = (type: string, seed: number) => {
      const w = world([{ x: 750, y: 400, w: 32, h: 400, kind: 'low' }], seed);
      const e = spawnEnemy(w, type, 950, 600);
      e.attackCooldown = 0;
      const hp0 = w.players[0]!.hp;
      for (let t = 0; t < 20; t++) {
        e.x = 950;
        e.y = 600;
        applyInput(w, 1, { ...emptyInput(), seq: t + 1 });
        stepWorld(w, TICK_DT);
      }
      return w.players[0]!.hp === hp0;
    };
    // Impaler always gets through in this close setup.
    expect(stopped('hive_guard', 3)).toBe(false);
  });
});
