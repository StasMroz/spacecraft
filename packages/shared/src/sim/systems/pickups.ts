import { PICKUP, PLAYER } from '../../constants.js';
import { dist2 } from '../../math/vec.js';
import type { World } from '../types.js';
import type { Player } from '../types.js';
import { grantWeapon } from './weapons.js';

/** A crate with another chapter's special becomes this marine's signature weapon. */
export function resolvePickupWeapon(world: World, player: Player, weaponId: string): string {
  const def = world.content.weapon(weaponId);
  if (!def.chapter) return weaponId;
  return world.content.chapter(player.chapter).specialWeapon;
}

export function updatePickups(world: World, dt: number): void {
  const r = PICKUP.radius + PLAYER.radius;
  for (const pk of world.pickups) {
    pk.life -= dt;
    if (pk.life <= 0) continue;
    for (const p of world.players) {
      if (p.state !== 'alive') continue;
      if (dist2(pk.x, pk.y, p.x, p.y) > r * r) continue;
      if (pk.kind === 'medkit') {
        if (p.hp >= p.maxHp) continue;
        p.hp = Math.min(p.maxHp, p.hp + PICKUP.medkitHeal);
      } else if (pk.weapon) {
        // Chapter specials convert to the marine's own signature weapon.
        const granted = resolvePickupWeapon(world, p, pk.weapon);
        // Silent grant: the `pickup` event below is the one toast (grantWeapon would also
        // emit `unlock` and the HUD would show the same banner twice).
        if (!grantWeapon(world, p, granted, { announce: false })) {
          // Already owned: refill that weapon and patch up a little.
          p.ammo[granted] = world.content.weapon(granted).magazine;
          p.hp = Math.min(p.maxHp, p.hp + PICKUP.medkitHeal / 2);
        }
        pk.weapon = granted;
      }
      world.events.push({ e: 'pickup', p: p.id, k: pk.kind, w: pk.weapon });
      pk.life = 0;
      break;
    }
  }
  world.pickups = world.pickups.filter((pk) => pk.life > 0);
}
