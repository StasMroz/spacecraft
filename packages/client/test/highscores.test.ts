import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunResult } from '@sms/shared';
import { FallbackHighscoreStore } from '../src/highscores/FallbackHighscoreStore.js';
import { HttpError, type HttpHighscoreStore } from '../src/highscores/HttpHighscoreStore.js';
import {
  LOCAL_KEY,
  LOCAL_SUBMITTED_KEY,
  LocalHighscoreStore,
} from '../src/highscores/LocalHighscoreStore.js';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

let n = 0;
const run = (survivalMs: number, teamSize = 1): RunResult => ({
  runId: `run_${n++}_abcdef`,
  teamSize,
  players: Array.from({ length: teamSize }, (_, i) => `P${i}`),
  survivalMs,
  kills: 1,
  wave: 0,
  endedAt: new Date().toISOString(),
  version: '0.1.0',
  mode: 'local',
});

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('LocalHighscoreStore', () => {
  it('ranks per team size and is idempotent', async () => {
    const s = new LocalHighscoreStore();
    await s.submit(run(10_000));
    const r = run(20_000);
    expect((await s.submit(r)).rank).toBe(1);
    expect((await s.submit(r)).rank).toBe(1);
    await s.submit(run(5_000, 2));
    expect((await s.top(1)).entries.map((e) => e.survivalMs)).toEqual([20_000, 10_000]);
    expect((await s.top(2)).entries).toHaveLength(1);
    expect(s.pending()).toHaveLength(3);
  });
});

describe('local storage is per leaderboard board', () => {
  it('uses board-namespaced keys and ignores the v0.1 table on the same origin', async () => {
    expect(LOCAL_KEY).toBe('sms.highscores.board-0.6.0');
    expect(LOCAL_SUBMITTED_KEY).toBe('sms.highscores.submitted.board-0.6.0');
    const old = { '1': [{ ...run(999_000), id: 'x', submittedAt: '2026-01-01T00:00:00Z' }] };
    localStorage.setItem('sms.highscores.v1', JSON.stringify(old));
    const s = new LocalHighscoreStore();
    expect((await s.top(1)).entries).toEqual([]);
    await s.submit(run(10_000));
    expect(JSON.parse(localStorage.getItem('sms.highscores.v1')!)).toEqual(old);
    expect(localStorage.getItem(LOCAL_KEY)).toContain('10000');
  });
});

describe('FallbackHighscoreStore', () => {
  const fakeRemote = () => {
    const state = { up: true, received: [] as RunResult[], reject: 0 };
    const remote = {
      async submit(r: RunResult) {
        if (!state.up) throw new TypeError('fetch failed');
        if (state.reject) throw new HttpError(state.reject, 'nope');
        state.received.push(r);
        return { status: 'server' as const, rank: state.received.length };
      },
      async top() {
        if (!state.up) throw new TypeError('fetch failed');
        return { entries: [], source: 'server' as const };
      },
    } as unknown as HttpHighscoreStore;
    return { state, remote };
  };

  it('uses the server when online', async () => {
    const { state, remote } = fakeRemote();
    const s = new FallbackHighscoreStore(remote, new LocalHighscoreStore());
    expect((await s.submit(run(30_000))).status).toBe('server');
    expect(state.received).toHaveLength(1);
    expect(s.online).toBe(true);
  });

  it('falls back to localStorage offline and flushes later', async () => {
    const { state, remote } = fakeRemote();
    const local = new LocalHighscoreStore();
    const s = new FallbackHighscoreStore(remote, local);
    state.up = false;
    expect((await s.submit(run(30_000))).status).toBe('local');
    expect(s.online).toBe(false);
    expect((await s.top(1)).source).toBe('local');
    state.up = true;
    await s.flushPending();
    expect(state.received).toHaveLength(1);
    expect(local.pending()).toHaveLength(0);
  });

  it('reports failed (not local) when the server rejects the run', async () => {
    const { state, remote } = fakeRemote();
    state.reject = 400;
    const s = new FallbackHighscoreStore(remote, new LocalHighscoreStore());
    expect((await s.submit(run(30_000))).status).toBe('failed');
  });
});

describe('FallbackHighscoreStore (local-only, no server configured)', () => {
  it('stores and ranks locally without network calls or warnings', async () => {
    const warn = vi.spyOn(console, 'warn');
    warn.mockClear();
    const fetchSpy = vi.fn();
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    const s = new FallbackHighscoreStore(null, new LocalHighscoreStore());
    expect(s.localOnly).toBe(true);
    await s.submit(run(10_000));
    const out = await s.submit(run(25_000));
    expect(out).toEqual({ status: 'local', rank: 1 });
    const top = await s.top(1);
    expect(top.source).toBe('local');
    expect(top.entries.map((e) => e.survivalMs)).toEqual([25_000, 10_000]);
    await s.flushPending();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('ranked missions only reach the global board', () => {
  const fakeRemote = () => {
    const state = { received: [] as RunResult[] };
    const remote = {
      async submit(r: RunResult) {
        state.received.push(r);
        return { status: 'server' as const, rank: state.received.length };
      },
      async top() {
        return { entries: [], source: 'server' as const };
      },
    } as unknown as HttpHighscoreStore;
    return { state, remote };
  };

  it('submits hive_siege (and legacy runs without mission) remotely', async () => {
    const { state, remote } = fakeRemote();
    const s = new FallbackHighscoreStore(remote, new LocalHighscoreStore());
    await s.submit({ ...run(10_000), mission: 'hive_siege' });
    await s.submit(run(11_000));
    expect(state.received).toHaveLength(2);
  });

  it('keeps other missions local and does not flush them to the board', async () => {
    const { state, remote } = fakeRemote();
    const local = new LocalHighscoreStore();
    const s = new FallbackHighscoreStore(remote, local);
    const out = await s.submit({ ...run(40_000), mission: 'hold_the_line' });
    expect(out.status).toBe('local');
    expect(state.received).toHaveLength(0);
    expect(local.pending()).toHaveLength(0);
    await s.flushPending();
    expect(state.received).toHaveLength(0);
  });
});
