import { describe, expect, it } from 'vitest';
import { ARENA, PLAYER, TICK_DT } from '../src/constants.js';
import { defaultContent } from '../src/data/index.js';
import {
  maxPlausibleScore,
  playerScoreEntries,
  validateLeaderboardRun,
  validateRunResult,
} from '../src/highscore/index.js';
import {
  applyInput,
  BREACH_STATE,
  buildSnapshot,
  createWorld,
  emptyInput,
  grantWeapon,
  isBraced,
  pickBreach,
  pickFlankingBreaches,
  spawnEnemy,
  stepWorld,
  type World,
} from '../src/sim/index.js';
import { damageEnemy, damagePlayer } from '../src/sim/systems/combat.js';
import type { GameEvent } from '../src/sim/types.js';

const content = defaultContent;
const ticks = (sec: number) => Math.ceil(sec / TICK_DT);

function run(w: World, n: number, input?: Partial<ReturnType<typeof emptyInput>>): GameEvent[] {
  const evs: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    if (input) applyInput(w, w.players[0].id, { ...emptyInput(), seq: w.tick, ...input });
    stepWorld(w, TICK_DT);
    evs.push(...w.events);
  }
  return evs;
}

function quietWorld(seed = 7): World {
  const w = createWorld([{ id: 1, name: 'A' }], seed);
  w.director.idle = true;
  return w;
}

describe('v0.4 arsenal', () => {
  it('has no power sword; shared slots stay unique and chapter specials share slot 3', () => {
    expect(content.weaponOrder.map((w) => w.id)).not.toContain('power_sword');
    const shared = content.weaponOrder.filter((w) => !w.chapter).map((w) => w.slot);
    expect(shared).toEqual([1, 2, 4, 5, 6, 7, 8, 9]);
    expect(content.weaponOrder.filter((w) => w.chapter).every((w) => w.slot === 3)).toBe(true);
    expect(() => content.weapon('power_sword')).toThrow();
  });

  it('every enemy is worth the configured points', () => {
    const pts = Object.fromEntries(content.enemyIds.map((id) => [id, content.enemy(id).points]));
    expect(pts).toEqual({
      ripper: 1,
      hormagaunt: 2,
      termagant: 3,
      genestealer: 5,
      spore_mine: 1,
      biovore: 8,
      ravener: 10,
      warrior: 15,
      carnifex: 50,
      psychophage: 40,
    });
  });
});

describe('heavy bolter brace', () => {
  const heavy = content.weapon('heavy_bolter');

  it('is data-driven', () => {
    expect(heavy.braceDelay).toBe(0.25);
    expect(heavy.braceFireRateMult).toBeGreaterThanOrEqual(1.6);
    expect(heavy.braceFireRateMult).toBeLessThanOrEqual(1.8);
    expect(heavy.braceSpreadMult).toBeLessThan(1);
    expect(content.weapon('bolt_rifle').braceDelay).toBeUndefined();
  });

  const shotsIn = (moving: boolean, sec: number) => {
    const w = quietWorld();
    const p = w.players[0];
    grantWeapon(w, p, 'heavy_bolter');
    p.current = 'heavy_bolter';
    // walk in a small circle when "moving" so the marine stays in the arena
    let shots = 0;
    let braced = false;
    for (let i = 0; i < ticks(sec); i++) {
      const a = i * 0.05;
      applyInput(w, p.id, {
        ...emptyInput(),
        seq: w.tick,
        fire: true,
        aim: 0,
        ...(moving ? { mx: Math.cos(a), my: Math.sin(a) } : {}),
      });
      stepWorld(w, TICK_DT);
      for (const e of w.events) {
        if (e.e === 'shot') shots++;
        if (e.e === 'brace') braced = true;
      }
      p.ammo.heavy_bolter = 90; // ignore reloads
    }
    return {
      shots,
      braced,
      still: isBraced(p, heavy),
      snapBraced: buildSnapshot(w, 1).players[0].br,
    };
  };

  it('fires ~70% faster after standing still for braceDelay, and not while moving', () => {
    const moving = shotsIn(true, 3);
    const still = shotsIn(false, 3);
    expect(moving.braced).toBe(false);
    expect(moving.snapBraced).toBeUndefined();
    expect(still.braced).toBe(true);
    expect(still.snapBraced).toBe(1);
    const ratio = still.shots / moving.shots;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(1.85);
  });

  it('moving breaks the brace immediately', () => {
    const w = quietWorld();
    const p = w.players[0];
    grantWeapon(w, p, 'heavy_bolter');
    p.current = 'heavy_bolter';
    run(w, ticks(0.5));
    expect(isBraced(p, heavy)).toBe(true);
    run(w, 1, { mx: 1 });
    expect(isBraced(p, heavy)).toBe(false);
    // tiny stick drift (touch joystick) still counts as standing still
    run(w, ticks(0.5), { mx: 0.05 });
    expect(isBraced(p, heavy)).toBe(true);
  });
});

describe('personal scoring', () => {
  it('the killer gets the points and per-type kills; the summary and run carry them', () => {
    const w = createWorld(
      [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      3,
    );
    const [a, b] = w.players;
    for (const [type, who] of [
      ['carnifex', a],
      ['hormagaunt', a],
      ['hormagaunt', b],
      ['warrior', b],
    ] as const) {
      const e = spawnEnemy(w, type, a.x + 300, a.y);
      damageEnemy(w, e, 1e9, { sourcePlayerId: who.id });
    }
    expect([a.score, b.score]).toEqual([52, 17]);
    expect(a.killsByType).toEqual({ carnifex: 1, hormagaunt: 1 });
    expect(b.killsByType).toEqual({ hormagaunt: 1, warrior: 1 });
    expect(buildSnapshot(w, 1).players.map((p) => p.sc)).toEqual([52, 17]);
  });

  const base = {
    runId: 'run_abcdefgh',
    teamSize: 2,
    players: ['A', 'B'],
    survivalMs: 100_000,
    kills: 40,
    wave: 1,
    endedAt: new Date().toISOString(),
    version: '0.4.0-dev',
    mode: 'local',
  };

  it('validates per-marine scores (optional, aligned, plausible)', () => {
    expect(validateRunResult(base).ok).toBe(true);
    const ok = validateRunResult({ ...base, playerScores: [120, 30], playerKills: [30, 10] });
    expect(ok.ok && ok.value.playerScores).toEqual([120, 30]);
    expect(validateRunResult({ ...base, playerScores: [1] }).ok).toBe(false);
    expect(validateRunResult({ ...base, playerScores: [1.5, 2] }).ok).toBe(false);
    expect(validateRunResult({ ...base, playerKills: [41, 0] }).ok).toBe(false);
    const cap = Math.floor(maxPlausibleScore(base.survivalMs));
    expect(validateLeaderboardRun({ ...base, playerScores: [cap, 0] }).ok).toBe(true);
    expect(validateLeaderboardRun({ ...base, playerScores: [cap + 1, 0] }).ok).toBe(false);
  });

  it('a run yields one individual row per marine', () => {
    const rows = playerScoreEntries(
      { ...base, mode: 'local', playerScores: [120, 30], playerKills: [30, 10] },
      'T',
    );
    expect(rows.map((r) => [r.id, r.name, r.score, r.kills])).toEqual([
      ['run_abcdefgh-0', 'A', 120, 30],
      ['run_abcdefgh-1', 'B', 30, 10],
    ]);
    expect(playerScoreEntries({ ...base, mode: 'local' }, 'T')).toEqual([]);
  });
});

describe('hive breaches (spawn points)', () => {
  const sp = content.director.spawnPoints;

  it('has 4-6 marked breaches inside the arena', () => {
    expect(sp.length).toBeGreaterThanOrEqual(4);
    expect(sp.length).toBeLessThanOrEqual(6);
    for (const p of sp) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(ARENA.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(ARENA.height);
    }
  });

  it('never picks a breach next to a marine', () => {
    const w = quietWorld();
    const p = w.players[0];
    p.x = sp[4].x;
    p.y = sp[4].y;
    for (let i = 0; i < 200; i++) expect(pickBreach(w)).not.toBe(4);
  });

  it('telegraphs, then the group emerges from the breach', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 5);
    // A wave in progress whose roster is one group of gaunts (so it goes to a breach at once).
    Object.assign(w.director, { phase: 'active', waveStartedAt: 0, wave: 1, dispatch: 100 });
    w.director.roster = [{ type: 'hormagaunt', n: 4 }];
    const first = run(w, 1);
    const breach = first.find((e) => e.e === 'breach');
    expect(breach).toBeDefined();
    const i = (breach as { i: number }).i;
    const nonBurrow = w.enemies.filter((e) => !content.enemy(e.type).burrow);
    expect(nonBurrow).toHaveLength(0); // nothing yet: telegraphing
    expect(buildSnapshot(w, 1).sp[i]).toBe(BREACH_STATE.telegraph);
    const evs = run(w, ticks(content.director.spawn.telegraph + 0.1));
    const swarmed = evs.flatMap((e) => (e.e === 'swarm' ? [e.i] : []));
    expect(swarmed).toContain(i);
    const out = w.enemies.filter((e) => !content.enemy(e.type).burrow);
    expect(out.length).toBeGreaterThan(0);
    for (const e of out)
      expect(
        Math.min(...swarmed.map((j) => Math.hypot(e.x - sp[j].x, e.y - sp[j].y))),
      ).toBeLessThan(150);
    expect(buildSnapshot(w, 1).sp[i]).toBe(BREACH_STATE.active);
  });

  it('surges flank from several breaches spread around the squad', () => {
    const w = quietWorld(11);
    const picks = pickFlankingBreaches(w, 3);
    expect(new Set(picks).size).toBe(3);
    const p = w.players[0];
    const angles = picks.map((i) => Math.atan2(sp[i].y - p.y, sp[i].x - p.x));
    const minSep = Math.min(
      ...angles.flatMap((a, j) =>
        angles.slice(j + 1).map((b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)),
      ),
    );
    expect(minSep).toBeGreaterThan(Math.PI / 4);
  });

  it('a whole run uses several breaches', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 9);
    const used = new Set<number>();
    for (let i = 0; i < ticks(150); i++) {
      // keep the marine alive and in the centre
      w.players[0].hp = w.players[0].maxHp;
      stepWorld(w, TICK_DT);
      for (const e of w.events) if (e.e === 'breach') used.add(e.i);
      // the squad wipes out whatever emerges, so waves keep coming
      for (const e of w.enemies) if (!e.burrowed) e.dead = true;
    }
    expect(used.size).toBeGreaterThanOrEqual(4);
  });
});

describe('downed marines', () => {
  it('bleed out after 60 s (3x v0.3), revive still takes 3 s', () => {
    expect(PLAYER.bleedOutTime).toBe(60);
    expect(PLAYER.reviveTime).toBe(3);
    const w = createWorld(
      [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      3,
    );
    w.director.idle = true;
    const [a, b] = w.players;
    b.x = a.x + 900;
    a.invuln = 0;
    damagePlayer(w, a, 10_000);
    expect(a.state).toBe('downed');
    for (let i = 0; i < ticks(59); i++) stepWorld(w, TICK_DT);
    expect(a.state).toBe('downed');
    for (let i = 0; i < ticks(1.2); i++) stepWorld(w, TICK_DT);
    expect(a.state).toBe('dead');
  });

  it('8-marine squad: everyone spawns apart, a downed marine is revived by a squadmate in 3 s', () => {
    const w = createWorld(
      Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `M${i + 1}` })),
      5,
    );
    w.director.idle = true;
    expect(w.players).toHaveLength(8);
    const spots = new Set(w.players.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
    expect(spots.size).toBe(8);
    const [a, b] = w.players;
    // Keep the others far away so only B revives.
    w.players.slice(2).forEach((p, i) => {
      p.x = 200 + i * 10;
      p.y = 200;
    });
    a.x = 1600;
    a.y = 1100;
    b.x = a.x + 30;
    b.y = a.y;
    a.invuln = 0;
    damagePlayer(w, a, 10_000);
    expect(a.state).toBe('downed');
    for (let i = 0; i < ticks(2.8); i++) stepWorld(w, TICK_DT);
    expect(a.state).toBe('downed');
    for (let i = 0; i < ticks(0.4); i++) stepWorld(w, TICK_DT);
    expect(a.state).toBe('alive');
  });
});
