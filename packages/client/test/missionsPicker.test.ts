import { DEFAULT_MISSION_ID, MISSIONS, getMission } from '@sms/shared';
import { describe, expect, it } from 'vitest';
import {
  formatTimeLimit,
  initialMissionId,
  lobbyMissionMarkup,
  mapLabel,
  menuMarkup,
  missionBriefingHtml,
  missionClockLabel,
  missionMetaLine,
  missionPickerMarkup,
  missionSupplyLabel,
  missionTags,
  resolvedMissionId,
  selectedMissionId,
} from '../src/ui/screens/menu.js';
import { defaultContent } from '@sms/shared';

describe('resolved / initial mission id', () => {
  it('defaults to hive_siege', () => {
    expect(DEFAULT_MISSION_ID).toBe('hive_siege');
    expect(resolvedMissionId(undefined)).toBe('hive_siege');
    expect(resolvedMissionId(null)).toBe('hive_siege');
    expect(resolvedMissionId('')).toBe('hive_siege');
    expect(resolvedMissionId('nope')).toBe('hive_siege');
  });

  it('keeps a known catalogue id', () => {
    expect(resolvedMissionId('evacuation')).toBe('evacuation');
    expect(resolvedMissionId('synapse_purge')).toBe('synapse_purge');
  });

  it('lets ?mission= win over a remembered pref', () => {
    expect(initialMissionId('relic_recovery', 'evacuation')).toBe('relic_recovery');
    expect(initialMissionId('', 'evacuation')).toBe('evacuation');
    expect(initialMissionId(undefined, undefined)).toBe('hive_siege');
    expect(initialMissionId('nope', 'hold_the_line')).toBe('hold_the_line');
  });
});

describe('mission picker markup', () => {
  it('lists all five missions and checks hive_siege by default', () => {
    const html = missionPickerMarkup('');
    expect(MISSIONS).toHaveLength(5);
    for (const m of MISSIONS) {
      expect(html).toContain(`value="${m.id}"`);
      expect(html).toContain(m.name);
    }
    expect(html).toMatch(/value="hive_siege"[^>]*checked|checked[^>]*value="hive_siege"/);
    expect(html).not.toMatch(/value="evacuation"[^>]*checked|checked[^>]*value="evacuation"/);
  });

  it('builds chip tags from each catalogue entry, without hard-coded ids', () => {
    expect(MISSIONS.length).toBeGreaterThan(0);
    for (const m of MISSIONS) {
      const tags = missionTags(m);
      if (m.crates) expect(tags).toContain('drops');
      else expect(tags).not.toMatch(/\bdrops\b/);
      if (m.timeLimit !== null) expect(tags).toContain(formatTimeLimit(m.timeLimit));
    }
    expect(formatTimeLimit(190)).toBe('3:10');
    expect(mapLabel('missing-map')).toBe('missing-map');
  });
});

describe('passing a mission id into solo', () => {
  it('menu markup sits the picker immediately before SOLO DEPLOY', () => {
    const html = menuMarkup({
      baseUrl: '/assets/',
      content: defaultContent,
      dedicated: false,
      missionId: 'evacuation',
    });
    const picker = html.indexOf('class="missions"');
    const solo = html.indexOf('id="solo"');
    const friends = html.indexOf('PLAY WITH FRIENDS');
    expect(picker).toBeGreaterThanOrEqual(0);
    expect(picker).toBeLessThan(solo);
    expect(solo).toBeLessThan(friends);
    expect(html).toMatch(/value="evacuation"[^>]*checked|checked[^>]*value="evacuation"/);
  });

  it('selectedMissionId reads the checked radio and ignores unknown values', () => {
    const checked = {
      querySelector: (sel: string) =>
        sel.includes(':checked') ? { value: 'hold_the_line' } : null,
    };
    expect(selectedMissionId(checked)).toBe('hold_the_line');
    const empty = { querySelector: () => null };
    expect(selectedMissionId(empty)).toBe('hive_siege');
    const bad = {
      querySelector: (sel: string) => (sel.includes(':checked') ? { value: 'nope' } : null),
    };
    expect(selectedMissionId(bad)).toBe('hive_siege');
  });
});

describe('mission briefing', () => {
  it('renders a BRIEFING for every catalogue mission from its fields only', () => {
    expect(MISSIONS.length).toBeGreaterThan(0);
    for (const m of MISSIONS) {
      const html = missionBriefingHtml(m.id);
      expect(html).toContain('BRIEFING');
      expect(html).toContain(m.name);
      expect(html).toContain(m.description);
      expect(html).toContain(m.objective);
      expect(html).toContain(mapLabel(m.map));
      expect(html).toContain(missionSupplyLabel(m));
      expect(html).toContain(missionClockLabel(m));
      expect(missionMetaLine(m)).toBe(
        `${mapLabel(m.map)} · ${missionSupplyLabel(m)} · ${missionClockLabel(m)}`,
      );
      if (m.crates) expect(missionSupplyLabel(m)).toBe('zrzuty');
      else expect(missionSupplyLabel(m)).toBe('brak zrzutów');
      if (m.timeLimit === null) expect(missionClockLabel(m)).toBe('bez limitu');
      else expect(missionClockLabel(m)).toBe(`limit ${formatTimeLimit(m.timeLimit)}`);
    }
  });

  it('puts that briefing in the picker and the lobby, for each mission', () => {
    for (const m of MISSIONS) {
      const picker = missionPickerMarkup(m.id);
      const lobby = lobbyMissionMarkup(m.id);
      for (const html of [picker, lobby]) {
        expect(html).toContain('BRIEFING');
        expect(html).toContain(m.name);
        expect(html).toContain(m.description);
        expect(html).toContain(m.objective);
        expect(html).toContain(missionMetaLine(m));
      }
      expect(picker).toMatch(new RegExp(`value="${m.id}"[^>]*checked|checked[^>]*value="${m.id}"`));
      expect(lobby).not.toContain('input');
    }
    expect(lobbyMissionMarkup('nope')).toContain(getMission(DEFAULT_MISSION_ID).name);
  });
});

describe('mission picker CSS', () => {
  it('resets radio inputs so the global text-field rule cannot stretch them', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
    const start = css.indexOf(".mission-chip input[type='radio']");
    expect(start).toBeGreaterThanOrEqual(0);
    const body = css.slice(start, css.indexOf('}', start) + 1);
    expect(body).toContain('appearance: none');
    expect(body).toMatch(/width:\s*1px/);
    expect(body).toContain('min-height: 0');
    expect(body).toContain('padding: 0');
    expect(body).toContain('border: 0');
  });
});
