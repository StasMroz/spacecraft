/**
 * `npm run contact-sheet -w @sms/tools` — renders a labelled contact sheet of every unit
 * (chapter marines with their weapons, Tyranids with walk / attack / death frames) from the
 * generated atlas + manifest into docs/wh-sprites.png. Run `npm run assets` first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { defaultContent, type AssetManifest } from '@sms/shared';
import { OUT_DIR, REPO_ROOT } from './paths.js';

const out =
  process.argv.find((a) => a.startsWith('--out='))?.slice(6) ??
  path.join(REPO_ROOT, 'docs/wh-sprites.png');
const manifest = JSON.parse(
  fs.readFileSync(path.join(OUT_DIR, 'manifest.json'), 'utf8'),
) as AssetManifest;

function drawSprite(
  ctx: SKRSContext2D,
  atlas: Image,
  key: string,
  frame: number,
  cx: number,
  cy: number,
  zoom: number,
  rot = 0,
): void {
  const s = manifest.sprites[key];
  if (!s) return;
  const [fx, fy] = s.frames[Math.min(frame, s.frames.length - 1)]!;
  const k = zoom / (s.scale ?? 1);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.drawImage(atlas, fx, fy, s.w, s.h, -s.ax * k, -s.ay * k, s.w * k, s.h * k);
  ctx.restore();
}

function label(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  size = 15,
  color = '#e9dcb8',
): void {
  ctx.font = `bold ${size}px serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

async function main(): Promise<void> {
  const atlas = await loadImage(path.join(OUT_DIR, manifest.atlas.image));
  const content = defaultContent;
  const weapons = content.weaponOrder;
  const enemies = [...content.enemies.values()];
  const CELL = 150;
  const W = Math.max(content.chapters.length, weapons.length) * CELL + 40;
  const enemyRowH = 240;
  const guardRowH = 180;
  const H =
    120 +
    CELL +
    40 +
    CELL +
    60 +
    enemies.length * 0 +
    Math.ceil(enemies.length / 3) * enemyRowH +
    guardRowH +
    40;
  const W2 = Math.max(W, 3 * 4 * 115 + 60);
  const c = createCanvas(W2, H);
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1d1814');
  bg.addColorStop(1, '#0d0b09');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W2, H);
  label(ctx, `${content.title}: unit contact sheet`, W2 / 2, 36, 26, '#e0b44a');
  label(
    ctx,
    'Procedural sprites (tools/src/sprites). Marines are composited: body + held weapon + pauldrons/helmet.',
    W2 / 2,
    60,
    13,
    '#a89a7a',
  );

  // Row 1: chapters with their starting weapon.
  let y = 90;
  label(ctx, 'Chapters (lobby choice)', 120, y, 16, '#e0b44a');
  content.chapters.forEach((ch, i) => {
    const cx = 40 + CELL / 2 + i * CELL;
    const cy = y + 20 + CELL / 2;
    const w = weapons[i % weapons.length]!;
    drawSprite(ctx, atlas, 'shadow', 0, cx, cy + 4, 1.6);
    drawSprite(ctx, atlas, `marine_${ch.id}`, 0, cx, cy, 1.6);
    drawSprite(ctx, atlas, w.sprites.held, 0, cx, cy, 1.6);
    drawSprite(ctx, atlas, `marine_${ch.id}_top`, 0, cx, cy, 1.6);
    drawSprite(ctx, atlas, `badge_${ch.id}`, 0, cx + 52, cy - 52, 1);
    label(ctx, ch.name, cx, cy + 70, 14);
  });
  // Row 2: every weapon, held + icon.
  y += CELL + 50;
  label(ctx, 'Weapons (unlock order)', 120, y, 16, '#e0b44a');
  const ch0 = content.chapters[0]!;
  weapons.forEach((w, i) => {
    const cx = 40 + CELL / 2 + i * CELL;
    const cy = y + 10 + CELL / 2;
    drawSprite(ctx, atlas, `marine_${ch0.id}`, 0, cx, cy - 10, 1.4);
    drawSprite(ctx, atlas, w.sprites.held, 0, cx, cy - 10, 1.4);
    drawSprite(ctx, atlas, `marine_${ch0.id}_top`, 0, cx, cy - 10, 1.4);
    drawSprite(ctx, atlas, w.sprites.icon, 0, cx, cy + 46, 1);
    label(ctx, `${w.slot}. ${w.name}`, cx, cy + 78, 13);
  });
  // Enemy grid: walk / attack / death.
  y += CELL + 70;
  label(ctx, 'Tyranids: walk · attack · death', 160, y, 16, '#e0b44a');
  y += 10;
  const colW = (W2 - 40) / 3;
  enemies.forEach((e, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x0 = 20 + col * colW;
    const y0 = y + row * enemyRowH;
    const s = manifest.sprites[e.sprite];
    if (!s) return;
    const worldW = s.w / (s.scale ?? 1);
    const zoom = Math.min(1.6, 100 / worldW);
    const frames: number[] = [];
    const a = s.anims ?? {};
    if (a.walk) frames.push(a.walk[0], a.walk[0] + Math.floor(a.walk[1] / 2));
    if (a.attack) frames.push(a.attack[0] + Math.floor(a.attack[1] / 2));
    if (a.death) frames.push(a.death[0] + a.death[1] - 1);
    const step = colW / frames.length;
    frames.forEach((f, k) =>
      drawSprite(ctx, atlas, e.sprite, f, x0 + step * (k + 0.5), y0 + 90, zoom),
    );
    label(ctx, `${e.name}${e.boss ? ' (boss)' : ''}`, x0 + colW / 2, y0 + 175, 15);
    const role = e.role ?? '';
    label(
      ctx,
      role.length > 64 ? role.slice(0, 61) + '…' : role,
      x0 + colW / 2,
      y0 + 198,
      11,
      '#a89a7a',
    );
  });
  // Guardsmen: human walk cycle (not a disc).
  const gy = y + Math.ceil(enemies.length / 3) * enemyRowH + 24;
  label(ctx, 'Astra Militarum Guardsmen (allies): walk cycle', 220, gy, 16, '#e0b44a');
  const gs = manifest.sprites['ally_guardsman'];
  if (gs) {
    const frames = [0, 1, 2, 3, 4, 5];
    const step = 110;
    frames.forEach((f, k) => {
      const cx = 80 + k * step;
      const cy = gy + 90;
      drawSprite(ctx, atlas, 'shadow', 0, cx, cy + 4, 1.2);
      drawSprite(ctx, atlas, 'ally_guardsman', f, cx, cy, 1.8);
    });
    label(
      ctx,
      'khaki uniform, olive flak vest, helmet, lasgun — a person, not a ball',
      80 + 2.5 * step,
      gy + 155,
      13,
      '#a89a7a',
    );
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await c.encode('png'));
  console.log(`contact sheet -> ${out} (${W2}x${H})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
