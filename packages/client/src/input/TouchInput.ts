import { MARINE_SPRINT } from '@sms/shared';
import {
  NO_ACTIONS,
  type ActionIntent,
  type ContinuousIntent,
  type InputSource,
} from './InputSource.js';
import { canFullscreen, isFullscreen, requestLandscape } from './orientation.js';
import { VirtualStick, type StickVector } from './joystick.js';
import {
  hitTouchPad,
  touchPadLayout,
  type TouchHit,
  type TouchPadLayout,
} from './touchControls.js';

/** Tuning for the twin-stick layout (CSS px). */
export const TOUCH_TUNING = {
  move: { radius: 60, deadzone: 0.12 },
  /**
   * Stick-edge sprint: push the move thumb past the stick's ring into the outer "sprint zone"
   * (≥ enter × radius) to sprint while held there; back inside exit × radius stops it
   * (hysteresis). The origin only starts following past outer × radius.
   */
  sprintZone: { enter: 1.2, exit: 1.08, outer: 1.5 },
  aim: { radius: 60, deadzone: 0.2 },
  /** Fire once the aim stick magnitude (after deadzone) reaches this. 0 = as soon as it's past the deadzone. */
  fireThreshold: 0,
};

/**
 * Maps the two stick vectors to the normalized intent (pure, unit tested):
 *  - left stick: movement (analog)
 *  - right stick: aim direction + auto-fire while pushed past the deadzone
 *  - aim stick idle but moving: face the movement direction (no fire)
 */
export function touchIntent(
  move: StickVector,
  aim: StickVector,
  fireThreshold = TOUCH_TUNING.fireThreshold,
): ContinuousIntent {
  const m = move.active ? { x: move.x, y: move.y } : { x: 0, y: 0 };
  if (aim.active)
    return {
      move: m,
      aim: { kind: 'angle', angle: aim.angle },
      fire: aim.mag >= fireThreshold,
      sprint: false,
      guard: false,
    };
  if (move.active)
    return {
      move: m,
      aim: { kind: 'angle', angle: move.angle },
      fire: false,
      sprint: false,
      guard: false,
    };
  return { move: m, aim: null, fire: false, sprint: false, guard: false };
}

/** Stick-edge sprint with hysteresis (pure, unit tested). `reach` = thumb distance in radii. */
export function stickSprint(
  reach: number,
  wasOn: boolean,
  zone = TOUCH_TUNING.sprintZone,
): boolean {
  return reach >= (wasOn ? zone.exit : zone.enter);
}

/**
 * Touch sprint: hold the SPRINT button above the right AIM·FIRE stick.
 * (The leftover stick-edge helper `stickSprint` is unused on the live path.)
 */
export class TouchSprint {
  held = false;
  get on(): boolean {
    return this.held;
  }
  setHeld(v: boolean): void {
    this.held = v;
  }
  reset(): void {
    this.held = false;
  }
}

/** What the move stick's outer sprint band shows (v0.6.0 hotfix feedback). */
export type StickSprintMode = 'off' | 'on' | 'noStamina' | 'fire';

/** The sim's view of our sprint, for the stick feedback (predicted state). */
export interface StickSprintSim {
  sprinting: boolean;
  stamina: number;
  /** The fire input is held (blocks the start of a sprint). */
  fire: boolean;
}

/**
 * Move-stick feedback (pure, unit tested):
 *  - `maxWalk`: the thumb is at/after the stick radius = full walking speed (stickVector saturates);
 *  - `sprintMode`: 'on' only while the sim actually sprints; 'noStamina' / 'fire' while a sprint
 *    could not start (stamina below minToStartS, trigger held); else 'off'.
 * Between the radius (max walk) and sprintZone.enter × radius there is a dead gap, so pushing to
 * full speed doesn't trigger a sprint by accident.
 */
export function moveStickFeedback(
  reach: number,
  sim: StickSprintSim | null,
): { maxWalk: boolean; sprintMode: StickSprintMode } {
  const maxWalk = reach >= 1 - 1e-6;
  if (!sim) return { maxWalk, sprintMode: 'off' };
  if (sim.sprinting) return { maxWalk, sprintMode: 'on' };
  if (sim.stamina < MARINE_SPRINT.minToStartS) return { maxWalk, sprintMode: 'noStamina' };
  if (sim.fire) return { maxWalk, sprintMode: 'fire' };
  return { maxWalk, sprintMode: 'off' };
}

/** Which stick a new touch starts: left half moves, right half aims. */
export function zoneFor(x: number, width: number): 'move' | 'aim' {
  return x < width / 2 ? 'move' : 'aim';
}

export interface StickView {
  kind: 'move' | 'aim';
  engaged: boolean;
  origin: { x: number; y: number };
  knob: { x: number; y: number };
  radius: number;
  active: boolean;
  /** Move stick only: sprint band inner radius (CSS px, sprint trigger) and outer edge. */
  sprintRing?: number;
  sprintOuter?: number;
  /** Move stick only: thumb at full walking speed (at/after the radius). */
  maxWalk?: boolean;
  /** Move stick only: what the sprint band shows (lit only while really sprinting). */
  sprintMode?: StickSprintMode;
}

export interface TouchPadView {
  sprintHeld: boolean;
  wheelOpen: boolean;
  hoverSlot: number;
}

export interface TouchInputOptions {
  /** Hit-test against the SPRINT button, the weapon wheel, or (legacy) HUD widgets. */
  hitControl?: (x: number, y: number, wheelOpen: boolean) => TouchHit | null;
  /** @deprecated column of weapon slots; the wheel replaces it on touch. */
  hitSlot?: (x: number, y: number) => number;
  /** System buttons. */
  onButton?: (action: 'mute' | 'menu') => void;
}

/**
 * Twin-stick touch controls on a full-screen overlay: floating sticks on each half,
 * a holdable SPRINT button and a weapon wheel above the right AIM·FIRE stick,
 * buttons for reload / mute / fullscreen, and a holdable GUARD on the right.
 * Only visible in `body.touch-mode` (see device.ts).
 */
export class TouchInput implements InputSource {
  readonly kind = 'touch' as const;
  readonly layer: HTMLElement;
  readonly moveStick = new VirtualStick({
    ...TOUCH_TUNING.move,
    follow: true,
    outer: TOUCH_TUNING.sprintZone.outer,
  });
  readonly aimStick = new VirtualStick({ ...TOUCH_TUNING.aim, follow: true });
  private latched: ActionIntent = { ...NO_ACTIONS };
  /** Sprint: hold the SPRINT button above AIM·FIRE. */
  readonly sprint = new TouchSprint();
  private sprintTouchId: number | null = null;
  /** Weapon wheel above the sprint button (tap/hold the handle, pick a slice). */
  wheelOpen = false;
  hoverSlot = 0;
  private wheelTouchId: number | null = null;
  /** Defensive stance held via the right-side GUARD button. */
  private guardHeld = false;
  private listeners: Array<() => void> = [];
  onActivity: (() => void) | null = null;

  constructor(
    host: HTMLElement,
    private readonly opts: TouchInputOptions = {},
  ) {
    const canFs = canFullscreen();
    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    this.layer.innerHTML = `
      <div class="touch-buttons">
        <button class="tb" data-act="menu" aria-label="Menu / leave game">⏸</button>
        <button class="tb" data-act="mute" aria-label="Mute">🔊</button>
        <button class="tb main" data-act="reload" aria-label="Reload">⟳<span>RELOAD</span></button>
        ${canFs ? '<button class="tb" data-act="fullscreen" aria-label="Fullscreen">⛶</button>' : ''}
      </div>
      <button class="tb hold guard-btn" data-act="guard" aria-label="Defensive stance (hold)">▣<span>GUARD</span></button>`;
    host.append(this.layer);

    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Document | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts: AddEventListenerOptions = { passive: false },
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.listeners.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };

    on(this.layer, 'touchstart', (e) => this.onStart(e));
    on(this.layer, 'touchmove', (e) => this.onMove(e));
    on(this.layer, 'touchend', (e) => this.onEnd(e));
    on(this.layer, 'touchcancel', (e) => this.onEnd(e));
    // No long-press menus / pull-to-refresh / pinch while playing.
    on(this.layer, 'contextmenu', (e) => e.preventDefault());
    // …but menus / the game-over summary drawn over the canvas (#ui) must stay touch-scrollable.
    on(document, 'touchmove', (e) => {
      if (!isInScrollableUi(e.target)) e.preventDefault();
    });
    on(document, 'gesturestart' as keyof HTMLElementEventMap, (e) => e.preventDefault());

    this.layer.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
      const act = b.dataset.act!;
      if (act === 'guard') {
        const down = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          this.guardHeld = true;
          b.classList.add('pressed');
        };
        const up = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          this.guardHeld = false;
          b.classList.remove('pressed');
        };
        on(b, 'touchstart', down);
        on(b, 'touchend', up);
        on(b, 'touchcancel', up);
        on(b, 'pointerdown', down);
        on(document, 'pointerup', up);
        return;
      }
      const fire = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.button(act, b);
      };
      on(b, 'touchstart', fire);
      on(b, 'click', fire);
    });
  }

  private button(act: string, b: HTMLButtonElement): void {
    if (act === 'reload') this.latched.reload = true;
    else if (act === 'mute') this.opts.onButton?.('mute');
    else if (act === 'menu') this.opts.onButton?.('menu');
    else if (act === 'fullscreen') void toggleFullscreen();
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 120);
  }

  setMuted(muted: boolean): void {
    const b = this.layer.querySelector('[data-act="mute"]');
    if (b) b.textContent = muted ? '🔇' : '🔊';
  }

  padLayout(): TouchPadLayout {
    const w = this.layer.clientWidth || window.innerWidth;
    const h = this.layer.clientHeight || window.innerHeight;
    return touchPadLayout(w, h);
  }

  pad(): TouchPadView {
    return { sprintHeld: this.sprint.on, wheelOpen: this.wheelOpen, hoverSlot: this.hoverSlot };
  }

  private hit(x: number, y: number): TouchHit | null {
    if (this.opts.hitControl) return this.opts.hitControl(x, y, this.wheelOpen);
    const slot = this.opts.hitSlot?.(x, y) ?? 0;
    if (slot) return { kind: 'slot', slot };
    return hitTouchPad(this.padLayout(), x, y, { wheelOpen: this.wheelOpen, slots: [] });
  }

  private onStart(e: TouchEvent): void {
    e.preventDefault();
    this.onActivity?.();
    const w = this.layer.clientWidth || window.innerWidth;
    for (const t of Array.from(e.changedTouches)) {
      const hit = this.hit(t.clientX, t.clientY);
      if (hit?.kind === 'sprint') {
        this.sprint.setHeld(true);
        this.sprintTouchId = t.identifier;
        continue;
      }
      if (hit?.kind === 'slot') {
        this.latched.slot = hit.slot;
        this.wheelOpen = false;
        this.hoverSlot = 0;
        this.wheelTouchId = null;
        continue;
      }
      if (hit?.kind === 'wheel') {
        this.wheelOpen = !this.wheelOpen;
        this.wheelTouchId = this.wheelOpen ? t.identifier : null;
        this.hoverSlot = 0;
        continue;
      }
      if (this.wheelOpen) {
        this.wheelOpen = false;
        this.hoverSlot = 0;
      }
      const stick = zoneFor(t.clientX, w) === 'move' ? this.moveStick : this.aimStick;
      if (!stick.engaged) stick.begin(t.identifier, t.clientX, t.clientY);
    }
  }

  private onMove(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.wheelTouchId && this.wheelOpen) {
        const hit = this.hit(t.clientX, t.clientY);
        this.hoverSlot = hit?.kind === 'slot' ? hit.slot : 0;
        continue;
      }
      if (t.identifier === this.sprintTouchId) continue;
      for (const s of [this.moveStick, this.aimStick])
        if (s.touchId === t.identifier) s.move(t.clientX, t.clientY);
    }
  }

  private onEnd(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.sprintTouchId) {
        this.sprint.setHeld(false);
        this.sprintTouchId = null;
        continue;
      }
      if (t.identifier === this.wheelTouchId) {
        const hit = this.hit(t.clientX, t.clientY);
        if (hit?.kind === 'slot') {
          this.latched.slot = hit.slot;
          this.wheelOpen = false;
        }
        this.hoverSlot = 0;
        this.wheelTouchId = null;
        continue;
      }
      for (const s of [this.moveStick, this.aimStick]) if (s.touchId === t.identifier) s.end();
    }
  }

  read(): ContinuousIntent {
    const intent = touchIntent(this.moveStick.vector, this.aimStick.vector);
    intent.sprint = this.sprint.on;
    intent.guard = this.guardHeld;
    return intent;
  }

  takeActions(): ActionIntent {
    const a = this.latched;
    this.latched = { ...NO_ACTIONS };
    return a;
  }

  sticks(sim: StickSprintSim | null = null): StickView[] {
    return (
      [
        ['move', this.moveStick],
        ['aim', this.aimStick],
      ] as const
    ).map(([kind, s]) => ({
      kind,
      engaged: s.engaged,
      origin: { x: s.originX, y: s.originY },
      knob: s.knob,
      radius: s.opts.radius,
      active: s.vector.active,
      ...(kind === 'move' ? { ...moveStickFeedback(s.reach, sim) } : {}),
    }));
  }

  /** Releases both sticks (e.g. when the window loses focus). */
  reset(): void {
    this.moveStick.end();
    this.aimStick.end();
    this.sprint.reset();
    this.sprintTouchId = null;
    this.wheelOpen = false;
    this.hoverSlot = 0;
    this.wheelTouchId = null;
    this.guardHeld = false;
    this.layer.querySelector('[data-act="guard"]')?.classList.remove('pressed');
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners = [];
    this.layer.remove();
  }
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (isFullscreen()) {
      const doc = document as Document & { webkitExitFullscreen?: () => unknown };
      if (document.exitFullscreen) await document.exitFullscreen();
      else await doc.webkitExitFullscreen?.();
    } else {
      await requestLandscape();
    }
  } catch {
    /* not allowed (e.g. iOS Safari) — ignore */
  }
}

/** Touches inside the visible #ui overlay (menus, game-over summary) scroll normally. */
export function isInScrollableUi(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return !!el && typeof el.closest === 'function' && !!el.closest('#ui:not(.hidden)');
}
