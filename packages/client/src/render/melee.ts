import {
  meleeAngle,
  meleeProgress,
  meleeReach,
  type MeleeMotion,
  type WeaponDef,
} from '@sms/shared';
import type { Particles } from './particles.js';

export function swingPose(
  def: WeaponDef,
  remaining: number,
): { u: number; angle: number; reach: number; motion: MeleeMotion } | null {
  if (!def.melee || remaining <= 0) return null;
  const duration = def.meleeFx?.duration ?? def.fireInterval * 0.7;
  const u = meleeProgress(remaining, duration);
  const motion = def.meleeFx?.motion ?? 'slash';
  return { u, angle: meleeAngle(motion, u), reach: meleeReach(def), motion };
}

function hexAlpha(color: string, a: number): string {
  const hex = color.replace('#', '');
  const n =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Smear / trail of the blade along the recent arc, in front of the marine. */
export function drawMeleeTrail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  aim: number,
  def: WeaponDef,
  u: number,
): void {
  const fx = def.meleeFx;
  const motion = fx?.motion ?? 'slash';
  const reach = meleeReach(def);
  const c1 = fx?.trail ?? '#9fe8ff';
  const c2 = fx?.trail2 ?? c1;
  const span = motion === 'sweep' ? 0.28 : motion === 'rake' ? 0.2 : 0.22;
  const u0 = Math.max(0, u - span);
  const steps = 8;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < steps; i++) {
    const t0 = u0 + ((u - u0) * i) / steps;
    const t1 = u0 + ((u - u0) * (i + 1)) / steps;
    const a0 = aim + meleeAngle(motion, t0);
    const a1 = aim + meleeAngle(motion, t1);
    const fade = (i + 1) / steps;
    ctx.strokeStyle = hexAlpha(c1, 0.15 + 0.55 * fade);
    ctx.lineWidth = (motion === 'smash' ? 10 : motion === 'sweep' ? 7 : 6) * fade;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a0) * reach, y + Math.sin(a0) * reach);
    ctx.lineTo(x + Math.cos(a1) * reach, y + Math.sin(a1) * reach);
    ctx.stroke();
    if (motion === 'rake') {
      const inner = reach * 0.72;
      ctx.strokeStyle = hexAlpha(c2, 0.1 + 0.4 * fade);
      ctx.lineWidth = 4 * fade;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a0 + 0.35) * inner, y + Math.sin(a0 + 0.35) * inner);
      ctx.lineTo(x + Math.cos(a1 + 0.35) * inner, y + Math.sin(a1 + 0.35) * inner);
      ctx.stroke();
    }
  }
  // Bright tip of the blade.
  const a = aim + meleeAngle(motion, u);
  ctx.fillStyle = hexAlpha(c2, 0.85);
  ctx.beginPath();
  ctx.arc(
    x + Math.cos(a) * reach,
    y + Math.sin(a) * reach,
    motion === 'smash' ? 5 : 3.2,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

export function meleeImpactBurst(
  particles: Particles,
  x: number,
  y: number,
  aim: number,
  def: WeaponDef,
  u: number,
): void {
  const fx = def.meleeFx;
  const motion = fx?.motion ?? 'slash';
  const a = aim + meleeAngle(motion, u);
  const reach = meleeReach(def);
  const px = x + Math.cos(a) * reach;
  const py = y + Math.sin(a) * reach;
  const c1 = fx?.trail ?? '#9fe8ff';
  const c2 = fx?.trail2 ?? c1;
  const n = motion === 'smash' ? 14 : motion === 'chop' ? 10 : 6;
  for (let i = 0; i < n; i++) {
    const ang = a + (Math.random() - 0.5) * (motion === 'smash' ? 1.6 : 0.9);
    const spd = 40 + Math.random() * (motion === 'smash' ? 180 : 90);
    particles.spawn({
      x: px,
      y: py,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      maxLife: motion === 'chop' ? 0.35 : 0.25,
      size: motion === 'smash' ? 3.2 : 2.2,
      grow: 0.4,
      color: Math.random() < 0.5 ? c1 : c2,
      shape: 'dot',
      additive: true,
    });
  }
}

/** Soft motes along a frost / ember trail while the swing is in flight. */
export function meleeTrailMotes(
  particles: Particles,
  x: number,
  y: number,
  aim: number,
  def: WeaponDef,
  u: number,
  dt: number,
): void {
  const fx = def.meleeFx;
  if (!fx) return;
  const motion = fx.motion;
  if (motion !== 'chop' && motion !== 'smash') return;
  if (Math.random() > dt * 28) return;
  const a = aim + meleeAngle(motion, u);
  const reach = meleeReach(def) * (0.55 + Math.random() * 0.4);
  particles.spawn({
    x: x + Math.cos(a) * reach,
    y: y + Math.sin(a) * reach,
    vx: (Math.random() - 0.5) * 30,
    vy: (Math.random() - 0.5) * 30 - (motion === 'chop' ? 20 : 0),
    maxLife: 0.3,
    size: 2,
    grow: 0.6,
    color: fx.trail2 ?? fx.trail,
    shape: 'dot',
    additive: true,
  });
}
