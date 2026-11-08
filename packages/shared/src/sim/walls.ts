import type { ArenaSize, WallDef } from '../maps/types.js';

/** Pushes a circle (pos, r) out of every wall it overlaps, along the shortest way out. */
export function pushOutOfWalls(
  pos: { x: number; y: number },
  r: number,
  walls: readonly WallDef[],
): boolean {
  let moved = false;
  for (const w of walls) {
    const cx = Math.max(w.x, Math.min(pos.x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(pos.y, w.y + w.h));
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    moved = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * r;
      pos.y = cy + (dy / d) * r;
      continue;
    }
    // Centre inside the block: leave through the nearest side.
    const left = pos.x - w.x;
    const right = w.x + w.w - pos.x;
    const top = pos.y - w.y;
    const bottom = w.y + w.h - pos.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) pos.x = w.x - r;
    else if (m === right) pos.x = w.x + w.w + r;
    else if (m === top) pos.y = w.y - r;
    else pos.y = w.y + w.h + r;
  }
  return moved;
}

/** Entry parameter t ∈ [0, 1] of the segment into the wall grown by `pad`, or null (slab test). */
export function segmentEntry(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: WallDef,
  pad = 0,
): number | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (
    clip(-dx, x0 - (w.x - pad)) &&
    clip(dx, w.x + w.w + pad - x0) &&
    clip(-dy, y0 - (w.y - pad)) &&
    clip(dy, w.y + w.h + pad - y0)
  )
    return t0;
  return null;
}

/** True when any wall of `kind` (default: any) crosses the segment. */
export function segmentBlocked(
  walls: readonly WallDef[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  kind?: WallDef['kind'],
  pad = 0,
): boolean {
  for (const w of walls) {
    if (kind && w.kind !== kind) continue;
    if (segmentEntry(x0, y0, x1, y1, w, pad) !== null) return true;
  }
  return false;
}

export const insideWall = (walls: readonly WallDef[], x: number, y: number, pad = 0): boolean =>
  walls.some((w) => x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad);

/** Grid distance field (BFS) towards a set of goals around the walls; -1 = blocked / unreachable. */
export interface FlowField {
  cell: number;
  cols: number;
  rows: number;
  dist: Int32Array;
}

export const FLOW_CELL = 40;
/** Cells this close to a wall count as blocked, so paths keep bodies clear of corners. */
const FLOW_PAD = 14;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

export function buildFlowField(
  arena: ArenaSize,
  walls: readonly WallDef[],
  goals: readonly { x: number; y: number }[],
): FlowField {
  const cell = FLOW_CELL;
  const cols = Math.ceil(arena.width / cell);
  const rows = Math.ceil(arena.height / cell);
  const blocked = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++)
      if (insideWall(walls, (cx + 0.5) * cell, (cy + 0.5) * cell, FLOW_PAD))
        blocked[cy * cols + cx] = 1;
  const dist = new Int32Array(cols * rows).fill(-1);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  for (const g of goals) {
    const i = cellIndex(cols, rows, cell, g.x, g.y);
    if (dist[i] !== -1) continue;
    dist[i] = 0;
    queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++]!;
    const cx = i % cols;
    const cy = (i - cx) / cols;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = ny * cols + nx;
      if (blocked[n] || dist[n] !== -1) continue;
      // No corner cutting past a blocked cell.
      if (dx && dy && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
      dist[n] = dist[i]! + 1;
      queue[tail++] = n;
    }
  }
  return { cell, cols, rows, dist };
}

const cellIndex = (cols: number, rows: number, cell: number, x: number, y: number): number =>
  Math.min(rows - 1, Math.max(0, Math.floor(y / cell))) * cols +
  Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));

/** Unit direction downhill from (x, y), or null when the field has nothing better here. */
export function flowDirection(f: FlowField, x: number, y: number): { x: number; y: number } | null {
  const i = cellIndex(f.cols, f.rows, f.cell, x, y);
  const cx = i % f.cols;
  const cy = (i - cx) / f.cols;
  const here = f.dist[i]!;
  let best = here === -1 ? Infinity : here;
  let bx = 0;
  let by = 0;
  for (const [dx, dy] of DIRS) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= f.cols || ny >= f.rows) continue;
    const d = f.dist[ny * f.cols + nx]!;
    if (d === -1 || d >= best) continue;
    if (dx && dy && (f.dist[cy * f.cols + nx] === -1 || f.dist[ny * f.cols + cx] === -1)) continue;
    best = d;
    bx = (nx + 0.5) * f.cell - x;
    by = (ny + 0.5) * f.cell - y;
  }
  const l = Math.hypot(bx, by);
  return l > 1e-6 ? { x: bx / l, y: by / l } : null;
}
