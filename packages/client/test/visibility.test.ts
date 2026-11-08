import { describe, expect, it } from 'vitest';
import type { WallDef } from '@sms/shared';
import { visibleTo } from '../src/render/visibility.js';

const walls: WallDef[] = [
  { x: 100, y: 0, w: 20, h: 200, kind: 'full' },
  { x: 100, y: 300, w: 20, h: 200, kind: 'low' },
];

describe('what the local marine can see', () => {
  it('nothing behind a full wall', () => {
    expect(visibleTo(walls, { x: 50, y: 100 }, 200, 100)).toBe(false);
  });
  it('over low cover and in the open', () => {
    expect(visibleTo(walls, { x: 50, y: 400 }, 200, 400)).toBe(true);
    expect(visibleTo(walls, { x: 50, y: 250 }, 200, 250)).toBe(true);
  });
  it('everything while not alive (spectating)', () => {
    expect(visibleTo(walls, null, 200, 100)).toBe(true);
  });
});
