import type { WallDef } from '@sms/shared';

const byFoot = (a: WallDef, b: WallDef): number => a.y + a.h - (b.y + b.h);

/**
 * Split walls into paint layers. Low cover sits on the ground and must be drawn
 * *before* LOS shadows so a tall wall hides it; full (tall) walls are the
 * occluders and are painted after the shadow so their faces stay visible.
 * Each layer is y-sorted (farther / smaller foot-Y first) so two walls of the
 * same kind also stack correctly.
 */
export function wallLayers(walls: readonly WallDef[]): { low: WallDef[]; full: WallDef[] } {
  const low: WallDef[] = [];
  const full: WallDef[] = [];
  for (const w of walls) {
    if (w.kind === 'full') full.push(w);
    else low.push(w);
  }
  low.sort(byFoot);
  full.sort(byFoot);
  return { low, full };
}
