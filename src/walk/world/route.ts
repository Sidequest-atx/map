/**
 * The town plan, in meters on the XZ ground plane (+x east, +z south, y up).
 *
 * One main street carries the whole walk: a long suburban straight heading
 * north, a right turn east past Barton Springs, a left turn north again
 * climbing into downtown, ending at the Capitol grounds. Corners are true
 * fillet arcs; everything else is straight block segments, so houses can sit
 * in honest parallel rows. The sidewalk is the street's left-hand offset and
 * is the path the reader walks.
 */
import { clamp } from "./rng";

export type P = { x: number; z: number };
export type Frame = { x: number; z: number; tx: number; tz: number; s: number };

/** Left-of-travel normal for a plan tangent (x east, z south, y up). */
export const leftOf = (tx: number, tz: number): P => ({ x: tz, z: -tx });

const STEP = 0.5;

/** Replace interior corners of a waypoint polyline with tangent fillet arcs. */
export function fillet(ws: P[], r: number, step = STEP): P[] {
  const out: P[] = [{ ...ws[0] }];
  for (let i = 1; i < ws.length - 1; i++) {
    const p = ws[i];
    const a = ws[i - 1];
    const b = ws[i + 1];
    const u = norm({ x: p.x - a.x, z: p.z - a.z });
    const v = norm({ x: b.x - p.x, z: b.z - p.z });
    const dot = clamp(u.x * v.x + u.z * v.z, -1, 1);
    const theta = Math.acos(dot);
    if (theta < 1e-3) continue;
    const t = r * Math.tan(theta / 2);
    const from = { x: p.x - u.x * t, z: p.z - u.z * t };
    // Arc center sits off the entry point along the entry normal, on the turn side.
    const cross = u.x * v.z - u.z * v.x; // >0 = turning toward +z side
    const side = Math.sign(cross) || 1;
    const n = { x: -u.z * side, z: u.x * side };
    const c = { x: from.x + n.x * r, z: from.z + n.z * r };
    const a0 = Math.atan2(from.z - c.z, from.x - c.x);
    const steps = Math.max(2, Math.ceil((r * theta) / step));
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + side * theta * (k / steps);
      out.push({ x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r });
    }
  }
  out.push({ ...ws[ws.length - 1] });
  return out;
}

function norm(p: P): P {
  const l = Math.hypot(p.x, p.z) || 1;
  return { x: p.x / l, z: p.z / l };
}

/** A sampled plan path with arclength frames and left-offset derivation. */
export class Path2 {
  readonly pts: Frame[] = [];
  readonly length: number;

  constructor(raw: P[]) {
    // Resample to a uniform step so frame() can index directly.
    let total = 0;
    const seg: number[] = [0];
    for (let i = 1; i < raw.length; i++) {
      total += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
      seg.push(total);
    }
    this.length = total;
    const n = Math.max(2, Math.ceil(total / STEP));
    let j = 0;
    for (let i = 0; i <= n; i++) {
      const s = (total * i) / n;
      while (j < raw.length - 2 && seg[j + 1] < s) j++;
      const t = (s - seg[j]) / (seg[j + 1] - seg[j] || 1);
      this.pts.push({
        x: raw[j].x + (raw[j + 1].x - raw[j].x) * t,
        z: raw[j].z + (raw[j + 1].z - raw[j].z) * t,
        tx: 0,
        tz: 0,
        s,
      });
    }
    for (let i = 0; i < this.pts.length; i++) {
      const a = this.pts[Math.max(0, i - 1)];
      const b = this.pts[Math.min(this.pts.length - 1, i + 1)];
      const d = norm({ x: b.x - a.x, z: b.z - a.z });
      this.pts[i].tx = d.x;
      this.pts[i].tz = d.z;
    }
  }

  frame(s: number): Frame {
    const f = clamp(s, 0, this.length) / this.length;
    const fi = f * (this.pts.length - 1);
    const i = Math.min(this.pts.length - 2, Math.floor(fi));
    const t = fi - i;
    const a = this.pts[i];
    const b = this.pts[i + 1];
    const tx = a.tx + (b.tx - a.tx) * t;
    const tz = a.tz + (b.tz - a.tz) * t;
    const l = Math.hypot(tx, tz) || 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: tx / l, tz: tz / l, s };
  }

  frameF(f: number): Frame {
    return this.frame(f * this.length);
  }

  /** Left-offset polyline (positive d = left of travel). */
  offset(d: number): P[] {
    return this.pts.map((p) => {
      const n = leftOf(p.tx, p.tz);
      return { x: p.x + n.x * d, z: p.z + n.z * d };
    });
  }

  /** Station of the closest sample to a plan point. */
  closestS(p: P): number {
    let best = 0;
    let bd = Infinity;
    for (const q of this.pts) {
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = q.s;
      }
    }
    return best;
  }
}

/* ---------- dimensions ---------- */

export const LANE_W = 3.2;
export const STREET_W = LANE_W * 2 + 1.0; // paved width incl. gutters
export const CURB_W = 0.35;
export const CURB_H = 0.13;
export const STRIP_W = 2.2; // planting strip between curb and walk
export const WALK_OFF = STREET_W / 2 + CURB_W + STRIP_W + 0.8; // street center → walk center
export const SLAB_W = 1.6;
export const SLAB_L = 1.8;

/* ---------- the plan ---------- */

const CORNER_R = 11;

export const STREET = new Path2(
  fillet(
    [
      { x: 0, z: 455 }, // runs off the south edge of the frame — no dead end
      { x: 0, z: 180 },
      { x: 150, z: 180 },
      { x: 150, z: -60 },
    ],
    CORNER_R,
  ),
);

/** The sidewalk the reader walks: the street's left-hand companion. */
export const WALK = new Path2(STREET.offset(WALK_OFF));

/** Traffic lanes. `fwd` runs the route direction (south → capitol),
    `rev` runs back, right-hand traffic in both. */
export const LANES = {
  fwd: new Path2(STREET.offset(-LANE_W / 2)),
  rev: new Path2(STREET.offset(LANE_W / 2).reverse()),
};

/* Cross streets: I1 is a suburban 4-way stop; I2 and I3 carry signals. */
export type Intersection = {
  id: string;
  at: P; // on the main street centerline
  signal: boolean;
  path: Path2; // cross-street centerline, west→east
  lanes: { fwd: Path2; rev: Path2 };
  mainS: number; // station of the intersection on STREET
};

function crossStreet(id: string, at: P, signal: boolean, west: number, east: number): Intersection {
  const path = new Path2([
    { x: at.x - west, z: at.z },
    { x: at.x + east, z: at.z },
  ]);
  return {
    id,
    at,
    signal,
    path,
    lanes: { fwd: new Path2(path.offset(-LANE_W / 2)), rev: new Path2(path.offset(LANE_W / 2).reverse()) },
    mainS: STREET.closestS(at),
  };
}

export const INTERSECTIONS: Intersection[] = [
  crossStreet("i1", { x: 0, z: 310 }, false, 165, 165),
  crossStreet("i2", { x: 150, z: 120 }, true, 90, 175),
  crossStreet("i3", { x: 150, z: 30 }, true, 90, 175),
];

/* ---------- story geography ---------- */

/** Chapter beats as fractions of the WALK's arclength (scroll-aligned). */
export const BEATS = {
  missing: 0.18,
  broken: 0.34,
  math: 0.5,
  falls: 0.645,
  precedent: 0.79,
  count: 0.9,
} as const;

/** Never-built stretches of sidewalk, as walk fractions. */
export const GAPS: [number, number][] = [
  [0.163, 0.2],
  [0.853, 0.872],
];
export const inAnyGap = (f1: number, f2: number) => GAPS.some(([g1, g2]) => f2 > g1 - 0.004 && f1 < g2 + 0.004);

/** Where the world changes character along segment C. */
export const DOWNTOWN_Z = 100;

export const CAPITOL_AT: P = { x: 150, z: -96 };
export const BARTON_AT: P = { x: 72, z: 232 };
/** Walk fraction where the camera drifts toward Barton Springs. */
export const BARTON_BEAT = 0.475;

/* ---------- the drone prologue's downtown (scenic, off the walked route) ----------
   Geography follows real Austin: Lady Bird Lake south of the towers, the
   arched Congress bridge (the bat bridge) and a second S-First-style bridge
   crossing it, the west-downtown grid north of the water, the Capitol at the
   head of the walk's own street, and the UT Tower beyond it. The lake tapers
   out before the walked leg — the walk never touches water. */

/** Lady Bird Lake: a band across the plan, tapering at its east end. */
export const LAKE = { zN: 118, zS: 152, xW: -262, xE: 108, taperFrom: 68 };

/** Bridges over the lake (x of centerline; deck spans the band + banks). */
export const BRIDGE_CONGRESS = { x: 58, w: 10.5, arched: true };
export const BRIDGE_FIRST = { x: -34, w: 8.5, arched: false };

/** The west-downtown scenic grid (streets at the listed coordinates). */
export const DISTRICT = {
  x0: 2,
  x1: 78,
  z0: -44,
  z1: 112,
  avenues: [16, 58], // north-south streets
  streets: [104, 58, 8, -38], // east-west streets ("104" = the waterfront drive)
};

/** Landmark towers (plan positions). Frost sits in a carved notch of the
    walk-street's own downtown rows, like the real one on Congress. */
export const LM = {
  frost: { x: 117, z: 43 },
  austonian: { x: 66, z: 34 },
  independent: { x: 26, z: 82 },
  sail: { x: -8, z: 100 },
  utTower: { x: 150, z: -186 },
} as const;

/** z-range on the walk street's west side kept clear for Frost. */
export const FROST_CLEAR: [number, number] = [24, 62];

/** Route segments in plan, for lot layout: [axis, fixed, from, to, dir]. */
export const BLOCKS = {
  /** Suburban north-south leg: street at x=0, z from 400 down to ~192. */
  A: { x: 0, z0: 430, z1: 194 },
  /** East-west leg: street at z=180, x from ~12 to ~138. */
  B: { z: 180, x0: 14, x1: 138 },
  /** North leg into town: street at x=150, z from ~168 down to -60. */
  C: { x: 150, z0: 166, z1: -58 },
} as const;
