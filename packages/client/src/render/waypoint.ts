import { findMission, type MissionSnap } from '@sms/shared';

export type Waypoint = { x: number; y: number; label: string };

/** Next place the marine should go: live objective, carried relic's extract, or open extract. */
export function missionWaypoint(mi: MissionSnap | undefined): Waypoint | null {
  if (!mi) return null;
  const kind = findMission(mi.id)?.kind;
  if (kind === 'retrieve') {
    if (mi.rc) return { x: mi.ex, y: mi.ey, label: 'Ekstrakcja' };
    if (mi.rx !== undefined && mi.ry !== undefined)
      return { x: mi.rx, y: mi.ry, label: 'Relikwia' };
  }
  const live = mi.tg.find((t) => t.hp > 0);
  if (live) return { x: live.x, y: live.y, label: 'Cel' };
  if (mi.eo) return { x: mi.ex, y: mi.ey, label: 'Ekstrakcja' };
  return null;
}

export type Chevron = { hidden: true } | { hidden: false; x: number; y: number; angle: number };

/**
 * Project a world point to the screen edge (padded) when it sits outside the view.
 * `angle` points from the screen centre toward the target (radians, 0 = east).
 */
export function edgeChevron(
  wx: number,
  wy: number,
  cam: { x: number; y: number; zoom: number },
  screenW: number,
  screenH: number,
  margin = 56,
): Chevron {
  const sx = (wx - cam.x) * cam.zoom + screenW / 2;
  const sy = (wy - cam.y) * cam.zoom + screenH / 2;
  if (sx >= margin && sx <= screenW - margin && sy >= margin && sy <= screenH - margin) {
    return { hidden: true };
  }
  const cx = screenW / 2;
  const cy = screenH / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  const angle = Math.atan2(dy, dx);
  const left = margin;
  const right = screenW - margin;
  const top = margin;
  const bottom = screenH - margin;
  const hits: number[] = [];
  if (dx !== 0) {
    for (const ex of [left, right]) {
      const t = (ex - cx) / dx;
      const y = cy + t * dy;
      if (t > 0 && y >= top && y <= bottom) hits.push(t);
    }
  }
  if (dy !== 0) {
    for (const ey of [top, bottom]) {
      const t = (ey - cy) / dy;
      const x = cx + t * dx;
      if (t > 0 && x >= left && x <= right) hits.push(t);
    }
  }
  const t = hits.length ? Math.min(...hits) : 0;
  return { hidden: false, x: cx + t * dx, y: cy + t * dy, angle };
}
