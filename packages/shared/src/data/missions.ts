/**
 * Mission catalogue. Menu-agnostic: the sim and host take a mission id; the menu bot only
 * needs this table and HostSession.setMission / the `mission` field on lobby + start.
 *
 * `hive_siege` is the original endless-wave mode and the default when nothing is chosen.
 */
export type MissionKind = 'endless' | 'hold' | 'extract' | 'destroy' | 'retrieve';

export interface MissionDef {
  /** Stable id. Lowercase [a-z0-9_]. Never rename once released. */
  id: string;
  name: string;
  /** One-line briefing (rules, lobby, HUD). */
  description: string;
  /** Short HUD objective line. */
  objective: string;
  kind: MissionKind;
  /** Map id from maps/index.ts. */
  map: string;
  /**
   * Mission clock in seconds (null = none). Hits zero = defeat, unless the squad is already
   * extracting. For extract-window missions this is the time until the window *closes*.
   */
  timeLimit: number | null;
  /** Seconds after t=0 when the extraction zone opens (null = no extract / never opens). */
  extractOpensAt: number | null;
  /** How long the extract window stays open after it opens (null = stays open). */
  extractWindow: number | null;
  /** Seconds the living squad must stand in the zone once it is open. */
  extractHold: number;
  /** Supply crate drops (weapon crates). Reinforcements are independent of this. */
  crates: boolean;
  /** Imperial ship-crash event (wreck + Guardsmen). */
  crash: boolean;
  /** Destroy-this-many synapse capillaries (kind === 'destroy'). */
  targets?: number;
  targetHp?: number;
  /** Carry-object radius and pickup radius (kind === 'retrieve'). */
  relic?: { radius: number; carryMul: number };
  /**
   * Offensive drop: the squad starts at `start` among already-deployed Tyranids.
   * The wave director does not send edge waves; enemies come from placement and nests.
   */
  assault?: boolean;
  /** Drop-zone (world px). Default: west-centre of the arena. */
  start?: [number, number];
  /** Hunt target (existing enemy type, usually a buffed Carnifex). Extract opens when it dies. */
  boss?: string;
  bossHpMul?: number;
  bossAt?: [number, number];
  /** Destroy-targets act as nests and keep spawning until destroyed. */
  nests?: { interval: number; maxAlive: number; types: string[] };
  /** Extra pre-placed groups: [x, y, kind] (kind 0 = stealers, 1 = gaunts). */
  patrols?: [number, number, number][];
}

export const DEFAULT_MISSION_ID = 'hive_siege';

export const MISSIONS: readonly MissionDef[] = [
  {
    id: 'hive_siege',
    name: 'Oblężenie ula',
    description:
      'Klasyczna obrona pokładu ula: niekończące się fale Tyranidów. Przetrwaj, aż padnie cały oddział i skończą się posiłki.',
    objective: 'Przetrwaj kolejne fale.',
    kind: 'endless',
    map: 'wave',
    timeLimit: null,
    extractOpensAt: null,
    extractWindow: null,
    extractHold: 0,
    crates: true,
    crash: true,
  },
  {
    id: 'hold_the_line',
    name: 'Zabójstwo tyrana',
    description:
      'Lądujecie na pokładzie, który już roi się od Tyranidów. Zapolcie na wzmocnionego Carnifexa — strażnika synapsy — chronionego przez gwardię, potem wezwijcie Thunderhawka. Bez fal z krawędzi: wróg już stoi na pozycji.',
    objective: 'Zabij strażnika synapsy i ewakuuj się.',
    kind: 'hold',
    map: 'wave',
    timeLimit: 190,
    extractOpensAt: null,
    extractWindow: null,
    extractHold: 5,
    crates: true,
    crash: false,
    assault: true,
    start: [480, 1100],
    boss: 'carnifex',
    bossHpMul: 1.7,
    bossAt: [2500, 400],
    patrols: [
      [1100, 900, 1],
      [1700, 600, 0],
      [2000, 1200, 1],
    ],
  },
  {
    id: 'evacuation',
    name: 'Ewakuacja',
    description:
      'Wrak hulka dryfuje w pustce. Thunderhawk ma ciasne okno: dotrzyj do strefy ewakuacji zanim odleci.',
    objective: 'Dotrzyj do strefy ewakuacji zanim Thunderhawk odleci.',
    kind: 'extract',
    map: 'hulk',
    timeLimit: 165,
    extractOpensAt: 120,
    extractWindow: 45,
    extractHold: 5,
    crates: true,
    crash: false,
  },
  {
    id: 'synapse_purge',
    name: 'Spalenie gniazd',
    description:
      'Lądujecie na skraju dżungli biomasy i przebijacie się przez trzy sektory ula. Spalcie gniazda — każde, dopóki stoi, wypuszcza posiłki. Tyranidzi są już rozstawieni; fal z krawędzi nie ma.',
    objective: 'Zniszcz gniazda i ewakuuj się.',
    kind: 'destroy',
    map: 'jungle',
    timeLimit: 300,
    extractOpensAt: null, // opens when the last nest dies
    extractWindow: null,
    extractHold: 5,
    crates: true,
    crash: false,
    targets: 3,
    targetHp: 400,
    assault: true,
    start: [600, 400],
    nests: { interval: 5, maxAlive: 5, types: ['termagant', 'hormagaunt'] },
    patrols: [
      [1200, 800, 1],
      [1800, 1100, 0],
    ],
  },
  {
    id: 'relic_recovery',
    name: 'Odzyskaj relikwię',
    description:
      'Cień w warpie tłumi zrzuty zaopatrzenia. Odzyskaj relikwię z lodowego świata i donieś ją do strefy ekstrakcji.',
    objective: 'Odzyskaj relikwię i donieś ją do ekstrakcji.',
    kind: 'retrieve',
    map: 'ice',
    timeLimit: 240,
    extractOpensAt: 0,
    extractWindow: null,
    extractHold: 5,
    crates: false,
    crash: false,
    relic: { radius: 22, carryMul: 0.75 },
  },
];

const byId = new Map(MISSIONS.map((m) => [m.id, m]));

export const findMission = (id: string | undefined): MissionDef | undefined =>
  id === undefined ? undefined : byId.get(id);

export function getMission(id: string = DEFAULT_MISSION_ID): MissionDef {
  const m = byId.get(id);
  if (!m) throw new Error(`Unknown mission '${id}'`);
  return m;
}

/** Problems with the catalogue (unknown maps are checked against the map registry by tests). */
export function validateMissions(list: readonly MissionDef[] = MISSIONS): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const m of list) {
    if (!/^[a-z0-9_]+$/.test(m.id)) errors.push(`mission id '${m.id}' must match [a-z0-9_]+`);
    if (ids.has(m.id)) errors.push(`duplicate mission id ${m.id}`);
    ids.add(m.id);
    if (!m.name) errors.push(`mission ${m.id} needs a name`);
    if (m.timeLimit !== null && !(m.timeLimit > 0))
      errors.push(`mission ${m.id} timeLimit must be > 0 or null`);
    if (m.kind === 'destroy' && !(m.targets! > 0 && m.targetHp! > 0))
      errors.push(`mission ${m.id} needs targets and targetHp`);
    if (m.kind === 'retrieve' && !m.relic) errors.push(`mission ${m.id} needs a relic spec`);
  }
  if (!ids.has(DEFAULT_MISSION_ID))
    errors.push(`default mission '${DEFAULT_MISSION_ID}' is missing`);
  return errors;
}
