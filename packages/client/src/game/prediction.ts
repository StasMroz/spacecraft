import {
  isMoving,
  marineSprintSpeed,
  newSprintState,
  stepPlayerMovement,
  stepSprint,
  TICK_DT,
  type ArenaSize,
  type PlayerInput,
  type WallDef,
  type SprintState,
} from '@sms/shared';

interface PendingInput {
  input: PlayerInput;
  /** Walking speed for this tick (weapon carry + firing slow-down), used when not sprinting. */
  walk: number;
  canMove: boolean;
  /** Sprint allowed (host supports it, not reviving a squadmate). */
  sprintOk: boolean;
}

/**
 * Client-side prediction for the local marine's movement. Inputs are applied
 * immediately with the same pure function the host uses; when a snapshot
 * arrives we rewind to the authoritative position and replay unacknowledged
 * inputs. A decaying visual offset hides small corrections.
 */
export class Predictor {
  pos = { x: 0, y: 0 };
  /** Map playfield + walls (incl. wreck walls from the latest snapshot); undefined = wave map. */
  field: { arena: ArenaSize; walls: readonly WallDef[] } | undefined;
  /** Position before the latest predicted tick (for sub-tick render blending). */
  prev = { x: 0, y: 0 };
  /** Predicted sprint state (same pure state machine as the host; rewound on every snapshot). */
  sprint: SprintState = newSprintState();
  private pending: PendingInput[] = [];
  private initialized = false;
  /** Visual error offset that decays to 0. */
  private errX = 0;
  private errY = 0;
  /** Largest correction seen recently (debug overlay). */
  lastCorrection = 0;

  get ready(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.pending = [];
    this.initialized = false;
    this.errX = this.errY = 0;
    this.sprint = newSprintState();
  }

  /**
   * Apply a freshly sent input locally. Steps the sprint state first (like the host), then asks
   * `walkSpeed` for the non-sprint speed (it may depend on the sprint state, e.g. the trigger is
   * ignored right after a sprint so it mustn't slow us down).
   */
  applyLocal(
    input: PlayerInput,
    walkSpeed: number | ((s: SprintState) => number),
    canMove: boolean,
    sprintOk = true,
  ): void {
    if (!this.initialized) return;
    this.prev = { ...this.pos };
    if (canMove) this.stepSprintFor(input, sprintOk);
    const walk = typeof walkSpeed === 'number' ? walkSpeed : walkSpeed(this.sprint);
    this.pending.push({ input, walk, canMove, sprintOk });
    if (this.pending.length > 120) this.pending.shift();
    if (canMove)
      stepPlayerMovement(this.pos, input.mx, input.my, this.speed(walk), TICK_DT, this.field);
  }

  private stepSprintFor(input: PlayerInput, sprintOk: boolean): void {
    stepSprint(
      this.sprint,
      input.sprint === true,
      isMoving(input.mx, input.my),
      sprintOk,
      TICK_DT,
      input.fire === true,
    );
  }

  private speed(walk: number): number {
    return this.sprint.sprinting ? marineSprintSpeed() : walk;
  }

  /**
   * Reconcile with the authoritative state for our player. `sprint` = the host's sprint state
   * at `ackSeq` (omitted by hosts without sprint support: the local state is then kept).
   */
  reconcile(
    serverX: number,
    serverY: number,
    ackSeq: number,
    canMove: boolean,
    sprint?: SprintState,
  ): void {
    if (sprint) this.sprint = { ...sprint };
    if (!this.initialized) {
      this.pos = { x: serverX, y: serverY };
      this.prev = { ...this.pos };
      this.initialized = true;
      return;
    }
    const before = { ...this.pos };
    this.pending = this.pending.filter((p) => p.input.seq > ackSeq);
    const next = { x: serverX, y: serverY };
    if (canMove)
      for (const p of this.pending) {
        if (!p.canMove) continue;
        if (sprint) this.stepSprintFor(p.input, p.sprintOk);
        stepPlayerMovement(next, p.input.mx, p.input.my, this.speed(p.walk), TICK_DT, this.field);
      }
    const dx = before.x - next.x;
    const dy = before.y - next.y;
    const err = Math.hypot(dx, dy);
    this.lastCorrection = err;
    if (err > 120) {
      // Teleport-sized error (e.g. revive / desync): snap.
      this.errX = this.errY = 0;
      this.prev = { ...next };
    } else {
      this.errX += dx;
      this.errY += dy;
      this.prev.x -= dx;
      this.prev.y -= dy;
    }
    this.pos = next;
  }

  /** Render position: blend prev->pos by sub-tick alpha plus the decaying error. */
  renderPos(alpha: number, dt: number): { x: number; y: number } {
    const k = Math.exp(-dt * 12);
    this.errX *= k;
    this.errY *= k;
    return {
      x: this.prev.x + (this.pos.x - this.prev.x) * alpha + this.errX,
      y: this.prev.y + (this.pos.y - this.prev.y) * alpha + this.errY,
    };
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
