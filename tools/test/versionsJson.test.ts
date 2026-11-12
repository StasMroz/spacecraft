import { describe, expect, it } from 'vitest';
import {
  buildVersionsJson,
  compactTitle,
  parseChangelog,
  releasePath,
} from '../../scripts/write-versions-json.js';

const sample = `# Changelog

## v35

- Hotfix ofensywy: wręcz na zrzucie. HUD pisze „BEZ FAL”.

## v34

- Dwie misje ofensywne: **Zabójstwo tyrana** (\`hold_the_line\`) i **Spalenie gniazd**.

## v2

- Something old.
`;

describe('write-versions-json', () => {
  it('parses CHANGELOG headings newest-first and strips markdown in titles', () => {
    const rows = parseChangelog(sample);
    expect(rows.map((r) => r.version)).toEqual(['35', '34', '2']);
    expect(rows[0]!.title).toContain('wręcz na zrzucie');
    expect(rows[1]!.title).toBe(
      'Dwie misje ofensywne: Zabójstwo tyrana (hold_the_line) i Spalenie gniazd.',
    );
    expect(rows[1]!.title).not.toMatch(/[*`]/);
  });

  it('builds { versions: VersionEntry[] } with Release paths (no frozen /vN/ folders on Pages)', () => {
    const json = buildVersionsJson(sample, {
      repo: 'StasMroz/spacecraft',
      dates: { '35': '2026-11-12', '34': '2026-11-12' },
    });
    expect(json.versions).toHaveLength(3);
    expect(json.versions[0]).toEqual({
      version: '35',
      date: '2026-11-12',
      title: expect.stringContaining('Hotfix'),
      path: 'https://github.com/StasMroz/spacecraft/releases/tag/v35',
    });
    expect(releasePath('StasMroz/spacecraft', '34')).toBe(
      'https://github.com/StasMroz/spacecraft/releases/tag/v34',
    );
    for (const e of json.versions) {
      expect(e).toHaveProperty('version');
      expect(e).toHaveProperty('date');
      expect(e).toHaveProperty('title');
      expect(e).toHaveProperty('path');
      expect(e.path).toMatch(/\/releases\/tag\/v/);
    }
  });

  it('truncates long titles', () => {
    expect(compactTitle('a'.repeat(200)).length).toBe(120);
    expect(compactTitle('a'.repeat(200)).endsWith('…')).toBe(true);
  });
});
