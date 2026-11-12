import { describe, expect, it } from 'vitest';
import {
  applyElo,
  ELO_K,
  ELO_START,
  eloExpected,
  isDuelRankedResult,
  ratingsFromMatches,
  sortDuelRatings,
  toDuelMatchRecord,
  type DuelMatchRecord,
  type RunResult,
} from '../src/index.js';

function run(over: Partial<RunResult> = {}): RunResult {
  return {
    runId: 'run_abc123_abcdefghij',
    teamSize: 2,
    players: ['Alice', 'Bob'],
    survivalMs: 45_000,
    wave: 0,
    kills: 3,
    playerScores: [0, 0],
    playerKills: [2, 1],
    endedAt: '2026-11-12T14:00:00.000Z',
    version: '0.6.1',
    mode: 'p2p',
    mission: 'duel',
    outcome: 'victory',
    ...over,
  };
}

describe('Elo', () => {
  it('gives even 1000s a 50/50 expected score and ±K/2 after a win', () => {
    expect(eloExpected(ELO_START, ELO_START)).toBeCloseTo(0.5, 10);
    expect(applyElo(ELO_START, ELO_START, ELO_K)).toEqual({ winner: 1016, loser: 984 });
  });

  it('moves a favourite less than an underdog for the same result', () => {
    const fav = applyElo(1400, 1000);
    const dog = applyElo(1000, 1400);
    expect(fav.winner - 1400).toBeLessThan(dog.winner - 1000);
    expect(1000 - fav.loser).toBeLessThan(1400 - dog.loser);
  });
});

describe('isDuelRankedResult', () => {
  it('accepts a finished 1v1 P2P duel and rejects everything else', () => {
    expect(isDuelRankedResult(run())).toBe(true);
    expect(toDuelMatchRecord(run())?.winner).toBe('Alice');
    expect(isDuelRankedResult(run({ mode: 'local' }))).toBe(false);
    expect(isDuelRankedResult(run({ teamSize: 1, players: ['Alice'], playerKills: [2] }))).toBe(
      false,
    );
    expect(
      isDuelRankedResult(
        run({ teamSize: 4, players: ['A', 'B', 'C', 'D'], playerKills: [2, 0, 1, 0] }),
      ),
    ).toBe(false);
    expect(isDuelRankedResult(run({ mission: 'hive_siege' }))).toBe(false);
    expect(isDuelRankedResult(run({ playerKills: [1, 1] }))).toBe(false);
    expect(isDuelRankedResult(run({ players: ['Alice', 'Alice'] }))).toBe(false);
  });

  it('replays matches into ratings, wins and losses, sorted by rating', () => {
    const matches: DuelMatchRecord[] = [
      {
        id: 'm1',
        winner: 'Alice',
        loser: 'Bob',
        winnerKills: 2,
        loserKills: 0,
        version: '0.6.1',
        mode: 'p2p',
      },
      {
        id: 'm2',
        winner: 'Alice',
        loser: 'Bob',
        winnerKills: 2,
        loserKills: 1,
        version: '0.6.1',
        mode: 'p2p',
      },
    ];
    const rows = sortDuelRatings(ratingsFromMatches(matches).values());
    expect(rows[0]).toEqual({ name: 'Alice', rating: 1031, wins: 2, losses: 0 });
    expect(rows[1]).toEqual({ name: 'Bob', rating: 969, wins: 0, losses: 2 });
  });
});
