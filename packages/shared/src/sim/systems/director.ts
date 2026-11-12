import { MAX_PLAYERS, PICKUP } from '../../constants.js';
import { pushOutOfWalls } from '../walls.js';
import type { DirectorConfig, PerTeamSize, WaveTableEntry } from '../../data/index.js';
import { clamp, dist2 } from '../../math/vec.js';
import { allocId, alivePlayers } from '../world.js';
import type { Enemy, RosterGroup, World } from '../types.js';

/** Value for a squad of `teamSize` marines from a per-team-size table (1..MAX_PLAYERS). */
export const perTeam = (table: PerTeamSize, teamSize: number): number =>
  table[clamp(teamSize, 1, Math.min(MAX_PLAYERS, table.length)) - 1];

export function waveEntryFor(cfg: DirectorConfig, wave: number): WaveTableEntry {
  let entry = cfg.waveTable[0];
  for (const e of cfg.waveTable) if (wave >= e.fromWave) entry = e;
  return entry;
}

/**
 * The wave table's weights for a squad: elites (threat >= teamScaling.eliteThreat) weighted up by
 * teamScaling.elite, so bigger squads meet proportionally more Warriors, Genestealers and Carnifexes.
 */
export function waveWeightsFor(
  cfg: DirectorConfig,
  wave: number,
  teamSize: number,
  threatOf: (id: string) => number,
): Record<string, number> {
  const base = waveEntryFor(cfg, wave).weights;
  const mul = perTeam(cfg.teamScaling.elite, teamSize);
  if (mul === 1) return base;
  const out: Record<string, number> = {};
  for (const [id, w] of Object.entries(base))
    out[id] = threatOf(id) >= cfg.teamScaling.eliteThreat ? w * mul : w;
  return out;
}

/** Fixed threat budget of wave `wave` (1-based) for a squad. */
export function waveBudget(cfg: DirectorConfig, wave: number, teamSize: number): number {
  const b = cfg.waves.budget;
  return (
    (b.base + b.perWave * Math.max(0, wave - 1) ** b.exponent) *
    perTeam(cfg.teamScaling.budget, teamSize)
  );
}

/** Threat per second sent to the breaches while a wave's roster lasts. */
export function wavePace(cfg: DirectorConfig, wave: number, teamSize: number): number {
  const p = cfg.waves.pace;
  return (p.base + p.perWave * Math.max(0, wave - 1)) * perTeam(cfg.teamScaling.pace, teamSize);
}

export function maxAlive(cfg: DirectorConfig, wave: number, teamSize: number): number {
  const raw =
    (cfg.maxAlive.base + cfg.maxAlive.perWave * Math.max(0, wave - 1)) *
    perTeam(cfg.teamScaling.maxAlive, teamSize);
  return Math.min(cfg.maxAlive.cap, Math.floor(raw));
}

/** Tyranid HP multiplier for a wave and squad size (per-wave growth × squad toughness). */
export const enemyHpScale = (cfg: DirectorConfig, wave: number, teamSize = 1): number =>
  (1 + cfg.waves.hpScalePerWave * Math.max(0, wave - 1)) * perTeam(cfg.teamScaling.hp, teamSize);

/** Average drops per wave for a squad (fractional: base + perMarine * (teamSize - 1)). */
export function dropRates(
  cfg: DirectorConfig,
  teamSize: number,
): { medkits: number; crates: number } {
  const n = clamp(teamSize, 1, MAX_PLAYERS) - 1;
  const d = cfg.drops;
  return {
    medkits: d.medkits.base + d.medkits.perMarine * n,
    crates: d.crates.base + d.crates.perMarine * n,
  };
}

/**
 * Per-wave drop caps for a squad in wave `wave`. Fractional rates carry over between waves
 * (cumulative rounding), so e.g. 1.5 crates/wave gives 2, 1, 2, 1... and the average is exact
 * instead of being rounded away. Deterministic: depends only on config, squad size and wave.
 */
export function dropCaps(
  cfg: DirectorConfig,
  teamSize: number,
  wave = 1,
): { medkits: number; crates: number } {
  const r = dropRates(cfg, teamSize);
  const w = Math.max(1, Math.floor(wave));
  const cum = (rate: number, k: number) => Math.round(rate * k + 1e-9);
  return {
    medkits: cum(r.medkits, w) - cum(r.medkits, w - 1),
    crates: cum(r.crates, w) - cum(r.crates, w - 1),
  };
}

export const isBossWave = (cfg: DirectorConfig, wave: number): boolean =>
  wave >= cfg.bosses.firstWave && (wave - cfg.bosses.firstWave) % cfg.bosses.everyWave === 0;

/**
 * The wave's fixed roster: groups drawn from the wave table until the threat budget is spent
 * (deterministic given the world RNG). A boss wave leads with its Carnifexes.
 */
export function buildRoster(world: World, wave: number): RosterGroup[] {
  const cfg = world.content.director;
  const roster: RosterGroup[] = [];
  if (isBossWave(cfg, wave)) {
    const n =
      perTeam(cfg.bosses.count, world.teamSize) +
      cfg.bosses.extraPerAppearance * world.director.bossWaves;
    roster.push({ type: cfg.bosses.enemy, n, boss: true });
  }
  const sup = cfg.support;
  if (sup && wave >= sup.firstWave && (wave - sup.firstWave) % sup.everyWave === 0)
    roster.push({ type: sup.enemy, n: 1, boss: true });
  const weights = waveWeightsFor(cfg, wave, world.teamSize, (id) => world.content.enemy(id).threat);
  let budget = waveBudget(cfg, wave, world.teamSize);
  let guard = 0;
  while (budget >= 1 && guard++ < 500) {
    const type = world.rng.weighted(weights);
    if (!type) break;
    const def = world.content.enemy(type);
    const affordable = Math.floor(budget / def.threat);
    if (affordable < 1) {
      // Spend the remainder on the cheapest enemy in the table.
      const cheapest = Object.keys(weights)
        .map((id) => world.content.enemy(id))
        .reduce((a, b) => (b.threat < a.threat ? b : a));
      if (cheapest.threat > budget) break;
      roster.push({ type: cheapest.id, n: Math.floor(budget / cheapest.threat) });
      break;
    }
    const [gMin, gMax] = def.group ?? [
      cfg.spawn.groupMin,
      def.threat >= 5 ? Math.max(1, Math.floor(cfg.spawn.groupMax / 3)) : cfg.spawn.groupMax,
    ];
    const n = Math.min(affordable, world.rng.int(gMin, gMax));
    roster.push({ type, n });
    budget -= n * def.threat;
  }
  return roster;
}

/** Enemies of the current wave still to kill: alive + telegraphing + not yet sent. */
export function remainingEnemies(world: World): number {
  const st = world.director;
  let n = 0;
  for (const e of world.enemies) if (!e.dead) n++;
  for (const q of st.queue) n += q.n;
  for (const g of st.roster) n += g.n;
  return n;
}

/** Starts the next wave (normally after a full clear; `forced` = stall timeout). */
export function startWave(world: World, forced = false): void {
  const cfg = world.content.director;
  const st = world.director;
  st.wave++;
  st.phase = 'active';
  st.waveStartedAt = world.time;
  st.roster = buildRoster(world, st.wave);
  if (st.roster[0]?.boss) st.bossWaves++;
  st.dispatch = 0;
  st.hunting = false;
  st.huntAt = -1;
  for (const e of world.enemies) e.hunt = false;
  st.waveChildren = 0;
  const carried =
    world.enemies.filter((e) => !e.dead).length + st.queue.reduce((s, q) => s + q.n, 0);
  st.waveTotal = carried + st.roster.reduce((s, g) => s + g.n, 0);
  st.drops = { medkits: 0, crates: 0 };
  st.nextCrateAt = world.mission.crates ? world.time + cfg.crates.firstAfter : Infinity;
  const [pMin, pMax] = cfg.waves.flankPoints;
  st.surgePoints = pickFlankingBreaches(world, world.rng.int(pMin, pMax));
  world.events.push({
    e: 'surge',
    n: st.wave,
    total: st.waveTotal,
    ...(forced ? { f: 1 as const } : {}),
  });
  const boss = st.roster[0]?.boss ? st.roster[0] : undefined;
  if (boss) world.events.push({ e: 'boss', t: boss.type, n: boss.n });
}

/**
 * Finite-wave director: between waves it counts down a breather; during a wave it sends the
 * wave's fixed roster to the breaches at a steady pace, reveals the last stragglers so nobody can
 * hide from them, and declares the wave cleared once every enemy (children included) is dead.
 */
export function updateDirector(world: World, dt: number): void {
  const cfg = world.content.director;
  const st = world.director;
  if (st.idle) return;
  const t = world.time;
  if (alivePlayers(world).length === 0) return;

  if (st.phase === 'breather') {
    if (t >= st.nextWaveAt) startWave(world);
    else return;
  }

  // Dispatch the roster at the wave's pace, respecting the alive cap.
  const cap = maxAlive(cfg, st.wave, world.teamSize);
  const pending = () =>
    world.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0) + st.queue.reduce((s, q) => s + q.n, 0);
  st.dispatch += wavePace(cfg, st.wave, world.teamSize) * dt;
  const hpMul = enemyHpScale(cfg, st.wave, world.teamSize);
  let guard = 0;
  while (st.roster.length && guard++ < 10) {
    const g = st.roster[0];
    const def = world.content.enemy(g.type);
    if (!g.boss && st.dispatch < def.threat) break;
    const room = cap - pending();
    if (room < 1) break;
    const n = g.boss ? g.n : Math.min(g.n, room, Math.max(1, Math.floor(st.dispatch / def.threat)));
    if (def.burrow && !g.boss) spawnGroup(world, g.type, n, hpMul);
    else queueGroup(world, g.type, n, hpMul, !!g.boss);
    if (!g.boss) st.dispatch -= n * def.threat;
    g.n -= n;
    if (g.n <= 0) st.roster.shift();
  }
  if (st.roster.length === 0) st.dispatch = 0;

  emergeQueued(world);
  updateSpawners(world, dt);

  // Weapon crates: on a timer, within the wave's crate budget.
  if (world.mission.crates && t >= st.nextCrateAt) {
    st.nextCrateAt = t + world.rng.range(cfg.crates.intervalMin, cfg.crates.intervalMax);
    if (st.drops.crates < dropCaps(cfg, world.teamSize, st.wave).crates) {
      st.drops.crates++;
      spawnCrate(world);
    }
  }

  const remaining = remainingEnemies(world);
  const sentOut = st.roster.length === 0 && st.queue.length === 0;
  if (sentOut && remaining === 0) {
    st.phase = 'breather';
    st.nextWaveAt = t + cfg.waves.breather;
    st.hunting = false;
    world.events.push({ e: 'cleared', n: st.wave, next: cfg.waves.breather });
    return;
  }
  // Anti-stall: reveal the last few (or everyone after a while) and send them hunting.
  const r = cfg.waves.reveal;
  if (!st.hunting && sentOut) {
    const few = remaining <= Math.max(r.remaining, Math.ceil(r.fraction * st.waveTotal));
    if (few) {
      st.hunting = true;
      world.events.push({ e: 'hunt', n: remaining });
    } else if (st.huntAt < 0) st.huntAt = t + r.afterSec;
    else if (t >= st.huntAt) {
      st.hunting = true;
      world.events.push({ e: 'hunt', n: remaining });
    }
  }
  if (st.hunting) for (const e of world.enemies) if (!e.dead) e.hunt = true;
  if (t - st.waveStartedAt >= cfg.waves.forceNextAfter) startWave(world, true);
}

/** Spawner enemies seed a capped number of children (per parent and per wave). */
function updateSpawners(world: World, dt: number): void {
  const cfg = world.content.director;
  const st = world.director;
  const waveCap = Math.round(
    cfg.waves.maxChildren * perTeam(cfg.teamScaling.children, world.teamSize),
  );
  const born: Enemy[] = [];
  for (const e of world.enemies) {
    if (e.dead || e.burrowed) continue;
    const sp = world.content.enemy(e.type).spawner;
    if (!sp || e.children >= sp.max) continue;
    e.spawnTimer -= dt;
    if (e.spawnTimer > 0) continue;
    e.spawnTimer = sp.interval;
    if (st.waveChildren >= waveCap) continue;
    let near = false;
    for (const p of alivePlayers(world))
      if (dist2(p.x, p.y, e.x, e.y) <= sp.range * sp.range) near = true;
    if (!near) continue;
    const a = world.rng.range(0, Math.PI * 2);
    const c = makeEnemy(world, sp.enemy, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, 1);
    c.child = true;
    c.hunt = e.hunt;
    e.children++;
    st.waveChildren++;
    st.waveTotal++;
    born.push(c);
  }
  world.enemies.push(...born);
}

/** How long a breach shows as active after a group bursts out of it. */
export const BREACH_ACTIVE_SECONDS = 3;

/**
 * Queues a group at a breach: the breach telegraphs (pulses) and the group emerges when it ends.
 * Groups picked for a breach that is already telegraphing join that wave.
 */
export function queueGroup(
  world: World,
  type: string,
  n: number,
  hpMul: number,
  boss = false,
): void {
  const cfg = world.content.director;
  const st = world.director;
  // Most groups pour out of the wave's flanking breaches; some use any usable breach.
  const flank = st.surgePoints.filter(
    (i) =>
      nearestMarine(world, cfg.spawnPoints[i].x, cfg.spawnPoints[i].y) >=
      cfg.spawn.pointMinDistance,
  );
  const point =
    flank.length && !boss && world.rng.chance(0.7) ? world.rng.pick(flank) : pickBreach(world);
  const pending = st.queue.find((q) => q.point === point && q.at > world.time);
  const delay = boss ? cfg.spawn.bossTelegraph : cfg.spawn.telegraph;
  const at = pending && !boss ? pending.at : world.time + delay;
  if (!pending || boss)
    world.events.push({ e: 'breach', i: point, t: type, ...(boss ? { b: 1 as const } : {}) });
  st.queue.push({ point, type, n, at, hpMul });
}

/** Spawns every queued group whose telegraph is over. */
function emergeQueued(world: World): void {
  const cfg = world.content.director;
  const st = world.director;
  if (!st.queue.some((q) => q.at <= world.time)) return;
  const burst = new Map<number, number>();
  st.queue = st.queue.filter((q) => {
    if (q.at > world.time) return true;
    const sp = cfg.spawnPoints[q.point];
    for (let i = 0; i < q.n; i++) {
      const a = world.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(world.rng.next()) * cfg.spawn.groupSpread;
      spawnEnemy(world, q.type, sp.x + Math.cos(a) * r, sp.y + Math.sin(a) * r, q.hpMul);
    }
    burst.set(q.point, (burst.get(q.point) ?? 0) + q.n);
    st.activeUntil[q.point] = world.time + BREACH_ACTIVE_SECONDS;
    return false;
  });
  for (const [i, n] of burst) world.events.push({ e: 'swarm', i, n });
}

/** Distance from a spawn point to the nearest living marine. */
const nearestMarine = (world: World, x: number, y: number): number => {
  let best = Infinity;
  for (const p of alivePlayers(world)) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
};

/**
 * Picks a breach for a group: never one within `pointMinDistance` of a living marine; among the
 * rest, closer breaches are likelier (so the swarm reaches the squad) but every one gets used.
 */
export function pickBreach(world: World): number {
  const cfg = world.content.director;
  const weights: Record<string, number> = {};
  let farthest = 0;
  let farthestD = -1;
  cfg.spawnPoints.forEach((sp, i) => {
    const d = nearestMarine(world, sp.x, sp.y);
    if (d > farthestD) {
      farthestD = d;
      farthest = i;
    }
    if (d >= cfg.spawn.pointMinDistance) weights[String(i)] = 1 / (0.6 + d / 900) ** 2;
  });
  const pick = world.rng.weighted(weights);
  return pick === undefined ? farthest : Number(pick);
}

/**
 * `k` usable breaches spread around the squad (largest angular separation as seen from the
 * squad's centre), so a surge comes from several sides at once.
 */
export function pickFlankingBreaches(world: World, k: number): number[] {
  const cfg = world.content.director;
  const alive = alivePlayers(world);
  const cx = alive.reduce((s, p) => s + p.x, 0) / alive.length;
  const cy = alive.reduce((s, p) => s + p.y, 0) / alive.length;
  const usable = cfg.spawnPoints
    .map((sp, i) => ({
      i,
      a: Math.atan2(sp.y - cy, sp.x - cx),
      d: nearestMarine(world, sp.x, sp.y),
    }))
    .filter((c) => c.d >= cfg.spawn.pointMinDistance);
  if (usable.length === 0) return [pickBreach(world)];
  const chosen = [usable.splice(world.rng.int(0, usable.length - 1), 1)[0]];
  while (chosen.length < k && usable.length) {
    let bestIdx = 0;
    let bestSep = -1;
    usable.forEach((c, idx) => {
      let sep = Infinity;
      for (const o of chosen) {
        const diff = Math.abs(((c.a - o.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        sep = Math.min(sep, diff);
      }
      if (sep > bestSep) {
        bestSep = sep;
        bestIdx = idx;
      }
    });
    chosen.push(usable.splice(bestIdx, 1)[0]);
  }
  return chosen.map((c) => c.i);
}

/** Spawns `n` enemies of a type around one random point out of the marines' sight (burrowers). */
export function spawnGroup(world: World, type: string, n: number, hpMul: number): void {
  const cfg = world.content.director;
  const [gx, gy] = pickSpawnPoint(world, cfg.spawn.minDistance, cfg.spawn.maxDistance, 80);
  for (let i = 0; i < n; i++) {
    const ox = world.rng.range(-1, 1) * cfg.spawn.groupSpread;
    const oy = world.rng.range(-1, 1) * cfg.spawn.groupSpread;
    spawnEnemy(world, type, gx + ox, gy + oy, hpMul);
  }
}

/** Creates one enemy (clamped into the arena) and adds it to the world. */
export function spawnEnemy(world: World, type: string, x: number, y: number, hpMul = 1): Enemy {
  const e = makeEnemy(world, type, x, y, hpMul);
  world.enemies.push(e);
  return e;
}

function makeEnemy(world: World, type: string, x: number, y: number, hpMul: number): Enemy {
  const def = world.content.enemy(type);
  const hp = def.hp * hpMul;
  const e: Enemy = {
    id: allocId(world),
    type,
    x: clamp(x, def.radius, world.map.arena.width - def.radius),
    y: clamp(y, def.radius, world.map.arena.height - def.radius),
    vx: 0,
    vy: 0,
    angle: 0,
    hp,
    maxHp: hp,
    attackCooldown: world.rng.range(0.2, 1),
    fuse: -1,
    strafe: world.rng.chance(0.5) ? 1 : -1,
    chargePhase: 0,
    chargeTimer: 0,
    chargeCooldown: def.charge ? world.rng.range(0.5, def.charge.cooldown) : 0,
    chargeDx: 0,
    chargeDy: 0,
    burrowed: !!def.burrow,
    synSpeed: 1,
    synDamage: 1,
    attackAnim: 0,
    dead: false,
    child: false,
    children: 0,
    spawnTimer: def.spawner ? def.spawner.interval * world.rng.range(0.4, 1) : 0,
    hunt: world.director.hunting,
  };
  if (!e.burrowed) pushOutOfWalls(e, def.radius, world.map.walls);
  return e;
}

/** Random point in a ring around a random alive marine, kept inside the arena and away from all marines. */
export function pickSpawnPoint(
  world: World,
  minD: number,
  maxD: number,
  margin: number,
): [number, number] {
  const alive = alivePlayers(world);
  let best: [number, number] = [margin, margin];
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 6; attempt++) {
    const anchor = world.rng.pick(alive);
    const a = world.rng.range(0, Math.PI * 2);
    const d = world.rng.range(minD, maxD);
    const x = clamp(anchor.x + Math.cos(a) * d, margin, world.map.arena.width - margin);
    const y = clamp(anchor.y + Math.sin(a) * d, margin, world.map.arena.height - margin);
    let nearest = Infinity;
    for (const p of alive) nearest = Math.min(nearest, dist2(x, y, p.x, p.y));
    if (nearest >= minD * minD * 0.5) return [x, y];
    if (nearest > bestScore) {
      bestScore = nearest;
      best = [x, y];
    }
  }
  return best;
}

export function spawnCrate(world: World): void {
  const alive = alivePlayers(world);
  if (alive.length === 0) return;
  const cfg = world.content.director.crates;
  const weights: Record<string, number> = {};
  for (const w of world.content.weaponOrder) {
    if (w.crateWeight <= 0) continue;
    const need = w.chapter
      ? alive.some(
          (p) => world.content.chapter(p.chapter).id === w.chapter && !p.weapons.includes(w.id),
        )
      : alive.some((p) => !p.weapons.includes(w.id));
    if (need) weights[w.id] = w.crateWeight;
  }
  const weapon = world.rng.weighted(weights);
  const at = pickSpawnPoint(world, cfg.minDistance, cfg.maxDistance, 60);
  const pos = { x: at[0], y: at[1] };
  pushOutOfWalls(pos, 24, world.map.walls);
  const { x, y } = pos;
  world.pickups.push({
    id: allocId(world),
    kind: weapon ? 'weapon' : 'medkit',
    weapon,
    x,
    y,
    life: PICKUP.lifetime,
  });
  world.events.push({ e: 'crate', x: Math.round(x), y: Math.round(y) });
}
