import { describe, expect, it } from 'vitest';
import { PLAYER, TICK_DT } from '../src/constants.js';
import { defaultContent } from '../src/data/index.js';
import { MISSIONS } from '../src/data/missions.js';
import { MAPS } from '../src/maps/index.js';
import {
  applyInput,
  buildFlowField,
  createWorld,
  emptyInput,
  insideWall,
  stepWorld,
} from '../src/sim/index.js';

const squad = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `M${i + 1}` }));

const cellPos = (f: { cols: number; cell: number }, i: number) => ({
  x: ((i % f.cols) + 0.5) * f.cell,
  y: (Math.floor(i / f.cols) + 0.5) * f.cell,
});

describe('every map keeps play space open', () => {
  for (const m of MAPS) {
    it(`${m.id}: breaches, vents and the deploy ring stay clear of walls`, () => {
      for (const sp of m.director.spawnPoints)
        expect(insideWall(m.walls, sp.x, sp.y, 80), sp.id).toBe(false);
      const ring = Math.max(m.playerSpawn.ringMin, 8 * m.playerSpawn.ringPerMarine) + PLAYER.radius;
      expect(insideWall(m.walls, m.playerSpawn.x, m.playerSpawn.y, ring + 20)).toBe(false);
    });

    it(`${m.id}: every open cell is reachable from the deploy zone`, () => {
      const f = buildFlowField(m.arena, m.walls, [m.playerSpawn]);
      const trapped: string[] = [];
      for (let i = 0; i < f.dist.length; i++) {
        const { x, y } = cellPos(f, i);
        if (!insideWall(m.walls, x, y, 14) && f.dist[i]! < 0)
          trapped.push(`${Math.round(x)},${Math.round(y)}`);
      }
      expect(trapped, trapped.slice(0, 8).join('; ')).toEqual([]);
    });
  }
});

describe('every mission drops, objectives and extract stay valid', () => {
  for (const def of MISSIONS) {
    it(`${def.id}: start, objectives and extract are not inside walls and stay reachable`, () => {
      const content = defaultContent.withMap(def.map);
      const w = createWorld(squad(2), 7, content, undefined, def.id);
      for (const p of w.players) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y), `player ${p.id} pos`).toBe(true);
        expect(insideWall(w.map.walls, p.x, p.y, PLAYER.radius - 1), `player ${p.id} in wall`).toBe(
          false,
        );
      }
      const start = { x: w.players[0]!.x, y: w.players[0]!.y };
      const f = buildFlowField(w.map.arena, w.map.walls, [start]);
      const i = (x: number, y: number) => {
        const col = Math.min(f.cols - 1, Math.max(0, Math.floor(x / f.cell)));
        const row = Math.min(f.rows - 1, Math.max(0, Math.floor(y / f.cell)));
        return f.dist[row * f.cols + col]!;
      };
      expect(i(start.x, start.y), 'start cell').toBeGreaterThanOrEqual(0);
      if (w.mission.extractX) {
        expect(
          insideWall(w.map.walls, w.mission.extractX, w.mission.extractY, 20),
          'extract in wall',
        ).toBe(false);
        expect(
          i(w.mission.extractX, w.mission.extractY),
          'extract unreachable',
        ).toBeGreaterThanOrEqual(0);
      }
      for (const t of w.mission.targets) {
        expect(insideWall(w.map.walls, t.x, t.y, t.r - 2), `target ${t.id} in wall`).toBe(false);
        expect(i(t.x, t.y), `target ${t.id} unreachable`).toBeGreaterThanOrEqual(0);
      }
      if (w.mission.relicX != null && w.mission.relicY != null) {
        expect(
          insideWall(w.map.walls, w.mission.relicX, w.mission.relicY, 12),
          'relic in wall',
        ).toBe(false);
        expect(i(w.mission.relicX, w.mission.relicY), 'relic unreachable').toBeGreaterThanOrEqual(
          0,
        );
      }
      for (const e of w.enemies) {
        expect(Number.isFinite(e.x) && Number.isFinite(e.y), `enemy ${e.id}`).toBe(true);
        expect(insideWall(w.map.walls, e.x, e.y, 8), `enemy ${e.id} ${e.type} in wall`).toBe(false);
      }
    });

    it(`${def.id}: a short run does not produce NaN or embed anyone in a wall`, () => {
      const content = defaultContent.withMap(def.map);
      const w = createWorld(squad(2), 11, content, undefined, def.id);
      for (let t = 0; t < 90; t++) {
        applyInput(w, 1, { ...emptyInput(), seq: t + 1, mx: 1, my: 0, fire: t % 15 === 0 });
        applyInput(w, 2, { ...emptyInput(), seq: t + 1, mx: 0, my: 1 });
        stepWorld(w, TICK_DT);
      }
      const nan: string[] = [];
      for (const p of w.players) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp))
          nan.push(`player ${p.id}`);
        expect(insideWall(w.map.walls, p.x, p.y, PLAYER.radius - 2), `player ${p.id} stuck`).toBe(
          false,
        );
      }
      for (const e of w.enemies) {
        if (e.dead) continue;
        if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp))
          nan.push(`enemy ${e.id}`);
        expect(insideWall(w.map.walls, e.x, e.y, 6), `enemy ${e.id} stuck in wall`).toBe(false);
      }
      expect(nan).toEqual([]);
    });
  }
});
