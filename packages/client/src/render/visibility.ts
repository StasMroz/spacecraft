import { segmentBlocked, type WallDef } from '@sms/shared';

/** Eye of the local marine: null while not alive (spectating sees everything). */
export type Viewer = { x: number; y: number } | null;

/** False when a full wall stands between the local marine and (x, y). */
export const visibleTo = (
  walls: readonly WallDef[],
  viewer: Viewer,
  x: number,
  y: number,
): boolean => !viewer || !segmentBlocked(walls, viewer.x, viewer.y, x, y, 'full');
