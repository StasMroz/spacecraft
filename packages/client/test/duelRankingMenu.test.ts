import { describe, expect, it } from 'vitest';
import {
  DUEL_RANKING_EMPTY,
  DUEL_RANKING_ERROR,
  DUEL_RANKING_LOADING,
  duelBriefingHint,
  duelRankingBodyHtml,
  readDuelRankingView,
} from '../src/ui/screens/menu.js';
import { MISSIONS } from '@sms/shared';

describe('duel briefing hint', () => {
  it('marks 1v1 as ranked and does not say the ladder is off', () => {
    const duels = MISSIONS.filter((m) => m.kind === 'duel');
    expect(duels.length).toBeGreaterThan(0);
    for (const m of duels) {
      const hint = duelBriefingHint(m);
      expect(hint).toBe(`2 graczy = 1v1 (ranking), 4 = 2v2, pierwszy do ${m.duelTo ?? 2} zabójstw`);
    }
  });
});

describe('duel ranking body', () => {
  it('renders the empty-state copy', () => {
    const html = duelRankingBodyHtml({ kind: 'empty' });
    expect(html).toContain(DUEL_RANKING_EMPTY);
    expect(html).not.toContain('<table');
  });

  it('renders position, nick, rating and W–L for each row', () => {
    const html = duelRankingBodyHtml({
      kind: 'rows',
      rows: [
        { name: 'Alice', rating: 1124, wins: 3, losses: 1 },
        { name: 'Bob <x>', rating: 1000, wins: 0, losses: 2 },
      ],
    });
    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).toContain('Alice');
    expect(html).toContain('Bob &lt;x&gt;');
    expect(html).not.toContain('Bob <x>');
    expect(html).toContain('1124');
    expect(html).toContain('1000');
    expect(html).toContain('3–1');
    expect(html).toContain('0–2');
    expect(html).toContain('W–L');
    expect(html).toContain('RATING');
  });

  it('renders loading and error copy', () => {
    expect(duelRankingBodyHtml({ kind: 'loading' })).toContain(DUEL_RANKING_LOADING);
    const err = duelRankingBodyHtml({ kind: 'error' });
    expect(err).toContain(DUEL_RANKING_ERROR);
    expect(err).toContain('error');
  });
});

describe('readDuelRankingView', () => {
  it('maps an empty list to the empty view and a throw to error', async () => {
    expect(await readDuelRankingView(async () => [])).toEqual({ kind: 'empty' });
    expect(
      await readDuelRankingView(async () => {
        throw new Error('403');
      }),
    ).toEqual({ kind: 'error' });
  });

  it('keeps returned rows', async () => {
    const rows = [{ name: 'Cain', rating: 1080, wins: 2, losses: 0 }];
    expect(await readDuelRankingView(async () => rows)).toEqual({ kind: 'rows', rows });
  });
});
