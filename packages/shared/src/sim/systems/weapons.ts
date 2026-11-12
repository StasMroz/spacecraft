import {
  applyRecoilKick,
  meleeSwingDuration,
  recoilMoveMul,
  SIM_MUZZLE_FORWARD,
  stepRecoil,
  weaponRecoil,
  type WeaponDef,
} from '../../data/index.js';
import { allocId } from '../world.js';
import type { Player, World } from '../types.js';
import { damagePlayer } from './combat.js';
import { effectiveFire, sprintFacing } from './movement.js';

/**
 * Grants a weapon to a player (no-op if owned). Returns true if newly granted.
 * `announce` (default true) emits an `unlock` HUD event — wave unlocks want that; crate
 * pickups pass false because they already emit `pickup` (avoids a double toast).
 */
export function grantWeapon(
  world: World,
  player: Player,
  weaponId: string,
  opts?: { announce?: boolean },
): boolean {
  if (player.weapons.includes(weaponId)) return false;
  const def = world.content.weapon(weaponId);
  player.weapons.push(weaponId);
  player.weapons.sort((a, b) => world.content.weapon(a).slot - world.content.weapon(b).slot);
  player.ammo[weaponId] = def.magazine;
  if (opts?.announce !== false) world.events.push({ e: 'unlock', p: player.id, w: weaponId });
  return true;
}

/**
 * Wave unlocks: when wave `wave` starts, every marine still in the fight (alive or downed) gets
 * each weapon whose `unlockAtWave` is that wave. Deterministic (driven by the director's wave
 * counter in the shared sim), so the host and every peer agree in multiplayer.
 */
export function unlockWaveWeapons(world: World, wave: number): void {
  for (const def of world.content.weaponOrder) {
    if (def.unlockAtWave === null || def.unlockAtWave <= 0 || def.unlockAtWave !== wave) continue;
    for (const p of world.players) {
      if (p.state === 'dead') continue;
      if (def.chapter && world.content.chapter(p.chapter).id !== def.chapter) continue;
      grantWeapon(world, p, def.id);
    }
  }
}

export function updatePlayerWeapon(world: World, p: Player, dt: number): void {
  if (p.state !== 'alive') {
    p.triggerWasDown = false;
    p.recoil = 0;
    p.swing = 0;
    return;
  }
  const input = p.input;
  // Aim recoil recovers with the weapon in hand (data/recoil.ts).
  stepRecoil(p, weaponRecoil(p.current), dt);
  // Sprinting: the marine faces where he runs (directional armour turns with him).
  const run = sprintFacing(p.sprint, input.mx, input.my);
  p.aim = run ?? input.aim + p.recoil;

  // Weapon switching.
  if (input.slot > 0) {
    const target = p.weapons.find((id) => world.content.weapon(id).slot === input.slot);
    if (target && target !== p.current) {
      p.current = target;
      p.reloadTimer = 0;
      p.venting = false;
      p.fireCooldown = Math.max(p.fireCooldown, 0.15);
      world.events.push({ e: 'switch', p: p.id, w: target });
      p.swing = 0;
    }
  }

  const def = world.content.weapon(p.current);
  const braced = isBraced(p, def);
  if (braced && p.stillTime - dt < def.braceDelay!)
    world.events.push({ e: 'brace', p: p.id, w: def.id });
  // Keep the overshoot while the trigger stays down so fire rates aren't rounded up to whole
  // ticks; reset to 0 when idle (no stored burst).
  const held = p.triggerWasDown && effectiveFire(p.input.fire, p.sprint) && def.automatic;
  p.fireCooldown = Math.max(held ? -dt : 0, p.fireCooldown - dt);
  if (p.swing > 0) p.swing = Math.max(0, p.swing - dt);
  coolWeapons(world, p, dt);

  if (def.melee) {
    p.ammo[def.id] = def.magazine;
    p.reloadTimer = 0;
    p.venting = false;
  } else if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.reloadTimer = 0;
      // A vent only clears heat; the magazine is untouched (unless it was empty).
      if (!p.venting || p.ammo[def.id] <= 0) p.ammo[def.id] = def.magazine;
      p.venting = false;
    }
  } else if (input.reload && p.ammo[def.id] < def.magazine) {
    startReload(world, p, def);
  }

  // Trigger ignored while sprinting / until the weapon is ready again after a sprint.
  const fire = effectiveFire(input.fire, p.sprint);
  const wantsFire = fire && (def.automatic || !p.triggerWasDown);
  p.triggerWasDown = input.fire;
  if (!wantsFire || p.reloadTimer > 0) return;

  // Fire as many shots as the cooldown allows this tick (fast weapons > tick rate).
  let guard = 0;
  while (p.fireCooldown <= 0 && guard++ < 8) {
    if (!def.melee && p.ammo[def.id] <= 0) {
      startReload(world, p, def);
      return;
    }
    fireWeapon(world, p, def, braced);
    if (!def.melee) p.ammo[def.id]--;
    kickAim(world, p, def, braced, input.aim);
    p.fireCooldown += braced ? def.fireInterval / (def.braceFireRateMult ?? 1) : def.fireInterval;
    if (def.heat && addHeat(world, p, def)) return;
    if (!def.automatic) break;
  }
  if (!def.melee && p.ammo[def.id] <= 0) startReload(world, p, def);
}

/**
 * Recoil kick after a shot (seeded RNG, host-authoritative): the next shot already uses the
 * kicked aim. Clients mirror p.recoil from the snapshot (`rc`) to draw the reticle.
 */
function kickAim(world: World, p: Player, def: WeaponDef, braced: boolean, base: number): void {
  applyRecoilKick(p, weaponRecoil(def.id), recoilMoveMul(p.moveFrac, braced), world.rng.next());
  p.aim = base + p.recoil;
}

function startReload(world: World, p: Player, def: WeaponDef): void {
  if (p.reloadTimer > 0) return;
  p.reloadTimer = def.reloadTime;
  world.events.push({ e: 'reload', p: p.id, w: def.id });
}

/** Heat bleeds off every weapon over time (also while holstered). */
function coolWeapons(world: World, p: Player, dt: number): void {
  for (const id in p.heat) {
    const heat = world.content.weapon(id).heat;
    if (heat) p.heat[id] = Math.max(0, p.heat[id] - heat.coolPerSec * dt);
  }
}

/** Adds one shot of heat; on overheat burns the marine and starts a vent. Returns true on overheat. */
function addHeat(world: World, p: Player, def: WeaponDef): boolean {
  const heat = def.heat!;
  const h = (p.heat[def.id] ?? 0) + heat.perShot;
  if (h < heat.max) {
    p.heat[def.id] = h;
    return false;
  }
  p.heat[def.id] = heat.max * 0.35;
  p.venting = true;
  p.reloadTimer = heat.ventTime;
  world.events.push({ e: 'overheat', p: p.id });
  // Bypasses hurt-invulnerability: overheating always hurts.
  const inv = p.invuln;
  p.invuln = 0;
  damagePlayer(world, p, heat.selfDamage);
  if (p.state === 'alive') p.invuln = inv;
  return true;
}

/** True when the marine has stood still long enough to brace this weapon (and is alive). */
export function isBraced(p: Player, def: WeaponDef): boolean {
  return def.braceDelay !== undefined && p.state === 'alive' && p.stillTime >= def.braceDelay;
}

/** True when the next shot of this weapon would be supercharged. */
export function isSupercharged(p: Player, def: WeaponDef): boolean {
  return !!def.heat && (p.heat[def.id] ?? 0) >= def.heat.superchargeAt * def.heat.max;
}

export function fireWeapon(world: World, p: Player, def: WeaponDef, braced = false): void {
  if (def.melee) p.swing = meleeSwingDuration(def);
  const spec = def.projectile;
  const sc = isSupercharged(p, def);
  const dmgMul = sc ? def.heat!.superchargeDamageMul : 1;
  const muzzle = SIM_MUZZLE_FORWARD; // visual barrel tips: data/muzzle.ts (client-side only)
  const mx = p.x + Math.cos(p.aim) * muzzle;
  const my = p.y + Math.sin(p.aim) * muzzle;
  world.stats.shots++;
  world.events.push({
    e: 'shot',
    p: p.id,
    w: def.id,
    x: Math.round(mx),
    y: Math.round(my),
    a: Math.round(p.aim * 100) / 100,
    ...(sc ? { s: 1 as const } : {}),
  });
  for (let i = 0; i < def.pellets; i++) {
    const spread = braced ? def.spread * (def.braceSpreadMult ?? 1) : def.spread;
    const a = p.aim + (world.rng.next() - 0.5) * spread;
    const speed = spec.speed * (1 + (world.rng.next() - 0.5) * 2 * (spec.speedJitter ?? 0));
    world.projectiles.push({
      id: allocId(world),
      owner: 'player',
      ownerId: p.id,
      sx: p.x,
      sy: p.y,
      ox: p.x,
      oy: p.y,
      kind: sc ? `${spec.kind}_super` : spec.kind,
      x: mx,
      y: my,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: spec.lifetime,
      radius: sc ? spec.radius * 1.35 : spec.radius,
      damage: spec.damage * dmgMul,
      pierceLeft: spec.pierce,
      ...(spec.pierceBudget
        ? { pierceBudget: spec.pierceBudget, pierceBudgetLeft: spec.pierceBudget.total }
        : {}),
      strength:
        spec.strength !== undefined
          ? spec.strength + (sc ? (def.heat!.superchargeStrength ?? 0) : 0)
          : undefined,
      ap: (spec.ap ?? 0) + (sc ? (def.heat!.superchargeAp ?? 0) : 0),
      drag: spec.drag ?? 0,
      knockback: spec.knockback,
      explosion: spec.explosion,
      ...(spec.endBurst ? { endBurst: spec.endBurst } : {}),
      hit: [],
      dead: false,
    });
  }
}
