# Art pipeline (Spacecraft: Hive Siege)

All art and audio is **procedural by default**. `tools/` draws every sprite with node-canvas and
synthesises every sound and the music. No image or audio generation service is involved, and the
repository holds no third-party artwork. `npm run assets` (it also runs before `dev` and `build`)
writes the following to `packages/client/public/assets/generated/`:

| Output                | What                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------- |
| `atlas.png`           | One shelf-packed sprite atlas (every frame of every sprite)                             |
| `manifest.json`       | Frame rects, anchors, render scale, animation ranges, and `source: procedural/override` |
| `sfx/*.wav`, `music/` | Layered DSP SFX with variants (see "Sound") plus choir/organ music                      |
| `ui/emblem.png`       | Our own skull-and-wings emblem (menu, HUD watermark)                                    |
| `ui/parchment.png`    | Parchment texture behind the menu flavour text                                          |
| `preview.html`        | Browsable contact sheet of everything above                                             |

`npm run contact-sheet -w @sms/tools` renders the labelled unit sheet at `docs/wh-sprites.png`.

## Sprites, sizes and animation states

Sprites are drawn at 2× (`scale: 2` in the manifest) and shown at the world size below, which is
the 64–128 px class on a normal screen. Every unit faces **+X** (right) and is rotated in-game.
Animation ranges are `[firstFrame, count]` within the sprite's horizontal strip.

| Key                                                        | Atlas px       | Frames | Animations                                                                                                |
| ---------------------------------------------------------- | -------------- | -----: | --------------------------------------------------------------------------------------------------------- |
| `marine_<chapter>`                                         | 144×144        |      6 | `walk` 0–5 (legs and backpack; the torso is drawn on top)                                                 |
| `marine_<chapter>_top`                                     | 144×144        |      1 | torso with pauldrons and grille helm; rotated to aim. Firing recoil and muzzle flash are procedural kicks |
| `marine_<chapter>_down`                                    | 144×144        |      1 | downed / dead pose                                                                                        |
| `held_<weapon>`                                            | 144×144        |      1 | weapon held in the torso pose                                                                             |
| `enemy_hormagaunt`, `enemy_termagant`, `enemy_genestealer` | 128×128        |     13 | `walk` 0–5, `attack` 6–8, `death` 9–12                                                                    |
| `enemy_warrior`, `enemy_ravener`                           | 200×200        |     13 | `walk` 0–5, `attack` 6–8, `death` 9–12                                                                    |
| `enemy_ripper`                                             | 72×72          |      9 | `walk` 0–3, `attack` 4–5, `death` 6–8                                                                     |
| `enemy_biovore`                                            | 160×160        |     11 | `walk` 0–3, `attack` 4–6 (spore launch), `death` 7–10                                                     |
| `enemy_spore_mine`                                         | 96×96          |      7 | `walk` 0–3 (pulsing float), `death` 4–6 (burst)                                                           |
| `enemy_carnifex`                                           | 272×272        |     14 | `walk` 0–5, `attack` 6–8, `death` 9–13                                                                    |
| `enemy_psychophage`                                        | 248×248        |     14 | `walk` 0–5, `attack` 6–8, `death` 9–13                                                                    |
| `ally_guardsman`                                           | 104×104        |      6 | `walk` 0–5 (human: helmet, vest, lasgun, striding legs)                                                   |
| `badge_<chapter>`                                          | 64×64          |      1 | shoulder badge (HUD, lobby), simple geometric icon                                                        |
| `icon_<weapon>`, `crate_<weapon>`                          | 128×56 / 96×96 |  1 / 2 | HUD icon / supply crate (2-frame glint)                                                                   |
| `proj_*`, `fx_*`, `decal_*`, `tile_*`, `prop_*`, `creep_*` | varies         | varies | projectiles, effects, blood/ichor decals, Imperial tiles, ruins, Tyranid creep                            |

The client picks the frame from the enemy's state flags in the snapshot. `attacking` plays
`attack`. A death spawns a corpse that plays `death` once and then becomes a decal. Charge
wind-up (crouch / rear-up pose, eye glow, dust), dash (stretch, ghost trails), burrowed and synapse
states are extra draw effects, so they need no frames of their own.

## Dropping in your own art (override)

1. Find the key in `preview.html`, the table above, or `shared/src/assets/keys.ts`.
2. Save a PNG at **`tools/assets-src/overrides/sprites/<key>.png`**:
   - a **horizontal strip** of exactly `frames` equal frames, in the order of the animation table;
   - any resolution. Each frame is scaled into the atlas rect, so keep the same aspect ratio
     (square for units);
   - the unit faces right (+X), centred on the anchor (the frame centre for units), on a
     transparent background.
3. Run `npm run assets`. The manifest then shows `source: "override"` for that key, and the
   generator log counts overrides.
4. Audio works the same way: `tools/assets-src/overrides/sfx/<key>.wav` (or variants
   `<key>_0.wav`, `<key>_1.wav`, …) or `.../music/<key>.wav` is copied as-is.

Each `SpriteDef` in `tools/src/sprites/` has a `prompt` field that describes the intended look,
so an artist can work from it. Only use art you made or have the rights to. Do **not** drop in
Games Workshop artwork, logos, the Aquila, chapter iconography or anything scanned from
codexes. The project is an unofficial fan work and must stay free of GW assets (see README).

## Adding a sprite

Add a `SpriteDef` (`key, w, h, frames, anims?, anchor?, scale?, draw(ctx, frame, rng)`) to the
relevant file in `tools/src/sprites/`, and reference the key from content data
(`shared/src/data/*.ts`). The generator fails on any content key that has no asset (the
"coverage" check), and `tools/test/assets.test.ts` checks the frame counts and animation ranges.

## Sound

Every SFX is a **recipe** in `tools/src/audio/recipes.ts`, rendered by `synth.ts` with the DSP
toolkit in `dsp.ts` at **44.1 kHz, 16-bit**. The design language follows the 40k games (Space
Marine 2, Dawn of War):

- **Guns** stack a transient crack, a sub thump sweeping through 40–120 Hz, a filtered noise
  body, a mechanical rattle (bolt, belt, magazine) and a short corridor reverb, then saturate and
  compress the sum.
- **Tyranids** use formant-filtered throats (hisses, shrieks, roars), FM screeches and granular
  chitin (skitter, crunches, debris).
- **Loops** (flamer jet, plasma whine, synapse drone, swarm and hive beds) are rendered with a
  cross-faded seam and tested for clicks.

One-shots get 2–4 **variants** with pitch/time jitter, written as `sfx/<key>_<n>.wav` and listed
under `variants` in the manifest. The client loads variant 0 of every sound first and the rest
lazily. The full list with descriptions is in `preview.html` (each recipe has a `description`).

The client mixer routes each sound by its recipe `bus` (weapons, enemies, ambience, ui; music has
its own) through a compressor, limits the total to 32 voices by `priority`, attenuates and pans
by distance from the listener, and ducks the music on big blasts.

`npm run audio-preview -w @sms/tools` renders a 32-second scripted battle mix (bolters, heavy
bolter, flamer, plasma with overheat, melta, frags, a Hormagaunt pack leaping, a Carnifex
charge, the swarm bed) to `docs/audio-preview.wav` and `docs/audio-preview.mp3` (needs ffmpeg).
