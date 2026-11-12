import { describe, expect, it, vi } from 'vitest';
import type { RunResult } from '@sms/shared';
import { applyElo, ELO_START } from '@sms/shared';

vi.hoisted(() => {
  (globalThis as { location?: unknown }).location ??= {
    search: '',
    hostname: 'localhost',
    origin: 'http://localhost',
    protocol: 'http:',
    pathname: '/',
  };
});

import {
  duelMatchCommitBody,
  duelMatchDocName,
  fetchDuelRanking,
  submitDuelMatch,
  submitGameResult,
} from '../src/duel/ranking.js';

const cfg = { apiKey: 'AIza-test', projectId: 'sms-demo' };
const DOCS = 'projects/sms-demo/databases/(default)/documents';

const ranked = (patch: Partial<RunResult> = {}): RunResult => ({
  runId: 'run_abc123def456',
  teamSize: 2,
  players: ['Alice', 'Bob'],
  survivalMs: 45_000,
  kills: 3,
  wave: 0,
  playerKills: [2, 1],
  endedAt: '2026-11-12T14:00:00.000Z',
  version: '0.6.1',
  mode: 'p2p',
  mission: 'duel',
  outcome: 'victory',
  ...patch,
});

const fields = (row: Record<string, string | number>, ts = '2026-11-12T14:00:00Z') => {
  const f: Record<string, unknown> = { timestamp: { timestampValue: ts } };
  for (const [k, v] of Object.entries(row)) {
    f[k] = typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v };
  }
  return f;
};

const doc = (col: string, id: string, f: Record<string, unknown>) => ({
  document: { name: `${DOCS}/${col}/${id}`, fields: f },
});

describe('duel ranking client', () => {
  it('writes a create-only match document keyed by runId', () => {
    const match = {
      id: 'run_abc123def456',
      winner: 'Alice',
      loser: 'Bob',
      winnerKills: 2,
      loserKills: 1,
      version: '0.6.1',
      mode: 'p2p' as const,
    };
    const body = duelMatchCommitBody(cfg, match);
    expect(body.writes[0]?.update.name).toBe(duelMatchDocName(cfg, match.id));
    expect(body.writes[0]?.update.name).toContain('/duelMatches/run_abc123def456');
    expect(body.writes[0]?.currentDocument).toEqual({ exists: false });
    expect(body.writes[0]?.updateTransforms).toEqual([
      { fieldPath: 'timestamp', setToServerValue: 'REQUEST_TIME' },
    ]);
    expect(body.writes).toHaveLength(1);
  });

  it('submits a ranked 1v1 once, treats 409 as success, and never throws', async () => {
    const posts: { url: string; body: unknown }[] = [];
    const f: typeof fetch = async (url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      posts.push({ url: String(url), body });
      if (
        String(url).includes(':commit') &&
        posts.filter((p) => p.url.includes(':commit')).length === 1
      ) {
        return new Response('{"writeResults":[{}]}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (String(url).includes(':runQuery')) {
        return new Response(
          JSON.stringify([
            doc(
              'duelMatches',
              'run_abc123def456',
              fields({
                winner: 'Alice',
                loser: 'Bob',
                winnerKills: 2,
                loserKills: 1,
                version: '0.6.1',
                mode: 'p2p',
              }),
            ),
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{"writeResults":[{}]}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    await expect(submitDuelMatch(ranked(), cfg, { fetch: f })).resolves.toBe(true);
    expect(JSON.stringify(posts[0]?.body)).toContain('currentDocument');
    expect(JSON.stringify(posts[0]?.body)).toContain('run_abc123def456');

    let n = 0;
    const conflict: typeof fetch = async () => {
      n++;
      if (n === 1)
        return new Response(
          JSON.stringify({ error: { status: 'ALREADY_EXISTS', message: 'exists' } }),
          {
            status: 409,
            headers: { 'content-type': 'application/json' },
          },
        );
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await expect(submitDuelMatch(ranked(), cfg, { fetch: conflict })).resolves.toBe(true);

    const denied: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'no' } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    await expect(submitDuelMatch(ranked(), cfg, { fetch: denied })).resolves.toBe(false);
    await expect(submitGameResult({ ...ranked(), mission: 'hive_siege' })).resolves.toEqual({
      status: 'local',
    });
    await expect(
      submitDuelMatch({ ...ranked(), teamSize: 1, players: ['Alice'], playerKills: [2] }, cfg, {
        fetch: f,
      }),
    ).resolves.toBe(false);
  });

  it('reads denormalized ratings, else replays matches, and fails open', async () => {
    const alice = applyElo(ELO_START, ELO_START).winner;
    const bob = applyElo(ELO_START, ELO_START).loser;
    const rated: typeof fetch = async (url) => {
      expect(String(url)).toContain('runQuery');
      return new Response(
        JSON.stringify([
          doc('duelRatings', 'Bob', fields({ name: 'Bob', rating: bob, wins: 0, losses: 1 })),
          doc('duelRatings', 'Alice', fields({ name: 'Alice', rating: alice, wins: 1, losses: 0 })),
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const rows = await fetchDuelRanking(cfg, { fetch: rated });
    expect(rows[0]).toEqual({ name: 'Alice', rating: alice, wins: 1, losses: 0 });
    expect(rows[1]?.name).toBe('Bob');

    let q = 0;
    const replay: typeof fetch = async () => {
      q++;
      if (q === 1)
        return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      return new Response(
        JSON.stringify([
          doc(
            'duelMatches',
            'run_1',
            fields({
              winner: 'Alice',
              loser: 'Bob',
              winnerKills: 2,
              loserKills: 0,
              version: '0.6.1',
              mode: 'p2p',
            }),
          ),
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const fromMatches = await fetchDuelRanking(cfg, { fetch: replay });
    expect(fromMatches[0]).toMatchObject({ name: 'Alice', wins: 1, losses: 0, rating: alice });

    const down: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    await expect(fetchDuelRanking(cfg, { fetch: down })).resolves.toEqual([]);
    await expect(fetchDuelRanking(null)).resolves.toEqual([]);
  });
});
