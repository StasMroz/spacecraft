import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { ENEMIES, WEAPONS, type EnemySize } from '../src/data/index.js';
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

function world(): World {
  const w = createWorld([{ id: 1, name: 'M1' }], 7);
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
function shoot(types: string[], gap = 40): { hit: number[]; ids: number[] } {
  const w = world();
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

const bySize = (size: EnemySize) => ENEMIES.filter((e) => e.size === size).map((e) => e.id);

describe('Meltagun single direct hit (v20: no pierce)', () => {
  it('classes every enemy by body size', () => {
    expect(bySize('tiny')).toEqual(['ripper']);
    expect(bySize('small').sort()).toEqual([
      'genestealer',
      'hormagaunt',
      'spore_mine',
      'termagant',
    ]);
    expect(bySize('medium').sort()).toEqual(['biovore', 'ravener', 'warrior']);
    expect(bySize('large').sort()).toEqual(['carnifex', 'psychophage']);
  });

  it.each(['carnifex', 'warrior', 'termagant', 'ripper'] as const)(
    'a row of %s: only the first takes the direct hit',
    (type) => {
      const { hit, ids } = shoot(Array(4).fill(type), type === 'carnifex' ? 80 : 40);
      expect(hit).toEqual([ids[0]]);
    },
  );

  it('mixed sizes: one direct hit, nearest first, whatever its size', () => {
    const a = shoot(['ripper', 'carnifex', 'termagant'], 60);
    expect(a.hit).toEqual([a.ids[0]]);
    const b = shoot(['warrior', 'ripper', 'ripper'], 50);
    expect(b.hit).toEqual([b.ids[0]]);
  });

  it('melta has no pierce and no size budget; other weapons keep theirs', () => {
    expect(melta.projectile.pierce).toBe(0);
    expect(melta.projectile.pierceBudget).toBeUndefined();
    expect(melta.fireInterval).toBe(1.13);
    expect(WEAPONS.some((w) => w.projectile.pierceBudget)).toBe(false);
  });

  it('far low cover: the beam either stops ON it and flashes there, or flies on to max range', () => {
    let onCover = 0;
    let atRange = 0;
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
      expect(booms).toHaveLength(1); // exactly one flash per shot
      if (booms[0]! >= 700 && booms[0]! <= 722) onCover++;
      else if (booms[0]! > 800) atRange++;
    }
    expect(onCover + atRange).toBe(80);
    expect(onCover).toBeGreaterThan(24);
    expect(atRange).toBeGreaterThan(24);
  });
});
