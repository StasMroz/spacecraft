import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { defaultContent } from '../src/data/index.js';
import { createLocalLinkPair } from '../src/net/link.js';
import { ClientSession, HostSession, ManualScheduler } from '../src/session/index.js';
import {
  applyInput,
  buildSnapshot,
  createWorld,
  emptyInput,
  ENEMY_FLAG,
  enemyFlags,
  grantWeapon,
  spawnEnemy,
  stepWorld,
  type World,
} from '../src/sim/index.js';
import type { GameEvent } from '../src/sim/types.js';

const content = defaultContent;

/** Steps the world, collecting every event emitted along the way. */
function run(w: World, ticks: number, input?: Partial<ReturnType<typeof emptyInput>>): GameEvent[] {
  const evs: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    if (input) applyInput(w, w.players[0].id, { ...emptyInput(), seq: w.tick, ...input });
    stepWorld(w, TICK_DT);
    evs.push(...w.events);
  }
  return evs;
}

/** A solo world where the director stays quiet, so only staged enemies exist. */
function quietWorld(seed = 7): World {
  const w = createWorld([{ id: 1, name: 'A' }], seed);
  w.director.idle = true;
  return w;
}

describe('40k content data', () => {
  it('has the Primaris arsenal in unlock order', () => {
    const order = content.weaponOrder.map((w) => w.id);
    expect(order).toEqual([
      'bolt_rifle',
      'heavy_bolter',
      'flamer',
      'plasma_gun',
      'meltagun',
      'frag_grenade',
    ]);
    const unlocks = content.weaponOrder.map((w) => w.unlockAtWave ?? Infinity);
    expect(unlocks[0]).toBe(0);
    expect([...unlocks].sort((a, b) => a - b)).toEqual(unlocks);
    expect(content.weapon('plasma_gun').heat).toBeDefined();
  });

  it('has the Tyranid roster with the Carnifex and Psychophage bosses and the synapse/burrow/charge traits', () => {
    const ids = [...content.enemies.keys()];
    for (const id of [
      'termagant',
      'hormagaunt',
      'ripper',
      'genestealer',
      'warrior',
      'ravener',
      'biovore',
      'spore_mine',
      'carnifex',
    ])
      expect(ids).toContain(id);
    expect([...content.enemies.values()].filter((e) => e.boss).map((e) => e.id)).toEqual([
      'carnifex',
      'psychophage',
    ]);
    expect(content.enemy('warrior').synapse).toBeDefined();
    expect(content.enemy('ravener').burrow).toBeDefined();
    expect(content.enemy('carnifex').charge).toBeDefined();
    expect(content.director.bosses.enemy).toBe('carnifex');
  });

  it('has a chapter per squad slot (8) with distinct colours; chapter() wraps', () => {
    expect(content.chapters.map((c) => c.id)).toEqual([
      'ultramarines',
      'blood_angels',
      'dark_angels',
      'imperial_fists',
      'space_wolves',
      'salamanders',
      'white_scars',
      'raven_guard',
    ]);
    expect(new Set(content.chapters.map((c) => c.primary)).size).toBe(8);
    expect(content.chapter(8).id).toBe('ultramarines');
    expect(content.chapterIndex('space_wolves')).toBe(4);
    expect(content.chapterIndex('nope')).toBe(-1);
  });

  it('renames via presets without touching ids, so saves and wire formats stay valid', () => {
    const g = content.withNames('generic');
    expect(g.weapon('plasma_gun').name).not.toBe(content.weapon('plasma_gun').name);
    expect(g.enemy('termagant').name).not.toBe('Termagant');
    expect([...g.enemies.keys()]).toEqual([...content.enemies.keys()]);
    expect(g.weaponOrder.map((w) => w.id)).toEqual(content.weaponOrder.map((w) => w.id));
    expect(g.title).toBe('Spacecraft: Hive Siege');
    expect(content.withNames('does-not-exist')).toBe(content);
    // No preset may reintroduce the forbidden flavour line.
    expect(g.subtitle.toLowerCase()).not.toContain('grim darkness');
  });
});

describe('plasma heat', () => {
  it('supercharges when hot, then overheats: vents and burns the marine', () => {
    const w = quietWorld();
    const p = w.players[0];
    grantWeapon(w, p, 'plasma_gun');
    p.current = 'plasma_gun';
    p.invuln = 0;
    const hp0 = p.hp;
    const evs = run(w, 240, { fire: true, aim: 0 });
    const shots = evs.filter((e) => e.e === 'shot' && e.w === 'plasma_gun');
    expect(shots.length).toBeGreaterThan(3);
    expect(shots.some((e) => e.e === 'shot' && e.s === 1)).toBe(true);
    expect(shots[0].e === 'shot' && shots[0].s).toBeFalsy();
    expect(evs.some((e) => e.e === 'overheat' && e.p === p.id)).toBe(true);
    expect(p.hp).toBeLessThan(hp0);
  });

  it('cools down when not firing', () => {
    const w = quietWorld();
    const p = w.players[0];
    grantWeapon(w, p, 'plasma_gun');
    p.heat.plasma_gun = 0.6;
    run(w, 120);
    expect(p.heat.plasma_gun).toBeLessThan(0.6);
  });
});

describe('Tyranid behaviours', () => {
  it('Raveners tunnel (untargetable) and erupt near a marine', () => {
    const w = quietWorld();
    const p = w.players[0];
    spawnEnemy(w, 'ravener', p.x + 600, p.y);
    const r = w.enemies[0];
    expect(r.burrowed).toBe(true);
    expect(enemyFlags(r) & ENEMY_FLAG.burrowed).toBeTruthy();
    const evs = run(w, 60 * 6);
    expect(evs.some((e) => e.e === 'emerge' && e.t === 'ravener')).toBe(true);
    expect(r.burrowed).toBe(false);
  });

  it('a Warrior synapse-buffs nearby gaunts only', () => {
    const w = quietWorld();
    const p = w.players[0];
    spawnEnemy(w, 'warrior', p.x + 700, p.y);
    spawnEnemy(w, 'termagant', p.x + 720, p.y + 20);
    spawnEnemy(w, 'termagant', p.x - 700, p.y);
    run(w, 1);
    const [warrior, near, far] = w.enemies;
    expect(near.synSpeed).toBeGreaterThan(1);
    expect(near.synDamage).toBeGreaterThan(1);
    expect(far.synSpeed).toBe(1);
    expect(warrior.synSpeed).toBe(1);
    expect(enemyFlags(near) & ENEMY_FLAG.synapse).toBeTruthy();
  });

  it('the Carnifex winds up, then dashes', () => {
    const w = quietWorld();
    const p = w.players[0];
    spawnEnemy(w, 'carnifex', p.x + 300, p.y);
    const c = w.enemies[0];
    c.chargeCooldown = 0;
    const phases = new Set<number>();
    const evs: GameEvent[] = [];
    for (let i = 0; i < 120; i++) {
      evs.push(...run(w, 1));
      phases.add(c.chargePhase);
    }
    expect(phases.has(1)).toBe(true);
    expect(phases.has(2)).toBe(true);
    expect(evs.some((e) => e.e === 'charge' && e.t === 'carnifex')).toBe(true);
  });

  it('signals the leap: windup flag first, then a leap event and the dashing flag', () => {
    const w = quietWorld();
    const p = w.players[0];
    spawnEnemy(w, 'carnifex', p.x + 300, p.y);
    const c = w.enemies[0];
    c.chargeCooldown = 0;
    const seq: string[] = [];
    for (let i = 0; i < 120 && !seq.includes('leap'); i++) {
      for (const ev of run(w, 1)) if (ev.e === 'charge' || ev.e === 'leap') seq.push(ev.e);
      const f = enemyFlags(c);
      if (f & ENEMY_FLAG.windup && !seq.includes('windup')) seq.push('windup');
      if (f & ENEMY_FLAG.dashing && !seq.includes('dashing')) seq.push('dashing');
    }
    expect(seq.slice(0, 2)).toEqual(['charge', 'windup']);
    expect(seq).toContain('leap');
    expect(seq.indexOf('leap')).toBeGreaterThan(seq.indexOf('windup'));
  });

  it('spore mines burst and hurt nearby marines', () => {
    const w = quietWorld();
    const p = w.players[0];
    p.invuln = 0;
    const hp0 = p.hp;
    spawnEnemy(w, 'spore_mine', p.x + 40, p.y);
    const evs = run(w, 120);
    expect(evs.some((e) => e.e === 'boom')).toBe(true);
    expect(p.hp).toBeLessThan(hp0);
  });

  it('boss waves bring a Carnifex on the configured wave', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 3);
    const b = content.director.bosses;
    w.director.wave = b.firstWave - 1;
    w.director.nextWaveAt = w.time;
    // The boss telegraphs at a breach first, then emerges.
    const evs = run(w, Math.ceil((content.director.spawn.bossTelegraph + 0.2) / TICK_DT));
    expect(evs.some((e) => e.e === 'boss' && e.t === 'carnifex' && e.n === b.count[0])).toBe(true);
    expect(w.enemies.filter((e) => e.type === 'carnifex').length).toBe(b.count[0]);
    expect(w.director.bossWaves).toBe(1);
  });
});

describe('snapshots carry 40k state', () => {
  it('includes chapter index, plasma heat and enemy flags', () => {
    const w = createWorld([{ id: 1, name: 'A', chapter: 3 }], 1);
    const p = w.players[0];
    grantWeapon(w, p, 'plasma_gun');
    p.current = 'plasma_gun';
    p.heat.plasma_gun = 0.5;
    spawnEnemy(w, 'ravener', p.x + 500, p.y);
    const s = buildSnapshot(w, 30);
    expect(s.players[0].c).toBe(3);
    expect(s.players[0].ht).toBeGreaterThan(0);
    const snap = s.enemies.find((e) => e[1] === content.enemyIds.indexOf('ravener'))!;
    expect(snap[6] & ENEMY_FLAG.burrowed).toBeTruthy();
  });
});

describe('lobby chapter selection', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  it('honours the requested chapter, keeps chapters unique and allows switching to a free one', async () => {
    const host = new HostSession({
      roomCode: 'CHAP1',
      mode: 'p2p',
      scheduler: new ManualScheduler(),
      seed: () => 1,
      submitResult: async () => ({ status: 'local' }),
    });
    const [h1, c1] = createLocalLinkPair('a');
    const [h2, c2] = createLocalLinkPair('b');
    host.addLink(h1);
    host.addLink(h2);
    const a = new ClientSession(c1, 'Alpha', 'blood_angels');
    const b = new ClientSession(c2, 'Bravo', 'blood_angels');
    a.join();
    await flush();
    b.join();
    await flush();
    const ch = (s: ClientSession) => s.lobby!.players.find((p) => p.id === s.playerId)!.chapter;
    expect(ch(a)).toBe(content.chapterIndex('blood_angels'));
    expect(ch(b)).not.toBe(ch(a));
    b.selectChapter('blood_angels'); // taken -> ignored
    await flush();
    expect(ch(b)).not.toBe(ch(a));
    b.selectChapter('space_wolves');
    await flush();
    expect(ch(b)).toBe(content.chapterIndex('space_wolves'));
    expect(ch(a)).toBe(content.chapterIndex('blood_angels'));
    host.close();
  });
});
