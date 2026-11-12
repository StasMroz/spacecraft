import { describe, expect, it } from 'vitest';
import { createLocalLinkPair } from '../src/net/link.js';
import { ClientSession, HostSession, ManualScheduler } from '../src/session/index.js';
import { createWorld, spawnEnemy } from '../src/sim/index.js';
import { damageEnemy, explode } from '../src/sim/systems/combat.js';
import type { PlayerSummary, SquadSummary } from '../src/net/protocol.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('kill tally', () => {
  it('counts every kill per type for the squad, credited or not', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 3);
    const [a] = w.players;
    const far = (type: string, dx: number) => spawnEnemy(w, type, a.x + dx, a.y + 600);
    damageEnemy(w, far('carnifex', 0), 1e9, { sourcePlayerId: a.id });
    damageEnemy(w, far('hormagaunt', 300), 1e9, { sourcePlayerId: a.id });
    // An uncredited blast (a self-detonating Spore Mine) still counts for the squad.
    const g = far('termagant', -600);
    explode(w, g.x, g.y, { radius: 40, damage: 1e6, edgeFactor: 1 } as never, {
      hurtsPlayers: false,
      hurtsEnemies: true,
    });
    expect(a.killsByType).toEqual({ carnifex: 1, hormagaunt: 1 });
    expect(w.stats.killsByType).toEqual({ carnifex: 1, hormagaunt: 1, termagant: 1 });
    expect(w.stats.kills).toBe(3);
  });

  it('a Spore Mine popped by a marine credits its blast kills to that marine', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 3);
    const [a] = w.players;
    const x = a.x + 700;
    const y = a.y;
    const rippers = [0, 1, 2].map((i) => spawnEnemy(w, 'ripper', x + 20, y + i * 10 - 10));
    for (const r of rippers) r.hp = 1;
    damageEnemy(w, spawnEnemy(w, 'spore_mine', x, y), 1e9, { sourcePlayerId: a.id });
    expect(rippers.every((r) => r.dead)).toBe(true);
    expect(a.killsByType).toEqual({ spore_mine: 1, ripper: 3 });
    expect(w.stats.killsByType).toEqual({ spore_mine: 1, ripper: 3 });
  });

  it('the host sends the squad tally to every client in the over message', async () => {
    const scheduler = new ManualScheduler();
    const host = new HostSession({
      roomCode: 'TALL',
      mode: 'p2p',
      maxPlayers: 4,
      scheduler,
      seed: () => 3,
      submitResult: async () => ({ status: 'local' }),
    });
    const [h1, c1] = createLocalLinkPair('a');
    const [h2, c2] = createLocalLinkPair('b');
    host.addLink(h1);
    host.addLink(h2);
    const a = new ClientSession(c1, 'A');
    const b = new ClientSession(c2, 'B');
    const got: { summary: PlayerSummary[]; squad?: SquadSummary }[] = [];
    a.on('over', (o) => got.push(o));
    b.on('over', (o) => got.push(o));
    a.join();
    await flush();
    b.join();
    await flush();
    a.requestStart();
    await flush();
    scheduler.advance(100);
    const w = host.world!;
    const [pa, pb] = w.players;
    const at = (t: string) => spawnEnemy(w, t, pa.x + 900, pa.y);
    damageEnemy(w, at('carnifex'), 1e9, { sourcePlayerId: pa.id });
    damageEnemy(w, at('warrior'), 1e9, { sourcePlayerId: pb.id });
    damageEnemy(w, at('genestealer'), 1e9, { sourcePlayerId: pb.id });
    w.reinforce.left = 0;
    w.reinforce.pods = [];
    for (const p of w.players) {
      p.state = 'downed';
      p.invuln = 0;
      p.downedTime = 1e9;
    }
    scheduler.advance(1000);
    await flush();
    expect(got).toHaveLength(2);
    for (const o of got) {
      expect(o.squad?.killsByType).toMatchObject({ carnifex: 1, warrior: 1, genestealer: 1 });
      const byName = Object.fromEntries(o.summary.map((p) => [p.name, p.killsByType]));
      expect(byName.A).toMatchObject({ carnifex: 1 });
      expect(byName.B).toMatchObject({ warrior: 1, genestealer: 1 });
    }
    host.close();
  });
});
