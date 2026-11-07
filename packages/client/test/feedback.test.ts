import { describe, expect, it, vi } from 'vitest';
import { GAME_VERSION, type PetitionDoc, type PetitionVote, voteDocId } from '@sms/shared';

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
  createPetitionBody,
  listPetitionsQuery,
  parsePetitions,
  parseVotes,
  petitionEndpoint,
  voteBody,
} from '../src/feedback/firestore.js';
import { PetitionStore, sortPetitions } from '../src/feedback/store.js';

const cfg = { apiKey: 'AIza-test', projectId: 'sms-demo' };
const DOCS = 'projects/sms-demo/databases/(default)/documents';

describe('feedback firestore payloads', () => {
  it('builds create-only petition commit with server timestamp', () => {
    const body = createPetitionBody(cfg, {
      id: 'pet_test_abcdef12',
      category: 'ideas',
      title: 'Więcej apteczek',
      body: 'Proszę o częstsze dropy.',
      name: 'Filip',
      gameVersion: '0.6.1-dev',
      source: 'dev',
    });
    expect(body.writes).toHaveLength(1);
    const w = body.writes[0]!;
    expect(w.currentDocument).toEqual({ exists: false });
    expect(w.update.name).toBe(`${DOCS}/petitions/pet_test_abcdef12`);
    expect(w.update.fields.status).toEqual({ stringValue: 'open' });
    expect(w.updateTransforms?.[0]?.setToServerValue).toBe('REQUEST_TIME');
  });

  it('vote doc id and create/update bodies', () => {
    const vote = {
      petitionId: 'pet_test_abcdef12',
      voterId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      value: 1 as const,
    };
    expect(voteDocId(vote.petitionId, vote.voterId)).toBe(`${vote.petitionId}_${vote.voterId}`);
    const create = voteBody(cfg, vote, false);
    expect(create.writes[0]!.currentDocument).toEqual({ exists: false });
    const update = voteBody(cfg, { ...vote, value: 0 }, true);
    expect(update.writes[0]!.currentDocument).toEqual({ exists: true });
    expect(update.writes[0]!.update.fields.value).toEqual({ integerValue: '0' });
  });

  it('endpoint hits the database root (top-level collections)', () => {
    expect(petitionEndpoint(cfg, 'runQuery')).toContain(`${DOCS}:runQuery?key=`);
    expect(listPetitionsQuery().structuredQuery.from[0]!.collectionId).toBe('petitions');
  });

  it('parses petitions and votes; skips malformed', () => {
    const petDoc = (fields: Record<string, unknown>, id = 'pet_ok_123456') => ({
      document: {
        name: `${DOCS}/petitions/${id}`,
        fields,
        createTime: '2026-11-05T12:00:00.000Z',
      },
    });
    const fields = {
      category: { stringValue: 'bugs' },
      title: { stringValue: 'Bug' },
      body: { stringValue: 'Opis' },
      name: { stringValue: 'Filip' },
      gameVersion: { stringValue: '0.6.1' },
      status: { stringValue: 'open' },
      source: { stringValue: 'live' },
      createdAt: { timestampValue: '2026-11-05T12:00:00.000Z' },
    };
    const parsed = parsePetitions([
      petDoc(fields),
      petDoc({ ...fields, category: { stringValue: 'nope' } }, 'pet_bad_1'),
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toBe('pet_ok_123456');

    const votes = parseVotes([
      {
        document: {
          name: `${DOCS}/petitionVotes/x`,
          fields: {
            petitionId: { stringValue: 'pet_ok_123456' },
            voterId: { stringValue: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
            value: { integerValue: '1' },
          },
        },
      },
      {
        document: {
          name: `${DOCS}/petitionVotes/y`,
          fields: {
            petitionId: { stringValue: 'pet_ok_123456' },
            voterId: { stringValue: 'b' },
            value: { integerValue: '9' },
          },
        },
      },
    ]);
    expect(votes).toHaveLength(1);
    expect(votes[0]!.value).toBe(1);
  });
});

describe('PetitionStore + sort', () => {
  it('lists, aggregates, hides hidden, sorts by score/newest', async () => {
    const petitions: PetitionDoc[] = [
      {
        id: 'pet_a_11111111',
        category: 'bugs',
        title: 'A',
        body: 'a',
        name: 'Filip',
        gameVersion: '0.6.1',
        status: 'open',
        source: 'live',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 'pet_b_22222222',
        category: 'bugs',
        title: 'B',
        body: 'b',
        name: 'Filip',
        gameVersion: '0.6.1',
        status: 'hidden',
        source: 'live',
        createdAt: '2026-11-04T00:00:00.000Z',
      },
      {
        id: 'pet_c_33333333',
        category: 'bugs',
        title: 'C',
        body: 'c',
        name: 'Filip',
        gameVersion: '0.6.1',
        status: 'open',
        source: 'dev',
        createdAt: '2026-11-05T00:00:00.000Z',
      },
      {
        id: 'pet_d_44444444',
        category: 'ideas',
        title: 'D',
        body: 'd',
        name: 'Filip',
        gameVersion: '0.6.1',
        status: 'open',
        source: 'live',
        createdAt: '2026-11-03T00:00:00.000Z',
      },
    ];
    const votes: PetitionVote[] = [
      { petitionId: 'pet_a_11111111', voterId: 'me', value: 1 },
      { petitionId: 'pet_a_11111111', voterId: 'x', value: 1 },
      { petitionId: 'pet_c_33333333', voterId: 'x', value: -1 },
    ];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        structuredQuery?: { from: { collectionId: string }[] };
      };
      const col = body.structuredQuery?.from[0]?.collectionId;
      const rows =
        col === 'petitions'
          ? petitions.map((p) => ({
              document: {
                name: `${DOCS}/petitions/${p.id}`,
                fields: {
                  category: { stringValue: p.category },
                  title: { stringValue: p.title },
                  body: { stringValue: p.body },
                  name: { stringValue: p.name },
                  gameVersion: { stringValue: p.gameVersion },
                  status: { stringValue: p.status },
                  source: { stringValue: p.source },
                  createdAt: { timestampValue: p.createdAt },
                },
              },
            }))
          : votes.map((v, i) => ({
              document: {
                name: `${DOCS}/petitionVotes/${i}`,
                fields: {
                  petitionId: { stringValue: v.petitionId },
                  voterId: { stringValue: v.voterId },
                  value: { integerValue: String(v.value) },
                },
              },
            }));
      return {
        ok: true,
        status: 200,
        json: async () => rows,
      } as Response;
    });
    const store = new PetitionStore(cfg, { fetch: fetchMock as unknown as typeof fetch });
    const cards = await store.list('me');
    expect(cards.map((c) => c.id).sort()).toEqual([
      'pet_a_11111111',
      'pet_c_33333333',
      'pet_d_44444444',
    ]);
    const byScore = sortPetitions(cards, 'bugs', 'score');
    expect(byScore.map((c) => c.id)).toEqual(['pet_a_11111111', 'pet_c_33333333']);
    expect(byScore[0]!.score).toBe(2);
    expect(byScore[0]!.myVote).toBe(1);
    const byNew = sortPetitions(cards, 'bugs', 'newest');
    expect(byNew[0]!.id).toBe('pet_c_33333333');
    const allByScore = sortPetitions(cards, 'all', 'score');
    expect(allByScore.map((c) => c.id)).toEqual([
      'pet_a_11111111',
      'pet_d_44444444',
      'pet_c_33333333',
    ]);
  });

  it('menu footer mentions PETYCJE next to rules (source check)', async () => {
    // Light coupling check: the built menu template string includes the link.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/ui/screens/menu.ts', import.meta.url), 'utf8'),
    );
    expect(src).toContain('href="feedback.html">PETYCJE</a>');
    expect(src).toContain('href="rules.html">ZASADY / RULES</a>');
    expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
