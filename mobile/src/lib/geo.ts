import type { TrailPoint } from "../types";

export type LngLat = [number, number];

const R = 6_371_000; // metres

/** Great-circle distance in metres. */
export function haversine(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function trailMiles(trail: LngLat[]): number {
  let m = 0;
  for (let i = 1; i < trail.length; i++) m += haversine(trail[i - 1], trail[i]);
  return m / 1609.344;
}

export function trailPointsMiles(trail: TrailPoint[]): number {
  return trailMiles(trail.map((p) => [p.lng, p.lat]));
}

export function bboxOf(points: LngLat[]): [LngLat, LngLat] | null {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

export interface Interpolated {
  lng: number;
  lat: number;
  /** seconds between the photo time and the nearest breadcrumb actually used */
  gapS: number;
  /** accuracy of the breadcrumb(s) used, metres */
  accuracyM: number | null;
  /** "between" two points, "nearest" single point (outside trail), or none */
  how: "between" | "nearest" | "none";
}

/**
 * Where was the walker at time t? Linear interpolation between the two
 * breadcrumbs that bracket t. Outside the trail we snap to the nearest end
 * and report the gap so the reviewer can see how trustworthy the pin is.
 */
export function positionAt(trail: TrailPoint[], t: number): Interpolated {
  if (!trail.length) return { lng: 0, lat: 0, gapS: Infinity, accuracyM: null, how: "none" };
  const pts = trail; // assumed sorted by t
  if (t <= pts[0].t) {
    return { lng: pts[0].lng, lat: pts[0].lat, gapS: (pts[0].t - t) / 1000, accuracyM: pts[0].accuracyM, how: "nearest" };
  }
  const last = pts[pts.length - 1];
  if (t >= last.t) {
    return { lng: last.lng, lat: last.lat, gapS: (t - last.t) / 1000, accuracyM: last.accuracyM, how: "nearest" };
  }
  // binary search for the bracket
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const span = b.t - a.t;
  const f = span > 0 ? (t - a.t) / span : 0;
  const gapS = Math.min(t - a.t, b.t - t) / 1000;
  const acc = a.accuracyM != null && b.accuracyM != null ? Math.max(a.accuracyM, b.accuracyM) : (a.accuracyM ?? b.accuracyM);
  return { lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f, gapS, accuracyM: acc, how: "between" };
}

export function fmtCoord(lng: number, lat: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function fmtMetres(m: number | null | undefined): string {
  if (m == null || !isFinite(m)) return "unknown";
  if (m < 1) return "<1 m";
  if (m < 100) return `${Math.round(m)} m`;
  return `${Math.round(m / 10) * 10} m`;
}

export function fmtFeet(m: number | null | undefined): string {
  if (m == null || !isFinite(m)) return "unknown";
  const ft = m * 3.28084;
  if (ft < 1) return "<1 ft";
  return `${Math.round(ft)} ft`;
}
