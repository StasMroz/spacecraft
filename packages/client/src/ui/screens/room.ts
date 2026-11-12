import { MAX_PLAYERS, type ClientSession, type ContentRegistry, type LobbyInfo } from '@sms/shared';
import { chapterBadgeSvg, createChapterPicker } from '../chapters.js';
import { prefs } from '../prefs.js';
import { escapeHtml } from '../format.js';
import {
  bindMissionPicker,
  chapterLoadoutHtml,
  duelLobbyAdvice,
  lobbyMissionMarkup,
  missionPickerMarkup,
  paintMissionDetails,
  resolvedMissionId,
} from './menu.js';
import { config } from '../../config.js';
import { buildJoinUrl } from '../../net/joinUrl.js';
import { renderQr } from '../qr.js';
import { $, html } from '../dom.js';

export interface RoomActions {
  leave(): void;
  /** Present for the P2P host only: the room's voice-chat opt-in (CZAT GŁOSOWY). */
  setVoice?(on: boolean): void;
  /** Present for the host: pick a mission while still in the lobby. */
  setMission?(id: string): void;
}

/** Pre-game lobby: room code + QR + share link, player list, owner starts the run. */
export function createRoomScreen(
  session: ClientSession,
  roomCode: string,
  mode: string,
  content: ContentRegistry,
  actions: RoomActions,
): { el: HTMLElement; dispose(): void } {
  const link = buildJoinUrl({
    origin: location.origin,
    base: import.meta.env.BASE_URL,
    code: roomCode,
    dedicated: mode === 'dedicated',
    api: config.apiFromUrl,
  });
  const el = html(`<div class="screen room">
    <div class="card">
      <h2>SQUAD ROOM</h2>
      <div class="share">
        <canvas id="qr" class="qr" width="200" height="200" aria-label="QR code to join this room"></canvas>
        <div class="share-info">
          <div class="code-box"><span class="muted">ROOM CODE</span><div class="code" id="code">${escapeHtml(roomCode)}</div></div>
          <p class="muted small">Scan with a phone camera to join, or share the code / link.</p>
          <div class="row"><input id="link" readonly value="${escapeHtml(link)}"><button id="copy">COPY LINK</button></div>
        </div>
      </div>
      <p class="muted small">Up to ${MAX_PLAYERS} battle-brothers, one chapter each. Each squad size has its own leaderboard.</p>
      <div id="mission-slot"></div>
      <ul class="players" id="players"></ul>
      ${
        mode === 'p2p'
          ? `<div class="voice-row" id="voice-row">${
              actions.setVoice
                ? `<button id="voice" class="voice-toggle" role="switch" aria-checked="false">🎙 CZAT GŁOSOWY: <b>WYŁ.</b></button>`
                : ''
            }<span class="muted small" id="voice-state"></span></div>`
          : ''
      }
      <label>YOUR CHAPTER</label>
      <div id="chapters"></div>
      <div class="row">
        <button id="leave">LEAVE</button>
        <button id="start" class="primary">START MISSION</button>
      </div>
      <div class="muted small" id="hint"></div>
    </div>
  </div>`);
  const qr = $<HTMLCanvasElement>(el, '#qr');
  qr.dataset.url = link;
  void renderQr(qr, link, 200).catch((e) => {
    console.warn('[qr]', e);
    qr.remove();
  });
  const players = $(el, '#players');
  const start = $<HTMLButtonElement>(el, '#start');
  const hint = $(el, '#hint');
  const initialChapter = prefs.chapter() ?? content.chapters[0]?.id ?? '';
  const loadout = html(
    `<p class="chapter-loadout" id="chapter-loadout">${chapterLoadoutHtml(content, initialChapter)}</p>`,
  );
  const paintLoadout = (id: string) => {
    loadout.innerHTML = chapterLoadoutHtml(content, id);
  };
  const picker = createChapterPicker(content, initialChapter || undefined, (id) => {
    prefs.setChapter(id);
    session.selectChapter(id);
    paintLoadout(id);
  });
  $(el, '#chapters').append(picker.el, loadout);
  const missionSlot = $(el, '#mission-slot');
  const canPickMission = !!actions.setMission;
  missionSlot.innerHTML = canPickMission
    ? missionPickerMarkup(resolvedMissionId(session.lobby?.mission))
    : lobbyMissionMarkup(session.lobby?.mission);
  if (canPickMission) {
    bindMissionPicker(missionSlot, (id) => {
      prefs.setMission(id);
      actions.setMission?.(id);
    });
  }
  const render = (l: LobbyInfo | null) => {
    if (!l) return;
    players.innerHTML = Array.from({ length: l.maxPlayers }, (_, i) => {
      const p = l.players[i];
      if (!p) return `<li class="empty">— open slot —</li>`;
      const ch = content.chapter(p.chapter);
      return `<li>${chapterBadgeSvg(ch)}${escapeHtml(p.name)} <span class="muted small">${escapeHtml(ch.name)}</span>${p.id === l.ownerId ? ' <span class="tag">LEADER</span>' : ''}${p.id === session.playerId ? ' <span class="tag you">YOU</span>' : ''}</li>`;
    }).join('');
    const mine = l.players.find((p) => p.id === session.playerId)?.chapter ?? null;
    picker.setTaken(
      new Set(l.players.filter((p) => p.id !== session.playerId).map((p) => p.chapter)),
      mine,
    );
    if (mine !== null) paintLoadout(content.chapter(mine).id);
    picker.el.style.pointerEvents = l.phase === 'lobby' ? '' : 'none';
    const owner = session.isOwner;
    start.style.display = owner ? '' : 'none';
    const advice = duelLobbyAdvice(l.mission, l.players.length);
    start.disabled = l.phase === 'playing' || (owner && advice.blockStart);
    renderVoice(l);
    paintMissionDetails(missionSlot, l.mission);
    if (!owner) hint.textContent = 'Waiting for the squad leader to start…';
    else if (advice.hint) hint.textContent = advice.hint;
    else hint.textContent = `Start when your squad is ready (${l.players.length}/${l.maxPlayers}).`;
  };
  function renderVoice(l: LobbyInfo): void {
    const state = el.querySelector('#voice-state');
    if (!state) return;
    const btn = el.querySelector<HTMLButtonElement>('#voice');
    if (btn) {
      btn.classList.toggle('on', l.voice);
      btn.setAttribute('aria-checked', String(l.voice));
      btn.innerHTML = `🎙 CZAT GŁOSOWY: <b>${l.voice ? 'WŁ.' : 'WYŁ.'}</b>`;
      btn.disabled = l.phase !== 'lobby';
    }
    state.textContent = l.voice
      ? btn
        ? 'Głos włączony dla całego oddziału — każdy dotyka „🎙 GŁOS” u góry, żeby mówić (albo tylko słucha).'
        : '🎙 Czat głosowy włączony — dotknij „🎙 GŁOS” u góry, żeby mówić (albo tylko słuchaj).'
      : btn
        ? 'Głos wyłączony (domyślnie). Włącz, jeśli oddział chce rozmawiać.'
        : '🔇 Czat głosowy wyłączony przez dowódcę.';
  }
  render(session.lobby);
  el.querySelector<HTMLButtonElement>('#voice')?.addEventListener('click', () =>
    actions.setVoice?.(!session.lobby?.voice),
  );
  const off = session.on('lobby', render);
  $(el, '#copy').addEventListener('click', () => {
    const input = $<HTMLInputElement>(el, '#link');
    const done = () => ($(el, '#copy').textContent = 'COPIED');
    input.select();
    if (navigator.clipboard?.writeText)
      void navigator.clipboard.writeText(link).then(done, () => done());
    else {
      // non-secure contexts (LAN dev over http) have no async clipboard
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      done();
    }
  });
  start.addEventListener('click', () => {
    const l = session.lobby;
    if (duelLobbyAdvice(l?.mission, l?.players.length ?? 0).blockStart) return;
    start.disabled = true;
    session.requestStart();
  });
  $(el, '#leave').addEventListener('click', () => actions.leave());
  return { el, dispose: off };
}
