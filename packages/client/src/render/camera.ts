import { ARENA } from '@sms/shared';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Follows a target with smoothing, aim look-ahead and screen shake. */
export class Camera {
  x = ARENA.width / 2;
  y = ARENA.height / 2;
  width = 0;
  height = 0;
  /** Device-independent zoom (world px -> CSS px). */
  zoom = 1;
  /** Current map arena; 0 = not set (no clamp). */
  boundsW = 0;
  boundsH = 0;
  private shake = 0;
  shakeX = 0;
  shakeY = 0;

  setBounds(w: number, h: number): void {
    this.boundsW = w;
    this.boundsH = h;
    this.clampToBounds();
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    // Keep roughly the same visible world area across screen sizes.
    this.zoom = Math.max(0.6, Math.min(1.3, Math.sqrt((w * h) / (1500 * 900))));
    this.clampToBounds();
  }

  addShake(amount: number): void {
    this.shake = Math.min(24, this.shake + amount);
  }

  follow(tx: number, ty: number, dt: number, snap = false): void {
    const k = snap ? 1 : 1 - Math.exp(-dt * 10);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.clampToBounds();
    this.shake *= Math.exp(-dt * 9);
    this.shakeX = (Math.random() * 2 - 1) * this.shake;
    this.shakeY = (Math.random() * 2 - 1) * this.shake;
  }

  /** Keep the view on the map when the arena is larger than the viewport. */
  clampToBounds(): void {
    if (!(
      this.boundsW > 0 &&
      this.boundsH > 0 &&
      this.zoom > 0 &&
      this.width > 0 &&
      this.height > 0
    ))
      return;
    const hw = this.width / 2 / this.zoom;
    const hh = this.height / 2 / this.zoom;
    if (this.boundsW > 2 * hw) this.x = clamp(this.x, hw, this.boundsW - hw);
    else this.x = this.boundsW / 2;
    if (this.boundsH > 2 * hh) this.y = clamp(this.y, hh, this.boundsH - hh);
    else this.y = this.boundsH / 2;
  }

  /** Screen (CSS px) -> world. */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.width / 2) / this.zoom + this.x,
      y: (sy - this.height / 2) / this.zoom + this.y,
    };
  }

  /** Visible world rect with margin. */
  view(margin = 0): { x0: number; y0: number; x1: number; y1: number } {
    const hw = this.width / 2 / this.zoom + margin;
    const hh = this.height / 2 / this.zoom + margin;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }
}
