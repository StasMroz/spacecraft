import {
  DEFAULT_MISSION_ID,
  MISSIONS,
  findMap,
  findMission,
  getMission,
  sanitizeName,
  type ContentRegistry,
  type MissionDef,
} from '@sms/shared';
import { DEV_PREVIEW } from '../../devPreview.js';
import { storage } from '../../util/storage.js';
import { $, html } from '../dom.js';
import { createChapterPicker } from '../chapters.js';
import { escapeHtml } from '../format.js';
import { prefs } from '../prefs.js';
import { createVersionsLink, versionLabel } from '../versions.js';
import { createMixerPanel, type MixerControls } from '../mixerPanel.js';

export interface MenuActions {
  solo(name: string, missionId?: string): void;
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
  /** Pre-selected mission (`?mission=` or last remembered). */
  missionId?: string;
}

const NAME_KEY = 'sms.name';

/** Known catalogue id, or the default when the value is missing or unknown. */
export function resolvedMissionId(id: string | undefined | null): string {
  return findMission(id ?? undefined)?.id ?? DEFAULT_MISSION_ID;
}

/** A valid `?mission=` wins, then the remembered pref, then hive_siege. */
export function initialMissionId(urlMission?: string, pref?: string): string {
  return findMission(urlMission)?.id ?? findMission(pref)?.id ?? DEFAULT_MISSION_ID;
}

export function formatTimeLimit(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function isDuelMission(id: string | undefined | null): boolean {
  return getMission(resolvedMissionId(id)).kind === 'duel';
}

/** Compact tags: supply drops and/or a clock, omitted when neither applies. Duel shows PvP. */
export function missionTags(m: MissionDef): string {
  if (m.kind === 'duel') return 'PvP';
  const tags: string[] = [];
  if (m.crates) tags.push('drops');
  if (m.timeLimit !== null) tags.push(formatTimeLimit(m.timeLimit));
  return tags.join(' · ');
}

/** Why SOLO DEPLOY is blocked for a PvP duel, or null if solo is allowed. */
const DUEL_SOLO_NEEDED = 'A duel needs a squad — use HOST SQUAD.';

export function duelSoloMessage(missionId: string | undefined | null): string | null {
  return isDuelMission(missionId) ? DUEL_SOLO_NEEDED : null;
}

export function duelBriefingHint(m: MissionDef): string | null {
  if (m.kind !== 'duel') return null;
  const n = m.duelTo ?? 2;
  return `2 graczy = 1v1, 4 = 2v2, pierwszy do ${n} zabójstw, bez rankingu`;
}

/** Lobby start rules for a duel. Other missions leave blockStart false and hint null. */
export function duelLobbyAdvice(
  missionId: string | undefined | null,
  playerCount: number,
): { blockStart: boolean; hint: string | null } {
  if (!isDuelMission(missionId)) return { blockStart: false, hint: null };
  if (playerCount < 2) {
    return {
      blockStart: true,
      hint: 'A duel needs at least two players (1v1 or 2v2).',
    };
  }
  if (playerCount === 3) {
    return {
      blockStart: false,
      hint: '3 players: the duel will be 2v1. 2 (1v1) or 4 (2v2) is better.',
    };
  }
  return { blockStart: false, hint: null };
}

export function mapLabel(mapId: string): string {
  return findMap(mapId)?.name ?? mapId;
}

export function missionSupplyLabel(m: MissionDef): string {
  return m.crates ? 'zrzuty' : 'brak zrzutów';
}

export function missionClockLabel(m: MissionDef): string {
  return m.timeLimit !== null ? `limit ${formatTimeLimit(m.timeLimit)}` : 'bez limitu';
}

/** Map, resupply and clock, one compact line for the briefing. */
export function missionMetaLine(m: MissionDef): string {
  if (m.kind === 'duel') return `${mapLabel(m.map)} · PvP`;
  const parts = [mapLabel(m.map), missionSupplyLabel(m), missionClockLabel(m)];
  if (m.assault) parts.push('desant ofensywny');
  return parts.join(' · ');
}

/** Signature special and melee for a chapter, with unlock wave when the weapon has one. */
export function chapterLoadoutHtml(content: ContentRegistry, chapterId: string): string {
  const i = content.chapterIndex(chapterId);
  const ch = (i >= 0 ? content.chapters[i] : content.chapters[0]) ?? null;
  if (!ch) return '';
  return [ch.specialWeapon, ch.meleeWeapon]
    .map((id) => {
      const w = content.weapon(id);
      const when =
        w.unlockAtWave !== null && w.unlockAtWave > 0
          ? ` <span class="loadout-when">fala ${w.unlockAtWave}</span>`
          : '';
      return `<span class="loadout-item">${escapeHtml(w.name)}${when}</span>`;
    })
    .join('');
}

/** 40k-style briefing for the selected mission, built only from catalogue fields. */
export function missionBriefingHtml(id: string | undefined | null): string {
  const m = getMission(resolvedMissionId(id));
  const hint = duelBriefingHint(m);
  return `<div class="mission-briefing">
    <h3 class="mission-briefing-title">BRIEFING</h3>
    <p class="mission-picked">${escapeHtml(m.name)}</p>
    <p class="mission-desc" id="mission-desc">${escapeHtml(m.description)}</p>
    <p class="mission-objective" id="mission-objective">${escapeHtml(m.objective)}</p>
    <p class="mission-hint" id="mission-hint"${hint ? '' : ' hidden'}>${hint ? escapeHtml(hint) : ''}</p>
    <p class="mission-meta muted small" id="mission-meta">${escapeHtml(missionMetaLine(m))}</p>
  </div>`;
}

export function missionDetailsHtml(id: string | undefined | null): string {
  return missionBriefingHtml(id);
}

/** Compact radio list: one row per mission, description + map for the selection only. */
export function missionPickerMarkup(selectedId: string): string {
  const selected = resolvedMissionId(selectedId);
  const options = MISSIONS.map((m) => {
    const tags = missionTags(m);
    const checked = m.id === selected ? ' checked' : '';
    return `<label class="mission-chip"><input type="radio" name="mission" value="${escapeHtml(m.id)}"${checked}><span class="mission-name">${escapeHtml(m.name)}</span>${tags ? `<span class="mission-tags">${escapeHtml(tags)}</span>` : ''}</label>`;
  }).join('');
  return `<section class="missions" aria-labelledby="mission-title">
    <h2 id="mission-title">MISSION</h2>
    <div class="mission-list" role="radiogroup" aria-label="Mission" aria-describedby="mission-desc">${options}</div>
    ${missionDetailsHtml(selected)}
  </section>`;
}

/** Read-only briefing for anyone in the lobby (name + description from the catalogue). */
export function lobbyMissionMarkup(missionId: string | undefined | null): string {
  const m = getMission(resolvedMissionId(missionId));
  return `<section class="missions mission-brief" aria-labelledby="mission-title">
    <h2 id="mission-title">MISSION</h2>
    ${missionBriefingHtml(m.id)}
  </section>`;
}

export function selectedMissionId(root: {
  querySelector: (sel: string) => { value: string } | null;
}): string {
  const el = root.querySelector('input[name="mission"]:checked');
  return resolvedMissionId(el?.value);
}

export function paintMissionDetails(root: ParentNode, id: string | undefined | null): void {
  const mid = resolvedMissionId(id);
  const m = getMission(mid);
  const desc = root.querySelector('#mission-desc');
  const objective = root.querySelector('#mission-objective');
  const meta = root.querySelector('#mission-meta');
  const picked = root.querySelector('.mission-picked');
  const hintEl = root.querySelector<HTMLElement>('#mission-hint');
  const hint = duelBriefingHint(m);
  if (desc) desc.textContent = m.description;
  if (objective) objective.textContent = m.objective;
  if (hintEl) {
    hintEl.textContent = hint ?? '';
    hintEl.hidden = !hint;
  }
  if (meta) meta.textContent = missionMetaLine(m);
  if (picked) picked.textContent = m.name;
  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="mission"]')) {
    input.checked = input.value === mid;
  }
}

export function bindMissionPicker(root: ParentNode, onPick: (id: string) => void): void {
  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="mission"]')) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      const id = resolvedMissionId(input.value);
      paintMissionDetails(root, id);
      onPick(id);
    });
  }
}

export function createMenuScreen(actions: MenuActions, opts: MenuOptions): HTMLElement {
  const missionId = initialMissionId(opts.missionId, prefs.mission());
  const el = html(menuMarkup({ ...opts, missionId }));
  const chaptersBox = $(el, '#chapters');
  const initialChapter = prefs.chapter() ?? opts.content.chapters[0]?.id ?? '';
  const loadout = html(
    `<p class="chapter-loadout" id="chapter-loadout">${chapterLoadoutHtml(opts.content, initialChapter)}</p>`,
  );
  const paintLoadout = (id: string) => {
    loadout.innerHTML = chapterLoadoutHtml(opts.content, id);
  };
  chaptersBox.append(
    createChapterPicker(opts.content, initialChapter || undefined, (id) => {
      prefs.setChapter(id);
      paintLoadout(id);
    }).el,
    loadout,
  );
  $(el, '#meta').append(createVersionsLink());
  if (opts.mixer) $(el, '#mixer').append(createMixerPanel(opts.mixer));
  const name = $<HTMLInputElement>(el, '#name');
  const code = $<HTMLInputElement>(el, '#code');
  const err = $(el, '#err');
  const soloBtn = $<HTMLButtonElement>(el, '#solo');
  const syncSolo = () => {
    const msg = duelSoloMessage(selectedMissionId(el));
    soloBtn.disabled = !!msg;
    if (msg) err.textContent = msg;
    else if (err.textContent === DUEL_SOLO_NEEDED) err.textContent = '';
  };
  bindMissionPicker(el, (id) => {
    prefs.setMission(id);
    syncSolo();
  });
  name.value = storage.get(NAME_KEY, '');
  if (opts.joinCode) code.value = opts.joinCode;
  syncSolo();
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
  $(el, '#solo').addEventListener('click', () => {
    const msg = duelSoloMessage(selectedMissionId(el));
    if (msg) {
      err.textContent = msg;
      return;
    }
    run(() => actions.solo(getName()!, selectedMissionId(el)));
  });
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

/** Menu markup: solo CTA first, host/join grouped under PLAY WITH FRIENDS, controls collapsed. */
export function menuMarkup(
  opts: Pick<MenuOptions, 'baseUrl' | 'content' | 'dedicated' | 'missionId'>,
): string {
  const [main, sub] = splitTitle(opts.content.title);
  return `<div class="screen menu">
    <div class="title">
      <img class="emblem" src="${escapeHtml(opts.baseUrl)}ui/emblem.png" alt="" width="256" height="128">
      <h1>${escapeHtml(main)}${sub ? `<span>: ${escapeHtml(sub)}</span>` : ''}</h1>
      <p class="tagline">${escapeHtml(opts.content.subtitle)}</p>
      <div class="version-tag" id="version">${escapeHtml(versionLabel())}</div>
      ${DEV_PREVIEW ? `<div class="dev-badge" title="Unversioned dev preview — scores go to a separate DEV board">DEV PREVIEW ${escapeHtml(DEV_PREVIEW)}</div>` : ''}
      <div class="scroll">The hive spires have gone dark. Hold the breach until the last bolt is spent.</div>
    </div>
    <div class="cols single">
      <div class="card play">
        <label>CALLSIGN<input id="name" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Marine"></label>
        <label>CHAPTER</label>
        <div id="chapters"></div>
        ${missionPickerMarkup(opts.missionId ?? '')}
        <button id="solo" class="primary">▶ SOLO DEPLOY</button>
        <section class="squad" aria-labelledby="squad-title">
          <h2 id="squad-title">PLAY WITH FRIENDS</h2>
          <button id="host">HOST SQUAD (CO-OP)</button>
          <div class="row join">
            <input id="code" maxlength="8" placeholder="ROOM CODE" aria-label="Room code" autocomplete="off" spellcheck="false">
            <button id="join">JOIN</button>
          </div>
        </section>
        <div class="error" id="err"></div>
        <details class="help">
          <summary>HOW TO PLAY</summary>
          <span class="kbm-only"><b>WASD</b> move · <b>Mouse</b> aim · <b>LMB / Space</b> fire · <b>RMB</b> guard · <b>1-${opts.content.weaponOrder.length}</b> / <b>Q E</b> / wheel switch weapon · <b>R</b> reload · <b>M</b> mute<br></span>
          <span class="touch-only"><b>Left thumb</b> move · <b>Right thumb</b> aim &amp; auto-fire · <b>🛡 GUARD</b> hold (right) · <b>tap a weapon</b> to switch · <b>⟳</b> reload · <b>⛶</b> fullscreen<br></span>
          Stand next to a downed battle-brother to revive them. Wargear unlocks over time; supply crates drop on the map. Plasma runs hot: past the line shots are supercharged, at the top it vents and burns you.
        </details>
        <div id="mixer"></div>
        <div class="muted small" id="meta"><a class="rules-link" href="rules.html">ZASADY / RULES</a> · <a class="rules-link" href="feedback.html">PETYCJE</a>${opts.dedicated ? ' · dedicated host mode' : ' · P2P (browser-hosted)'}</div>
      </div>
    </div>
    <p class="disclaimer">Unofficial, non-commercial fan project. Not affiliated with or endorsed by Games Workshop. Warhammer 40,000 and related marks are trademarks of Games Workshop Ltd. All art and sound here is procedurally generated.</p>
  </div>`;
}

/** "Spacecraft: Hive Siege" -> ["Spacecraft", "Hive Siege"]. */
function splitTitle(t: string): [string, string] {
  const i = t.indexOf(':');
  return i < 0 ? [t, ''] : [t.slice(0, i).trim(), t.slice(i + 1).trim()];
}
