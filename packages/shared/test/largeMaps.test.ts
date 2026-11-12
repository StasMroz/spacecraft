import { describe, expect, it } from 'vitest';
import { getMission } from '../src/data/missions.js';
import { CITY_MAP, DESERT_MAP, LARGE_ARENA, SHIP_MAP, VOLCANIC_MAP } from '../src/maps/index.js';

describe('large biomes', () => {
  it('registers four 2× arenas with distinct biomes', () => {
    for (const m of [CITY_MAP, DESERT_MAP, VOLCANIC_MAP, SHIP_MAP]) {
      expect(m.arena).toEqual(LARGE_ARENA);
      expect(m.arena.width).toBe(6400);
      expect(m.arena.height).toBe(4400);
      expect(m.walls.length).toBeGreaterThan(4);
    }
    expect(
      new Set(
        [CITY_MAP, DESERT_MAP, VOLCANIC_MAP, SHIP_MAP].map((m) => {
          if (!m.theme) throw new Error(`map ${m.id} has no theme`);
          return m.theme.biome;
        }),
      ).size,
    ).toBe(4);
  });

  it('puts the four offensive missions on the large biomes (ranked hive stays on wave)', () => {
    expect(getMission('infiltration').map).toBe('city');
    expect(getMission('relic_recovery').map).toBe('desert');
    expect(getMission('synapse_purge').map).toBe('volcanic');
    expect(getMission('evacuation').map).toBe('ship');
    expect(getMission('hive_siege').map).toBe('wave');
    expect(getMission('hold_the_line').map).toBe('wave');
    expect(getMission('fortress_raid').map).toBe('wave');
  });
});
