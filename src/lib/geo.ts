export type LngLat = [number, number];

const R = 6_371_000; // metres

/** Great-circle distance in metres. */
export function haversine(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function trailMiles(trail: LngLat[]): number {
  let m = 0;
  for (let i = 1; i < trail.length; i++) m += haversine(trail[i - 1], trail[i]);
  return m / 1609.344;
}

/** Linear interpolation along a polyline by fraction t in [0,1]. */
export function pointAlong(trail: LngLat[], t: number): LngLat {
  if (trail.length === 0) return [0, 0];
  if (trail.length === 1) return trail[0];
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < trail.length; i++) {
    const d = haversine(trail[i - 1], trail[i]);
    segs.push(d);
    total += d;
  }
  let target = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const f = segs[i] === 0 ? 0 : target / segs[i];
      const a = trail[i];
      const b = trail[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    target -= segs[i];
  }
  return trail[trail.length - 1];
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
