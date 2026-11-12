import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import type { RunResult } from '../src/highscore/types.js';
import { createLocalLinkPair } from '../src/net/link.js';
import { ClientSession, HostSession, ManualScheduler } from '../src/session/index.js';
import type { Snapshot } from '../src/sim/snapshot.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('HostSession over local links', () => {
  it('runs lobby -> game -> submit for a 2-marine team', async () => {
    const scheduler = new ManualScheduler();
    const results: RunResult[] = [];
    const host = new HostSession({
      roomCode: 'TEST1',
      mode: 'p2p',
      scheduler,
      seed: () => 123,
      submitResult: async (r) => {
        results.push(r);
        return { status: 'server', rank: 1 };
      },
    });
    const [h1, c1] = createLocalLinkPair('a');
    const [h2, c2] = createLocalLinkPair('b');
    host.addLink(h1);
    host.addLink(h2);
    const a = new ClientSession(c1, 'Alpha');
    const b = new ClientSession(c2, 'Bravo');
    const snapsB: Snapshot[] = [];
    b.on('snapshot', (s) => snapsB.push(s as Snapshot));
    a.join();
    await flush();
    b.join();
    await flush();
    expect(host.playerCount).toBe(2);

    a.requestStart();
    await flush();
    expect(host.phase).toBe('playing');
    scheduler.advance(1000);
    await flush();
    expect(snapsB.length).toBeGreaterThan(0);

    const world = host.world!;
    // simulate the swarm winning
    world.reinforce.left = 0;
    world.reinforce.pods = [];
    for (const p of world.players) {
      p.state = 'dead';
      p.diedAt = world.time;
    }
    world.time = Math.max(world.time, 5);
    scheduler.advance(TICK_DT * 1000 * 3);
    await flush();
    await flush();
    expect(results).toHaveLength(1);
    expect(results[0].teamSize).toBe(2);
    expect(results[0].players.sort()).toEqual(['Alpha', 'Bravo']);
    expect(results[0].mode).toBe('p2p');
    host.close();
  });

  it('freezes the solo sim while paused (leave-game dialog) and resumes without catch-up', async () => {
    const scheduler = new ManualScheduler();
    const host = new HostSession({
      roomCode: 'SOLO',
      mode: 'local',
      maxPlayers: 1,
      scheduler,
      seed: () => 7,
      submitResult: async () => ({ status: 'local' }),
    });
    const [h, c] = createLocalLinkPair('s');
    host.addLink(h);
    const a = new ClientSession(c, 'Solo');
    a.join();
    await flush();
    a.requestStart();
    await flush();
    scheduler.advance(500);
    const t0 = host.world!.time;
    expect(t0).toBeGreaterThan(0);
    host.setPaused(true);
    scheduler.advance(5000);
    expect(host.world!.time).toBe(t0);
    host.setPaused(false);
    scheduler.advance(100);
    // no 5 s catch-up burst after unpausing
    expect(host.world!.time - t0).toBeLessThan(0.3);
    expect(host.world!.time).toBeGreaterThan(t0);
    host.close();
  });
});

describe('voice chat opt-in (lobby field)', () => {
  it('is off by default; the host toggle reaches every client in the lobby message', async () => {
    const host = new HostSession({
      roomCode: 'VOICE',
      mode: 'p2p',
      scheduler: new ManualScheduler(),
    });
    const [h1, c1] = createLocalLinkPair('a');
    const [h2, c2] = createLocalLinkPair('b');
    host.addLink(h1);
    host.addLink(h2);
    const a = new ClientSession(c1, 'Alpha');
    const b = new ClientSession(c2, 'Bravo');
    const raw: unknown[] = [];
    c2.onMessage((m) => raw.push(m));
    a.join();
    await flush();
    b.join();
    await flush();
    expect(host.voice).toBe(false);
    expect(b.lobby?.voice).toBe(false);
    // off = field absent on the wire (older clients see the exact v5 message)
    expect(raw.some((m) => (m as { t: string }).t === 'lobby' && 'voice' in (m as object))).toBe(
      false,
    );
    host.setVoice(true);
    await flush();
    expect(a.lobby?.voice).toBe(true);
    expect(b.lobby?.voice).toBe(true);
    host.setVoice(false);
    await flush();
    expect(b.lobby?.voice).toBe(false);
    host.close();
  });

  it('can start enabled via options', async () => {
    const host = new HostSession({
      roomCode: 'VOIC2',
      mode: 'p2p',
      voice: true,
      scheduler: new ManualScheduler(),
    });
    const [h1, c1] = createLocalLinkPair('a');
    host.addLink(h1);
    const a = new ClientSession(c1, 'Alpha');
    a.join();
    await flush();
    expect(a.lobby?.voice).toBe(true);
    host.close();
  });
});
