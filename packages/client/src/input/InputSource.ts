/**
 * Input abstraction. Every device (keyboard+mouse, touch, later gamepad) is an InputSource
 * that reports the same normalized player intent. GameClient only talks to the
 * InputManager, so simulation and netcode never know which device is in use.
 */

export type InputKind = 'kbm' | 'touch';

/**
 * Where the player wants to aim:
 *  - `screen`: a point in CSS px (mouse cursor); the client turns it into a world angle
 *    relative to the marine, exactly like before the abstraction existed.
 *  - `angle`: an absolute direction in radians (touch aim stick).
 */
export type AimIntent = { kind: 'screen'; x: number; y: number } | { kind: 'angle'; angle: number };

/** Continuous state, sampled every tick/frame. */
export interface ContinuousIntent {
  /** Movement vector, each axis -1..1 (length <= ~1.41 for keyboard diagonals). */
  move: { x: number; y: number };
  /** Null = no aim input right now (keep the previous aim). */
  aim: AimIntent | null;
  fire: boolean;
  /** Sprint requested (Shift held / touch move stick in the sprint band). */
  sprint: boolean;
  /** Defensive stance requested (RMB / touch GUARD hold). Only works while standing still. */
  guard: boolean;
}

/** Discrete actions latched until consumed so taps between ticks are never lost. */
export interface ActionIntent {
  /** Weapon slot requested (1-based), 0 = none. */
  slot: number;
  /** Cycle weapons: -1 previous, +1 next, 0 none. */
  cycle: number;
  reload: boolean;
  /** Call a drop-pod reinforcement (X / HUD tap). */
  reinforce?: boolean;
}

export const NO_ACTIONS: ActionIntent = { slot: 0, cycle: 0, reload: false };

export interface InputSource {
  readonly kind: InputKind;
  read(): ContinuousIntent;
  /** Returns and clears latched actions. */
  takeActions(): ActionIntent;
  dispose(): void;
}

/** Resolves slot/cycle requests against the owned weapon slots. 0 = no change. */
export function resolveSlot(a: ActionIntent, ownedSlots: number[], currentSlot: number): number {
  if (a.slot) return a.slot;
  if (a.cycle && ownedSlots.length > 1) {
    const idx = ownedSlots.indexOf(currentSlot);
    return ownedSlots[(idx + a.cycle + ownedSlots.length) % ownedSlots.length];
  }
  return 0;
}

/** Merges discrete actions from several sources (later sources win on conflicts). */
export function mergeActions(list: ActionIntent[]): ActionIntent {
  const out = { ...NO_ACTIONS };
  for (const a of list) {
    if (a.slot) out.slot = a.slot;
    if (a.cycle) out.cycle = a.cycle;
    if (a.reload) out.reload = true;
    if (a.reinforce) out.reinforce = true;
  }
  return out;
}
