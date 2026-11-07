import { GAME_VERSION, sanitizeName, type ContentRegistry } from '@sms/shared';
import { DEV_PREVIEW } from '../../devPreview.js';
import { storage } from '../../util/storage.js';
import { $, html } from '../dom.js';
import { createChapterPicker } from '../chapters.js';
import { escapeHtml } from '../format.js';
import { prefs } from '../prefs.js';
import { createVersionsLink } from '../versions.js';
import { createMixerPanel, type MixerControls } from '../mixerPanel.js';

export interface MenuActions {
  solo(name: string): void;
  host(name: string): void;
  join(name: string, code: string): void;
}

export interface MenuOptions {
  content: ContentRegistry;
  /** Generated-assets base URL (for the emblem image). */
  baseUrl: string;
  joinCode?: string;
  error?: string;
  dedicated: boolean;
  /** Per-bus volume sliders; omitted when audio is unavailable. */
  mixer?: MixerControls;
}

const NAME_KEY = 'sms.name';

export function createMenuScreen(actions: MenuActions, opts: MenuOptions): HTMLElement {
  const [main, sub] = splitTitle(opts.content.title);
  const el = html(`<div class="screen menu">
    <div class="title">
      <img class="emblem" src="${escapeHtml(opts.baseUrl)}ui/emblem.png" alt="" width="256" height="128">
      <h1>${escapeHtml(main)}${sub ? `<span>: ${escapeHtml(sub)}</span>` : ''}</h1>
      <p class="tagline">${escapeHtml(opts.content.subtitle)}</p>
      ${DEV_PREVIEW ? `<div class="dev-badge" title="Unversioned dev preview — scores go to a separate DEV board">DEV PREVIEW ${escapeHtml(DEV_PREVIEW)}</div>` : ''}
      <div class="scroll">The hive spires have gone dark. Hold the breach until the last bolt is spent.</div>
    </div>
    <div class="cols single">
      <div class="card play">
        <label>CALLSIGN<input id="name" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Marine"></label>
        <label>CHAPTER</label>
        <div id="chapters"></div>
        <button id="solo" class="primary">▶ SOLO DEPLOY</button>
        <div class="row">
          <button id="host">HOST SQUAD (CO-OP)</button>
        </div>
        <div class="row join">
          <input id="code" maxlength="8" placeholder="ROOM CODE" autocomplete="off" spellcheck="false">
          <button id="join">JOIN</button>
        </div>
        <div class="error" id="err"></div>
        <div class="help">
          <span class="kbm-only"><b>WASD</b> move · <b>Mouse</b> aim · <b>LMB / Space</b> fire · <b>RMB</b> guard · <b>1-${opts.content.weaponOrder.length}</b> / <b>Q E</b> / wheel switch weapon · <b>R</b> reload · <b>M</b> mute<br></span>
          <span class="touch-only"><b>Left thumb</b> move · <b>Right thumb</b> aim &amp; auto-fire · <b>🛡 GUARD</b> hold (right) · <b>tap a weapon</b> to switch · <b>⟳</b> reload · <b>⛶</b> fullscreen<br></span>
          Stand next to a downed battle-brother to revive them. Wargear unlocks over time; supply crates drop on the map. Plasma runs hot: past the line shots are supercharged, at the top it vents and burns you.
        </div>
        <div id="mixer"></div>
        <div class="muted small" id="meta"><a class="rules-link" href="rules.html">ZASADY / RULES</a> · <a class="rules-link" href="feedback.html">PETYCJE</a> · v${GAME_VERSION}${DEV_PREVIEW ? `-dev+${escapeHtml(DEV_PREVIEW)}` : ''}${opts.dedicated ? ' · dedicated host mode' : ' · P2P (browser-hosted)'}</div>
      </div>
    </div>
    <p class="disclaimer">Unofficial, non-commercial fan project. Not affiliated with or endorsed by Games Workshop. Warhammer 40,000 and related marks are trademarks of Games Workshop Ltd. All art and sound here is procedurally generated.</p>
  </div>`);
  $(el, '#chapters').append(
    createChapterPicker(opts.content, prefs.chapter(), (id) => prefs.setChapter(id)).el,
  );
  $(el, '#meta').append(createVersionsLink());
  if (opts.mixer) $(el, '#mixer').append(createMixerPanel(opts.mixer));
  const name = $<HTMLInputElement>(el, '#name');
  const code = $<HTMLInputElement>(el, '#code');
  const err = $(el, '#err');
  name.value = storage.get(NAME_KEY, '');
  if (opts.joinCode) code.value = opts.joinCode;
  if (opts.error) err.textContent = opts.error;

  const getName = (): string | null => {
    const n = sanitizeName(name.value) || 'Marine';
    storage.set(NAME_KEY, n);
    return n;
  };
  const busy = (b: boolean) =>
    el.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = b));
  const run = (fn: () => void) => {
    err.textContent = '';
    busy(true);
    fn();
  };
  $(el, '#solo').addEventListener('click', () => run(() => actions.solo(getName()!)));
  $(el, '#host').addEventListener('click', () => run(() => actions.host(getName()!)));
  const doJoin = () => {
    if (!code.value.trim()) {
      err.textContent = 'Enter the room code your squad leader shared.';
      return;
    }
    run(() => actions.join(getName()!, code.value));
  };
  $(el, '#join').addEventListener('click', doJoin);
  code.addEventListener('keydown', (e) => e.key === 'Enter' && doJoin());
  queueMicrotask(() => (opts.joinCode ? $(el, '#join') : name).focus());
  return el;
}

/** "Spacecraft: Hive Siege" -> ["Spacecraft", "Hive Siege"]. */
function splitTitle(t: string): [string, string] {
  const i = t.indexOf(':');
  return i < 0 ? [t, ''] : [t.slice(0, i).trim(), t.slice(i + 1).trim()];
}
