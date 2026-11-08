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

describe('Meltagun size-weighted pierce', () => {
  it('classes every enemy by body size', () => {
    expect(bySize('tiny')).toEqual(['ripper']);
    expect(bySize('small').sort()).toEqual([
      'genestealer',
      'hormagaunt',
      'spore_mine',
      'termagant',
    ]);
    expect(bySize('medium').sort()).toEqual(['biovore', 'ravener', 'warrior']);
    expect(bySize('large')).toEqual(['carnifex']);
  });

  it.each([
    ['carnifex', 1, 90],
    ['warrior', 2, 60],
    ['ravener', 2, 60],
    ['biovore', 2, 60],
    ['termagant', 3, 40],
    ['hormagaunt', 3, 40],
    ['genestealer', 3, 40],
    ['ripper', 4, 30],
  ] as const)('a row of %s: %i hit', (type, n, gap) => {
    const { hit, ids } = shoot(Array(6).fill(type), gap);
    expect(hit).toEqual(ids.slice(0, n));
  });

  it('mixes share one budget, spent nearest first', () => {
    // small 4 + small 4 + ripper 3 = 11, the next small (4) no longer fits
    const a = shoot(['termagant', 'termagant', 'ripper', 'termagant', 'ripper'], 40);
    expect(a.hit).toEqual(a.ids.slice(0, 3));
    // medium 6 + ripper 3 + ripper 3 = 12
    const b = shoot(['warrior', 'ripper', 'ripper', 'ripper'], 45);
    expect(b.hit).toEqual(b.ids.slice(0, 3));
  });

  it('a target too big for what is left stops the beam; nothing behind it is hit', () => {
    const a = shoot(['ripper', 'carnifex', 'ripper', 'ripper'], 70);
    expect(a.hit).toEqual([a.ids[0]]);
    const b = shoot(['termagant', 'termagant', 'warrior', 'ripper'], 50);
    expect(b.hit).toEqual(b.ids.slice(0, 2));
  });

  it('hits each enemy at most once', () => {
    const { hit } = shoot(Array(6).fill('ripper'), 30);
    expect(new Set(hit).size).toBe(hit.length);
  });

  it('leaves every other weapon on plain pierce', () => {
    expect(WEAPONS.filter((w) => w.projectile.pierceBudget).map((w) => w.id)).toEqual(['meltagun']);
    expect(melta.projectile.pierceBudget).toEqual({
      total: 12,
      cost: { tiny: 3, small: 4, medium: 6, large: 12 },
    });
  });
});
