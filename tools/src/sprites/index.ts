import { guardsmanSprites } from './guardsmen.js';
import { fxSprites } from './fx.js';
import { marineSprites } from './marines.js';
import { tyranidSprites } from './tyranids.js';
import type { SpriteDef } from './types.js';
import { uiSprites } from './ui.js';
import { weaponSprites } from './weapons.js';
import { worldSprites } from './world.js';

export type { SpriteDef, Ctx } from './types.js';
export { UI_IMAGES } from './ui.js';

/** Every procedurally generated sprite. Add new generators here. */
export const SPRITES: SpriteDef[] = [
  ...marineSprites,
  ...guardsmanSprites,
  ...weaponSprites,
  ...tyranidSprites,
  ...fxSprites,
  ...worldSprites,
  ...uiSprites,
];
