import { DEFAULT_MISSION_ID, MISSIONS, getMap, getMission } from '@sms/shared';
import { describe, expect, it } from 'vitest';
import {
  formatTimeLimit,
  initialMissionId,
  lobbyMissionMarkup,
  mapLabel,
  menuMarkup,
  missionPickerMarkup,
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

  it('checks the given mission and shows only that description and map', () => {
    const m = getMission('synapse_purge');
    const html = missionPickerMarkup('synapse_purge');
    expect(html).toMatch(/value="synapse_purge"[^>]*checked|checked[^>]*value="synapse_purge"/);
    expect(html).toContain(m.description);
    expect(html).toContain(getMap(m.map).name);
    expect(html).not.toContain(getMission('evacuation').description);
  });

  it('marks supply drops and the time limit, and uses the map signature', () => {
    expect(missionTags(getMission('hive_siege'))).toBe('drops');
    expect(missionTags(getMission('hold_the_line'))).toBe(`drops · ${formatTimeLimit(190)}`);
    expect(missionTags(getMission('relic_recovery'))).toBe(formatTimeLimit(240));
    expect(formatTimeLimit(190)).toBe('3:10');
    expect(mapLabel('jungle')).toBe('Dżungla biomasy');
    expect(mapLabel('missing-map')).toBe('missing-map');
    const html = missionPickerMarkup('hive_siege');
    expect(html).toContain('drops');
    expect(html).toContain(mapLabel('wave'));
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

describe('lobby mission briefing', () => {
  it('shows the name and description from the lobby mission id', () => {
    const m = getMission('evacuation');
    const html = lobbyMissionMarkup('evacuation');
    expect(html).toContain(m.name);
    expect(html).toContain(m.description);
    expect(html).toContain(getMap(m.map).name);
    expect(html).not.toContain('input');
    expect(lobbyMissionMarkup('nope')).toContain(getMission('hive_siege').name);
  });
});
