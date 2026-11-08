import { describe, expect, it } from 'vitest';
import { GAME_VERSION } from '@sms/shared';
import { siteRoot, versionLabel } from '../src/ui/versions.js';

describe('Previous versions: site root', () => {
  it('strips a frozen vX.Y.Z/ folder so every build reads the same versions.json', () => {
    expect(siteRoot('/spacecraft/')).toBe('/spacecraft/');
    expect(siteRoot('/spacecraft/v0.1.0/')).toBe('/spacecraft/');
    expect(siteRoot('/spacecraft/v10.2.33/')).toBe('/spacecraft/');
    expect(siteRoot('/')).toBe('/');
    expect(siteRoot('/spacecraft/v0.1/')).toBe('/spacecraft/v0.1/');
  });
});

describe('menu version label', () => {
  it('shows the real build version, without needing versions.json', () => {
    expect(versionLabel()).toBe(`v${GAME_VERSION}`);
    expect(versionLabel('1.2.3', null)).toBe('v1.2.3');
    expect(versionLabel('1.2.3', 'abc1234')).toBe('v1.2.3-dev+abc1234');
  });
});
