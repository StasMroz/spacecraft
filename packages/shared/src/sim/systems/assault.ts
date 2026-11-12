import { REINFORCE } from '../../data/reinforce.js';
import { getMission } from '../../data/missions.js';
import { clamp, dist2 } from '../../math/vec.js';
import type { World } from '../types.js';
import { spawnCrate, spawnEnemy } from './director.js';
import { spawnGuardsmen } from './crash.js';
import { dropCaps } from './director.js';
import { unlockWaveWeapons } from './weapons.js';

/** Reposition the squad at the drop zone and seed the already-deployed Tyranid force. */
export function setupAssault(world: World): void {
  const def = getMission(world.mission.id);
  if (!def.assault) return;
  if (world.mission.bossId != null || world.mission.nestNext) return;
  const { width, height } = world.map.arena;
  const start = def.start ?? [width * 0.15, height * 0.5];
  const n = Math.max(1, world.players.length);
  world.players.forEach((p, i) => {
    const a = (i / n) * Math.PI * 2;
    const ring = n > 1 ? 48 : 0;
    p.x = clamp(start[0] + Math.cos(a) * ring, 40, width - 40);
    p.y = clamp(start[1] + Math.sin(a) * ring, 40, height - 40);
    p.invuln = Math.max(p.invuln, REINFORCE.invulnS);
  });
  world.director.nextWaveAt = Number.POSITIVE_INFINITY;
  world.director.nextCrateAt = world.mission.crates ? world.time + 8 : Infinity;
  world.director.phase = 'breather';

  const team = world.teamSize;
  if (def.nests) {
    world.mission.nestNext = world.mission.targets.map(() => def.nests!.interval * 0.5);
    for (const t of world.mission.targets) seedAround(world, t.x, t.y, nestGuard(team));
  }
  if (def.boss) {
    const [bx, by] = def.bossAt ?? [width * 0.82, height * 0.22];
    const boss = spawnEnemy(world, def.boss, bx, by, def.bossHpMul ?? 1.7);
    world.mission.bossId = boss.id;
    seedAround(world, bx, by, bossGuard(team));
  }
  for (const g of def.patrols ?? [])
    seedAround(world, g[0], g[1], patrol(team, g[2]), def.sleeping || g[2] >= 2);
  // No edge waves, so grant the wave-2 loadout (chapter melee) at the drop.
  for (let wave = 1; wave <= 2; wave++) unlockWaveWeapons(world, wave);
}

export function updateAssault(world: World, dt: number): void {
  const def = getMission(world.mission.id);
  if (!def.assault) return;
  releaseCages(world, def);
  const st = world.director;
  if (world.mission.crates && world.time >= st.nextCrateAt) {
    const cfg = world.content.director;
    st.nextCrateAt = world.time + world.rng.range(cfg.crates.intervalMin, cfg.crates.intervalMax);
    // Wave counter stays 0; use wave-1 caps as a modest trickle.
    if (st.drops.crates < dropCaps(cfg, world.teamSize, 1).crates) {
      st.drops.crates++;
      spawnCrate(world);
    }
  }
  const nest = def.nests;
  if (!nest || !world.mission.nestNext) return;
  for (let i = 0; i < world.mission.targets.length; i++) {
    const t = world.mission.targets[i]!;
    if (t.hp <= 0) continue;
    world.mission.nestNext[i] = (world.mission.nestNext[i] ?? nest.interval) - dt;
    if (world.mission.nestNext[i]! > 0) continue;
    world.mission.nestNext[i] = nest.interval;
    const around = world.enemies.filter(
      (e) => !e.dead && dist2(e.x, e.y, t.x, t.y) < 220 * 220,
    ).length;
    if (around >= nest.maxAlive) continue;
    const type = world.rng.pick(nest.types);
    const a = world.rng.range(0, Math.PI * 2);
    const d = 40 + world.rng.range(0, 50);
    spawnEnemy(world, type, t.x + Math.cos(a) * d, t.y + Math.sin(a) * d);
  }
}

function releaseCages(world: World, def: ReturnType<typeof getMission>): void {
  if (!def.rescue) return;
  const st = world.mission;
  st.freed ??= st.targets.map(() => false);
  for (let i = 0; i < st.targets.length; i++) {
    const t = st.targets[i]!;
    if (t.hp > 0 || st.freed[i]) continue;
    st.freed[i] = true;
    spawnGuardsmen(world, t.x, t.y, 2 + world.teamSize);
  }
}

function seedAround(world: World, x: number, y: number, roster: string[], asleep = false): void {
  roster.forEach((type, i) => {
    const a = (i / Math.max(1, roster.length)) * Math.PI * 2 + world.rng.range(-0.2, 0.2);
    const d = 70 + (i % 4) * 28;
    const e = spawnEnemy(world, type, x + Math.cos(a) * d, y + Math.sin(a) * d);
    if (asleep) e.asleep = true;
  });
}

function nestGuard(team: number): string[] {
  const n = 2 + team;
  const out: string[] = ['warrior'];
  for (let i = 0; i < n; i++) out.push(i % 2 ? 'hormagaunt' : 'termagant');
  return out;
}

function bossGuard(team: number): string[] {
  const out: string[] = ['warrior', 'warrior'];
  for (let i = 0; i < 1 + team; i++) out.push('genestealer');
  if (team >= 3) out.push('warrior');
  return out;
}

function patrol(team: number, kind: number): string[] {
  if (kind === 1)
    return team >= 3
      ? ['warrior', 'termagant', 'termagant']
      : ['termagant', 'hormagaunt', 'hormagaunt'];
  return ['genestealer', 'genestealer', ...(team >= 2 ? (['hormagaunt'] as const) : [])];
}
