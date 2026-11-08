import { GAME_VERSION } from '@sms/shared';
import { DEV_PREVIEW, isDevBoardVersion } from '../devPreview.js';
import { escapeHtml } from './format.js';

/** One entry of /spacecraft/versions.json (written by scripts/deploy-pages.ts). */
export interface VersionEntry {
  version: string;
  date: string;
  title: string;
  path: string;
}

/**
 * Site root of the Pages deploy: BASE_URL without a trailing `vX.Y.Z/` segment, so both the
 * latest build (/spacecraft/), frozen builds (/spacecraft/v0.2.0/) and the dev preview
 * (/spacecraft/dev/) find the same list.
 */
export function siteRoot(base = import.meta.env.BASE_URL): string {
  return base.replace(/(v\d+\.\d+\.\d+|dev)\/?$/, '');
}

/** Version shown in the menu: the build's real GAME_VERSION, plus the dev-preview sha if any. */
export function versionLabel(version = GAME_VERSION, preview: string | null = DEV_PREVIEW): string {
  return `v${version}${preview ? `-dev+${preview}` : ''}`;
}

export async function loadVersions(): Promise<VersionEntry[]> {
  try {
    const r = await fetch(`${siteRoot()}versions.json`, { cache: 'no-cache' });
    if (!r.ok) return [];
    const j = (await r.json()) as { versions?: VersionEntry[] };
    // the hidden dev-preview board (0.0.0) is never a real version
    return Array.isArray(j.versions) ? j.versions.filter((v) => !isDevBoardVersion(v.version)) : [];
  } catch {
    return [];
  }
}

/** "Previous versions" link; expands into the list from versions.json (hidden if none). */
export function createVersionsLink(): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'versions';
  wrap.hidden = true;
  void loadVersions().then((list) => {
    // The dev preview is never in the list, so every listed version is "other" there.
    const current = DEV_PREVIEW ? null : GAME_VERSION;
    const older = list.filter((v) => v.version !== current);
    if (!older.length) return;
    wrap.hidden = false;
    wrap.innerHTML = ` · <a class="versions-link" role="button" tabindex="0">Previous versions</a><ul class="versions-list" hidden>${list
      .map(
        (v) =>
          `<li><a href="${escapeHtml(v.path)}">v${escapeHtml(v.version)}</a> — ${escapeHtml(v.title)} <span class="muted">(${escapeHtml(v.date)})</span>${v.version === current ? ' <span class="tag you">CURRENT</span>' : ''}</li>`,
      )
      .join('')}</ul>`;
    const link = wrap.querySelector('.versions-link') as HTMLElement;
    const ul = wrap.querySelector('.versions-list') as HTMLElement;
    const toggle = () => (ul.hidden = !ul.hidden);
    link.addEventListener('click', toggle);
    link.addEventListener('keydown', (e) => e.key === 'Enter' && toggle());
  });
  return wrap;
}
