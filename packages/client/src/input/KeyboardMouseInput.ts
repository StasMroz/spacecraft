import type { ActionIntent, ContinuousIntent, InputSource } from './InputSource.js';

/**
 * Keyboard + mouse: WASD/arrows move, mouse aims, LMB/Space fires, Shift (hold) sprints, RMB (hold) defensive stance,
 * 1-9 / Q E / wheel switch weapons, R reloads, X calls a reinforcement pod.
 */
export class KeyboardMouseInput implements InputSource {
  readonly kind = 'kbm' as const;
  private keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  /** RMB held = defensive stance. */
  mouseRight = false;
  /** True once the mouse has moved over the page (so we have a real aim point). */
  hasPointer = false;
  private latchedSlot = 0;
  private latchedReload = false;
  private latchedReinforce = false;
  private latchedCycle = 0;
  private listeners: Array<() => void> = [];
  /** Extra key handlers (e.g. M = mute, F3 = debug). */
  onKey: ((code: string) => void) | null = null;
  /** Called on any keyboard / real mouse activity (device auto-detection). */
  onActivity: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(
      target: Window | HTMLElement,
      type: K,
      fn: (e: WindowEventMap[K]) => void,
    ) => {
      target.addEventListener(type, fn as EventListener);
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(window, 'keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (/^Digit[1-9]$/.test(e.code)) this.latchedSlot = Number(e.code.slice(5));
      if (e.code === 'KeyR') this.latchedReload = true;
      if (e.code === 'KeyX') this.latchedReinforce = true;
      if (e.code === 'KeyQ') this.latchedCycle = -1;
      if (e.code === 'KeyE') this.latchedCycle = 1;
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.onKey?.(e.code);
      this.onActivity?.();
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.mouseRight = false;
    });
    on(window, 'mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      this.hasPointer = true;
    });
    // Pointer events tell real mice apart from touch-emulated mouse events.
    on(window, 'pointermove', (e) => {
      if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) this.onActivity?.();
    });
    on(canvas, 'mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouseRight = true;
    });
    on(window, 'mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRight = false;
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(canvas, 'wheel', (e) => {
      this.latchedCycle = e.deltaY > 0 ? 1 : -1;
    });
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  read(): ContinuousIntent {
    const x =
      (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) -
      (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    const y =
      (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0) -
      (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0);
    return {
      move: { x, y },
      aim: { kind: 'screen', x: this.mouseX, y: this.mouseY },
      fire: this.mouseDown || this.down('Space'),
      sprint: this.down('ShiftLeft') || this.down('ShiftRight'),
      guard: this.mouseRight,
    };
  }

  takeActions(): ActionIntent {
    const a = {
      slot: this.latchedSlot,
      cycle: this.latchedCycle,
      reload: this.latchedReload,
      reinforce: this.latchedReinforce,
    };
    this.latchedSlot = 0;
    this.latchedCycle = 0;
    this.latchedReload = false;
    this.latchedReinforce = false;
    return a;
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners = [];
  }
}

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
};
