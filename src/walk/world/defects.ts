/**
 * Where the sidewalk is failing, in one authoritative table. Geometry is
 * exaggerated ~2-3x real scale so a half-inch lip reads from an aerial
 * camera; the story labels quote the true numbers.
 */
import { BEATS, GAPS, WALK, inAnyGap } from "./route";
import { rng } from "./rng";

export type CrackSpot = { f: number; cell: number; yaw: number; scale: number };
export type PotholeSpot = { f: number; cell: number; scale: number; d: number };
export type Heave = { f: number; lift: number; tiltX: number; tiltZ: number; slabs: number };

const INT_CLEAR = [0.1, 0.126, 0.68, 0.7, 0.825, 0.85]; // walk fractions near intersections, keep clean-ish

function nearAny(f: number, list: number[], eps: number) {
  return list.some((v) => Math.abs(v - f) < eps);
}

export const CRACKS: CrackSpot[] = (() => {
  const r = rng(9001);
  const out: CrackSpot[] = [];
  let f = 0.03;
  while (f < 0.965) {
    const hot =
      Math.abs(f - BEATS.broken) < 0.032 ||
      Math.abs(f - 0.555) < 0.028 ||
      Math.abs(f - 0.095) < 0.024 || // the problem starts on the first block
      Math.abs(f - 0.29) < 0.024;
    f += hot ? 0.008 + r() * 0.014 : 0.016 + r() * 0.042;
    if (inAnyGap(f - 0.004, f + 0.004)) continue;
    if (nearAny(f, INT_CLEAR, 0.01)) continue;
    if (Math.abs(f - BEATS.count) < 0.02) continue; // the fresh panel stays fresh
    // heavier cracking around the "failing" and "nobody reported" beats;
    // the suburban stretch keeps more of its draws — cracks are its argument
    const keep = f < 0.62 ? 0.68 : 0.66;
    if (!hot && r() > keep) continue;
    const suburb = f < 0.62;
    out.push({
      f,
      cell: Math.floor(r() * 12),
      yaw: (r() - 0.5) * 0.9 + (r() < 0.3 ? Math.PI / 2 : 0),
      scale: (hot ? 0.95 : suburb ? 0.88 : 0.78) + r() * (suburb ? 0.55 : 0.5),
    });
  }
  // The camera comes right down on this one; it must not be left to chance.
  out.push({ f: BEATS.broken, cell: 5, yaw: 0.22, scale: 1.35 });
  return out;
})();

export const WALK_POTHOLES: PotholeSpot[] = [
  { f: 0.318, cell: 12, scale: 0.65, d: 0.3 },
  { f: 0.585, cell: 13, scale: 0.55, d: -0.35 },
  { f: 0.73, cell: 14, scale: 0.6, d: 0.2 },
];

/** Street potholes: [street station fraction, lane offset, cell, scale]. */
export const STREET_POTHOLES: [number, number, number, number][] = [
  [0.3, -1.4, 15, 1.15],
  [0.62, 1.5, 12, 1.3],
  [0.9, -1.2, 13, 1.0],
];

/** Mild lifted panels along the way (walk fraction, lift m, tilt deg). */
export const MILD_HEAVES: Heave[] = [
  { f: 0.09, lift: 0.05, tiltX: 2.4, tiltZ: 0.8, slabs: 1 },
  { f: 0.138, lift: 0.05, tiltX: -2.2, tiltZ: 0.6, slabs: 1 },
  { f: 0.225, lift: 0.06, tiltX: 2.6, tiltZ: -0.7, slabs: 1 },
  { f: 0.3, lift: 0.05, tiltX: -2.3, tiltZ: 0.9, slabs: 1 },
  { f: 0.42, lift: 0.06, tiltX: -2.8, tiltZ: -0.5, slabs: 1 },
  { f: 0.6, lift: 0.045, tiltX: 2.1, tiltZ: 0, slabs: 1 },
  { f: 0.755, lift: 0.055, tiltX: -2.5, tiltZ: 1.0, slabs: 1 },
  // the lip that gets its legal name at the precedent beat
  { f: 0.79, lift: 0.065, tiltX: 2.8, tiltZ: -0.9, slabs: 1 },
  // the panel the camera lands on at the "failing the test" beat
  { f: BEATS.broken, lift: 0.075, tiltX: 3.6, tiltZ: -1.1, slabs: 1 },
];

/** THE root heave: the oak, the lifted panel, the fall. */
export const ROOT_HEAVE: Heave = { f: BEATS.falls, lift: 0.16, tiltX: 7.5, tiltZ: 2.5, slabs: 2 };

/** Slabs missing entirely (dirt shows through). */
export const MISSING_SLABS: number[] = [0.058, 0.252, 0.708];

/** The fresh, verified-fixed stretch by the count beat. */
export const FRESH_RANGE: [number, number] = [BEATS.count - 0.007, BEATS.count + 0.007];

export const heaveAt = (f: number): Heave | null => {
  const all = [...MILD_HEAVES, ROOT_HEAVE];
  for (const h of all) {
    const halfSpan = ((h.slabs * 1.8) / WALK.length) * 0.62;
    if (Math.abs(f - h.f) < halfSpan) return h;
  }
  return null;
};

/** Barricade stations: both ends of each never-built stretch. */
export const BARRICADES: number[] = GAPS.flatMap(([a, b]) => [a - 0.005, b + 0.005]);
