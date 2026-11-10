import { circle, ellipse, line, roundRect, shade } from './draw.js';
import { animLayout, type Ctx, type SpriteDef } from './types.js';

/**
 * Astra Militarum Guardsman, top-down, facing +X. A human silhouette (head in a flak
 * helmet, vest, arms with a lasgun, striding legs) — not a coloured disc.
 * World size 52×52, stored at 2×. Walk cycle only; firing is a projectile/muzzle elsewhere.
 */
export const GUARDSMAN_SIZE = 52;
export const GUARDSMAN_SCALE = 2;
const C = GUARDSMAN_SIZE / 2;
const WALK = animLayout([['walk', 6]]);

const KHAKI = '#8a7d52';
const KHAKI_DARK = '#4a4428';
const OLIVE = '#3e4a32';
const OLIVE_LIGHT = '#6a7854';
const HELMET = '#4a5238';
const HELMET_DARK = '#2a3020';
const BOOT = '#2c2a22';
const WEB = '#5c4030';
const GUN = '#2a2a24';
const GUN_LIGHT = '#5a5a54';

function drawGuardsman(ctx: Ctx, frame: number): void {
  const step = Math.sin((frame / 6) * Math.PI * 2);
  ctx.save();
  ctx.translate(C, C);
  // Two distinct legs, planted wide and striding along +X (front/back).
  for (const [side, ph] of [
    [-1, 1],
    [1, -1],
  ] as const) {
    const fx = ph * step * 7.5;
    // hip to boot: a long khaki limb, clearly separate from the torso
    roundRect(ctx, -8 + fx, side * 7.4 - 2.5, 14.5, 5, 2, shade(KHAKI, -0.1), KHAKI_DARK, 0.9);
    roundRect(ctx, 4.2 + fx, side * 7.4 - 2.3, 5.8, 4.6, 1.4, BOOT, '#111', 0.6);
  }
  // Narrow elongated torso (a vest, not a disc) sitting between the legs.
  ellipse(ctx, -1, 0, 6.2, 6.6, shade(KHAKI, -0.05), KHAKI_DARK, 0.9);
  roundRect(ctx, -7.2, -6.4, 13.6, 12.8, 2, OLIVE, HELMET_DARK, 1.15);
  ellipse(ctx, -2.2, -2, 3.4, 2.2, shade(OLIVE_LIGHT, 0.08));
  line(ctx, -3.4, -4.8, -3.4, 4.6, WEB, 1.2);
  line(ctx, 2.6, -4.8, 2.6, 4.6, WEB, 1.2);
  roundRect(ctx, -2.6, 2.6, 5.4, 3.2, 0.9, shade(WEB, -0.08), '#1a120c', 0.55);
  // Shoulders / upper arms — wider than the helmet, so the figure reads as a person.
  ellipse(ctx, -1.5, -8.2, 3.6, 2.4, shade(KHAKI, -0.08), KHAKI_DARK, 0.7);
  ellipse(ctx, -1.5, 8.2, 3.6, 2.4, shade(KHAKI, -0.08), KHAKI_DARK, 0.7);
  ellipse(ctx, 4, 8.4, 5.6, 2.3, shade(KHAKI, -0.05), KHAKI_DARK, 0.8, 0.2);
  ellipse(ctx, 7.5, -5.6, 6, 2.2, shade(KHAKI, -0.05), KHAKI_DARK, 0.8, 0.45);
  circle(ctx, 11.5, 7.2, 1.8, shade(KHAKI, -0.25), KHAKI_DARK, 0.55);
  circle(ctx, 14.8, -3.6, 1.8, shade(KHAKI, -0.25), KHAKI_DARK, 0.55);
  // Lasgun along +X, held across the body (stock at the hip, barrel past the head).
  line(ctx, 2, 3.2, 23.5, 3.2, GUN, 2.4);
  line(ctx, 8, 3.2, 21, 3.2, GUN_LIGHT, 1.1);
  roundRect(ctx, 3.2, 1.8, 4, 3.2, 0.6, shade(GUN, 0.12), '#111', 0.5);
  roundRect(ctx, 10, 4, 5, 2.8, 0.7, GUN, '#111', 0.55);
  line(ctx, 18.4, 1.8, 18.4, -0.6, GUN_LIGHT, 1);
  line(ctx, 12.2, 1.9, 12.2, 0.4, GUN, 0.8);
  circle(ctx, 23.8, 3.2, 1.15, '#141412');
  // Helmeted head at the FRONT of the torso, smaller than the shoulders.
  ellipse(ctx, 5.2, 0, 2, 2.2, shade(KHAKI, -0.2));
  ellipse(ctx, 8.2, 0, 4.2, 4.3, HELMET, HELMET_DARK, 1.1);
  ellipse(ctx, 7.4, -1.2, 2.4, 1.7, shade(HELMET, 0.25));
  roundRect(ctx, 10.2, -1.9, 1.9, 3.8, 0.6, '#1a1e14', '#0a0c08', 0.45);
  ellipse(ctx, 9.2, 2, 2, 1.3, shade(HELMET, -0.15));
  ctx.restore();
}

export const guardsmanSprites: SpriteDef[] = [
  {
    key: 'ally_guardsman',
    group: 'player',
    w: GUARDSMAN_SIZE,
    h: GUARDSMAN_SIZE,
    scale: GUARDSMAN_SCALE,
    ...WALK,
    prompt:
      "Top-down (bird's-eye) human Astra Militarum Guardsman in khaki uniform and olive flak vest, bowl helmet with a visor slit at the front of the torso, two wide striding legs and arms holding a long lasgun with iron sights and a power pack; facing right; 6-frame walk cycle. A person, not a disc.",
    draw: (ctx, frame) => drawGuardsman(ctx, frame),
  },
];
