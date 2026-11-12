import { defaultContent, type PlayerSummary } from '@sms/shared';
import { describe, expect, it } from 'vitest';
import { killTally, killTallyRows } from '../src/ui/screens/gameOver.js';

const marine = (id: number, name: string, killsByType: Record<string, number>): PlayerSummary => ({
  id,
  name,
  kills: Object.values(killsByType).reduce((a, b) => a + b, 0),
  score: id,
  killsByType,
  damage: 0,
  diedAtMs: null,
});

describe('game-over kill tally', () => {
  it('lists every enemy type: bosses, then elites, then the swarm', () => {
    const rows = killTallyRows([marine(1, 'A', { hormagaunt: 3 })], undefined, defaultContent);
    expect(rows.map((r) => r.id).sort()).toEqual([...defaultContent.enemies.keys()].sort());
    expect(
      rows
        .filter((r) => r.rank === 'boss')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['carnifex', 'hive_tyrant', 'psychophage'].sort());
    expect(rows[0]?.rank).toBe('boss');
    const ranks = rows.map((r) => r.rank);
    expect(ranks).toEqual(
      [...ranks].sort(
        (a, b) => ['boss', 'elite', 'swarm'].indexOf(a) - ['boss', 'elite', 'swarm'].indexOf(b),
      ),
    );
    expect(rows.find((r) => r.id === 'warrior')?.rank).toBe('elite');
    expect(rows.find((r) => r.id === 'hormagaunt')).toMatchObject({ rank: 'swarm', total: 3 });
  });

  it('squad totals include uncredited kills; per-marine columns stay aligned', () => {
    const summary = [marine(2, 'B', { carnifex: 1 }), marine(1, 'A', { ripper: 4 })];
    const rows = killTallyRows(
      summary,
      { killsByType: { carnifex: 1, ripper: 6 } },
      defaultContent,
    );
    expect(rows.find((r) => r.id === 'ripper')).toMatchObject({ perMarine: [0, 4], total: 6 });
    const html = killTally(summary, {
      colors: new Map(),
      content: defaultContent,
      squad: { killsByType: { carnifex: 1, ripper: 6 } },
    });
    expect(html).toContain('Carnifex');
    expect(html).toContain('BOSS');
    expect(html).toContain('2 caught in Tyranid blasts');
  });
});
