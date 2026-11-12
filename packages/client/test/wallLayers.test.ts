import { describe, expect, it } from 'vitest';
import type { WallDef } from '@sms/shared';
import { wallLayers } from '../src/render/wallLayers.js';

const low = (x: number, y: number, w: number, h: number): WallDef => ({
  x,
  y,
  w,
  h,
  kind: 'low',
});
const full = (x: number, y: number, w: number, h: number): WallDef => ({
  x,
  y,
  w,
  h,
  kind: 'full',
});

describe('wallLayers', () => {
  it('paints every low cover before every tall wall, regardless of source order', () => {
    const walls = [
      full(0, 0, 40, 200),
      low(80, 400, 120, 24),
      full(200, 80, 200, 40),
      low(10, 10, 80, 20),
    ];
    const { low: lows, full: fulls } = wallLayers(walls);
    expect(lows.every((w) => w.kind === 'low')).toBe(true);
    expect(fulls.every((w) => w.kind === 'full')).toBe(true);
    expect(lows).toHaveLength(2);
    expect(fulls).toHaveLength(2);
  });

  it('y-sorts each layer by the foot of the wall (farther first)', () => {
    const { low: lows, full: fulls } = wallLayers([
      low(0, 80, 40, 20),
      low(0, 10, 40, 20),
      full(0, 200, 40, 20),
      full(0, 50, 40, 80),
    ]);
    expect(lows.map((w) => w.y)).toEqual([10, 80]);
    expect(fulls.map((w) => w.y + w.h)).toEqual([130, 220]);
  });

  it('keeps a low cover that sits behind a tall wall in the low (under-shadow) layer', () => {
    const tall = full(100, 200, 300, 32);
    const hidden = low(140, 80, 200, 24);
    const { low: lows, full: fulls } = wallLayers([tall, hidden]);
    expect(lows).toEqual([hidden]);
    expect(fulls).toEqual([tall]);
  });
});
