import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { CRASH, DIRECTOR, GUARDSMAN } from '../src/data/index.js';
import { createWireCodec } from '../src/net/index.js';
import {
  buildFlowField,
  buildSnapshot,
  createWorld,
  insideWall,
  snapWalls,
  stepWorld,
  type World,
} from '../src/sim/index.js';
import { isBossWave, spawnEnemy } from '../src/sim/systems/director.js';
import { isCrashWave } from '../src/sim/systems/crash.js';
import { spawnAcid } from '../src/sim/systems/acid.js';

function crashWorld(seed = 3, players = 1): World {
  const w = createWorld(
    Array.from({ length: players }, (_, i) => ({ id: i + 1, name: `M${i + 1}` })),
    seed,
  );
  w.director.idle = true;
  w.director.phase = 'active';
  w.director.wave = CRASH.firstWave;
  w.director.waveStartedAt = 0;
  for (const p of w.players) p.hp = p.maxHp = 1e9;
  return w;
}
const run = (w: World, s: number) => {
  const evs: string[] = [];
  for (let i = 0; i < Math.round(s / TICK_DT); i++) {
    stepWorld(w, TICK_DT);
    for (const e of w.events) evs.push(e.e);
  }
  return evs;
};
const CRASH_TIME = CRASH.delay + CRASH.fallTime + CRASH.smokeTime + 0.5;

function sealed(w: World): number {
  const f = buildFlowField(w.map.arena, w.map.walls, [w.map.playerSpawn]);
  let n = 0;
  for (let i = 0; i < f.dist.length; i++) {
    const x = ((i % f.cols) + 0.5) * f.cell;
    const y = (Math.floor(i / f.cols) + 0.5) * f.cell;
    if (f.dist[i] === -1 && !insideWall(w.map.walls, x, y, 14)) n++;
  }
  return n;
}

describe('Imperial ship crash (event of existing waves)', () => {
  it('happens on waves 4, 7, 10…, never on a boss or support-boss wave', () => {
    const waves = Array.from({ length: 30 }, (_, i) => i + 1).filter(isCrashWave);
    expect(waves.slice(0, 4)).toEqual([4, 7, 10, 13]);
    const sup = DIRECTOR.support!;
    for (const v of waves) {
      expect(isBossWave(DIRECTOR, v)).toBe(false);
      expect(v >= sup.firstWave && (v - sup.firstWave) % sup.everyWave === 0).toBe(false);
    }
  });

  it('warns, falls, smokes, then leaves wreck walls and Guardsmen — away from marines', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = crashWorld(seed);
      const p = w.players[0]!;
      const evs = run(w, CRASH.delay + 0.2);
      expect(evs).toContain('crash');
      const c = w.crash!;
      expect(c.phase).toBe('fall');
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      expect(d).toBeGreaterThanOrEqual(CRASH.minPlayerDist);
      expect(d).toBeLessThanOrEqual(CRASH.maxPlayerDist);
      for (const s of w.map.director.spawnPoints)
        expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeGreaterThanOrEqual(CRASH.spawnClear);
      expect(run(w, CRASH.fallTime)).toContain('crashHit');
      expect(w.crash?.phase).toBe('smoke');
      expect(w.wreck).toHaveLength(0);
      expect(run(w, CRASH.smokeTime + 0.2)).toContain('allies');
      expect(w.crash).toBeNull();
      expect(w.wreck.length).toBeGreaterThanOrEqual(1);
      expect(w.wreck.length).toBeLessThanOrEqual(CRASH.pieces[1]);
      expect(w.allies).toHaveLength(CRASH.soldiers[0]);
      // nobody buried, no sealed pockets, deploy point and breaches clear
      expect(insideWall(w.wreck, p.x, p.y, 20)).toBe(false);
      for (const a of w.allies) expect(insideWall(w.map.walls, a.x, a.y, 2)).toBe(false);
      for (const s of w.map.director.spawnPoints)
        expect(insideWall(w.wreck, s.x, s.y, 100)).toBe(false);
      expect(sealed(w)).toBe(0);
      expect(w.map.walls.slice(-w.wreck.length)).toEqual(w.wreck);
    }
  });

  it('the impact hurts Tyranids at the site, never marines', () => {
    const w = crashWorld(4);
    run(w, CRASH.delay + 0.1);
    const c = w.crash!;
    const g = spawnEnemy(w, 'hormagaunt', c.x + 20, c.y);
    g.hp = g.maxHp = 1e6;
    const hp = w.players[0]!.hp;
    for (let t = 0; t < Math.round((CRASH.fallTime + 0.1) / TICK_DT); t++) {
      g.x = c.x + 20;
      g.y = c.y;
      stepWorld(w, TICK_DT);
    }
    expect(g.hp).toBeLessThan(1e6);
    expect(w.players[0]!.hp).toBe(hp);
  });

  it('caps wreck pieces and Guardsmen over many crashes', () => {
    const w = crashWorld(8);
    for (let k = 0; k < 8; k++) {
      w.director.wave = CRASH.firstWave + k * CRASH.everyWave;
      w.director.waveStartedAt = w.time;
      run(w, CRASH_TIME);
    }
    expect(w.wreck.length).toBeLessThanOrEqual(CRASH.maxPieces);
    expect(w.allies.length).toBeLessThanOrEqual(CRASH.maxAllies);
    expect(sealed(w)).toBe(0);
  });
});

describe('Guardsmen', () => {
  const withAllies = (seed = 3, players = 1) => {
    const w = crashWorld(seed, players);
    run(w, CRASH_TIME);
    expect(w.allies.length).toBeGreaterThan(0);
    return w;
  };

  it('hold by the wreck during their wave and shoot a visible Tyranid', () => {
    const w = withAllies();
    const a = w.allies[0]!;
    const e = spawnEnemy(w, 'carnifex', a.x + 250, a.y);
    e.hp = e.maxHp = 1e6;
    for (let t = 0; t < 60; t++) {
      e.x = a.x + 250;
      e.y = a.y;
      stepWorld(w, TICK_DT);
    }
    expect(e.hp).toBeLessThan(1e6);
    for (const x of w.allies)
      expect(Math.hypot(x.x - x.homeX, x.y - x.homeY)).toBeLessThan(GUARDSMAN.holdRadius + 40);
    expect(w.allies.every((x) => !x.follow)).toBe(true);
  });

  it('never shoot through a full wall', () => {
    const w = withAllies();
    const a = w.allies[0]!;
    w.allies = [a];
    w.map = {
      ...w.map,
      walls: [...w.map.walls, { x: a.x + 100, y: a.y - 300, w: 30, h: 600, kind: 'full' }],
    };
    const e = spawnEnemy(w, 'carnifex', a.x + 300, a.y);
    e.hp = e.maxHp = 1e6;
    for (let t = 0; t < 60; t++) {
      e.x = a.x + 300;
      e.y = a.y;
      stepWorld(w, TICK_DT);
    }
    expect(e.hp).toBe(1e6);
    expect(w.projectiles.filter((p) => p.kind === 'lasgun')).toHaveLength(0);
  });

  it('lasgun shots over far low cover: some stop on it, some reach the Tyranid', () => {
    const w = withAllies();
    const a = w.allies[0]!;
    w.allies = [a];
    const wx = a.x + 150;
    w.map = {
      ...w.map,
      walls: [...w.map.walls, { x: wx, y: a.y - 300, w: 24, h: 600, kind: 'low' }],
    };
    const e = spawnEnemy(w, 'carnifex', a.x + 320, a.y);
    e.hp = e.maxHp = 1e6;
    let onCover = 0;
    let reached = 0;
    for (let t = 0; t < 300; t++) {
      e.x = a.x + 320;
      e.y = a.y;
      stepWorld(w, TICK_DT);
      for (const ev of w.events) {
        if (ev.e === 'bnc' && ev.k === 'lasgun' && Math.abs(ev.x - wx) < 12) onCover++;
        if ((ev.e === 'hit' || ev.e === 'bnc') && ev.k === 'lasgun' && ev.x > a.x + 260) reached++;
      }
    }
    expect(onCover).toBeGreaterThan(3);
    expect(reached).toBeGreaterThan(3);
  });

  it('stay where they landed after the wave: never follow, never walk', () => {
    for (const seed of [1, 2, 5, 7, 9]) {
      const w = withAllies(seed, 2);
      const [p1, p2] = w.players;
      p1!.x = 400;
      p1!.y = 400;
      p2!.x = 2800;
      p2!.y = 1800;
      const home = w.allies.map((a) => ({ x: a.x, y: a.y }));
      w.director.phase = 'breather';
      run(w, 25);
      expect(w.allies.every((a) => !a.follow)).toBe(true);
      w.allies.forEach((a, i) => {
        expect(Math.hypot(a.x - home[i]!.x, a.y - home[i]!.y), `seed ${seed}`).toBeLessThan(1);
      });
    }
  });

  it('Tyranid bites can kill them; marine acid does not; no friendly fire on marines', () => {
    const w = withAllies();
    const a = w.allies[0]!;
    spawnAcid(w, a.x, a.y, { radius: 60, duration: 3, damage: 50, interval: 0.25 });
    const hp0 = a.hp;
    const php = w.players[0]!.hp;
    run(w, 1);
    expect(a.hp).toBe(hp0);
    const g = spawnEnemy(w, 'hormagaunt', a.x + 20, a.y);
    g.hp = g.maxHp = 1e6;
    for (let t = 0; t < 30 * 8 && !a.dead; t++) {
      g.x = a.x + 20;
      g.y = a.y;
      stepWorld(w, TICK_DT);
    }
    expect(a.dead || !w.allies.includes(a)).toBe(true);
    expect(w.players[0]!.hp).toBe(php);
  });

  it('snapshot carries Guardsmen, crash and wreck losslessly; same seed, same crash', () => {
    const w = crashWorld(6);
    run(w, CRASH.delay + 1);
    const s1 = buildSnapshot(w, 60);
    expect(s1.cr?.[2]).toBe(1);
    run(w, CRASH.fallTime + CRASH.smokeTime);
    const s2 = buildSnapshot(w, 60);
    expect(s2.al!.length).toBeGreaterThan(0);
    expect(s2.wk!.length).toBe(w.wreck.length);
    const host = createWireCodec();
    const client = createWireCodec();
    for (const s of [s1, s2]) {
      const f = host.encode({ t: 'snap', s });
      expect(f).toBeInstanceOf(Uint8Array);
      const got = (client.decode(f) as { s: typeof s }).s;
      expect(got.al).toEqual(s.al);
      expect(got.cr).toEqual(s.cr);
      expect(got.wk).toEqual(s.wk);
    }
    expect(snapWalls(w.content.map.walls, s2.wk).length).toBe(w.map.walls.length);
    const again = crashWorld(6);
    run(again, CRASH.delay + 1 + CRASH.fallTime + CRASH.smokeTime);
    expect(JSON.stringify(buildSnapshot(again, 60).wk)).toBe(JSON.stringify(s2.wk));
    expect(JSON.stringify(again.allies)).toBe(JSON.stringify(w.allies));
  });
});
