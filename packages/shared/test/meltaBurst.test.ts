import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { WEAPONS } from '../src/data/index.js';
import { WEAPON_MUZZLE } from '../src/data/muzzle.js';
import {
  applyInput,
  createWorld,
  emptyInput,
  grantWeapon,
  stepWorld,
  type GameEvent,
  type PlayerInput,
  type World,
} from '../src/sim/index.js';
import { spawnEnemy } from '../src/sim/systems/director.js';

const melta = WEAPONS.find((w) => w.id === 'meltagun')!;
const frag = WEAPONS.find((w) => w.id === 'frag_grenade')!;
const burst = melta.projectile.endBurst!;
const RANGE = melta.projectile.speed * melta.projectile.lifetime;

function world(seed = 7, x = 600, y = 600, players = 1): World {
  const w = createWorld(
    Array.from({ length: players }, (_, i) => ({ id: i + 1, name: `M${i + 1}` })),
    seed,
  );
  w.director.idle = true;
  const p = w.players[0];
  p.x = x;
  p.y = y;
  grantWeapon(w, p, 'meltagun');
  p.current = 'meltagun';
  return w;
}

let seq = 0;
/** Fires one meltagun shot along +x and steps until it is gone; returns every event. */
function fireOnce(w: World, aim = 0): GameEvent[] {
  const p = w.players[0];
  const events: GameEvent[] = [];
  const step = (i: Partial<PlayerInput>) => {
    applyInput(w, p.id, { ...emptyInput(), seq: ++seq, aim, ...i });
    stepWorld(w, TICK_DT);
    events.push(...w.events);
  };
  for (let t = 0; t < 60 && !events.some((e) => e.e === 'shot'); t++) step({ fire: true });
  expect(events.some((e) => e.e === 'shot')).toBe(true);
  for (let t = 0; t < 40 && w.projectiles.some((pr) => pr.kind === 'melta'); t++) step({});
  return events;
}

const meltaBooms = (evs: GameEvent[]) =>
  evs.filter((e): e is Extract<GameEvent, { e: 'boom' }> => e.e === 'boom' && e.k === 'melta');

describe('Meltagun end-of-range burst', () => {
  it('is configured in the melta data at ~20–25% of frag damage and ~50–60% of its radius', () => {
    const fx = frag.projectile.explosion!;
    expect(burst.damage / fx.damage).toBeGreaterThanOrEqual(0.2);
    expect(burst.damage / fx.damage).toBeLessThanOrEqual(0.25);
    expect(burst.radius / fx.radius).toBeGreaterThanOrEqual(0.5);
    expect(burst.radius / fx.radius).toBeLessThanOrEqual(0.6);
    expect(burst.friendlyFire).toBeFalsy();
  });

  it('reaches 85% of the former 240 px range (204 px)', () => {
    expect(RANGE).toBeCloseTo(240 * 0.85, 6);
    const w = world();
    const p = w.players[0];
    const b = meltaBooms(fireOnce(w))[0]!;
    expect(b.x - p.x).toBeLessThan(240 + WEAPON_MUZZLE.meltagun!.forward);
  });

  it('a miss bursts once at max range', () => {
    const w = world();
    const p = w.players[0];
    const booms = meltaBooms(fireOnce(w));
    expect(booms).toHaveLength(1);
    const b = booms[0]!;
    expect(b.r).toBe(burst.radius);
    expect(Math.abs(b.y - p.y)).toBeLessThanOrEqual(2);
    // muzzle offset + one tick of overshoot at most
    expect(b.x - p.x).toBeGreaterThan(RANGE * 0.9);
    expect(b.x - p.x).toBeLessThan(RANGE + 80);
  });

  it('damages enemies around the end point but never a marine standing there', () => {
    // Same seed without targets → where the burst lands.
    const end = meltaBooms(fireOnce(world(7, 600, 600, 2)))[0]!;
    const w = world(7, 600, 600, 2);
    const buddy = w.players[1];
    buddy.x = end.x + 10;
    buddy.y = end.y - 40;
    // A ring of gaunts just off the beam line (armour saves are rolled, so use a few).
    const gaunts = [-1, 1].flatMap((side) =>
      [-30, 0, 30].map((dx) => spawnEnemy(w, 'termagant', end.x + dx, end.y + side * 42)),
    );
    const buddyHp = buddy.hp;
    const booms = meltaBooms(fireOnce(w));
    expect(booms).toHaveLength(1);
    expect(gaunts.some((g) => g.dead || g.hp < g.maxHp)).toBe(true);
    expect(buddy.hp).toBe(buddyHp);
  });

  it('still bursts at max range after piercing a target', () => {
    const w = world();
    const p = w.players[0];
    const e = spawnEnemy(w, 'carnifex', p.x + 120, p.y);
    const hp0 = e.hp;
    const evs = fireOnce(w);
    expect(e.hp).toBeLessThan(hp0);
    const booms = meltaBooms(evs);
    expect(booms).toHaveLength(1);
    const b = booms[0]!;
    // Past the target, near max range
    expect(b.x).toBeGreaterThan(e.x + 20);
    expect(b.x - p.x).toBeGreaterThan(RANGE * 0.9);
    expect(b.x - p.x).toBeLessThan(RANGE + 80);
  });

  it('keeps flying to max range after pierce is spent (no early death on last target)', () => {
    const w = world();
    const p = w.players[0];
    // pierce: 3 → four hits spend it; pack gaunts on the beam line well before max range
    const gaunts = [80, 110, 140, 170].map((dx) => spawnEnemy(w, 'termagant', p.x + dx, p.y));
    const evs = fireOnce(w);
    expect(gaunts.every((g) => g.dead || g.hp < g.maxHp)).toBe(true);
    const booms = meltaBooms(evs);
    expect(booms).toHaveLength(1);
    expect(booms[0]!.x - p.x).toBeGreaterThan(RANGE * 0.9);
  });

  it('no burst when the shot leaves the arena', () => {
    const w = world(7, 100, 600);
    expect(meltaBooms(fireOnce(w, Math.PI))).toHaveLength(0);
  });

  it('is deterministic', () => {
    const run = () => {
      const w = world(11, 600, 600);
      const e = spawnEnemy(w, 'termagant', 600 + RANGE, 650);
      const booms = meltaBooms(fireOnce(w));
      return JSON.stringify({ booms, hp: e.hp, dead: e.dead, x: e.x, y: e.y });
    };
    expect(run()).toBe(run());
  });
});
