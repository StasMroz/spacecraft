import { defaultContent, GAME_VERSION } from '@sms/shared';
import { describe, expect, it } from 'vitest';
import { menuMarkup } from '../src/ui/screens/menu.js';

const markup = menuMarkup({ baseUrl: '/assets/', content: defaultContent, dedicated: false });
const at = (needle: string) => {
  const i = markup.indexOf(needle);
  expect(i, needle).toBeGreaterThanOrEqual(0);
  return i;
};

describe('menu layout', () => {
  it('puts solo deploy first, then host and join grouped under PLAY WITH FRIENDS', () => {
    const solo = at('id="solo" class="primary"');
    const section = at('<section class="squad" aria-labelledby="squad-title">');
    expect(at('id="squad-title">PLAY WITH FRIENDS')).toBeGreaterThan(section);
    expect(solo).toBeLessThan(section);
    const end = markup.indexOf('</section>', section);
    for (const id of ['id="host"', 'id="code"', 'id="join"']) {
      const i = at(id);
      expect(i).toBeGreaterThan(section);
      expect(i).toBeLessThan(end);
    }
  });

  it('collapses controls under HOW TO PLAY, keeping desktop and touch help', () => {
    const details = at('<details class="help">');
    expect(markup).not.toContain('<details class="help" open');
    expect(at('<summary>HOW TO PLAY</summary>')).toBeGreaterThan(details);
    const end = markup.indexOf('</details>', details);
    expect(at('class="kbm-only"')).toBeLessThan(end);
    expect(at('class="touch-only"')).toBeLessThan(end);
  });

  it('still shows the version under the title', () => {
    expect(markup).toContain(`>v${GAME_VERSION}`);
  });

  it('collapses the 1v1 ranking under RANKING 1v1', () => {
    const details = at('id="duel-ranking"');
    expect(markup).not.toMatch(/id="duel-ranking"[^>]*\sopen/);
    expect(at('<summary>RANKING 1v1</summary>')).toBeGreaterThan(details);
    expect(at('id="duel-ranking-body"')).toBeGreaterThan(details);
  });
});
