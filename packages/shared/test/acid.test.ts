import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { ENEMIES } from '../src/data/enemies.js';
import type { WallDef } from '../src/maps/index.js';
import { createWireCodec } from '../src/net/index.js';
import {
  buildSnapshot,
  createWorld,
  stepWorld,
  type Projectile,
  type World,
} from '../src/sim/index.js';
import { spawnAcid } from '../src/sim/systems/acid.js';
import { spawnEnemy } from '../src/sim/systems/director.js';

const def = (id: string) => ENEMIES.find((e) => e.id === id)!;
const termPool = def('termagant').ranged!.projectile.pool!;
const fexLob = def('carnifex').lobAttack!;

function world(walls: WallDef[] = [], seed = 5): World {
  const w = createWorld([{ id: 1, name: 'M1' }], seed);
  w.map = { ...w.map, walls };
  w.director.idle = true;
  const p = w.players[0]!;
  p.x = 600;
  p.y = 600;
  p.hp = p.maxHp = 1000;
  p.aim = Math.PI; // facing away from shots coming from the right: no front-plate ricochet
  return w;
}

const steps = (w: World, n: number) => {
  for (let i = 0; i < n; i++) stepWorld(w, TICK_DT);
};

function shot(w: World, x: number, y: number, vx: number, life: number, pool = termPool): void {
  w.projectiles.push({
    id: 9000 + w.projectiles.length,
    owner: 'enemy',
    ownerId: 0,
    kind: 'fleshborer',
    x,
    y,
    vx,
    vy: 0,
    life,
    radius: 6,
    damage: 7,
    pierceLeft: 0,
    ap: 0,
    drag: 0,
    knockback: 0,
    pool,
    hit: [],
    dead: false,
  } as Projectile);
}

describe('acid spit', () => {
  it('spitter shots fly faster than before (v16: fleshborer 430, deathspitter 480)', () => {
    expect(def('termagant').ranged!.projectile.speed).toBeGreaterThan(430);
    expect(def('warrior').ranged!.projectile.speed).toBeGreaterThan(480);
  });

  it('a miss leaves a pool that burns a marine inside, then dries up', () => {
    const w = world();
    shot(w, 900, 600, -400, 0.4); // dies ~740 px: short of the marine
    steps(w, 30);
    expect(w.acid).toHaveLength(1);
    const pool = w.acid[0]!;
    const p = w.players[0]!;
    p.x = pool.x;
    p.y = pool.y;
    const hp = p.hp;
    steps(w, Math.round(1.05 / TICK_DT)); // ~2 burn ticks
    expect(hp - p.hp).toBe(2 * termPool.damage);
    expect(p.invuln).toBe(0); // burns grant no i-frames
    steps(w, Math.round(termPool.duration / TICK_DT));
    expect(w.acid).toHaveLength(0);
    const dry = p.hp;
    steps(w, 30);
    expect(p.hp).toBe(dry);
  });

  it('a hit on the marine leaves no small pool; a shot off the map none either', () => {
    const w = world();
    shot(w, 700, 600, -400, 2);
    shot(w, 30, 100, -400, 2);
    steps(w, 30);
    expect(w.players[0]!.hp).toBeLessThan(1000);
    expect(w.acid).toHaveLength(0);
  });

  it('a shot stopped by a full wall splashes on the shooter side', () => {
    const w = world([{ x: 780, y: 500, w: 20, h: 200, kind: 'full' }]);
    shot(w, 900, 600, -400, 2);
    steps(w, 30);
    expect(w.acid).toHaveLength(1);
    expect(w.acid[0]!.x).toBeGreaterThanOrEqual(800);
  });

  it('acid never burns through a full wall', () => {
    const w = world([{ x: 595, y: 500, w: 10, h: 200, kind: 'full' }]);
    const p = w.players[0]!;
    p.x = 590;
    spawnAcid(w, 612, 600, { radius: 40, duration: 3, damage: 5, interval: 0.25 });
    steps(w, 60);
    expect(p.hp).toBe(1000);
  });
});

describe('Carnifex acid glob', () => {
  const lobWorld = (d: number, walls: WallDef[] = []) => {
    const w = world(walls);
    const e = spawnEnemy(w, 'carnifex', 600 + d, 600);
    e.lobCooldown = 0;
    e.chargeCooldown = 99; // isolate the lob from the charge
    return w;
  };
  const globs = (w: World) => w.projectiles.filter((p) => p.kind === 'bioacid');

  it('lobs at a visible marine in range and leaves a big lasting pool', () => {
    const w = lobWorld(400);
    stepWorld(w, TICK_DT);
    expect(globs(w)).toHaveLength(1);
    const p = w.players[0]!;
    p.x = 600;
    p.y = 600;
    steps(w, Math.round(1.2 / TICK_DT));
    expect(w.acid.some((a) => a.r === fexLob.projectile.pool!.radius)).toBe(true);
    const a = w.acid.find((x) => x.r === fexLob.projectile.pool!.radius)!;
    expect(Math.hypot(a.x - 600, a.y - 600)).toBeLessThan(60); // lands where the marine stood
    expect(a.duration).toBeGreaterThanOrEqual(5);
  });

  it('holds fire when too close or behind a full wall', () => {
    expect(
      globs(
        (() => {
          const w = lobWorld(150);
          stepWorld(w, TICK_DT);
          return w;
        })(),
      ),
    ).toHaveLength(0);
    const w = lobWorld(400, [{ x: 780, y: 400, w: 20, h: 400, kind: 'full' }]);
    stepWorld(w, TICK_DT);
    expect(globs(w)).toHaveLength(0);
  });
});

describe('acid over the network', () => {
  it('pools survive the binary snapshot round trip', () => {
    const w = world();
    spawnAcid(w, 123.4, 456.7, termPool);
    spawnAcid(w, 300, 300, fexLob.projectile.pool!);
    steps(w, 3);
    const s = buildSnapshot(w, 60);
    const host = createWireCodec();
    const client = createWireCodec();
    const frame = host.encode({ t: 'snap', s });
    expect(frame).toBeInstanceOf(Uint8Array);
    const got = client.decode(frame) as { s: typeof s };
    expect(got.s.ac).toEqual(s.ac);
    expect(s.ac).toHaveLength(2);
  });

  it('same seed, same acid', () => {
    const run = () => {
      const w = world([], 11);
      shot(w, 900, 600, -400, 0.4);
      spawnEnemy(w, 'carnifex', 1000, 600).lobCooldown = 0;
      steps(w, 200);
      return JSON.stringify(w.acid) + w.players[0]!.hp;
    };
    expect(run()).toBe(run());
  });
});
