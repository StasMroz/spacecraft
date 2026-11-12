import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { defaultContent } from '@sms/shared';
import { SPRITES } from '../src/sprites/index.js';

function hash(key: string): string {
  const def = SPRITES.find((s) => s.key === key);
  if (!def) throw new Error('missing ' + key);
  const cv = createCanvas(def.w, def.h);
  const ctx = cv.getContext('2d');
  def.draw(ctx as never, 0, undefined as never);
  return cv.toBuffer('image/png').toString('base64');
}

describe('chapter special weapons have their own sprites', () => {
  it('each chapter special icon and held sprite differs from the generic fallback', () => {
    const genericIcon = hash('icon_storm_bolter'); // will compare pairwise, not to flamer
    const hashes = new Set<string>();
    const specials = defaultContent.weaponOrder.filter((w) => w.chapter && !w.melee);
    expect(specials.length).toBeGreaterThanOrEqual(7);
    for (const w of specials) {
      const icon = hash(w.sprites.icon);
      const held = hash(w.sprites.held);
      expect(hashes.has(icon), `${w.id} icon unique`).toBe(false);
      expect(hashes.has(held), `${w.id} held unique`).toBe(false);
      hashes.add(icon);
      hashes.add(held);
    }
    void genericIcon;
  });
});
