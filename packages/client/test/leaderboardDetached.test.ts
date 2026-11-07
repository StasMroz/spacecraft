import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const entry = (name: string) => fileURLToPath(new URL(`../src/${name}`, import.meta.url));

async function bundledModules(name: string): Promise<string[]> {
  const out = await build({
    entryPoints: [entry(name)],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
    loader: { '.css': 'empty', '.png': 'empty', '.glb': 'empty', '.jpg': 'empty' },
    define: { 'import.meta.env': '{}' },
  });
  return Object.keys(out.metafile.inputs);
}

describe('game build without the leaderboard', () => {
  it('ships no highscore store or table in the game entry', async () => {
    const modules = await bundledModules('main.ts');
    expect(modules.some((m) => m.endsWith('app/App.ts'))).toBe(true);
    expect(
      modules.filter((m) => m.includes('/highscores/') || m.includes('highscoreTable')),
    ).toEqual([]);
  });
});
