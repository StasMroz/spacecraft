import { describe, expect, it } from 'vitest';
import { defaultContent, referencedAssetKeys, CORE_MUSIC, Rng as SharedRng } from '@sms/shared';
import { packShelves } from '../src/atlas/pack.js';
import { renderSong, SONGS } from '../src/audio/music.js';
import { RECIPES } from '../src/audio/recipes.js';
import { renderRecipe, variantCount } from '../src/audio/synth.js';
import { SR, Biquad, Rng, makeLoop } from '../src/audio/dsp.js';
import { decodeWav, encodeWav, normalize } from '../src/audio/wav.js';
import { SPRITES } from '../src/sprites/index.js';
import { TYRANID_SPECIES_IDS } from '../src/sprites/tyranids.js';
import { animAt, animLayout } from '../src/sprites/types.js';
import { CHAPTERS } from '@sms/shared';

describe('asset coverage', () => {
  const refs = referencedAssetKeys(defaultContent);
  it('every referenced sprite has a generator', () => {
    const have = new Set(SPRITES.map((s) => s.key));
    expect(refs.sprites.filter((k) => !have.has(k))).toEqual([]);
  });
  it('every referenced sound has a recipe', () => {
    const have = new Set(RECIPES.map((s) => s.key));
    expect(refs.sounds.filter((k) => !have.has(k))).toEqual([]);
  });
  it('every core music track has a song spec', () => {
    const have = new Set(SONGS.map((s) => s.key));
    expect(CORE_MUSIC.filter((k) => !have.has(k))).toEqual([]);
  });
  it('sprite keys are unique and carry prompts', () => {
    expect(new Set(SPRITES.map((s) => s.key)).size).toBe(SPRITES.length);
    for (const s of SPRITES) expect(s.prompt.length).toBeGreaterThan(5);
  });
});

describe('atlas packer', () => {
  it('packs without overlaps inside the atlas', () => {
    const items = Array.from({ length: 80 }, (_, i) => ({
      id: `s${i}`,
      w: 8 + ((i * 37) % 90),
      h: 8 + ((i * 53) % 70),
    }));
    const res = packShelves(items, 512, 2);
    const rects = [...res.rects.values()];
    expect(rects).toHaveLength(items.length);
    for (const r of rects) {
      expect(r.x + r.w).toBeLessThanOrEqual(res.width);
      expect(r.y + r.h).toBeLessThanOrEqual(res.height);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });
  it('rejects sprites wider than the atlas', () => {
    expect(() => packShelves([{ id: 'big', w: 2000, h: 10 }], 1024)).toThrow();
  });
});

describe('audio', () => {
  it('WAV encode/decode round-trips', () => {
    const s = new Float32Array(1000).map((_, i) => Math.sin(i / 10) * 0.5);
    const wav = encodeWav(s, 22050);
    const d = decodeWav(wav);
    expect(d.sampleRate).toBe(22050);
    expect(d.samples.length).toBe(1000);
    for (let i = 0; i < 1000; i += 97) expect(d.samples[i]).toBeCloseTo(s[i], 3);
  });
  it('normalize hits the requested peak', () => {
    const n = normalize(new Float32Array([0.1, -0.2, 0.05]), 0.9);
    expect(Math.max(...[...n].map(Math.abs))).toBeCloseTo(0.9, 5);
  });
  const pick = [
    'shoot_bolt_rifle',
    'flamer_loop',
    'horma_shriek',
    'carnifex_roar',
    'ui_click',
    'amb_swarm',
  ];
  const byKey = new Map(RECIPES.map((r) => [r.key, r]));
  it('recipes render non-silent, bounded and deterministic at 44.1 kHz', () => {
    expect(SR).toBe(44100);
    for (const k of pick) {
      const r = byKey.get(k)!;
      const a = renderRecipe(r, 0);
      expect(a.length, k).toBeGreaterThan(SR * 0.02);
      let pk = 0;
      let finite = true;
      for (const v of a) {
        if (!Number.isFinite(v)) finite = false;
        pk = Math.max(pk, Math.abs(v));
      }
      expect(finite, k).toBe(true);
      expect(pk, k).toBeGreaterThan(0.05);
      expect(pk, k).toBeLessThanOrEqual(1);
      expect(renderRecipe(r, 0)).toEqual(a);
    }
  });
  it('variants differ from each other; loops are single-take', () => {
    const r = byKey.get('shoot_bolt_rifle')!;
    expect(variantCount(r)).toBeGreaterThanOrEqual(3);
    expect(renderRecipe(r, 1)).not.toEqual(renderRecipe(r, 0));
    expect(variantCount(byKey.get('flamer_loop')!)).toBe(1);
  });
  it('loops wrap without a click', () => {
    for (const r of RECIPES.filter((x) => x.loop)) {
      const a = renderRecipe(r, 0);
      const jump = Math.abs(a[0] - a[a.length - 1]);
      let avg = 0;
      for (let i = 1; i < a.length; i++) avg += Math.abs(a[i] - a[i - 1]);
      avg /= a.length;
      expect(jump, r.key).toBeLessThan(Math.max(0.05, avg * 12));
    }
  });
  it('makeLoop shortens by the crossfade length', () => {
    const rng = new Rng(3);
    const src = Float32Array.from({ length: 5000 }, () => rng.bi());
    expect(makeLoop(src, 1000 / SR).length).toBe(4000);
  });
  it('biquad low-pass attenuates high frequencies', () => {
    const lp = new Biquad('lp', 500, 0.707);
    let hi = 0;
    for (let i = 0; i < 4410; i++) {
      const y = lp.process(Math.sin((2 * Math.PI * 8000 * i) / SR));
      if (i > 400) hi = Math.max(hi, Math.abs(y));
    }
    expect(hi).toBeLessThan(0.02);
  });
  it('recipe keys are unique and described', () => {
    expect(new Set(RECIPES.map((r) => r.key)).size).toBe(RECIPES.length);
    for (const r of RECIPES) expect(r.description.length, r.key).toBeGreaterThan(5);
  });
  it('songs have the length implied by bpm and bars', () => {
    const spec = SONGS[0];
    const sr = 8000;
    const pcm = renderSong(spec, sr);
    const expected = ((spec.bars * 4 * 60) / spec.bpm) * sr;
    expect(Math.abs(pcm.length - expected) / expected).toBeLessThan(0.05);
  });
});

describe('hive siege sprites', () => {
  const byKey = new Map(SPRITES.map((s) => [s.key, s]));
  it('every chapter has body, top layer, downed pose and badge', () => {
    for (const ch of CHAPTERS)
      for (const k of [
        `marine_${ch.id}`,
        `marine_${ch.id}_top`,
        `marine_${ch.id}_down`,
        `badge_${ch.id}`,
      ])
        expect(byKey.has(k), k).toBe(true);
  });
  it('every Tyranid has walk + death animations and is 36-136 px', () => {
    for (const e of defaultContent.enemies.values()) {
      const s = byKey.get(e.sprite)!;
      expect(s.anims?.walk, e.id).toBeDefined();
      expect(s.anims?.death, e.id).toBeDefined();
      expect(s.w).toBeGreaterThanOrEqual(36);
      expect(s.w).toBeLessThanOrEqual(136);
      const n = Object.values(s.anims!).reduce((t, [, c]) => t + c, 0);
      expect(n).toBe(s.frames);
    }
  });
  it('melee + ranged gaunts have attack frames', () => {
    for (const id of ['hormagaunt', 'termagant', 'genestealer', 'carnifex'])
      expect(byKey.get(`enemy_${id}`)!.anims?.attack?.[1]).toBeGreaterThan(0);
  });
  it('animLayout / animAt agree', () => {
    const { frames, anims } = animLayout([
      ['walk', 6],
      ['attack', 3],
      ['death', 4],
    ]);
    expect(frames).toBe(13);
    expect(anims.attack).toEqual([6, 3]);
    expect(animAt(anims, 7)).toEqual(['attack', 1, 3]);
    expect(animAt(anims, 12)).toEqual(['death', 3, 4]);
  });
  it('the hive siege sound set has the signature sounds', () => {
    const keys = new Set(RECIPES.map((s) => s.key));
    for (const k of [
      'shoot_heavy_bolter',
      'flamer_loop',
      'shoot_melta',
      'horma_shriek',
      'carnifex_roar',
      'synapse_drone',
      'amb_swarm',
      'shoot_plasma',
      'nid_shriek',
      'nid_chitter',
      'boss_horn',
    ])
      expect(keys.has(k)).toBe(true);
  });
});

describe('unit drawers', () => {
  it('every Tyranid species has its own drawer, including Psychophage (not the hormagaunt fallback)', () => {
    const have = new Set(TYRANID_SPECIES_IDS);
    const missing = [...defaultContent.enemies.values()]
      .map((e) => e.id)
      .filter((id) => !have.has(id));
    expect(missing).toEqual([]);
    expect(have.has('psychophage')).toBe(true);
  });

  it('Guardsman sprite is a human walk cycle, not a single frame', () => {
    const g = SPRITES.find((s) => s.key === 'ally_guardsman');
    expect(g).toBeDefined();
    expect(g!.frames).toBe(6);
    expect(g!.anims?.walk).toEqual([0, 6]);
    expect(g!.prompt.toLowerCase()).toMatch(/helmet|lasgun|human|person/);
  });

  it('every unit sprite draws every frame without throwing and leaves pixels', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const units = SPRITES.filter((s) => s.group === 'player' || s.group === 'enemy');
    expect(units.some((s) => s.key === 'enemy_psychophage')).toBe(true);
    expect(units.some((s) => s.key === 'ally_guardsman')).toBe(true);
    for (const s of units) {
      const c = createCanvas(s.w, s.h);
      const ctx = c.getContext('2d');
      for (let f = 0; f < s.frames; f++) {
        ctx.clearRect(0, 0, s.w, s.h);
        expect(() => s.draw(ctx, f, new SharedRng(1 + f))).not.toThrow();
        const data = ctx.getImageData(0, 0, s.w, s.h).data;
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 8) painted++;
        expect(painted, `${s.key} frame ${f}`).toBeGreaterThan(20);
      }
    }
  });
});
