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
  chainsword: '#c8c0b0',
  power_axe: '#6a9cff',
  thunder_hammer: '#c9a227',
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
