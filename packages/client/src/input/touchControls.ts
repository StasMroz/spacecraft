/**
 * Phone pad: SPRINT and the weapon wheel sit above the right AIM·FIRE stick (CSS px).
 * Pure layout + hit-tests, unit tested, no DOM.
 */

export const AIM_HINT = { xFromRight: 230, fromBottom: 100 } as const;
export const TOUCH_BTN = 56;
/** Gap from the AIM stick centre up to the SPRINT button centre. */
export const SPRINT_ABOVE_AIM = 100;
/** Gap from the SPRINT centre up to the weapon-wheel handle centre. */
export const WHEEL_ABOVE_SPRINT = 64;
export const WHEEL_RADIUS = 112;
/** Inner dead zone of the open wheel (the handle itself). */
export const WHEEL_INNER = 28;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TouchPadLayout {
  aim: { x: number; y: number };
  sprint: Rect;
  wheel: Rect;
  wheelCenter: { x: number; y: number };
  wheelRadius: number;
}

export function touchPadLayout(w: number, h: number): TouchPadLayout {
  const aimX = w - AIM_HINT.xFromRight;
  const aimY = h - AIM_HINT.fromBottom;
  const size = TOUCH_BTN;
  const sprintCx = aimX;
  const sprintCy = aimY - SPRINT_ABOVE_AIM;
  const wheelCx = aimX;
  const wheelCy = sprintCy - WHEEL_ABOVE_SPRINT;
  return {
    aim: { x: aimX, y: aimY },
    sprint: { x: sprintCx - size / 2, y: sprintCy - size / 2, w: size, h: size },
    wheel: { x: wheelCx - size / 2, y: wheelCy - size / 2, w: size, h: size },
    wheelCenter: { x: wheelCx, y: wheelCy },
    wheelRadius: WHEEL_RADIUS,
  };
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

/**
 * Even slices around the wheel, starting at the top and going clockwise.
 * Returns the index in 0..count-1, or -1 if the point is inside the handle or outside the rim.
 */
export function wheelSliceAt(
  cx: number,
  cy: number,
  radius: number,
  x: number,
  y: number,
  count: number,
): number {
  if (count <= 0) return -1;
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d < WHEEL_INNER || d > radius + 16) return -1;
  const ang = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2); // 0 = up, clockwise
  return Math.min(count - 1, Math.floor((ang / (Math.PI * 2)) * count));
}

export type TouchHit = { kind: 'sprint' } | { kind: 'wheel' } | { kind: 'slot'; slot: number };

export function hitTouchPad(
  layout: TouchPadLayout,
  x: number,
  y: number,
  opts: { wheelOpen: boolean; slots: readonly number[] },
): TouchHit | null {
  if (opts.wheelOpen && opts.slots.length) {
    const i = wheelSliceAt(
      layout.wheelCenter.x,
      layout.wheelCenter.y,
      layout.wheelRadius,
      x,
      y,
      opts.slots.length,
    );
    if (i >= 0) return { kind: 'slot', slot: opts.slots[i]! };
  }
  if (inRect(layout.sprint, x, y)) return { kind: 'sprint' };
  if (inRect(layout.wheel, x, y)) return { kind: 'wheel' };
  return null;
}
