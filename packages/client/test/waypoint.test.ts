import { describe, expect, it } from 'vitest';
import { Camera } from '../src/render/camera.js';
import { edgeChevron, missionWaypoint } from '../src/render/waypoint.js';
import type { MissionSnap } from '@sms/shared';

const mi = (over: Partial<MissionSnap>): MissionSnap => ({
  id: 'hive_siege',
  tl: 60,
  eo: 0,
  ep: 0,
  ex: 2700,
  ey: 400,
  er: 80,
  tg: [],
  out: 0,
  ...over,
});

describe('missionWaypoint', () => {
  it('points at a live target, then at open extract', () => {
    expect(
      missionWaypoint(
        mi({
          id: 'synapse_purge',
          tg: [{ id: 0, x: 800, y: 2000, r: 28, hp: 400, maxHp: 400 }],
        }),
      ),
    ).toEqual({ x: 800, y: 2000, label: 'Cel' });
    expect(missionWaypoint(mi({ id: 'synapse_purge', eo: 1, tg: [] }))).toEqual({
      x: 2700,
      y: 400,
      label: 'Ekstrakcja',
    });
  });

  it('points at a ground relic, then extract once it is carried', () => {
    expect(missionWaypoint(mi({ id: 'relic_recovery', rx: 900, ry: 800, rr: 22, rc: 0 }))).toEqual({
      x: 900,
      y: 800,
      label: 'Relikwia',
    });
    expect(
      missionWaypoint(mi({ id: 'relic_recovery', rx: 900, ry: 800, rr: 22, rc: 1, eo: 1 })),
    ).toEqual({ x: 2700, y: 400, label: 'Ekstrakcja' });
  });
});

describe('edgeChevron + camera clamp', () => {
  it('hides when the target is on screen and sits on the pad when it is not', () => {
    const cam = { x: 2000, y: 1000, zoom: 1 };
    expect(edgeChevron(2000, 1000, cam, 800, 600, 40).hidden).toBe(true);
    const off = edgeChevron(6000, 1000, cam, 800, 600, 40);
    expect(off.hidden).toBe(false);
    if (off.hidden) throw new Error('expected visible chevron');
    expect(off.x).toBeCloseTo(800 - 40, 5);
    expect(off.y).toBeCloseTo(300, 5);
    expect(off.angle).toBeCloseTo(0, 5);
  });

  it('keeps a large-map camera from showing empty space past the arena edge', () => {
    const c = new Camera();
    c.resize(800, 600);
    c.setBounds(6400, 4400);
    c.follow(50, 50, 1, true);
    const hw = 800 / 2 / c.zoom;
    const hh = 600 / 2 / c.zoom;
    expect(c.x).toBeCloseTo(hw, 5);
    expect(c.y).toBeCloseTo(hh, 5);
    c.follow(8000, 8000, 1, true);
    expect(c.x).toBeCloseTo(6400 - hw, 5);
    expect(c.y).toBeCloseTo(4400 - hh, 5);
  });
});
