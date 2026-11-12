import type { ChapterDef, EnemyDef, WeaponDef } from './types.js';

/**
 * Display-name presets. Ids never change (they are used for balance, assets, the wire and
 * highscores); only the labels shown to players do. Pick one at runtime with `?names=<preset>`
 * or add your own preset here. Missing entries keep the default name.
 */
export interface NamePreset {
  /** Game title shown in the menu / browser tab. */
  title?: string;
  subtitle?: string;
  weapons?: Record<string, string>;
  enemies?: Record<string, string>;
  chapters?: Record<string, string>;
}

export const DEFAULT_TITLE = 'Spacecraft: Hive Siege';
export const DEFAULT_SUBTITLE = 'A last stand against the swarm';

export const NAME_PRESETS: Record<string, NamePreset> = {
  /** The default 40k-flavoured names (no overrides). */
  default: {},
  /** Trademark-free names, e.g. for a public build that must avoid any Warhammer terms. */
  generic: {
    title: 'Spacecraft: Hive Siege',
    subtitle: 'A last stand against the swarm',
    weapons: {
      bolt_rifle: 'Burst Rifle',
      heavy_bolter: 'Heavy Repeater',
      flamer: 'Incinerator',
      plasma_gun: 'Ion Rifle',
      meltagun: 'Fusion Lance',
      frag_grenade: 'Grenades',
    },
    enemies: {
      hormagaunt: 'Slasher',
      termagant: 'Spitter',
      ripper: 'Wormling',
      genestealer: 'Stalker',
      warrior: 'Hive Warden',
      ravener: 'Burrower',
      biovore: 'Mortar Beast',
      spore_mine: 'Gas Bag',
      carnifex: 'Juggernaut',
      psychophage: 'Stim Beast',
      hive_guard: 'Impaler Beast',
      zoanthrope: 'Warp Node',
      lictor: 'Shade Assassin',
      tyrant_guard: 'Shield Beast',
      hive_tyrant: 'Hive Sovereign',
    },
    chapters: {
      ultramarines: 'Azure Legion',
      blood_angels: 'Crimson Host',
      dark_angels: 'Verdant Order',
      imperial_fists: 'Golden Bastion',
      space_wolves: 'Storm Hounds',
    },
  },
};

export interface NamedTables {
  weapons: WeaponDef[];
  enemies: EnemyDef[];
  chapters: ChapterDef[];
}

/** Returns copies of the tables with display names replaced by the preset. */
export function applyNamePreset(tables: NamedTables, preset: NamePreset): NamedTables {
  return {
    weapons: tables.weapons.map((w) => ({ ...w, name: preset.weapons?.[w.id] ?? w.name })),
    enemies: tables.enemies.map((e) => ({ ...e, name: preset.enemies?.[e.id] ?? e.name })),
    chapters: tables.chapters.map((c) => ({ ...c, name: preset.chapters?.[c.id] ?? c.name })),
  };
}
