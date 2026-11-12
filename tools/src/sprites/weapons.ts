import { defaultContent } from '@sms/shared';
import { circle, ellipse, glow, line, poly, rgba, roundRect } from './draw.js';
import { GRIP_L, GRIP_R, MARINE_SCALE, MARINE_SIZE } from './marines.js';
import type { Ctx, SpriteDef } from './types.js';

/** Accent colour per weapon (crate light strip, icon glow). */
export const WEAPON_TINT: Record<string, string> = {
  bolt_rifle: '#e0b44a',
  heavy_bolter: '#ff9a3a',
  flamer: '#ff6a1a',
  plasma_gun: '#59c8ff',
  meltagun: '#ff5a2a',
  frag_grenade: '#a9c25a',
  storm_bolter: '#3a6cff',
  inferno_pistol: '#ff4a2a',
  plasma_caster: '#3cff9a',
  siege_bolter: '#e8d24a',
  plasma_pistol: '#8ec8ff',
  bolt_carbine: '#e84848',
  stalker_bolter: '#5a5a68',
  power_sword: '#6a9cff',
  encarmine_blade: '#ff2a3a',
  heavenfall_blade: '#d9cda4',
  thunder_hammer: '#c9a227',
  frost_axe: '#9fe8ff',
  forge_hammer: '#ff6a1a',
  power_glaive: '#e8d24a',
  lightning_claws: '#b8e0ff',
};

const BRASS = '#b8913a';
const GUN = '#26282d';
const GUN_D = '#0b0c0e';
const GUN_L = '#4a4f58';

/* -------------------------------------------- HUD icons (side view, 64x28) */

const ICONS: Record<string, (ctx: Ctx, c: string, d: string) => void> = {
  bolt_rifle: (ctx, c, d) => {
    poly(
      ctx,
      [
        [0, 9],
        [8, 10],
        [8, 18],
        [0, 21],
      ],
      c,
      d,
      1.2,
    ); // stock
    roundRect(ctx, 8, 8, 30, 11, 2, c, d, 1.5); // receiver
    roundRect(ctx, 36, 11, 22, 5, 1, c, d, 1.2); // barrel
    roundRect(ctx, 56, 10, 6, 7, 1, c, d, 1.2); // muzzle brake
    poly(
      ctx,
      [
        [20, 18],
        [28, 18],
        [26, 27],
        [19, 27],
      ],
      c,
      d,
      1.2,
    ); // magazine
    roundRect(ctx, 16, 4, 14, 4, 1, c, d, 1); // scope
  },
  heavy_bolter: (ctx, c, d) => {
    roundRect(ctx, 4, 7, 34, 15, 3, c, d, 1.5);
    roundRect(ctx, 36, 9, 24, 5, 1, c, d, 1.2);
    roundRect(ctx, 36, 15, 24, 5, 1, c, d, 1.2);
    roundRect(ctx, 58, 8, 5, 13, 1, c, d, 1.2);
    roundRect(ctx, 12, 21, 14, 6, 1, c, d, 1.2); // ammo box
    roundRect(ctx, 0, 10, 6, 9, 2, c, d, 1.2); // spade grips
  },
  flamer: (ctx, c, d) => {
    roundRect(ctx, 4, 6, 30, 9, 2, c, d, 1.4);
    roundRect(ctx, 6, 16, 26, 9, 4, c, d, 1.4); // promethium tank
    roundRect(ctx, 32, 8, 22, 5, 1, c, d, 1.2);
    poly(
      ctx,
      [
        [52, 6],
        [63, 4],
        [63, 17],
        [52, 15],
      ],
      c,
      d,
      1.2,
    ); // nozzle
  },
  plasma_gun: (ctx, c, d) => {
    roundRect(ctx, 2, 10, 10, 9, 2, c, d, 1.2);
    roundRect(ctx, 10, 7, 26, 14, 3, c, d, 1.5);
    for (let i = 0; i < 4; i++) roundRect(ctx, 36 + i * 5, 8, 3.5, 12, 1, c, d, 1); // coils
    roundRect(ctx, 34, 12, 26, 4, 1, c, d, 1);
    roundRect(ctx, 56, 9, 7, 10, 2, c, d, 1.2);
  },
  meltagun: (ctx, c, d) => {
    roundRect(ctx, 2, 11, 10, 8, 2, c, d, 1.2);
    roundRect(ctx, 10, 7, 22, 15, 3, c, d, 1.5);
    roundRect(ctx, 30, 9, 22, 11, 3, c, d, 1.4); // fat barrel
    roundRect(ctx, 36, 7, 4, 15, 1, c, d, 1);
    roundRect(ctx, 44, 7, 4, 15, 1, c, d, 1);
    poly(
      ctx,
      [
        [52, 9],
        [63, 11],
        [63, 18],
        [52, 20],
      ],
      c,
      d,
      1.2,
    );
  },
  frag_grenade: (ctx, c, d) => {
    circle(ctx, 30, 16, 10, c, d, 1.5);
    roundRect(ctx, 25, 3, 10, 5, 1, c, d, 1.2);
    line(ctx, 20, 16, 40, 16, d, 1.2);
    line(ctx, 30, 6, 30, 26, d, 1.2);
    ctx.beginPath();
    ctx.arc(38, 6, 4, 0, Math.PI * 2);
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  },
  power_sword: (ctx, c, d) => {
    roundRect(ctx, 10, 12, 16, 5, 1, '#5a5048', d, 1);
    poly(
      ctx,
      [
        [24, 11],
        [60, 13],
        [60, 16],
        [24, 18],
      ],
      c,
      d,
      1.2,
    );
    line(ctx, 28, 13.5, 56, 14.5, '#9ec4ff', 1.4);
    roundRect(ctx, 20, 8, 6, 13, 1, BRASS, d, 1);
  },
  encarmine_blade: (ctx, c, d) => {
    roundRect(ctx, 8, 12, 14, 5, 1, '#3a201c', d, 1);
    poly(
      ctx,
      [
        [22, 10],
        [62, 12],
        [58, 15],
        [22, 19],
      ],
      c,
      d,
      1.2,
    );
    line(ctx, 26, 13, 54, 14, '#ff6a6a', 1.5);
    circle(ctx, 18, 14.5, 3, '#8c1c18', d, 0.8);
  },
  heavenfall_blade: (ctx, c, d) => {
    roundRect(ctx, 6, 12, 16, 5, 1, '#2a2a24', d, 1);
    poly(
      ctx,
      [
        [20, 11],
        [62, 13],
        [62, 16],
        [20, 18],
      ],
      c,
      d,
      1.2,
    );
    line(ctx, 24, 13.5, 58, 14.5, '#e8dfc0', 1.3);
    poly(
      ctx,
      [
        [16, 8],
        [22, 12],
        [16, 21],
        [12, 16],
      ],
      '#1d4a2c',
      d,
      1,
    );
  },
  thunder_hammer: (ctx, c, d) => {
    roundRect(ctx, 8, 13, 30, 4, 1, '#4a4038', d, 1);
    roundRect(ctx, 36, 6, 24, 18, 3, c, d, 1.4);
    roundRect(ctx, 40, 9, 16, 12, 2, '#e8d48a', d, 1);
    line(ctx, 48, 9, 48, 21, d, 1);
  },
  frost_axe: (ctx, c, d) => {
    roundRect(ctx, 8, 13, 28, 4, 1, '#3a4450', d, 1);
    poly(
      ctx,
      [
        [32, 5],
        [60, 8],
        [56, 15],
        [60, 22],
        [32, 24],
        [36, 15],
      ],
      c,
      d,
      1.3,
    );
    line(ctx, 40, 9, 52, 15, '#e8f7ff', 1.5);
    line(ctx, 40, 21, 52, 15, '#e8f7ff', 1.5);
  },
  forge_hammer: (ctx, c, d) => {
    roundRect(ctx, 8, 13, 28, 4, 1, '#3a2a20', d, 1);
    roundRect(ctx, 34, 6, 26, 18, 3, c, d, 1.4);
    roundRect(ctx, 38, 9, 18, 12, 2, '#ff9a3a', d, 1);
    circle(ctx, 47, 15, 3, '#ffe0a0');
  },
  power_glaive: (ctx, c, d) => {
    roundRect(ctx, 2, 13, 36, 3.5, 1, '#4a4038', d, 1);
    poly(
      ctx,
      [
        [36, 9],
        [62, 12],
        [58, 15],
        [62, 18],
        [36, 20],
        [40, 15],
      ],
      c,
      d,
      1.2,
    );
    line(ctx, 42, 13, 56, 15, '#fff0a0', 1.3);
    roundRect(ctx, 14, 11, 5, 8, 1, '#b0201c', d, 0.8);
  },
  lightning_claws: (ctx, c, d) => {
    for (const x of [10, 34]) {
      poly(
        ctx,
        [
          [x, 8],
          [x + 8, 10],
          [x + 22, 6],
          [x + 20, 12],
          [x + 22, 18],
          [x + 8, 16],
          [x, 20],
        ],
        c,
        d,
        1.1,
      );
      line(ctx, x + 8, 12, x + 18, 11, '#e8f4ff', 1.2);
    }
  },
  storm_bolter: (ctx, c, d) => {
    poly(
      ctx,
      [
        [0, 10],
        [7, 11],
        [7, 18],
        [0, 20],
      ],
      c,
      d,
      1.2,
    );
    roundRect(ctx, 7, 8, 22, 13, 2, c, d, 1.5);
    roundRect(ctx, 28, 8, 22, 4, 1, c, d, 1.2);
    roundRect(ctx, 28, 16, 22, 4, 1, c, d, 1.2);
    roundRect(ctx, 48, 7, 8, 15, 1, c, d, 1.2);
    roundRect(ctx, 14, 20, 10, 7, 1, c, d, 1.1);
    roundRect(ctx, 26, 20, 10, 7, 1, c, d, 1.1);
  },
  inferno_pistol: (ctx, c, d) => {
    poly(
      ctx,
      [
        [0, 12],
        [10, 9],
        [10, 20],
        [0, 18],
      ],
      c,
      d,
      1.2,
    );
    roundRect(ctx, 10, 8, 18, 13, 3, c, d, 1.5);
    poly(
      ctx,
      [
        [28, 9],
        [48, 6],
        [56, 8],
        [56, 20],
        [48, 22],
        [28, 19],
      ],
      c,
      d,
      1.2,
    );
    roundRect(ctx, 16, 21, 8, 6, 1, c, d, 1);
    line(ctx, 34, 14, 52, 14, '#ff6a2a', 1.4);
  },
  plasma_caster: (ctx, c, d) => {
    poly(
      ctx,
      [
        [0, 11],
        [8, 10],
        [8, 19],
        [0, 20],
      ],
      c,
      d,
      1.2,
    );
    roundRect(ctx, 8, 7, 16, 14, 3, c, d, 1.5);
    for (let i = 0; i < 4; i++) roundRect(ctx, 24 + i * 6, 6, 5, 16, 2, c, d, 1);
    roundRect(ctx, 48, 10, 12, 8, 2, c, d, 1.2);
    line(ctx, 26, 14, 46, 14, '#3cff9a', 1.4);
  },
  siege_bolter: (ctx, c, d) => {
    poly(
      ctx,
      [
        [0, 9],
        [8, 10],
        [8, 20],
        [0, 21],
      ],
      c,
      d,
      1.2,
    );
    roundRect(ctx, 8, 7, 26, 14, 2, c, d, 1.5);
    poly(
      ctx,
      [
        [6, 4],
        [28, 2],
        [30, 8],
        [8, 9],
      ],
      c,
      d,
      1.2,
    ); // slab shield
    roundRect(ctx, 34, 10, 18, 8, 1, c, d, 1.2);
    roundRect(ctx, 52, 8, 8, 12, 1, c, d, 1.2);
    roundRect(ctx, 16, 20, 12, 7, 1, c, d, 1.1);
  },
  plasma_pistol: (ctx, c, d) => {
    poly(
      ctx,
      [
        [2, 12],
        [12, 9],
        [12, 20],
        [2, 18],
      ],
      c,
      d,
      1.2,
    );
    roundRect(ctx, 12, 8, 16, 13, 3, c, d, 1.5);
    roundRect(ctx, 28, 7, 10, 15, 3, c, d, 1.2);
    roundRect(ctx, 38, 11, 16, 7, 2, c, d, 1.2);
    line(ctx, 30, 14, 50, 14, '#8ec8ff', 1.4);
  },
  bolt_carbine: (ctx, c, d) => {
    poly(
      ctx,
      [
        [2, 11],
        [10, 12],
        [10, 18],
        [2, 19],
      ],
      c,
      d,
      1.2,
    );
    roundRect(ctx, 10, 9, 22, 11, 2, c, d, 1.5);
    roundRect(ctx, 32, 11, 22, 5, 1, c, d, 1.2);
    roundRect(ctx, 54, 10, 6, 7, 1, c, d, 1.2);
    poly(
      ctx,
      [
        [16, 19],
        [26, 19],
        [24, 27],
        [15, 27],
      ],
      c,
      d,
      1.2,
    );
  },
  stalker_bolter: (ctx, c, d) => {
    poly(
      ctx,
      [
        [0, 10],
        [8, 11],
        [8, 18],
        [0, 20],
      ],
      c,
      d,
      1.2,
    );
    roundRect(ctx, 8, 8, 22, 11, 2, c, d, 1.5);
    roundRect(ctx, 30, 11, 22, 4, 1, c, d, 1.2);
    roundRect(ctx, 52, 10, 10, 6, 2, c, d, 1.2); // suppressor
    roundRect(ctx, 14, 3, 16, 5, 1, c, d, 1); // long scope
    poly(
      ctx,
      [
        [18, 18],
        [26, 18],
        [24, 27],
        [17, 27],
      ],
      c,
      d,
      1.2,
    );
  },
  generic: (ctx, c, d) => {
    roundRect(ctx, 6, 9, 46, 10, 2, c, d, 1.5);
    roundRect(ctx, 20, 18, 8, 8, 1, c, d, 1.2);
  },
};

export function drawWeaponIcon(ctx: Ctx, id: string, color = '#e6d9b8'): void {
  (ICONS[id] ?? ICONS.generic!)(ctx, color, '#120d08');
}

/* --------------------------------- held overlays (top-down, marine frame) */

const C = MARINE_SIZE / 2;
const [RX, RY] = GRIP_R;
const [LX, LY] = GRIP_L;

/** Draws the weapon in marine-centred coordinates (+X = aim). Hands are drawn by marine_top. */
const HELD: Record<string, (ctx: Ctx) => void> = {
  bolt_rifle: (ctx) => {
    roundRect(ctx, RX - 8, RY - 3, 10, 6, 2, GUN, GUN_D, 1); // stock at the right hand
    roundRect(ctx, RX, 0.5, 20, 7, 2, GUN, GUN_D, 1.2);
    roundRect(ctx, RX + 18, 2, 12, 4, 1, GUN_L, GUN_D, 1);
    roundRect(ctx, RX + 29, 1.5, 4, 5, 1, GUN, GUN_D, 1);
    roundRect(ctx, RX + 6, -1.5, 8, 2.5, 1, GUN_L); // scope
    line(ctx, RX + 2, 4, RX + 16, 4, BRASS, 1);
  },
  heavy_bolter: (ctx) => {
    // Ammo feed from the backpack.
    ctx.beginPath();
    ctx.moveTo(-14, 11);
    ctx.quadraticCurveTo(0, 18, RX + 4, 8);
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    roundRect(ctx, RX - 6, -2, 26, 11, 3, GUN, GUN_D, 1.3);
    roundRect(ctx, RX + 19, -0.5, 16, 3.4, 1, GUN_L, GUN_D, 0.8);
    roundRect(ctx, RX + 19, 4.5, 16, 3.4, 1, GUN_L, GUN_D, 0.8);
    roundRect(ctx, RX + 33, -1.5, 4, 10.5, 1, GUN, GUN_D, 1);
    line(ctx, RX - 2, 3.5, RX + 16, 3.5, '#5a3f1a', 1.2);
  },
  flamer: (ctx) => {
    roundRect(ctx, RX - 6, 3, 18, 7, 3.5, '#6b3a1a', '#2a1408', 1.2); // promethium tank
    roundRect(ctx, RX, 0, 20, 5, 2, GUN, GUN_D, 1.2);
    roundRect(ctx, RX + 18, 0.8, 9, 3.5, 1, GUN_L, GUN_D, 0.8);
    poly(
      ctx,
      [
        [RX + 26, -0.5],
        [RX + 32, -1.8],
        [RX + 32, 6.3],
        [RX + 26, 5],
      ],
      GUN,
      GUN_D,
      1,
    );
    glow(ctx, RX + 33, 2.2, 3.5, '#4ab0ff', 0.9); // pilot light
  },
  plasma_gun: (ctx) => {
    roundRect(ctx, RX - 6, 1, 8, 6, 2, GUN, GUN_D, 1);
    roundRect(ctx, RX, -0.5, 16, 9, 3, GUN, GUN_D, 1.2);
    for (let i = 0; i < 3; i++) {
      roundRect(ctx, RX + 15 + i * 4, -1, 2.6, 10, 1, '#1d3e5a', GUN_D, 0.6);
      glow(ctx, RX + 16.3 + i * 4, 4, 3.2, '#59c8ff', 0.7);
    }
    roundRect(ctx, RX + 26, 1, 7, 6, 2, GUN_L, GUN_D, 1);
    circle(ctx, RX + 33, 4, 1.6, '#cfefff');
  },
  meltagun: (ctx) => {
    roundRect(ctx, RX - 6, 1, 8, 6, 2, GUN, GUN_D, 1);
    roundRect(ctx, RX, -1, 15, 10, 3, GUN, GUN_D, 1.2);
    roundRect(ctx, RX + 14, -0.5, 13, 9, 3, '#3a2e28', GUN_D, 1.2);
    for (const k of [17, 22]) roundRect(ctx, RX + k, -1.5, 2.2, 11, 0.8, GUN_L);
    poly(
      ctx,
      [
        [RX + 27, 0.5],
        [RX + 32, 1.5],
        [RX + 32, 6.5],
        [RX + 27, 7.5],
      ],
      GUN,
      GUN_D,
      1,
    );
    glow(ctx, RX + 32, 4, 3.5, '#ff6a2a', 0.8);
  },
  frag_grenade: (ctx) => {
    // Bolt pistol in the right hand, grenade ready in the left.
    roundRect(ctx, RX - 1, RY - 3.5, 12, 5, 1.5, GUN, GUN_D, 1);
    roundRect(ctx, RX + 10, RY - 2.8, 5, 3.6, 1, GUN_L, GUN_D, 0.8);
    circle(ctx, LX + 3, LY - 1, 3.4, '#4f5a2e', '#1a1f0c', 1);
    line(ctx, LX + 1, LY - 1, LX + 5, LY - 1, '#1a1f0c', 0.7);
  },
  power_sword: (ctx) => {
    roundRect(ctx, RX - 2, 2, 8, 4, 1, '#5a5048', GUN_D, 0.8);
    poly(
      ctx,
      [
        [RX + 5, 2.2],
        [39, 2.6],
        [40, 4],
        [39, 5.4],
        [RX + 5, 5.8],
      ],
      '#8aa8d8',
      GUN_D,
      1,
    );
    line(ctx, RX + 8, 4, 38, 4, '#cfe4ff', 1.2);
    glow(ctx, 39, 4, 3, '#6a9cff', 0.7);
  },
  encarmine_blade: (ctx) => {
    roundRect(ctx, RX - 2, 2, 7, 4, 1, '#3a201c', GUN_D, 0.8);
    poly(
      ctx,
      [
        [RX + 4, 2],
        [36, 2.4],
        [38, 4],
        [36, 5.8],
        [RX + 4, 6],
      ],
      '#8c1c18',
      GUN_D,
      1,
    );
    line(ctx, RX + 8, 4, 35, 4, '#ff6a6a', 1.2);
    glow(ctx, 37, 4, 3, '#ff2a3a', 0.8);
  },
  heavenfall_blade: (ctx) => {
    roundRect(ctx, RX - 2, 2, 8, 4, 1, '#2a2a24', GUN_D, 0.8);
    poly(
      ctx,
      [
        [RX + 5, 2.2],
        [43, 2.6],
        [44, 4],
        [43, 5.4],
        [RX + 5, 5.8],
      ],
      '#d9cda4',
      GUN_D,
      1,
    );
    line(ctx, RX + 8, 4, 42, 4, '#1d4a2c', 1);
    glow(ctx, 43, 4, 3, '#e8dfc0', 0.6);
  },
  thunder_hammer: (ctx) => {
    roundRect(ctx, RX - 1, 2.4, 24, 3.2, 1, '#4a4038', GUN_D, 0.8);
    roundRect(ctx, 30, -2, 12, 12, 2, '#c9a227', GUN_D, 1.2);
    roundRect(ctx, 32, 0, 8, 8, 1, '#e8d48a', GUN_D, 0.8);
    glow(ctx, 40, 4, 4, '#fff4a0', 0.6);
  },
  frost_axe: (ctx) => {
    roundRect(ctx, RX - 1, 2.4, 22, 3.2, 1, '#3a4450', GUN_D, 0.8);
    poly(
      ctx,
      [
        [30, -3],
        [42, 4],
        [30, 11],
        [33, 4],
      ],
      '#8ec8e8',
      GUN_D,
      1,
    );
    line(ctx, 32, 1, 40, 4, '#e8f7ff', 1.2);
    glow(ctx, 41, 4, 4, '#9fe8ff', 0.8);
  },
  forge_hammer: (ctx) => {
    roundRect(ctx, RX - 1, 2.4, 24, 3.2, 1, '#3a2a20', GUN_D, 0.8);
    roundRect(ctx, 30, -2, 12, 12, 2, '#8a3a18', GUN_D, 1.2);
    roundRect(ctx, 32, 0, 8, 8, 1, '#ff6a1a', GUN_D, 0.8);
    glow(ctx, 40, 4, 4.5, '#ff9a3a', 0.85);
  },
  power_glaive: (ctx) => {
    roundRect(ctx, RX - 4, 2.6, 36, 2.8, 1, '#4a4038', GUN_D, 0.8);
    poly(
      ctx,
      [
        [32, -1],
        [50, 2.2],
        [50, 5.8],
        [32, 9],
        [35, 4],
      ],
      '#e8d24a',
      GUN_D,
      1,
    );
    line(ctx, 36, 4, 47, 4, '#fff0a0', 1.2);
    glow(ctx, 49, 4, 3.5, '#e8d24a', 0.7);
  },
  lightning_claws: (ctx) => {
    const claw = (x0: number, y0: number, dir: number, tipX: number) => {
      for (const k of [-2.2, 0, 2.2]) {
        poly(
          ctx,
          [
            [x0, y0 + k],
            [tipX, y0 + k * 1.1 + dir],
            [tipX - 2, y0 + k * 1.1],
          ],
          '#b8e0ff',
          GUN_D,
          0.7,
        );
      }
      glow(ctx, tipX - 1, y0, 3, '#e8f4ff', 0.7);
    };
    claw(RX + 1, 4, 0, 30);
    claw(LX - 2, LY, 0, LX + 10);
  },
  storm_bolter: (ctx) => {
    roundRect(ctx, RX - 6, 0, 14, 8, 2, GUN, GUN_D, 1.2);
    roundRect(ctx, RX + 6, 0.2, 16, 2.6, 1, GUN_L, GUN_D, 0.8);
    roundRect(ctx, RX + 6, 5.2, 16, 2.6, 1, GUN_L, GUN_D, 0.8);
    roundRect(ctx, RX + 21, 0, 4, 8, 1, GUN, GUN_D, 1);
    line(ctx, RX, 4, RX + 16, 4, BRASS, 1);
  },
  inferno_pistol: (ctx) => {
    roundRect(ctx, RX - 2, 0.5, 10, 7, 2, GUN, GUN_D, 1);
    roundRect(ctx, RX + 7, -0.5, 12, 9, 2, '#3a2e28', GUN_D, 1.2);
    poly(
      ctx,
      [
        [RX + 18, 0.5],
        [RX + 24, 1.2],
        [RX + 24, 6.8],
        [RX + 18, 7.5],
      ],
      GUN,
      GUN_D,
      1,
    );
    glow(ctx, RX + 24, 4, 3, '#ff6a2a', 0.75);
  },
  plasma_caster: (ctx) => {
    roundRect(ctx, RX - 5, 0.5, 8, 7, 2, GUN, GUN_D, 1);
    roundRect(ctx, RX + 2, -0.5, 12, 9, 3, GUN, GUN_D, 1.2);
    for (let i = 0; i < 3; i++) {
      roundRect(ctx, RX + 13 + i * 4, -1, 2.4, 10, 1, '#1d4a38', GUN_D, 0.6);
      glow(ctx, RX + 14.2 + i * 4, 4, 2.8, '#3cff9a', 0.7);
    }
    roundRect(ctx, RX + 24, 1, 6, 6, 2, GUN_L, GUN_D, 1);
    circle(ctx, RX + 31, 4, 1.5, '#c8ffe8');
  },
  siege_bolter: (ctx) => {
    poly(
      ctx,
      [
        [RX - 2, -3],
        [RX + 14, -4],
        [RX + 14, 2],
        [RX - 2, 1.5],
      ],
      '#4a4038',
      GUN_D,
      1,
    ); // slab
    roundRect(ctx, RX - 4, 1, 16, 7, 2, GUN, GUN_D, 1.2);
    roundRect(ctx, RX + 11, 2, 12, 4.5, 1, GUN_L, GUN_D, 1);
    roundRect(ctx, RX + 22, 1.5, 4, 6, 1, GUN, GUN_D, 1);
    line(ctx, RX, 4.2, RX + 16, 4.2, '#c9a227', 1.1);
  },
  plasma_pistol: (ctx) => {
    roundRect(ctx, RX - 2, 0.8, 9, 6.4, 2, GUN, GUN_D, 1);
    roundRect(ctx, RX + 6, -0.5, 8, 9, 3, GUN, GUN_D, 1.2);
    glow(ctx, RX + 10, 4, 3, '#8ec8ff', 0.7);
    roundRect(ctx, RX + 13, 1.2, 8, 5.6, 2, GUN_L, GUN_D, 1);
    circle(ctx, RX + 21, 4, 1.4, '#cfefff');
  },
  bolt_carbine: (ctx) => {
    roundRect(ctx, RX - 4, RY - 3, 8, 5.5, 2, GUN, GUN_D, 1);
    roundRect(ctx, RX, 1, 16, 6, 2, GUN, GUN_D, 1.2);
    roundRect(ctx, RX + 15, 2.2, 12, 3.6, 1, GUN_L, GUN_D, 1);
    roundRect(ctx, RX + 26, 1.8, 3.5, 4.4, 1, GUN, GUN_D, 1);
    line(ctx, RX + 2, 4, RX + 14, 4, BRASS, 1);
  },
  stalker_bolter: (ctx) => {
    roundRect(ctx, RX - 8, RY - 3, 10, 6, 2, GUN, GUN_D, 1);
    roundRect(ctx, RX, 0.8, 18, 6.4, 2, GUN, GUN_D, 1.2);
    roundRect(ctx, RX + 6, -2, 10, 2.6, 1, GUN_L); // scope
    roundRect(ctx, RX + 17, 2.2, 18, 3.4, 1, GUN_L, GUN_D, 0.8);
    roundRect(ctx, RX + 34, 1.6, 6, 4.6, 1.5, GUN, GUN_D, 1); // suppressor
    line(ctx, RX + 2, 4, RX + 16, 4, '#5a5a68', 1);
  },
  generic: (ctx) => roundRect(ctx, RX, 1, 24, 6, 2, GUN, GUN_D, 1.2),
};

/* --------------------------------------------------------------- sprites */

const weapons = defaultContent.weaponOrder;

const icons: SpriteDef[] = weapons.map(({ id, sprites }) => ({
  key: sprites.icon,
  group: 'icon',
  w: 64,
  h: 28,
  scale: 2,
  frames: 1,
  prompt: `Side-view silhouette icon of a grimdark sci-fi ${id.replace('_', ' ')}, aged brass/bone on transparent, HUD style`,
  draw: (ctx) => drawWeaponIcon(ctx, id),
}));

/**
 * Held overlays extend past the marine frame (barrels reach ~48 px ahead of the centre), so the
 * canvas is wider than the marine and anchored on the marine centre. Before v0.7 they were drawn
 * into the 72 px marine frame and every barrel was clipped at 36 px.
 */
export const HELD_W = C + 56;
const held: SpriteDef[] = weapons.map(({ id, sprites }) => ({
  key: sprites.held,
  group: 'weapon',
  w: HELD_W,
  h: MARINE_SIZE,
  anchor: [C / HELD_W, 0.5],
  scale: MARINE_SCALE,
  frames: 1,
  prompt: `Top-down ${id.replace('_', ' ')} held by an armoured soldier facing right, weapon only (transparent elsewhere), grip at the soldier's right hand`,
  draw: (ctx) => {
    ctx.save();
    ctx.translate(C, C);
    (HELD[id] ?? HELD.generic!)(ctx);
    ctx.restore();
  },
}));

const crates: SpriteDef[] = weapons.map(({ id, sprites }) => ({
  key: sprites.pickup,
  group: 'pickup',
  w: 48,
  h: 48,
  scale: 2,
  frames: 2,
  prompt: `Top-down iron-bound armoury reliquary crate with a ${id.replace('_', ' ')} stencil, wax seals, glowing ${WEAPON_TINT[id] ?? 'white'} lumen strip, 2-frame blink`,
  draw: (ctx, frame) => {
    const tint = WEAPON_TINT[id] ?? '#ffffff';
    glow(ctx, 24, 24, 24, tint, frame ? 0.5 : 0.25);
    roundRect(ctx, 5, 8, 38, 32, 3, '#3d3428', '#120d08', 2);
    roundRect(ctx, 8, 11, 32, 26, 2, '#5a4c38');
    for (const x of [5, 39]) roundRect(ctx, x, 8, 4, 32, 1, '#2a241c', '#120d08', 1); // iron bands
    roundRect(ctx, 9, 30, 30, 3, 1, tint);
    ctx.save();
    ctx.translate(11, 13);
    ctx.scale(0.4, 0.4);
    drawWeaponIcon(ctx, id, '#e3d4ae');
    ctx.restore();
    // Wax seal with a ribbon.
    circle(ctx, 36, 12, 3, '#8c1c18', '#4a0b09', 0.8);
    line(ctx, 36, 14, 38, 20, '#d8ccaa', 1.4, 'butt');
    for (const [x, y] of [
      [7, 10],
      [41, 10],
      [7, 38],
      [41, 38],
    ])
      circle(ctx, x, y, 1.4, BRASS);
  },
}));

const medkit: SpriteDef = {
  key: 'medkit',
  group: 'pickup',
  w: 40,
  h: 40,
  scale: 2,
  frames: 2,
  prompt:
    'Top-down field-medicae canister: white-and-green case with a vial/helix symbol, soft green glow, 2-frame blink',
  draw: (ctx, frame) => {
    glow(ctx, 20, 20, 20, '#6dff9c', frame ? 0.45 : 0.2);
    roundRect(ctx, 7, 9, 26, 22, 4, '#e6e1d2', '#5a5a50', 1.5);
    roundRect(ctx, 7, 9, 26, 6, 3, '#2f6b45');
    // Helix: two crossing sine strands.
    for (const ph of [0, Math.PI]) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const x = 12 + i * 1.33;
        const y = 23 + Math.sin(i * 0.8 + ph) * 3.5;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = '#2f9a5a';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    roundRect(ctx, 16, 6, 8, 4, 1, '#8d8a7c');
    ellipse(ctx, 14, 12, 4, 1.2, rgba('#ffffff', 0.5));
  },
};

export const weaponSprites: SpriteDef[] = [...icons, ...held, ...crates, medkit];
