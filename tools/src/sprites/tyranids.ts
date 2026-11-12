import { defaultContent } from '@sms/shared';
import { circle, ellipse, glow, leg, line, poly, rgba, shade } from './draw.js';
import { FLEET as P, type FleetPalette } from './palette.js';
import { animAt, animLayout, type Ctx, type SpriteDef } from './types.js';

/**
 * Tyranid bio-forms, top-down, facing +X, drawn around the frame centre in world units.
 * Each sprite has walk / attack / death animations (see `anims` in the manifest).
 * Palette comes from palette.ts (Hive Fleet Behemoth by default).
 */

interface Pose {
  /** walk phase 0..1 */
  w: number;
  /** attack progress 0..1 (0 = rest) */
  a: number;
  /** death curl 0..1 */
  c: number;
}

type Drawer = (ctx: Ctx, p: Pose, pal: FleetPalette) => void;

const TAU = Math.PI * 2;

/* ----------------------------------------------------------- body helpers */

function plate(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  pal: FleetPalette,
  rot = 0,
): void {
  ellipse(ctx, x, y, rx, ry, pal.carapace, pal.carapaceDark, Math.max(1, rx * 0.12), rot);
  ellipse(
    ctx,
    x - rx * 0.15,
    y - ry * 0.25,
    rx * 0.55,
    ry * 0.35,
    rgba(pal.carapaceLight, 0.55),
    undefined,
    0,
    rot,
  );
  line(
    ctx,
    x - rx * 0.8,
    y,
    x + rx * 0.8,
    y,
    rgba(pal.carapaceDark, 0.6),
    Math.max(0.6, ry * 0.08),
  );
}

function flesh(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  pal: FleetPalette,
  rot = 0,
): void {
  ellipse(ctx, x, y, rx, ry, pal.flesh, pal.fleshDark, Math.max(0.8, rx * 0.1), rot);
  // Ribbed musculature.
  for (let i = -1; i <= 1; i++)
    line(
      ctx,
      x + i * rx * 0.45,
      y - ry * 0.7,
      x + i * rx * 0.45,
      y + ry * 0.7,
      rgba(pal.fleshDark, 0.5),
      Math.max(0.5, rx * 0.08),
    );
}

/** Curved bone blade from (x, y) at angle `ang`. `curve` > 0 bends towards +y of the blade. */
function talon(
  ctx: Ctx,
  x: number,
  y: number,
  ang: number,
  len: number,
  wid: number,
  curve: number,
  pal: FleetPalette,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -wid / 2);
  ctx.quadraticCurveTo(len * 0.55, -wid / 2 + curve * len * 0.35, len, curve * len * 0.5);
  ctx.quadraticCurveTo(len * 0.5, wid / 2 + curve * len * 0.2, 0, wid / 2);
  ctx.closePath();
  ctx.fillStyle = pal.bone;
  ctx.fill();
  ctx.lineWidth = Math.max(0.6, wid * 0.18);
  ctx.strokeStyle = shade(pal.bone, -0.55);
  ctx.stroke();
  ctx.restore();
}

/** Elongated Tyranid skull with eyes and a fanged maw at the front. */
function head(
  ctx: Ctx,
  x: number,
  y: number,
  len: number,
  wid: number,
  pal: FleetPalette,
  crest = 0,
): void {
  ellipse(ctx, x + len * 0.55, y, len * 0.22, wid * 0.32, pal.flesh, pal.fleshDark, 0.8); // maw
  for (const s of [-1, 1])
    poly(
      ctx,
      [
        [x + len * 0.62, y + s * wid * 0.12],
        [x + len * 0.86, y + s * wid * 0.05],
        [x + len * 0.66, y + s * wid * 0.26],
      ],
      pal.bone,
    );
  ellipse(
    ctx,
    x,
    y,
    len * 0.55,
    wid * 0.5,
    pal.carapace,
    pal.carapaceDark,
    Math.max(0.8, wid * 0.08),
  );
  ellipse(ctx, x - len * 0.1, y, len * 0.32, wid * 0.22, rgba(pal.carapaceLight, 0.6));
  for (const s of [-1, 1]) {
    // Bone ridges and eyes.
    line(
      ctx,
      x - len * 0.4,
      y + s * wid * 0.34,
      x + len * 0.35,
      y + s * wid * 0.3,
      pal.bone,
      Math.max(0.6, wid * 0.08),
    );
    circle(ctx, x + len * 0.32, y + s * wid * 0.32, Math.max(0.8, wid * 0.09), pal.eye);
  }
  if (crest) {
    for (const s of [-1, 1])
      talon(
        ctx,
        x - len * 0.3,
        y + s * wid * 0.2,
        Math.PI + s * 0.35,
        len * crest,
        wid * 0.22,
        s * 0.2,
        pal,
      );
  }
}

function spines(
  ctx: Ctx,
  x0: number,
  x1: number,
  y: number,
  n: number,
  size: number,
  pal: FleetPalette,
): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
    for (const s of [-1, 1])
      poly(
        ctx,
        [
          [x - size * 0.5, y + s * size * 0.2],
          [x - size * 1.1, y + s * size * 1.3],
          [x + size * 0.3, y + s * size * 0.3],
        ],
        pal.bone,
        shade(pal.bone, -0.5),
        0.5,
      );
  }
}

/** One jointed limb: armoured thigh, fleshy shin, clawed foot. */
function limb(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bend: number,
  lw: number,
  pal: FleetPalette,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const kx = (x0 + x1) / 2 + (-dy / len) * bend;
  const ky = (y0 + y1) / 2 + (dx / len) * bend;
  line(ctx, x0, y0, kx, ky, pal.carapaceDark, lw * 1.6 + 1.2);
  line(ctx, kx, ky, x1, y1, pal.fleshDark, lw + 1);
  line(ctx, kx, ky, x1, y1, pal.flesh, lw);
  line(ctx, x0, y0, kx, ky, pal.carapace, lw * 1.6);
  line(ctx, x0, y0, kx, ky, rgba(pal.carapaceLight, 0.45), lw * 0.5);
  circle(ctx, kx, ky, lw * 0.75, pal.carapaceDark);
  const fa = Math.atan2(y1 - ky, x1 - kx);
  for (const da of [-0.55, 0, 0.55])
    line(
      ctx,
      x1,
      y1,
      x1 + Math.cos(fa + da) * lw * 1.5,
      y1 + Math.sin(fa + da) * lw * 1.5,
      pal.bone,
      Math.max(0.6, lw * 0.4),
    );
}

/** Legs: pairs of [hipX, hipY(abs), footX, footY(abs), phaseOffset]. */
function legs(
  ctx: Ctx,
  p: Pose,
  pal: FleetPalette,
  defs: Array<[number, number, number, number, number]>,
  lw: number,
  stride: number,
): void {
  for (const [hx, hy, fx, fy, ph] of defs) {
    for (const s of [-1, 1]) {
      const sw = Math.sin((p.w + ph + (s > 0 ? 0.5 : 0)) * TAU) * stride * (1 - p.c);
      const cx = hx + (fx - hx) * (1 - p.c * 0.7) + sw;
      const cy = s * (hy + (fy - hy) * (1 - p.c * 0.6));
      limb(ctx, hx, s * hy, cx, cy, -s * lw * 1.6 * (1 + p.c) * Math.sign(fx - hx || 1), lw, pal);
    }
  }
}

function tail(
  ctx: Ctx,
  x: number,
  len: number,
  wid: number,
  p: Pose,
  pal: FleetPalette,
  wiggle = 1,
): void {
  const sw = Math.sin(p.w * TAU) * wiggle * (1 - p.c) + p.c * 3;
  ctx.beginPath();
  ctx.moveTo(x, -wid / 2);
  ctx.quadraticCurveTo(x - len * 0.5, -wid * 0.4 + sw * 0.6, x - len, sw * 1.4);
  ctx.quadraticCurveTo(x - len * 0.5, wid * 0.4 + sw * 0.6, x, wid / 2);
  ctx.closePath();
  ctx.fillStyle = pal.flesh;
  ctx.fill();
  ctx.strokeStyle = pal.fleshDark;
  ctx.lineWidth = Math.max(0.6, wid * 0.12);
  ctx.stroke();
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    plate(ctx, x - len * t, sw * t * 1.2, wid * (0.42 - t * 0.25), wid * (0.42 - t * 0.25), pal);
  }
}

/* --------------------------------------------------------------- species */

const hormagaunt: Drawer = (ctx, p, pal) => {
  // Powerful hind legs + a shorter mid pair; four scything talons up front.
  legs(
    ctx,
    p,
    pal,
    [
      [-6, 3, -12, 16, 0],
      [2, 3, 8, 11, 0.25],
    ],
    2.3,
    4.5,
  );
  tail(ctx, -7, 17, 10, p, pal, 3);
  flesh(ctx, -1, 0, 11, 8, pal);
  plate(ctx, -3.5, 0, 8.5, 7, pal);
  plate(ctx, 3, 0, 6.5, 6, pal);
  spines(ctx, -8, 2, 0, 3, 2.4, pal);
  const sweep = p.a > 0 ? Math.sin(p.a * Math.PI) * 1.1 : 0;
  for (const s of [-1, 1]) {
    talon(ctx, 4, s * 5, s * (1.2 - sweep), 15, 3.2, -s * 0.35, pal);
    talon(ctx, 2, s * 6.5, s * (0.75 - sweep * 0.5), 11, 2.4, -s * 0.25, pal);
  }
  head(ctx, 9, 0, 11, 9, pal);
};

const termagant: Drawer = (ctx, p, pal) => {
  legs(
    ctx,
    p,
    pal,
    [
      [-4, 3, -10, 12, 0],
      [3, 3, 9, 11, 0.25],
    ],
    1.9,
    3.5,
  );
  tail(ctx, -6, 14, 7, p, pal, 2.5);
  flesh(ctx, -1, 0, 8.5, 6, pal);
  plate(ctx, -3, 0, 6.5, 5, pal);
  plate(ctx, 2.5, 0, 5, 4.3, pal);
  // Fleshborer: organic gun cradled in both arms, recoils on attack.
  const rec = p.a > 0 ? Math.sin(p.a * Math.PI) * -2.5 : 0;
  leg(ctx, 3, -4, 9 + rec, 3, -2, pal.carapace, 1.6);
  leg(ctx, 3, 4, 8 + rec, 5.5, 2, pal.carapace, 1.6);
  ellipse(ctx, 11 + rec, 4.5, 6, 3, pal.flesh, pal.fleshDark, 0.8);
  ellipse(ctx, 9 + rec, 4.5, 3, 3.4, pal.carapace, pal.carapaceDark, 0.8);
  circle(ctx, 16.5 + rec, 4.5, 1.6, '#1a0610');
  if (p.a > 0 && p.a < 0.6) glow(ctx, 18 + rec, 4.5, 4, '#c8ff5a', 0.9 - p.a);
  head(ctx, 7, -1, 9, 7.5, pal);
};

const ripper: Drawer = (ctx, p, pal) => {
  // Segmented grub with a round toothy maw.
  const n = 5;
  for (let i = n - 1; i >= 0; i--) {
    const x = -8 + i * 3.6;
    const y = Math.sin((p.w + i * 0.18) * TAU) * 1.6 * (1 - p.c);
    const r = 2.8 + i * 0.5;
    ellipse(ctx, x, y, r, r * 0.9, i % 2 ? pal.flesh : shade(pal.flesh, -0.15), pal.fleshDark, 0.6);
    if (i < n - 1) ellipse(ctx, x, y - r * 0.2, r * 0.7, r * 0.5, rgba(pal.carapace, 0.85));
  }
  const open = 0.4 + (p.a > 0 ? Math.sin(p.a * Math.PI) * 0.6 : 0);
  circle(ctx, 9, 0, 3.6, pal.carapace, pal.carapaceDark, 0.7);
  circle(ctx, 10, 0, 2.4 * open, '#25040c');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    circle(ctx, 10 + Math.cos(a) * 2.6 * open, Math.sin(a) * 2.6 * open, 0.55, pal.bone);
  }
  circle(ctx, 8, -2.6, 0.8, pal.eye);
  circle(ctx, 8, 2.6, 0.8, pal.eye);
};

const genestealer: Drawer = (ctx, p, pal) => {
  const pl = {
    ...pal,
    carapace: pal.stealerCarapace,
    flesh: pal.stealer,
    fleshDark: shade(pal.stealer, -0.55),
  };
  legs(
    ctx,
    p,
    pl,
    [
      [-6, 4, -14, 12, 0],
      [-1, 5, 2, 14, 0.3],
    ],
    2.2,
    5,
  );
  flesh(ctx, -3, 0, 11, 8, pl);
  plate(ctx, -5, 0, 8, 6.5, pl);
  plate(ctx, 1, 0, 6, 5.5, pl);
  spines(ctx, -10, -2, 0, 3, 2, pl);
  // Four arms: big rending claws forward, smaller ones behind.
  const ext = p.a > 0 ? Math.sin(p.a * Math.PI) * 6 : 0;
  for (const s of [-1, 1]) {
    leg(ctx, 2, s * 6, 12 + ext, s * (9 - ext * 0.6), s * 3, pl.flesh, 3);
    for (const k of [-1, 0, 1])
      talon(ctx, 12 + ext, s * (9 - ext * 0.6), s * 0.25 + k * 0.35, 7, 1.6, s * 0.3, pl);
    leg(ctx, 0, s * 7, 7, s * 13, s * 2, pl.flesh, 2);
    for (const k of [-1, 1]) talon(ctx, 7, s * 13, s * 0.7 + k * 0.3, 4.5, 1.2, 0, pl);
  }
  // Bulbous ridged head.
  ellipse(ctx, 9, 0, 6.5, 5.5, pl.flesh, pl.fleshDark, 0.9);
  ellipse(ctx, 6, 0, 5.5, 5, pl.carapace, pl.carapaceDark, 1);
  for (const s of [-1, 1]) {
    line(ctx, 2, s * 2.4, 9, s * 1.6, pl.bone, 0.9);
    circle(ctx, 11, s * 2.4, 0.9, pal.eye);
  }
  poly(
    ctx,
    [
      [13.5, -1.2],
      [16.5, 0],
      [13.5, 1.2],
    ],
    pl.bone,
  );
};

const warrior: Drawer = (ctx, p, pal) => {
  legs(
    ctx,
    p,
    pal,
    [
      [-8, 6, -20, 20, 0],
      [2, 7, 8, 21, 0.5],
    ],
    3.4,
    6,
  );
  tail(ctx, -12, 20, 12, p, pal, 3);
  flesh(ctx, -2, 0, 15, 12, pal);
  plate(ctx, -7, 0, 11, 10, pal);
  plate(ctx, 4, 0, 10, 10.5, pal);
  spines(ctx, -16, 0, 0, 4, 3.2, pal);
  // Upper arms: boneswords. Lower arms: deathspitter.
  const swing = p.a > 0 ? Math.sin(p.a * Math.PI) : 0;
  for (const s of [-1, 1]) {
    leg(ctx, 6, s * 10, 12, s * 16, s * 3, pal.carapace, 3.6);
    talon(ctx, 12, s * 16, s * (0.35 - swing * 0.5), 26, 4, -s * 0.18, pal);
  }
  const rec = -swing * 3;
  leg(ctx, 8, 6, 16 + rec, 6, 3, pal.flesh, 3);
  ellipse(ctx, 20 + rec, 6, 8, 4, pal.flesh, pal.fleshDark, 1);
  ellipse(ctx, 17 + rec, 6, 4, 4.8, pal.carapace, pal.carapaceDark, 1);
  circle(ctx, 27.5 + rec, 6, 2, '#1a0610');
  if (swing > 0.3) glow(ctx, 29 + rec, 6, 6, '#c8ff5a', swing * 0.8);
  // Synapse crest glows.
  glow(ctx, 9, 0, 14, '#b46cff', 0.35 * (1 - p.c));
  head(ctx, 14, 0, 15, 12, pal, 0.9);
  ellipse(ctx, 10, 0, 3.4, 4.4, rgba('#d9a2ff', 0.75 * (1 - p.c)));
};

const ravener: Drawer = (ctx, p, pal) => {
  // Serpentine: segments follow a sine wave from tail to head.
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const x = -34 + t * 38;
    const y =
      Math.sin((p.w + t * 0.9) * TAU) * 5 * (1 - t * 0.7) * (1 - p.c) + p.c * Math.sin(t * 5) * 6;
    const r = 3 + t * 7;
    flesh(ctx, x, y, r + 1, r * 0.85, pal);
    plate(ctx, x - 0.5, y, r * 0.85, r * 0.75, pal);
    if (i > 1) spines(ctx, x, x, y, 1, 2 + t * 1.5, pal);
  }
  const strike = p.a > 0 ? Math.sin(p.a * Math.PI) : 0;
  for (const s of [-1, 1]) {
    talon(ctx, 4, s * 8, s * (1.1 - strike * 0.9), 20, 3.4, -s * 0.4, pal);
    talon(ctx, 0, s * 9, s * (1.6 - strike * 0.7), 15, 2.8, -s * 0.4, pal);
  }
  head(ctx, 11, 0, 13, 11, pal);
};

const biovore: Drawer = (ctx, p, pal) => {
  legs(
    ctx,
    p,
    pal,
    [
      [-8, 7, -15, 18, 0],
      [4, 7, 11, 18, 0.5],
    ],
    3.2,
    3,
  );
  flesh(ctx, 0, 0, 16, 13, pal);
  plate(ctx, 6, 0, 9, 9, pal);
  // Spore-mortar sac: swells then contracts on attack.
  const k = p.a > 0 ? 1 - Math.sin(p.a * Math.PI) * 0.35 : 1;
  ellipse(ctx, -6, 0, 13 * k, 11 * k, '#6e7a2c', '#2a300c', 1.2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    circle(ctx, -6 + Math.cos(a) * 7 * k, Math.sin(a) * 6 * k, 1.8, rgba('#e8ff7a', 0.8));
  }
  glow(ctx, -6, 0, 12 * k, '#c8ff5a', 0.25);
  ellipse(ctx, 6, 0, 3.2, 6, pal.fleshDark); // mortar orifice
  head(ctx, 14, 0, 9, 9, pal);
};

const sporeMine: Drawer = (ctx, p, pal) => {
  const pulse = 1 + Math.sin(p.w * TAU) * 0.08;
  // Dangling tendrils.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + p.w * 0.6;
    const r0 = 9 * pulse;
    const r1 = 15 + Math.sin((p.w + i / 6) * TAU) * 2;
    leg(
      ctx,
      Math.cos(a) * r0,
      Math.sin(a) * r0,
      Math.cos(a + 0.3) * r1,
      Math.sin(a + 0.3) * r1,
      2,
      pal.fleshDark,
      1.3,
    );
  }
  circle(ctx, 0, 0, 10 * pulse, '#7a8530', '#2a300c', 1.4);
  circle(ctx, -2, -2, 6 * pulse, rgba('#c6d465', 0.6));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.6;
    circle(ctx, Math.cos(a) * 5.5, Math.sin(a) * 5.5, 1.7, rgba('#f2ff9a', 0.9));
  }
  glow(ctx, 0, 0, 14, '#c8ff5a', 0.25 + 0.15 * Math.sin(p.w * TAU));
  void pal;
};

const carnifex: Drawer = (ctx, p, pal) => {
  legs(
    ctx,
    p,
    pal,
    [
      [-16, 14, -32, 34, 0],
      [4, 16, 10, 36, 0.5],
    ],
    6,
    7,
  );
  tail(ctx, -26, 22, 18, p, pal, 2);
  flesh(ctx, -4, 0, 30, 24, pal);
  // Massive armoured back: overlapping plates and spines.
  ellipse(ctx, -3, 0, 28, 23, pal.carapace, pal.carapaceDark, 2.4);
  ellipse(ctx, -6, -5, 17, 10, rgba(pal.carapaceLight, 0.45));
  // Segment seams across the shell.
  for (const x of [-18, -6, 6]) {
    ctx.beginPath();
    ctx.ellipse(x, 0, 6, 21 - Math.abs(x) * 0.35, 0, -Math.PI / 2, Math.PI / 2);
    ctx.strokeStyle = rgba(pal.carapaceDark, 0.8);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  plate(ctx, 16, 0, 10, 14, pal);
  // Back spines along both flanks + a dorsal crest row.
  for (const s of [-1, 1])
    for (const x of [-22, -10, 2])
      poly(
        ctx,
        [
          [x - 4, s * 17],
          [x - 2, s * 29],
          [x + 4, s * 17],
        ],
        pal.bone,
        shade(pal.bone, -0.5),
        0.8,
      );
  spines(ctx, -22, 4, 0, 4, 3.5, pal);
  // Twin scything / crushing claws clamp on attack.
  const clamp = p.a > 0 ? Math.sin(p.a * Math.PI) : 0;
  for (const s of [-1, 1]) {
    leg(ctx, 16, s * 18, 30 + clamp * 6, s * (26 - clamp * 10), s * 5, pal.carapaceDark, 8);
    leg(ctx, 16, s * 18, 30 + clamp * 6, s * (26 - clamp * 10), s * 5, pal.carapace, 6.4);
    talon(
      ctx,
      30 + clamp * 6,
      s * (26 - clamp * 10),
      s * (0.9 - clamp * 1.2),
      30,
      7,
      -s * 0.35,
      pal,
    );
    talon(
      ctx,
      28 + clamp * 6,
      s * (24 - clamp * 10),
      s * (0.2 - clamp * 0.6),
      18,
      5,
      -s * 0.2,
      pal,
    );
  }
  head(ctx, 26, 0, 18, 16, pal);
  // Armoured brow ridge.
  poly(
    ctx,
    [
      [18, -9],
      [32, -4],
      [32, 4],
      [18, 9],
      [22, 0],
    ],
    pal.bone,
    shade(pal.bone, -0.5),
    1,
  );
};

const psychophage: Drawer = (ctx, p, pal) => {
  // Six scuttling, talon-tipped limbs (three pairs) around a hunched, bulbous body.
  const scuttle = 1 - p.c;
  const pairs: Array<[number, number, number, number, number, number]> = [
    [-16, 11, -28, 24, 0, 3.5],
    [-1, 17, -5, 31, 0.33, 3.8],
    [14, 15, 24, 27, 0.66, 3.3],
  ];
  for (const [hx, hy, fx, fy, ph, lw] of pairs) {
    for (const s of [-1, 1]) {
      const sw = Math.sin((p.w + ph + (s > 0 ? 0.5 : 0)) * TAU) * 5.5 * scuttle;
      const cx = hx + (fx - hx) * (1 - p.c * 0.6) + sw;
      const cy = s * (hy + (fy - hy) * (1 - p.c * 0.5));
      limb(ctx, hx, s * hy, cx, cy, -s * lw * 1.4, lw, pal);
    }
  }
  // Rear-heavy flesh with digestive sacs and orifices.
  flesh(ctx, -4, 0, 26, 22, pal);
  for (const [sx, sy, rx, ry] of [
    [-16, -11, 8.5, 7.2],
    [-16, 11, 8.5, 7.2],
    [-8, 0, 11, 8.5],
  ] as const) {
    ellipse(ctx, sx, sy, rx, ry, pal.flesh, pal.fleshDark, 1.2);
    circle(ctx, sx + 2, sy, 2.3, rgba(pal.fleshDark, 0.65));
  }
  plate(ctx, -2, 0, 18, 16, pal);
  plate(ctx, 10, 0, 12, 12, pal);
  // Spore-spewing dorsal chimneys: three short stacks on the back (visible as pipes from above).
  const ash = p.a > 0 ? Math.sin(p.a * Math.PI) : 0.3 + 0.15 * Math.sin(p.w * TAU);
  for (const [cx, cy, len] of [
    [-16, -8, 11],
    [-20, 0, 14],
    [-16, 8, 11],
  ] as const) {
    // pipe body pointing slightly rearward (-X), rim facing up/back.
    ellipse(ctx, cx, cy, len * 0.55, 4.6, pal.carapaceDark, pal.carapaceDark, 1);
    ellipse(ctx, cx, cy, len * 0.48, 3.7, pal.carapace, pal.carapaceDark, 1.1);
    ellipse(ctx, cx - len * 0.25, cy, 3.4, 3.6, pal.carapaceLight, pal.carapaceDark, 1);
    circle(ctx, cx - len * 0.35, cy, 2.5, '#1a0610');
    glow(ctx, cx - len * 0.35, cy, 8, '#c070ff', 0.4 + 0.5 * ash);
    if (ash > 0.15)
      ellipse(
        ctx,
        cx - len * 0.35 - 5 - ash * 5,
        cy + Math.sin(p.w * 8 + cy) * 2,
        3.4 * ash + 1.5,
        2.6 * ash + 1,
        rgba('#d8a0ff', 0.55),
      );
  }
  // Gaping many-jawed maw at the front — the face is the funnel, not a gaunt skull.
  const open = 0.78 + (p.a > 0 ? Math.sin(p.a * Math.PI) * 0.32 : 0.08 * Math.sin(p.w * TAU));
  const mawX = 22;
  for (let k = 0; k < 6; k++) {
    const a = -0.9 + (k / 5) * 1.8;
    const jx = mawX + Math.cos(a) * 6 * open;
    const jy = Math.sin(a) * 10.5 * open;
    poly(
      ctx,
      [
        [mawX - 2, Math.sin(a) * 4],
        [jx + 4, jy],
        [jx, jy + Math.sign(a || 1) * 3.2],
      ],
      pal.bone,
      shade(pal.bone, -0.5),
      0.7,
    );
  }
  ellipse(ctx, mawX + 2, 0, 8.2 * open, 9.2 * open, '#1a0610', pal.fleshDark, 1.2);
  ellipse(ctx, mawX, 0, 6 * open, 6.6 * open, '#3a1028');
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    const tx = mawX + 2 + Math.cos(a) * 6.6 * open;
    const ty = Math.sin(a) * 7.6 * open;
    poly(
      ctx,
      [
        [tx, ty],
        [tx + Math.cos(a) * 3.6, ty + Math.sin(a) * 3.6],
        [tx + Math.cos(a + 0.3) * 1.6, ty + Math.sin(a + 0.3) * 1.6],
      ],
      pal.bone,
    );
  }
  // Barbed whipping tentacles around the maw.
  ctx.lineCap = 'round';
  for (let k = 0; k < 8; k++) {
    const baseA = -1.15 + (k / 7) * 2.3;
    const wob =
      Math.sin(p.w * TAU * 2 + k * 1.7) * 0.35 * (1 - p.c) +
      (p.a > 0 ? Math.sin(p.a * Math.PI + k) * 0.4 : 0);
    const len = 16 + (k % 3) * 3;
    const x0 = mawX + Math.cos(baseA) * 8;
    const y0 = Math.sin(baseA) * 9.2;
    const x1 = x0 + Math.cos(baseA + wob) * len * 0.55;
    const y1 = y0 + Math.sin(baseA + wob) * len * 0.55;
    const x2 = x0 + Math.cos(baseA - wob * 0.7) * len;
    const y2 = y0 + Math.sin(baseA - wob * 0.7) * len;
    ctx.lineWidth = 3.3;
    ctx.strokeStyle = pal.fleshDark;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x1, y1, x2, y2);
    ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = pal.flesh;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x1, y1, x2, y2);
    ctx.stroke();
    circle(ctx, x2, y2, 1.35, pal.bone);
  }
  // Side eyes by the maw (violet psychic glint).
  for (const s of [-1, 1]) {
    circle(ctx, 14, s * 8.2, 1.7, pal.eye);
    glow(ctx, 14, s * 8.2, 5.2, '#c070ff', 0.5);
  }
};

/* --------------------------------------------------------------- sprites */

interface Spec {
  size: number;
  draw: Drawer;
  walk: number;
  attack: number;
  death: number;
  brief: string;
}

const hiveGuard: Drawer = (ctx, p, pal) => {
  const rec = p.a * 8;
  const gait = Math.sin(p.w * TAU);
  plate(ctx, -2, 0, 16, 13, pal, p.c * 0.2);
  flesh(ctx, 4, 0, 10, 8, pal);
  // Four walking legs.
  for (const s of [-1, 1]) {
    leg(ctx, -4, s * 8, 8 + gait * s * 3, s * 16, s * 4, pal.carapace, 3.2);
    leg(ctx, 6, s * 7, 4 - gait * s * 3, s * 15, s * 3, pal.carapace, 3);
  }
  // Shield-like shoulder carapace on the left.
  plate(ctx, 2, -11, 9, 8, pal, -0.4);
  // Impaler cannon reaching forward.
  flesh(ctx, 14 + rec * 0.3, 6, 7, 4.5, pal, 0.1);
  line(ctx, 16 + rec * 0.3, 6, 28 + rec, 6, pal.bone, 3.4);
  line(ctx, 16 + rec * 0.3, 6, 28 + rec, 6, pal.bone, 1.4);
  circle(ctx, 28 + rec, 6, 2.2, pal.bone);
  // Head and sensory horns.
  plate(ctx, 14, -3, 8, 6, pal, 0.15);
  circle(ctx, 18, -4, 1.6, pal.eye);
  glow(ctx, 18, -4, 4, pal.eye, 0.45);
  line(ctx, 16, -8, 22, -12, pal.bone, 1.6);
};

const zoanthrope: Drawer = (ctx, p, pal) => {
  const bob = Math.sin(p.w * TAU) * 3;
  const swell = 1 + p.a * 0.15;
  // Atrophied dangling body.
  flesh(ctx, -2, 10 + bob, 6, 8, pal);
  for (const s of [-1, 1]) line(ctx, -2, 14 + bob, s * 7, 20 + bob + p.c * 4, pal.fleshDark, 1.6);
  // Huge cranium.
  glow(ctx, 2, -2 + bob, 22 * swell, '#a050ff', 0.35 + p.a * 0.25);
  ellipse(ctx, 2, -2 + bob, 16 * swell, 14 * swell, pal.flesh, pal.fleshDark, 1.4);
  plate(ctx, 0, -6 + bob, 10, 7, pal, -0.2);
  // Warp eye.
  circle(ctx, 8, -2 + bob, 3.2, pal.eye);
  glow(ctx, 8, -2 + bob, 8, '#d080ff', 0.7);
  circle(ctx, 9, -2.5 + bob, 1.2, '#ffe8ff');
  // Head-tail tendrils.
  for (const s of [-1, 1]) line(ctx, -8, -2 + bob, -16, s * 8 + bob, pal.fleshDark, 2);
};

const lictor: Drawer = (ctx, p, pal) => {
  const rec = p.a * 10;
  const gait = Math.sin(p.w * TAU);
  const dark = pal.carapaceDark;
  flesh(ctx, 0, 0, 8, 6, pal);
  plate(ctx, -2, 0, 11, 8, pal, p.c * 0.25);
  // Long leaping legs.
  for (const s of [-1, 1]) {
    leg(ctx, -2, s * 5, 10 + gait * s * 4, s * 14, s * 3, dark, 2.4);
    leg(ctx, 4, s * 5, 6 - gait * s * 3, s * 13, s * 2, pal.flesh, 2);
  }
  // Upper rending claws reaching forward.
  for (const s of [-1, 1]) {
    line(ctx, 6, s * 3, 18 + rec, s * (8 - rec * 0.4), pal.bone, 2.2);
    line(ctx, 18 + rec, s * (8 - rec * 0.4), 22 + rec, s * (5 - rec * 0.2), pal.bone, 1.6);
  }
  // Mantle / flesh hooks on the back.
  for (const s of [-1, 1]) line(ctx, -6, s * 2, -14, s * 10, pal.flesh, 1.8);
  plate(ctx, 8, -2, 6, 4.5, pal, 0.2);
  circle(ctx, 12, -3, 1.4, pal.eye);
  glow(ctx, 12, -3, 3.5, pal.eye, 0.4);
};

const tyrantGuard: Drawer = (ctx, p, pal) => {
  const rec = p.a * 6;
  const gait = Math.sin(p.w * TAU);
  // Massive shield plates.
  plate(ctx, 0, 0, 20, 16, pal, p.c * 0.15);
  plate(ctx, 6, -10, 12, 10, pal, -0.35);
  plate(ctx, 6, 10, 12, 10, pal, 0.35);
  flesh(ctx, 4, 0, 10, 8, pal);
  for (const s of [-1, 1]) {
    leg(ctx, -4, s * 10, 10 + gait * s * 2, s * 20, s * 5, pal.carapace, 5);
    leg(ctx, 8, s * 9, 6 - gait * s * 2, s * 18, s * 4, pal.carapace, 4.4);
  }
  // Short heavy claws.
  for (const s of [-1, 1]) leg(ctx, 10, s * 6, 18 + rec, s * 8, s * 3, pal.bone, 4);
  plate(ctx, 14, -2, 8, 6, pal, 0.1);
  circle(ctx, 18, -3, 1.7, pal.eye);
};

const hiveTyrant: Drawer = (ctx, p, pal) => {
  const rec = p.a * 8;
  const gait = Math.sin(p.w * TAU);
  // Vestigial wings.
  for (const s of [-1, 1]) {
    ellipse(ctx, -8, s * 22, 16, 9, pal.flesh, pal.fleshDark, 1, s * 0.5);
    plate(ctx, -6, s * 20, 12, 6, pal, s * 0.45);
  }
  plate(ctx, 0, 0, 22, 16, pal, p.c * 0.12);
  flesh(ctx, 6, 0, 12, 9, pal);
  for (const s of [-1, 1]) {
    leg(ctx, -4, s * 10, 14 + gait * s * 3, s * 24, s * 6, pal.carapace, 5.5);
    leg(ctx, 8, s * 10, 8 - gait * s * 3, s * 22, s * 5, pal.carapace, 5);
  }
  // Four arms: boneswords high, lesser claws low.
  for (const s of [-1, 1]) {
    line(ctx, 10, s * 6, 26 + rec, s * (14 - rec * 0.3), pal.bone, 3.2);
    line(ctx, 26 + rec, s * (14 - rec * 0.3), 32 + rec, s * (10 - rec * 0.2), pal.bone, 2.2);
    line(ctx, 8, s * 8, 20, s * 16, pal.fleshDark, 2.4);
  }
  // Psychic crest.
  plate(ctx, 16, -4, 11, 8, pal, 0.15);
  for (const s of [-1, 1]) line(ctx, 14, -8, 22, s * -16, pal.bone, 2);
  glow(ctx, 22, -5, 8, '#c070ff', 0.45 + p.a * 0.25);
  circle(ctx, 22, -5, 2.2, pal.eye);
};

const SPECIES: Record<string, Spec> = {
  hormagaunt: {
    size: 64,
    draw: hormagaunt,
    walk: 6,
    attack: 3,
    death: 4,
    brief: 'fast leaping alien with four scything bone talons, powerful hind legs and a long tail',
  },
  termagant: {
    size: 64,
    draw: termagant,
    walk: 6,
    attack: 3,
    death: 4,
    brief: 'small alien gunbeast holding an organic beetle-firing gun',
  },
  ripper: {
    size: 36,
    draw: ripper,
    walk: 4,
    attack: 2,
    death: 3,
    brief: 'tiny segmented grub with a round fanged maw',
  },
  genestealer: {
    size: 64,
    draw: genestealer,
    walk: 6,
    attack: 3,
    death: 4,
    brief: 'very fast purple four-armed alien with rending claws and a bulbous head',
  },
  warrior: {
    size: 100,
    draw: warrior,
    walk: 6,
    attack: 3,
    death: 4,
    brief: 'tall alien leader with bone swords, a bio-cannon and a glowing psychic crest',
  },
  ravener: {
    size: 100,
    draw: ravener,
    walk: 6,
    attack: 3,
    death: 4,
    brief: 'legless serpentine burrowing alien with two pairs of scything talons',
  },
  biovore: {
    size: 80,
    draw: biovore,
    walk: 4,
    attack: 3,
    death: 4,
    brief: 'squat quadruped alien with a glowing spore-mortar sac on its back',
  },
  spore_mine: {
    size: 48,
    draw: sporeMine,
    walk: 4,
    attack: 0,
    death: 3,
    brief: 'floating pulsing gas-bag mine with dangling tendrils',
  },
  carnifex: {
    size: 136,
    draw: carnifex,
    walk: 6,
    attack: 3,
    death: 5,
    brief: 'huge armoured alien siege beast with massive claws and a spiked carapace',
  },
  psychophage: {
    size: 124,
    draw: psychophage,
    walk: 6,
    attack: 3,
    death: 5,
    brief:
      'hunched many-limbed psychic furnace: six scuttling talon-tipped legs, a bulbous body with digestive sacs, dorsal ash-chimneys, and a gaping many-jawed maw ringed with barbed tentacles',
  },
  hive_guard: {
    size: 100,
    draw: hiveGuard,
    walk: 6,
    attack: 3,
    death: 4,
    brief:
      'hunched four-legged gunbeast with a long organic impaler cannon and a shield-like shoulder carapace',
  },
  zoanthrope: {
    size: 88,
    draw: zoanthrope,
    walk: 4,
    attack: 3,
    death: 4,
    brief:
      'floating swollen psychic alien: huge glowing cranium, atrophied dangling body and warp-lit eye',
  },
  lictor: {
    size: 80,
    draw: lictor,
    walk: 6,
    attack: 3,
    death: 4,
    brief:
      'lean mantis-like assassin alien with long rending claws, flesh hooks and a stealthy dark carapace',
  },
  tyrant_guard: {
    size: 112,
    draw: tyrantGuard,
    walk: 6,
    attack: 3,
    death: 4,
    brief:
      'bulky living-shield alien with massive overlapping carapace plates and short heavy claws',
  },
  hive_tyrant: {
    size: 136,
    draw: hiveTyrant,
    walk: 6,
    attack: 3,
    death: 5,
    brief:
      'towering winged hive monarch: four arms with boneswords, a psychic crest and a broad carapace',
  },
};

/** Every enemy id that has its own drawer (not the generic hormagaunt fallback). */
export const TYRANID_SPECIES_IDS = Object.keys(SPECIES);

const generic: Spec = SPECIES.hormagaunt!;

function render(
  ctx: Ctx,
  spec: Spec,
  anims: Record<string, [number, number]>,
  frame: number,
): void {
  const [anim, f, n] = animAt(anims, frame);
  const c = spec.size / 2;
  const pose: Pose = { w: 0, a: 0, c: 0 };
  if (anim === 'walk') pose.w = f / n;
  else if (anim === 'attack') pose.a = (f + 1) / (n + 1);
  else if (anim === 'death') pose.c = (f + 1) / n;
  ctx.save();
  ctx.translate(c, c);
  if (anim === 'death') {
    if (spec.draw === sporeMine) {
      // Burst: expanding spray, the sac collapses.
      const t = pose.c;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        circle(
          ctx,
          Math.cos(a) * t * 18,
          Math.sin(a) * t * 18,
          3 * (1 - t * 0.5),
          rgba('#b8d84a', 0.8 - t * 0.5),
        );
      }
      ellipse(ctx, 0, 0, 9 * (1 - t * 0.6), 7 * (1 - t * 0.6), rgba('#4a5418', 0.9));
      ctx.restore();
      return;
    }
    ctx.rotate(pose.c * 0.35);
  }
  spec.draw(ctx, pose, P);
  if (anim === 'death') {
    // Darken the corpse and pool ichor underneath.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(18,4,12,${0.15 + pose.c * 0.4})`;
    ctx.fillRect(-c, -c, spec.size, spec.size);
    ctx.globalCompositeOperation = 'destination-over';
    ellipse(ctx, -2, 2, c * 0.55 * pose.c + 1, c * 0.42 * pose.c + 1, rgba(P.ichor, 0.75));
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

export const tyranidSprites: SpriteDef[] = [...defaultContent.enemies.values()].map((def) => {
  const spec = SPECIES[def.id] ?? generic;
  const parts: Array<[string, number]> = [['walk', spec.walk]];
  if (spec.attack) parts.push(['attack', spec.attack]);
  parts.push(['death', spec.death]);
  const layout = animLayout(parts);
  return {
    key: def.sprite,
    group: 'enemy',
    w: spec.size,
    h: spec.size,
    scale: 2,
    ...layout,
    prompt: `Top-down (bird's-eye) ${spec.brief}; ${P.id} palette: carapace ${P.carapace}, flesh ${P.flesh}, bone ${P.bone}; facing right; frames: ${parts.map(([n, k]) => `${k} ${n}`).join(', ')}`,
    draw: (ctx, frame) => render(ctx, spec, layout.anims, frame),
  };
});
