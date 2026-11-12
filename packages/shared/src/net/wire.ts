import { NET } from '../constants.js';
import { RECOIL_WIRE } from '../data/recoil.js';
import type {
  EnemySnap,
  AcidSnap,
  AllySnap,
  CrashSnap,
  WreckSnap,
  PickupSnap,
  PlayerSnap,
  ProjectileSnap,
  Snapshot,
} from '../sim/snapshot.js';
import type { GameEvent } from '../sim/types.js';

/**
 * Stateful wire codec for one link (protocol v5). See docs/ARCHITECTURE.md "Network".
 *
 * - Every message except `snap` is a JSON string (unchanged from v4).
 * - `snap` is a compact binary frame, delta-encoded against what was previously sent on the
 *   same link (links are reliable + ordered, so no acks are needed):
 *   - numbers are zig-zag varints of the snapshot's already-rounded fixed-point values, so
 *     decoding is lossless vs the JSON snapshot (x/y 0.1 px, angles 0.01 rad, marines 0.01 px);
 *   - players, enemies and projectiles are id-keyed tables. Both ends extrapolate positions
 *     with each entity's last per-snapshot movement; only corrections to that prediction are
 *     sent, field by field behind a bit mask, so a bolt in flight or a still enemy costs 0 B;
 *   - strings (names, weapon / enemy / pickup ids) are interned per link and sent once;
 *   - shot / hit / die events (the bulk) are binary, rare events stay JSON;
 *   - interest management: once the codec knows its link's marine (from `welcome`),
 *     enemies / projectiles outside NET.interest around that marine only get corrections
 *     every `farEvery`-th snapshot (still extrapolated in between: minimap stays live).
 *
 * The host's codec (encode) and the client's codec (decode) of a link mirror each other's
 * state; both reset on `start`. Use one instance per link end.
 */
export interface WireCodec {
  encode(msg: unknown): string | Uint8Array;
  decode(data: unknown): unknown;
}

/** Optional per-section byte counters (diagnostics, e.g. scripts/net-load.ts). */
export type WireStats = Record<
  'header' | 'players' | 'enemies' | 'projectiles' | 'pickups' | 'events',
  number
>;

const MAGIC = 0x5a;
const ALLY_SCALES = [1, 10, 10, 100, 1, 1];
const CRASH_SCALES = [10, 10, 1, 10, 100];

class Writer {
  buf = new Uint8Array(4096);
  n = 0;
  private room(k: number): void {
    if (this.n + k <= this.buf.length) return;
    let len = this.buf.length * 2;
    while (len < this.n + k) len *= 2;
    const b = new Uint8Array(len);
    b.set(this.buf.subarray(0, this.n));
    this.buf = b;
  }
  u8(v: number): void {
    this.room(1);
    this.buf[this.n++] = v & 0xff;
  }
  /** Unsigned LEB128 (non-negative integers up to 2^53). */
  uv(v: number): void {
    this.room(8);
    while (v >= 0x80) {
      this.buf[this.n++] = (v % 0x80) | 0x80;
      v = Math.floor(v / 0x80);
    }
    this.buf[this.n++] = v;
  }
  /** Zig-zag signed varint. */
  sv(v: number): void {
    this.uv(v < 0 ? -2 * v - 1 : 2 * v);
  }
  bytes(b: Uint8Array): void {
    this.uv(b.length);
    this.room(b.length);
    this.buf.set(b, this.n);
    this.n += b.length;
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.n);
  }
}

class Reader {
  i = 0;
  constructor(private readonly b: Uint8Array) {}
  u8(): number {
    if (this.i >= this.b.length) throw new Error('wire: truncated');
    return this.b[this.i++];
  }
  uv(): number {
    let v = 0;
    let mul = 1;
    for (;;) {
      const c = this.u8();
      v += (c & 0x7f) * mul;
      if (c < 0x80) return v;
      mul *= 0x80;
    }
  }
  sv(): number {
    const z = this.uv();
    return z % 2 ? -(z + 1) / 2 : z / 2;
  }
  bytes(): Uint8Array {
    const n = this.uv();
    if (this.i + n > this.b.length) throw new Error('wire: truncated');
    const out = this.b.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const fx = (v: number, scale: number) => Math.round(v * scale);
/** Values the binary path carries exactly (finite and already rounded to `scale`). */
const exact = (v: number, scale: number) =>
  Number.isFinite(v) && Math.abs(v * scale - Math.round(v * scale)) < 1e-6;

/** Per-link interning table; new strings of a snapshot are sent in its header. */
class Symbols {
  private ids = new Map<string, number>();
  list: string[] = [];
  private fresh: string[] = [];
  id(s: string): number {
    let i = this.ids.get(s);
    if (i === undefined) {
      i = this.list.length;
      this.ids.set(s, i);
      this.list.push(s);
      this.fresh.push(s);
    }
    return i;
  }
  /** Writes (and forgets) the strings interned since the last call. */
  flush(w: Writer): void {
    w.uv(this.fresh.length);
    for (const s of this.fresh) w.bytes(enc.encode(s));
    this.fresh = [];
  }
  readNew(r: Reader): void {
    for (let n = r.uv(); n > 0; n--) this.list.push(dec.decode(r.bytes()));
  }
  get(i: number): string {
    const s = this.list[i];
    if (s === undefined) throw new Error('wire: unknown symbol');
    return s;
  }
}

/** An id-keyed table of fixed-point integer rows (one per link end). */
interface TableSpec {
  /** Fields that both ends extrapolate with the last per-snapshot movement. */
  predict: number[];
  /** Field indices of x / y for interest culling (-1 = never culled). */
  posX: number;
  posY: number;
  /** Largest per-snapshot move (fixed-point units) worth extrapolating; bigger = a jump. */
  maxStep: number;
}
/** Teleports / leaps are not extrapolated (a culled row would otherwise drift away). */
const step = (d: number, spec: TableSpec) => (Math.abs(d) > spec.maxStep ? 0 : d);
interface Entry {
  /** Current value as both ends know it (exact, or extrapolated while culled). */
  v: number[];
  /** Per-snapshot movement used to extrapolate the predict fields. */
  d: number[];
  /** Value when the row was last mentioned, and snapshots since then. */
  last: number[];
  age: number;
}
const newEntry = (cur: number[]): Entry => ({
  v: cur.slice(),
  d: cur.map(() => 0),
  last: cur.slice(),
  age: 0,
});
/**
 * Both ends, for every mentioned (corrected) row: the movement estimate is the average
 * since the row was last mentioned, so a row refreshed after being culled for a few
 * snapshots does not inherit its accumulated extrapolation error as velocity.
 */
function remeasure(e: Entry, spec: TableSpec): void {
  for (const k of spec.predict) e.d[k] = step(Math.round((e.v[k] - e.last[k]) / e.age), spec);
  e.last = e.v.slice();
  e.age = 0;
}
type Table = Map<number, Entry>;

const ENEMY_SCALES = [1, 10, 10, 100, 1, 1]; // type, x, y, angle, hp%, flags
const PROJ_SCALES = [1, 10, 10, 100]; // kind, x, y, angle
const ENEMY_SPEC: TableSpec = { predict: [1, 2], posX: 1, posY: 2, maxStep: 600 };
const PROJ_SPEC: TableSpec = { predict: [1, 2, 3], posX: 1, posY: 2, maxStep: 3000 };
const PLAYER_SPEC: TableSpec = { predict: [2, 3, 14], posX: -1, posY: -1, maxStep: Infinity };

type Box = { x: number; y: number; s: number } | null;

/** Both ends: advance every known row by its predicted movement before reading/writing. */
function predictAll(t: Table, spec: TableSpec): void {
  for (const e of t.values()) {
    e.age++;
    for (const k of spec.predict) e.v[k] += e.d[k];
  }
}

function writeTable(
  w: Writer,
  rows: Array<[number, number[]]>,
  spec: TableSpec,
  t: Table,
  box: Box,
  seq: number,
): void {
  predictAll(t, spec);
  const seen = new Set<number>();
  for (const [id] of rows) seen.add(id);
  const removed: number[] = [];
  for (const id of t.keys()) if (!seen.has(id)) removed.push(id);
  w.uv(removed.length);
  let last = 0;
  for (const id of removed) {
    t.delete(id);
    w.sv(id - last);
    last = id;
  }
  const out: Array<[number, number, number[]]> = [];
  for (const [id, cur] of rows) {
    const e = t.get(id);
    if (!e) {
      out.push([id, 1, cur]);
      t.set(id, newEntry(cur));
      continue;
    }
    // Far from this link's marine: corrections only on the entity's turn.
    if (
      box &&
      spec.posX >= 0 &&
      (Math.abs(cur[spec.posX] - box.x) > NET.interest.halfWidth * box.s ||
        Math.abs(cur[spec.posY] - box.y) > NET.interest.halfHeight * box.s) &&
      (id + seq) % NET.interest.farEvery !== 0
    )
      continue;
    let mask = 0;
    const corr = cur.map((v, k) => v - e.v[k]);
    for (let k = 0; k < cur.length; k++) if (corr[k] !== 0) mask |= 2 << k;
    if (!mask) continue; // exactly as predicted: nothing to send, nothing to update
    e.v = cur.slice();
    remeasure(e, spec);
    out.push([id, mask, corr]);
  }
  w.uv(out.length);
  last = 0;
  for (const [id, mask, vals] of out) {
    w.sv(id - last);
    last = id;
    w.uv(mask);
    for (let k = 0; k < vals.length; k++) if (mask & 1 || mask & (2 << k)) w.sv(vals[k]);
  }
}

function readTable(r: Reader, nf: number, spec: TableSpec, t: Table): Array<[number, number[]]> {
  predictAll(t, spec);
  let last = 0;
  for (let n = r.uv(); n > 0; n--) {
    last += r.sv();
    t.delete(last);
  }
  last = 0;
  for (let n = r.uv(); n > 0; n--) {
    last += r.sv();
    const mask = r.uv();
    if (mask & 1) {
      const cur: number[] = [];
      for (let k = 0; k < nf; k++) cur.push(r.sv());
      t.set(last, newEntry(cur));
      continue;
    }
    const e = t.get(last);
    if (!e) throw new Error('wire: delta for unknown entity');
    for (let k = 0; k < nf; k++) if (mask & (2 << k)) e.v[k] += r.sv();
    remeasure(e, spec);
  }
  return [...t].map(([id, e]) => [id, e.v.slice()]);
}

// ---- players: numeric rows with interned strings ----
const PF = { br: 1, vt: 2, ht: 4, sp: 8, sd: 16, gd: 1 << 13 } as const;
/**
 * Sprint data rides in the flags field above the boolean bits so protocol v5 stays compatible
 * (older clients only test bits 1/2/4): stamina in 1/100 s (9 bits) and the post-sprint weapon
 * delay in 1/100 s (7 bits). PF.sd marks that the host sent sprint data at all.
 */
const PF_STM_SHIFT = 5;
/** 8 bits (max 2.55 s); bit 13 of flags is PF.gd (was unused at staminaMax 2.4 s). */
const PF_STM_MASK = 0xff;
const PF_WD_SHIFT = 14;
const PF_WD_MASK = 0x7f;
const packSprint = (p: PlayerSnap): number =>
  p.stm === undefined
    ? 0
    : PF.sd |
      (p.sp ? PF.sp : 0) |
      (Math.min(PF_STM_MASK, Math.max(0, Math.round(p.stm * 100))) << PF_STM_SHIFT) |
      (Math.min(PF_WD_MASK, Math.max(0, Math.round((p.wd ?? 0) * 100))) << PF_WD_SHIFT);
/**
 * Aim recoil (v0.6.1-dev) rides in flag bits 21..30 too (offset binary in 1/2000 rad, 0 =
 * none); older decoders mask it away. Arithmetic, not bitwise: the flags stay below 2^31.
 */
const packRecoil = (p: PlayerSnap): number => {
  if (!p.rc) return 0;
  const R = RECOIL_WIRE;
  const q = Math.min(R.mask, Math.max(1, Math.round(p.rc * R.scale) + R.bias));
  return q * 2 ** R.shift;
};
const unpackRecoil = (flags: number): number => {
  const R = RECOIL_WIRE;
  const q = Math.floor(flags / 2 ** R.shift) % (R.mask + 1);
  return q ? (q - R.bias) / R.scale : 0;
};
const PLAYER_STATES = ['alive', 'downed', 'dead'] as const;
// [name, c, x, y, a, hp, mhp, st, w, ws, ammo, rl, bo, rv, seq, k, sc, flags, ht]
const PLAYER_FIELDS = 19;

function playerRow(p: PlayerSnap, sym: Symbols): number[] {
  const flags =
    ((p.br ? PF.br : 0) |
      (p.vt ? PF.vt : 0) |
      (p.ht !== undefined ? PF.ht : 0) |
      (p.gd ? PF.gd : 0) |
      packSprint(p)) +
    packRecoil(p);
  return [
    sym.id(p.name),
    p.c,
    fx(p.x, 100),
    fx(p.y, 100),
    fx(p.a, 100),
    p.hp,
    p.mhp,
    Math.max(0, PLAYER_STATES.indexOf(p.st as (typeof PLAYER_STATES)[number])),
    sym.id(p.w),
    sym.id(p.ws.join(',')),
    p.ammo ?? 0,
    fx(p.rl, 100),
    fx(p.bo, 10),
    fx(p.rv, 100),
    p.seq,
    p.k,
    p.sc ?? 0,
    flags,
    p.ht !== undefined ? fx(p.ht, 100) : 0,
  ];
}

function playerFromRow(id: number, v: number[], sym: Symbols): PlayerSnap {
  const ws = sym.get(v[9]);
  const p: PlayerSnap = {
    id,
    name: sym.get(v[0]),
    c: v[1],
    x: v[2] / 100,
    y: v[3] / 100,
    a: v[4] / 100,
    hp: v[5],
    mhp: v[6],
    st: PLAYER_STATES[v[7]] ?? 'alive',
    w: sym.get(v[8]),
    ws: ws ? ws.split(',') : [],
    ammo: v[10],
    rl: v[11] / 100,
    bo: v[12] / 10,
    rv: v[13] / 100,
    seq: v[14],
    k: v[15],
    sc: v[16],
  };
  if (v[17] & PF.br) p.br = 1;
  if (v[17] & PF.ht) p.ht = v[18] / 100;
  if (v[17] & PF.vt) p.vt = 1;
  if (v[17] & PF.gd) p.gd = 1;
  const rc = unpackRecoil(v[17]);
  if (rc) p.rc = rc;
  if (v[17] & PF.sd) {
    if (v[17] & PF.sp) p.sp = 1;
    p.stm = ((v[17] >> PF_STM_SHIFT) & PF_STM_MASK) / 100;
    const wd = ((v[17] >> PF_WD_SHIFT) & PF_WD_MASK) / 100;
    if (wd > 0) p.wd = wd;
  }
  return p;
}

const playerFits = (p: PlayerSnap) =>
  exact(p.x, 100) &&
  exact(p.y, 100) &&
  exact(p.a, 100) &&
  exact(p.rl, 100) &&
  exact(p.bo, 10) &&
  exact(p.rv, 100) &&
  (p.ht === undefined || exact(p.ht, 100)) &&
  (p.stm === undefined || (exact(p.stm, 100) && p.stm >= 0 && p.stm * 100 <= PF_STM_MASK)) &&
  (p.wd === undefined || (exact(p.wd, 100) && p.wd >= 0 && p.wd * 100 <= PF_WD_MASK)) &&
  (p.rc === undefined ||
    (exact(p.rc, RECOIL_WIRE.scale) &&
      Math.abs(p.rc * RECOIL_WIRE.scale) < RECOIL_WIRE.bias - 1)) &&
  [p.hp, p.mhp, p.c, p.seq, p.k, p.sc ?? 0, p.ammo ?? 0].every((v) => exact(v, 1)) &&
  p.ws.every((w) => !w.includes(',')) &&
  p.sw === undefined;

// ---- events: binary for the high-volume ones, JSON for the rest ----
const EV = { json: 0, shot: 1, hit: 2, die: 3 } as const;
const EV_KEYS: Record<string, string[]> = {
  shot: ['e', 'p', 'w', 'x', 'y', 'a', 's'],
  hit: ['e', 'x', 'y', 'k'],
  die: ['e', 't', 'x', 'y'],
};

/** Binary only when the event has exactly the expected shape; anything else goes as JSON. */
function binaryEvent(ev: GameEvent): boolean {
  const keys = EV_KEYS[ev.e];
  if (!keys) return false;
  for (const [k, v] of Object.entries(ev)) {
    if (!keys.includes(k)) return false;
    if (typeof v === 'number' && !Number.isFinite(v)) return false;
  }
  return true;
}

/** Pre-pass: intern every string the events will reference. */
function internEvent(ev: GameEvent, sym: Symbols): void {
  if (!binaryEvent(ev)) return;
  if (ev.e === 'shot') sym.id(ev.w);
  else if (ev.e === 'hit') sym.id(ev.k);
  else if (ev.e === 'die') sym.id(ev.t);
}

/** Players' fixed-point rows by id: shots are coded relative to their shooter (pure integers). */
type Anchors = Map<number, number[]>;
const anchor = (rows: Anchors, p: number) => {
  const v = rows.get(p);
  return v ? [Math.round(v[2] / 10), Math.round(v[3] / 10), v[4] * 10] : [0, 0, 0];
};

function writeEvent(w: Writer, ev: GameEvent, sym: Symbols, rows: Anchors): void {
  if (binaryEvent(ev)) {
    if (ev.e === 'shot') {
      const [ax, ay, aa] = anchor(rows, ev.p);
      w.uv(EV.shot);
      w.uv(ev.p);
      w.uv(sym.id(ev.w));
      w.sv(fx(ev.x, 10) - ax);
      w.sv(fx(ev.y, 10) - ay);
      w.sv(fx(ev.a, 1000) - aa);
      w.uv(ev.s ? 1 : 0);
      return;
    }
    if (ev.e === 'hit') {
      w.uv(EV.hit);
      w.sv(fx(ev.x, 10));
      w.sv(fx(ev.y, 10));
      w.uv(sym.id(ev.k));
      return;
    }
    if (ev.e === 'die') {
      w.uv(EV.die);
      w.uv(sym.id(ev.t));
      w.sv(fx(ev.x, 10));
      w.sv(fx(ev.y, 10));
      return;
    }
  }
  w.uv(EV.json);
  w.bytes(enc.encode(JSON.stringify(ev)));
}

function readEvent(r: Reader, sym: Symbols, rows: Anchors): GameEvent {
  switch (r.uv()) {
    case EV.shot: {
      const p = r.uv();
      const [ax, ay, aa] = anchor(rows, p);
      const ev: GameEvent = {
        e: 'shot',
        p,
        w: sym.get(r.uv()),
        x: (r.sv() + ax) / 10,
        y: (r.sv() + ay) / 10,
        a: (r.sv() + aa) / 1000,
      };
      if (r.uv()) ev.s = 1;
      return ev;
    }
    case EV.hit:
      return { e: 'hit', x: r.sv() / 10, y: r.sv() / 10, k: sym.get(r.uv()) };
    case EV.die:
      return { e: 'die', t: sym.get(r.uv()), x: r.sv() / 10, y: r.sv() / 10 };
    default:
      return JSON.parse(dec.decode(r.bytes())) as GameEvent;
  }
}

/**
 * Guard: the binary path assumes the precision buildSnapshot rounds to. Anything else (a
 * future field change) falls back to JSON, so nothing is ever silently mangled.
 */
function snapFits(s: Snapshot): boolean {
  for (const e of s.enemies)
    if (!e.every((v, k) => exact(v, k === 0 ? 1 : ENEMY_SCALES[k - 1]))) return false;
  for (const p of s.projectiles)
    if (!p.every((v, k) => exact(v, k === 0 ? 1 : PROJ_SCALES[k - 1]))) return false;
  for (const p of s.pickups)
    if (!exact(p.x, 10) || !exact(p.y, 10) || !exact(p.life, 10)) return false;
  for (const a of s.ac ?? []) if (!a.every((v, k) => exact(v, k === 0 ? 1 : 10))) return false;
  for (const a of s.al ?? []) if (!a.every((v, k) => exact(v, ALLY_SCALES[k]!))) return false;
  if (s.cr && !s.cr.every((v, k) => exact(v, CRASH_SCALES[k]!))) return false;
  for (const w of s.wk ?? []) if (!w.every((v) => exact(v, 1))) return false;
  if (!missionFits(s)) return false;
  return (
    s.players.every(playerFits) &&
    exact(s.time, 1000) &&
    (s.wv.nx === undefined || exact(s.wv.nx, 10))
  );
}

function missionFits(s: Snapshot): boolean {
  const m = s.mi;
  if (!m || !s.rf) return false;
  if (
    !exact(m.tl, 10) ||
    !exact(m.ep, 10) ||
    !exact(m.ex, 10) ||
    !exact(m.ey, 10) ||
    !exact(m.er, 10)
  )
    return false;
  for (const t of m.tg) {
    if (
      !exact(t.x, 10) ||
      !exact(t.y, 10) ||
      !exact(t.r, 1) ||
      !exact(t.hp, 1) ||
      !exact(t.maxHp, 1)
    )
      return false;
  }
  if (m.rx !== undefined && (!exact(m.rx, 10) || !exact(m.ry!, 10) || !exact(m.rr!, 1)))
    return false;
  if (!exact(s.rf.cd, 10)) return false;
  for (const p of s.rf.pods) {
    if (!exact(p[2], 10) || !exact(p[3], 10) || !exact(p[4], 10)) return false;
  }
  return true;
}

function writeMission(w: Writer, s: Snapshot, sym: Symbols): void {
  const m = s.mi;
  const rf = s.rf;
  w.uv(sym.id(m.id));
  w.sv(fx(m.tl, 10));
  w.u8(m.eo);
  w.uv(fx(m.ep, 10));
  w.sv(fx(m.ex, 10));
  w.sv(fx(m.ey, 10));
  w.uv(fx(m.er, 10));
  w.uv(m.tg.length);
  for (const t of m.tg) {
    w.uv(t.id);
    w.sv(fx(t.x, 10));
    w.sv(fx(t.y, 10));
    w.uv(t.r);
    w.uv(t.hp);
    w.uv(t.maxHp);
  }
  const hasRelic = m.rx !== undefined;
  w.u8(hasRelic ? 1 : 0);
  if (hasRelic) {
    w.sv(fx(m.rx!, 10));
    w.sv(fx(m.ry!, 10));
    w.uv(m.rr!);
    w.uv(m.rc ?? 0);
  }
  w.u8(m.out);
  w.uv(rf.left);
  w.uv(fx(rf.cd, 10));
  w.uv(rf.pods.length);
  for (const p of rf.pods) {
    w.uv(p[0]);
    w.uv(p[1]);
    w.sv(fx(p[2], 10));
    w.sv(fx(p[3], 10));
    w.uv(fx(p[4], 10));
  }
}

function readMission(r: Reader, sym: Symbols): { mi: Snapshot['mi']; rf: Snapshot['rf'] } {
  const id = sym.get(r.uv());
  const tl = r.sv() / 10;
  const eo = r.u8() ? 1 : 0;
  const ep = r.uv() / 10;
  const ex = r.sv() / 10;
  const ey = r.sv() / 10;
  const er = r.uv() / 10;
  const tg: Snapshot['mi']['tg'] = [];
  for (let n = r.uv(); n > 0; n--) {
    tg.push({
      id: r.uv(),
      x: r.sv() / 10,
      y: r.sv() / 10,
      r: r.uv(),
      hp: r.uv(),
      maxHp: r.uv(),
    });
  }
  const mi: Snapshot['mi'] = { id, tl, eo: eo as 0 | 1, ep, ex, ey, er, tg, out: 0 };
  if (r.u8()) {
    mi.rx = r.sv() / 10;
    mi.ry = r.sv() / 10;
    mi.rr = r.uv();
    mi.rc = r.uv();
  }
  mi.out = r.u8() as 0 | 1 | 2;
  const left = r.uv();
  const cd = r.uv() / 10;
  const pods: Snapshot['rf']['pods'] = [];
  for (let n = r.uv(); n > 0; n--) {
    pods.push([r.uv(), r.uv(), r.sv() / 10, r.sv() / 10, r.uv() / 10]);
  }
  return { mi, rf: { left, cd, pods } };
}

function defaultMissionSnap(): Snapshot['mi'] {
  return {
    id: 'hive_siege',
    tl: -1,
    eo: 0,
    ep: 0,
    ex: 0,
    ey: 0,
    er: 90,
    tg: [],
    out: 0,
  };
}

const toRows = (rows: number[][], scales: number[]): Array<[number, number[]]> =>
  rows.map((r) => [r[0], scales.map((s, k) => fx(r[k + 1], s))]);
const fromRows = (rows: Array<[number, number[]]>, scales: number[]): number[][] =>
  rows.map(([id, v]) => [id, ...v.map((x, k) => x / scales[k])]);

/** Creates the codec for one end of one link. */
export function createWireCodec(stats?: WireStats): WireCodec {
  let sym = new Symbols();
  let players: Table = new Map();
  let enemies: Table = new Map();
  let projs: Table = new Map();
  let me = -1;
  let seq = 0;
  const reset = () => {
    sym = new Symbols();
    players = new Map();
    enemies = new Map();
    projs = new Map();
    seq = 0;
  };
  const watch = (m: { t?: string; playerId?: number } | null) => {
    if (m?.t === 'welcome' && typeof m.playerId === 'number') me = m.playerId;
    if (m?.t === 'start') reset();
  };

  function encodeSnap(s: Snapshot): Uint8Array {
    const w = new Writer();
    let mark = 0;
    const section = (k: keyof WireStats) => {
      if (stats) stats[k] += w.n - mark;
      mark = w.n;
    };
    seq++;
    // Intern first: the header carries this snapshot's new strings.
    const prow = s.players.map((p) => [p.id, playerRow(p, sym)] as [number, number[]]);
    for (const p of s.pickups) {
      sym.id(p.k);
      sym.id(p.w ?? '');
    }
    for (const ev of s.events) internEvent(ev, sym);
    sym.id(s.mi.id);
    w.u8(MAGIC);
    sym.flush(w);
    w.uv(s.tick);
    w.uv(fx(s.time, 1000));
    w.uv(s.wave);
    const wv = s.wv;
    w.uv((wv.a ? 1 : 0) | (wv.h ? 2 : 0) | (wv.nx !== undefined ? 4 : 0) | (s.over ? 8 : 0) | 16);
    w.uv(wv.r);
    w.uv(wv.t);
    if (wv.nx !== undefined) w.uv(fx(wv.nx, 10));
    w.uv(s.sp.length);
    for (const v of s.sp) w.uv(v);
    section('header');
    writeTable(w, prow, PLAYER_SPEC, players, null, seq);
    section('players');
    const mine = s.players.find((p) => p.id === me);
    const box = (scale: number): Box =>
      mine && mine.st !== 'dead' ? { x: mine.x * scale, y: mine.y * scale, s: scale } : null;
    writeTable(w, toRows(s.enemies, ENEMY_SCALES), ENEMY_SPEC, enemies, box(10), seq);
    section('enemies');
    writeTable(w, toRows(s.projectiles, PROJ_SCALES), PROJ_SPEC, projs, box(10), seq);
    section('projectiles');
    w.uv(s.pickups.length);
    for (const p of s.pickups) {
      w.uv(p.id);
      w.uv(sym.id(p.k));
      w.uv(sym.id(p.w ?? ''));
      w.sv(fx(p.x, 10));
      w.sv(fx(p.y, 10));
      w.sv(fx(p.life, 10));
    }
    const ac = s.ac ?? [];
    w.uv(ac.length);
    for (const a of ac) {
      w.uv(a[0]);
      for (let k = 1; k < 6; k++) w.sv(fx(a[k]!, 10));
    }
    const al = s.al ?? [];
    w.uv(al.length);
    for (const a of al) for (let k = 0; k < 6; k++) w.sv(fx(a[k]!, ALLY_SCALES[k]!));
    w.uv(s.cr ? 1 : 0);
    if (s.cr) for (let k = 0; k < 5; k++) w.sv(fx(s.cr[k]!, CRASH_SCALES[k]!));
    const wk = s.wk ?? [];
    w.uv(wk.length);
    for (const x of wk) for (let k = 0; k < 5; k++) w.sv(x[k]!);
    section('pickups');
    w.uv(s.events.length);
    const anchors: Anchors = new Map(prow);
    for (const ev of s.events) writeEvent(w, ev, sym, anchors);
    section('events');
    writeMission(w, s, sym);
    return w.done();
  }

  function decodeSnap(b: Uint8Array): Snapshot {
    const r = new Reader(b);
    if (r.u8() !== MAGIC) throw new Error('wire: bad frame');
    sym.readNew(r);
    const tick = r.uv();
    const time = r.uv() / 1000;
    const wave = r.uv();
    const f = r.uv();
    const wv: Snapshot['wv'] = { r: r.uv(), t: r.uv(), a: f & 1 ? 1 : 0 };
    if (f & 4) wv.nx = r.uv() / 10;
    if (f & 2) wv.h = 1;
    const sp: number[] = [];
    for (let n = r.uv(); n > 0; n--) sp.push(r.uv());
    const prows = readTable(r, PLAYER_FIELDS, PLAYER_SPEC, players);
    const pl = prows.map(([id, v]) => playerFromRow(id, v, sym));
    const anchors: Anchors = new Map(prows);
    const en = fromRows(readTable(r, ENEMY_SCALES.length, ENEMY_SPEC, enemies), ENEMY_SCALES);
    const pr = fromRows(readTable(r, PROJ_SCALES.length, PROJ_SPEC, projs), PROJ_SCALES);
    const pickups: PickupSnap[] = [];
    for (let n = r.uv(); n > 0; n--) {
      const id = r.uv();
      const k = sym.get(r.uv()) as PickupSnap['k'];
      const wpn = sym.get(r.uv());
      const x = r.sv() / 10;
      const y = r.sv() / 10;
      const life = r.sv() / 10;
      pickups.push({ id, k, ...(wpn ? { w: wpn } : {}), x, y, life });
    }
    const ac: AcidSnap[] = [];
    for (let n = r.uv(); n > 0; n--) {
      const id = r.uv();
      const v = [1, 2, 3, 4, 5].map(() => r.sv() / 10);
      ac.push([id, v[0]!, v[1]!, v[2]!, v[3]!, v[4]!]);
    }
    const al: AllySnap[] = [];
    for (let n = r.uv(); n > 0; n--)
      al.push(ALLY_SCALES.map((sc) => r.sv() / sc) as unknown as AllySnap);
    const cr = r.uv() ? (CRASH_SCALES.map((sc) => r.sv() / sc) as unknown as CrashSnap) : undefined;
    const wk: WreckSnap[] = [];
    for (let n = r.uv(); n > 0; n--) wk.push([0, 0, 0, 0, 0].map(() => r.sv()) as WreckSnap);
    const events: GameEvent[] = [];
    for (let n = r.uv(); n > 0; n--) events.push(readEvent(r, sym, anchors));
    const extra =
      f & 16 ? readMission(r, sym) : { mi: defaultMissionSnap(), rf: { left: 0, cd: 0, pods: [] } };
    return {
      tick,
      time,
      wave,
      wv,
      over: !!(f & 8),
      players: pl,
      enemies: en as unknown as EnemySnap[],
      projectiles: pr as unknown as ProjectileSnap[],
      pickups,
      ac,
      al,
      ...(cr ? { cr } : {}),
      wk,
      sp,
      events,
      mi: extra.mi,
      rf: extra.rf,
    };
  }

  return {
    encode(msg) {
      const m = msg as { t?: string; playerId?: number; s?: Snapshot };
      watch(m);
      if (m.t === 'snap' && m.s && snapFits(m.s)) return encodeSnap(m.s);
      return JSON.stringify(msg);
    },
    decode(data) {
      let bin: Uint8Array | null = null;
      if (data instanceof ArrayBuffer) bin = new Uint8Array(data);
      else if (ArrayBuffer.isView(data))
        bin = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (bin) {
        if (bin[0] === MAGIC) {
          try {
            return { t: 'snap', s: decodeSnap(bin) };
          } catch {
            return undefined;
          }
        }
        data = dec.decode(bin);
      }
      if (typeof data !== 'string') return data;
      try {
        const m = JSON.parse(data) as { t?: string; playerId?: number } | null;
        watch(m);
        return m;
      } catch {
        return undefined;
      }
    },
  };
}
