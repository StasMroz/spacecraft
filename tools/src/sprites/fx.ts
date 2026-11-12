import { defaultContent } from '@sms/shared';
import { circle, ellipse, glow, line, poly, rgba, roundRect } from './draw.js';
import { FLEET } from './palette.js';
import type { Ctx, SpriteDef } from './types.js';

/* ------------------------------------------------------------- projectiles */

/** Drawers per projectile kind; every kind in content gets a sprite (unknown -> bolt). */
const PROJ: Record<string, { w: number; h: number; prompt: string; draw: (ctx: Ctx) => void }> = {
  bolt: {
    w: 24,
    h: 10,
    prompt: 'Mass-reactive bolt round with a short orange rocket trail, pointing right',
    draw: (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 16, 0);
      g.addColorStop(0, 'rgba(255,140,40,0)');
      g.addColorStop(1, 'rgba(255,190,90,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 3.5, 16, 3);
      roundRect(ctx, 14, 2.5, 8, 5, 2.5, '#c99a3a', '#4a3010', 0.8);
      circle(ctx, 21, 5, 1.6, '#ffe7a8');
    },
  },
  heavy_bolt: {
    w: 30,
    h: 12,
    prompt: 'Heavy bolt round, bigger brass slug with a fierce rocket trail, pointing right',
    draw: (ctx) => {
      glow(ctx, 8, 6, 8, '#ff8a2a', 0.7);
      const g = ctx.createLinearGradient(0, 0, 20, 0);
      g.addColorStop(0, 'rgba(255,120,30,0)');
      g.addColorStop(1, 'rgba(255,200,110,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 4, 20, 4);
      roundRect(ctx, 18, 2.5, 11, 7, 3.5, '#d2a24a', '#4a3010', 0.9);
      circle(ctx, 27, 6, 2, '#fff0c0');
    },
  },
  slash: {
    w: 20,
    h: 20,
    prompt: 'Faint blue power-field arc fragment',
    draw: (ctx) => {
      glow(ctx, 10, 10, 9, '#7fc8ff', 0.5);
      circle(ctx, 10, 10, 2, 'rgba(220,240,255,0.8)');
    },
  },
  flame: {
    w: 36,
    h: 36,
    prompt: 'Soft roiling blob of burning promethium, additive blending friendly',
    draw: (ctx) => {
      glow(ctx, 18, 18, 18, '#ff5a0a', 0.9);
      glow(ctx, 18, 18, 11, '#ffb03a', 0.9);
      glow(ctx, 20, 18, 5, '#fff2c0', 0.8);
    },
  },
  plasma: {
    w: 34,
    h: 20,
    prompt: 'Glowing blue-white plasma bolt pointing right',
    draw: (ctx) => {
      glow(ctx, 20, 10, 12, '#3ab8ff', 0.95);
      ellipse(ctx, 20, 10, 9, 5, 'rgba(160,230,255,0.9)');
      ellipse(ctx, 22, 10, 5, 3, '#ffffff');
      line(ctx, 2, 10, 12, 10, 'rgba(90,190,255,0.6)', 3);
    },
  },
  plasma_super: {
    w: 44,
    h: 28,
    prompt: 'Overcharged plasma bolt: large white-hot core, violet-blue corona, crackling',
    draw: (ctx) => {
      glow(ctx, 26, 14, 16, '#7a8aff', 1);
      glow(ctx, 26, 14, 10, '#bfe8ff', 1);
      ellipse(ctx, 27, 14, 8, 5.5, '#ffffff');
      ctx.strokeStyle = 'rgba(220,230,255,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(12, 6);
      ctx.lineTo(18, 10);
      ctx.lineTo(15, 14);
      ctx.lineTo(21, 20);
      ctx.stroke();
      line(ctx, 0, 14, 16, 14, 'rgba(130,140,255,0.6)', 4);
    },
  },
  melta: {
    w: 48,
    h: 18,
    prompt:
      'Shimmering melta heat beam segment: white-hot core with orange heat haze, pointing right',
    draw: (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 48, 0);
      g.addColorStop(0, 'rgba(255,90,20,0)');
      g.addColorStop(0.5, 'rgba(255,140,40,0.85)');
      g.addColorStop(1, 'rgba(255,230,170,1)');
      ctx.fillStyle = g;
      roundRect(ctx, 0, 4, 48, 10, 5, g);
      line(ctx, 6, 9, 46, 9, 'rgba(255,255,235,0.95)', 2.5);
      glow(ctx, 42, 9, 9, '#ffcf8a', 0.8);
    },
  },
  frag: {
    w: 16,
    h: 16,
    prompt: 'Top-down thrown frag grenade, olive casing, blinking fuse light',
    draw: (ctx) => {
      circle(ctx, 8, 8, 5.5, '#4f5a2e', '#1a1f0c', 1.2);
      line(ctx, 3, 8, 13, 8, '#1a1f0c', 0.8);
      line(ctx, 8, 3, 8, 13, '#1a1f0c', 0.8);
      glow(ctx, 10, 6, 4, '#ff3a2a', 0.9);
    },
  },
  fleshborer: {
    w: 18,
    h: 14,
    prompt: 'Tiny flesh-eating beetle projectile with flickering legs, pointing right',
    draw: (ctx) => {
      glow(ctx, 9, 7, 7, '#c8ff5a', 0.35);
      for (const s of [-1, 1])
        for (const x of [6, 9, 12]) line(ctx, x, 7, x - 2, 7 + s * 5, '#2a1408', 0.9);
      ellipse(ctx, 9, 7, 5.5, 3.5, FLEET.carapace, FLEET.carapaceDark, 0.8);
      circle(ctx, 14, 7, 2, FLEET.flesh);
    },
  },
  deathspitter: {
    w: 22,
    h: 16,
    prompt:
      'Burning acid-maggot round from a bio-cannon: glowing yellow-green blob with a smoky trail',
    draw: (ctx) => {
      glow(ctx, 13, 8, 9, '#c8ff3a', 0.9);
      line(ctx, 1, 8, 9, 8, 'rgba(120,160,40,0.6)', 3);
      ellipse(ctx, 13, 8, 6, 4, '#d8ff6a', '#4a6a12', 1);
      circle(ctx, 15, 7, 1.6, '#ffffe0');
    },
  },
  spore: {
    w: 32,
    h: 32,
    prompt: 'Lobbed spore mine in flight: pulsing green gas sac with trailing tendrils',
    draw: (ctx) => {
      glow(ctx, 16, 16, 15, '#c8ff5a', 0.4);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        line(ctx, 16, 16, 16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, FLEET.fleshDark, 1.2);
      }
      circle(ctx, 16, 16, 8, '#7a8530', '#2a300c', 1.2);
      circle(ctx, 14, 14, 3.5, 'rgba(242,255,154,0.75)');
    },
  },
  impaler: {
    w: 28,
    h: 10,
    prompt:
      'Bone impaler spike from a Hive Guard cannon, long ivory dart with a flesh collar, pointing right',
    draw: (ctx) => {
      glow(ctx, 22, 5, 6, '#ffe8a0', 0.45);
      line(ctx, 2, 5, 22, 5, FLEET.bone, 3.2);
      line(ctx, 2, 5, 22, 5, '#fff6d0', 1.2);
      ellipse(ctx, 8, 5, 3.5, 3, FLEET.flesh, FLEET.fleshDark, 0.8);
      ctx.beginPath();
      ctx.moveTo(22, 5);
      ctx.lineTo(27, 5);
      ctx.lineTo(22, 2.5);
      ctx.lineTo(22, 7.5);
      ctx.closePath();
      ctx.fillStyle = '#f4e8c0';
      ctx.fill();
    },
  },
  warpblast: {
    w: 28,
    h: 28,
    prompt: 'Psychic warp blast: pulsing violet orb with crackling arcs, flying right',
    draw: (ctx) => {
      glow(ctx, 16, 14, 14, '#c070ff', 0.7);
      circle(ctx, 16, 14, 8, '#6a20a0', '#2a0840', 1.2);
      circle(ctx, 14, 12, 3.5, 'rgba(230,200,255,0.85)');
      for (const a of [0.2, 1.4, 2.6, 4.0]) {
        line(
          ctx,
          16 + Math.cos(a) * 5,
          14 + Math.sin(a) * 5,
          16 + Math.cos(a) * 12,
          14 + Math.sin(a) * 12,
          'rgba(210,160,255,0.8)',
          1.4,
        );
      }
    },
  },
};

const projectiles: SpriteDef[] = defaultContent.projectileKinds.map((kind) => {
  const p = PROJ[kind] ?? PROJ.bolt!;
  return {
    key: `proj_${kind}`,
    group: 'projectile',
    w: p.w,
    h: p.h,
    scale: 2,
    frames: 1,
    prompt: p.prompt,
    draw: p.draw,
  };
});

/* ------------------------------------------------------------------ decals */

type R = { next(): number; range(a: number, b: number): number };

function splat(ctx: Ctx, rng: R, color: string, size = 64): void {
  const c = size / 2;
  for (let i = 0; i < 16; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = rng.range(0, c * 0.62);
    ellipse(
      ctx,
      c + Math.cos(a) * d,
      c + Math.sin(a) * d,
      rng.range(3, 11),
      rng.range(3, 8),
      rgba(color, rng.range(0.4, 0.75)),
      undefined,
      0,
      a,
    );
  }
  for (let i = 0; i < 12; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = rng.range(c * 0.55, c * 0.95);
    circle(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, rng.range(1, 2.6), rgba(color, 0.65));
    // Streak towards the droplet.
    line(
      ctx,
      c + Math.cos(a) * d * 0.5,
      c + Math.sin(a) * d * 0.5,
      c + Math.cos(a) * d,
      c + Math.sin(a) * d,
      rgba(color, 0.35),
      1.2,
    );
  }
}

function scorch(ctx: Ctx, rng: R, s: number): void {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 4, c, c, c - 2);
  g.addColorStop(0, 'rgba(8,6,4,0.8)');
  g.addColorStop(0.6, 'rgba(20,14,10,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * Math.PI * 2;
    line(
      ctx,
      c,
      c,
      c + Math.cos(a) * rng.range(c * 0.5, c * 0.95),
      c + Math.sin(a) * rng.range(c * 0.5, c * 0.95),
      'rgba(0,0,0,0.28)',
      rng.range(1, 3),
    );
  }
}

const decals: SpriteDef[] = [
  ...[0, 1, 2].map((i): SpriteDef => ({
    key: `decal_blood_${i}`,
    group: 'decal',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Top-down dark alien ichor splatter (wine-red / violet) on a metal floor',
    draw: (ctx, _f, rng) => splat(ctx, rng, FLEET.ichor),
  })),
  ...[0, 1, 2].map((i): SpriteDef => ({
    key: `decal_acid_${i}`,
    group: 'decal',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Top-down sickly yellow-green acid splash, corroded edges',
    draw: (ctx, _f, rng) => splat(ctx, rng, '#7a9a1a'),
  })),
  ...[0, 1].map((i): SpriteDef => ({
    key: `decal_scorch_${i}`,
    group: 'decal',
    w: i ? 64 : 96,
    h: i ? 64 : 96,
    frames: 1,
    prompt: 'Top-down black scorch mark from an explosion or promethium',
    draw: (ctx, _f, rng) => scorch(ctx, rng, i ? 64 : 96),
  })),
];

/* --------------------------------------------------------------------- fx */

const fx: SpriteDef[] = [
  {
    key: 'fx_explosion',
    group: 'fx',
    w: 128,
    h: 128,
    frames: 8,
    prompt: 'Top-down explosion fireball, 8 frames expanding then dark smoke dissipating',
    draw: (ctx, frame, rng) => {
      const t = frame / 7;
      const r = 20 + t * 42;
      ctx.save();
      ctx.globalAlpha = 1 - t * 0.85;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const d = r * 0.6;
        circle(
          ctx,
          64 + Math.cos(a) * d,
          64 + Math.sin(a) * d,
          r * 0.45,
          `rgba(${40 + t * 40},${34 + t * 36},${30 + t * 34},${0.75 - t * 0.3})`,
        );
      }
      if (t < 0.75) {
        glow(ctx, 64, 64, r * 1.1, '#ff5a00', 1 - t);
        glow(ctx, 64, 64, r * 0.7, '#ffc23a', 1 - t);
        if (t < 0.3) circle(ctx, 64, 64, r * 0.35, '#fff6d8');
      }
      ctx.restore();
    },
  },
  {
    key: 'fx_muzzle',
    group: 'fx',
    w: 32,
    h: 24,
    frames: 2,
    prompt: 'Muzzle flash star pointing right, 2 frames',
    draw: (ctx, frame) => {
      glow(ctx, 8, 12, 12, '#ffbf4a', 1);
      const len = frame ? 26 : 20;
      poly(
        ctx,
        [
          [2, 12],
          [len, 7],
          [len - 4, 12],
          [len, 17],
        ],
        'rgba(255,236,170,0.95)',
      );
      poly(
        ctx,
        [
          [4, 12],
          [12, 2],
          [10, 12],
          [12, 22],
        ],
        'rgba(255,210,110,0.8)',
      );
    },
  },
  {
    key: 'fx_particle',
    group: 'fx',
    w: 16,
    h: 16,
    frames: 1,
    prompt: 'Soft white round particle',
    draw: (ctx) => glow(ctx, 8, 8, 8, '#ffffff', 1),
  },
  {
    key: 'fx_spark',
    group: 'fx',
    w: 16,
    h: 6,
    frames: 1,
    prompt: 'Thin bright spark streak pointing right',
    draw: (ctx) => {
      line(ctx, 1, 3, 15, 3, 'rgba(255,240,200,0.95)', 1.6);
      circle(ctx, 14, 3, 1.4, '#ffffff');
    },
  },
  {
    key: 'fx_ring',
    group: 'fx',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Thin white glowing ring, used for revive/unlock pulses',
    draw: (ctx) => {
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
    },
  },
  {
    key: 'fx_burrow',
    group: 'fx',
    w: 64,
    h: 64,
    scale: 1.5,
    frames: 2,
    prompt:
      'Top-down churning mound of cracked floor plates and dirt where something tunnels beneath, 2 frames',
    draw: (ctx, frame, rng) => {
      ellipse(ctx, 32, 32, 22, 18, 'rgba(40,30,22,0.85)');
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + frame * 0.35;
        const d = rng.range(8, 18);
        poly(
          ctx,
          [
            [32 + Math.cos(a) * d, 32 + Math.sin(a) * d],
            [32 + Math.cos(a + 0.3) * (d + 7), 32 + Math.sin(a + 0.3) * (d + 7)],
            [32 + Math.cos(a - 0.2) * (d + 8), 32 + Math.sin(a - 0.2) * (d + 8)],
          ],
          '#4a443a',
          'rgba(0,0,0,0.6)',
          0.8,
        );
      }
      circle(ctx, 32, 32, 6, 'rgba(10,6,4,0.9)');
    },
  },
  {
    key: 'fx_synapse',
    group: 'fx',
    w: 128,
    h: 128,
    frames: 1,
    prompt: 'Faint violet psychic aura ring with drifting motes',
    draw: (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 62);
      g.addColorStop(0, 'rgba(180,108,255,0)');
      g.addColorStop(0.85, 'rgba(180,108,255,0.35)');
      g.addColorStop(1, 'rgba(180,108,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        circle(ctx, 64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54, 1.6, 'rgba(220,180,255,0.7)');
      }
    },
  },
  {
    key: 'shadow',
    group: 'fx',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Soft round black drop shadow',
    draw: (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    },
  },
];

export const fxSprites: SpriteDef[] = [...projectiles, ...decals, ...fx];
