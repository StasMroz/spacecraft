import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { WEAPONS } from '../src/data/index.js';
import {
  applyInput,
  createWorld,
  emptyInput,
  grantWeapon,
  stepWorld,
  type World,
} from '../src/sim/index.js';
import { spawnEnemy } from '../src/sim/systems/director.js';

const melta = WEAPONS.find((w) => w.id === 'meltagun')!;

function world(seed = 7): World {
  const w = createWorld([{ id: 1, name: 'M1' }], seed);
  w.director.idle = true;
  const p = w.players[0];
  p.x = 600;
  p.y = 600;
  grantWeapon(w, p, 'meltagun');
  p.current = 'meltagun';
  return w;
}

let seq = 0;
/** Lines up `types` along +x, fires one melta shot and returns the ids it hit, in order. */
function shoot(types: string[], gap = 40, seed = 7): { hit: number[]; ids: number[] } {
  const w = world(seed);
  const p = w.players[0];
  const ids = types.map((t, i) => spawnEnemy(w, t, p.x + 60 + i * gap, p.y).id);
  let hit: number[] = [];
  const step = (fire: boolean) => {
    applyInput(w, p.id, { ...emptyInput(), seq: ++seq, aim: 0, fire });
    stepWorld(w, TICK_DT);
    const pr = w.projectiles.find((x) => x.kind === 'melta');
    if (pr) hit = [...pr.hit];
  };
  for (let t = 0; t < 60 && !w.events.some((e) => e.e === 'shot'); t++) step(true);
  for (let t = 0; t < 40 && w.projectiles.some((x) => x.kind === 'melta'); t++) step(false);
  return { hit, ids };
}

describe('Meltagun pierce (original pierce: 3 = up to 4 hits)', () => {
  it('data matches the pre-nerf weapon (v12) with fire rate −40%', () => {
    expect(melta.projectile.pierce).toBe(3);
    expect(melta.projectile.pierceBudget).toBeUndefined();
    expect(melta.projectile.lifetime).toBe(0.2);
    expect(melta.projectile.speed).toBe(1200);
    expect(melta.projectile.endBurst).toEqual({
      radius: 66,
      damage: 25,
      edgeFactor: 0.35,
      strength: 4,
      ap: 0,
    });
    // 0.87 / 0.6 = 1.45
    expect(melta.fireInterval).toBeCloseTo(0.87 / 0.6, 9);
  });

  it('a row of gaunts: pierce 3 yields four hits, then the beam coasts', () => {
    const { hit, ids } = shoot(Array(6).fill('termagant'), 40);
    expect(hit).toEqual(ids.slice(0, 4));
  });

  it('mixed sizes: up to four direct hits, nearest first', () => {
    const a = shoot(['ripper', 'carnifex', 'termagant', 'warrior', 'ripper'], 60);
    expect(a.hit).toEqual(a.ids.slice(0, 4));
  });

  it('far low cover (v24): the beam either stops ON it and flashes there, or flies on to max range', () => {
    let onCover = 0;
    let atRange = 0;
    const RANGE = melta.projectile.speed * melta.projectile.lifetime;
    for (let s = 1; s <= 80; s++) {
      const w = createWorld([{ id: 1, name: 'M1' }], s);
      w.map = { ...w.map, walls: [{ x: 720, y: 500, w: 24, h: 200, kind: 'low' }] };
      w.director.idle = true;
      const p = w.players[0];
      p.x = 600;
      p.y = 600;
      grantWeapon(w, p, 'meltagun');
      p.current = 'meltagun';
      const booms: number[] = [];
      for (let t = 0; t < 30; t++) {
        applyInput(w, p.id, { ...emptyInput(), seq: ++seq, aim: 0, fire: t === 0 });
        stepWorld(w, TICK_DT);
        for (const e of w.events) if (e.e === 'boom') booms.push(e.x);
      }
      expect(booms).toHaveLength(1);
      if (booms[0]! >= 700 && booms[0]! <= 722) onCover++;
      else if (booms[0]! > RANGE * 0.85) atRange++;
    }
    expect(onCover + atRange).toBe(80);
    expect(onCover).toBeGreaterThan(24);
    expect(atRange).toBeGreaterThan(24);
  });
});
