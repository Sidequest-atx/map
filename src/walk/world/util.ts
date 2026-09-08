import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Build-once cache: the heavy world builds run a single time per session,
    surviving StrictMode double-mounts and route remounts. */
export function once<T>(fn: () => T): () => T {
  let v: T | undefined;
  let has = false;
  return () => {
    if (!has) {
      v = fn();
      has = true;
    }
    return v as T;
  };
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Compose a TRS matrix: position, yaw (about Y), optional scale + pitch/roll. */
export function trs(
  x: number,
  y: number,
  z: number,
  ry = 0,
  sx = 1,
  sy?: number,
  sz?: number,
  rx = 0,
  rz = 0,
): THREE.Matrix4 {
  _e.set(rx, ry, rz, "YXZ");
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy ?? sx, sz ?? sx);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Paint a constant vertex color over a geometry (adds the attribute). */
export function tint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color);
  const n = geo.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Collects transformed, tinted copies of geometries and merges them into one
 * BufferGeometry per material — the whole static world in a few draw calls.
 */
export class GeoBatch {
  private geos: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, matrix?: THREE.Matrix4, color?: THREE.ColorRepresentation) {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (color !== undefined) tint(g, color);
    this.geos.push(g);
    return this;
  }

  addAt(geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, color?: THREE.ColorRepresentation) {
    return this.add(geo, trs(x, y, z, ry), color);
  }

  get empty() {
    return this.geos.length === 0;
  }

  /** Merge and dispose the parts. Returns null when nothing was added. */
  build(): THREE.BufferGeometry | null {
    if (!this.geos.length) return null;
    // Normalize: everything non-indexed, and only the shared attributes,
    // so mergeGeometries never sees a mixed set.
    const flat = this.geos.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      return n;
    });
    const keep = ["position", "normal", "uv", "color"].filter((a) => flat.every((g) => g.getAttribute(a)));
    for (const g of flat) {
      for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    }
    const merged = mergeGeometries(flat, false);
    for (const g of flat) g.dispose();
    this.geos = [];
    return merged;
  }
}

/** Shared primitive geometries (unit-ish, cloned into batches). */
export const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg),
  plane: new THREE.PlaneGeometry(1, 1),
};

/** A ground-plane quad strip along a sampled polyline (y slightly above 0). */
export function ribbon(
  pts: { x: number; z: number; tx?: number; tz?: number }[],
  width: number,
  y: number,
  uvScale = 0.12,
): THREE.BufferGeometry {
  const n = pts.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx: number[] = [];
  let run = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    let tx = p.tx;
    let tz = p.tz;
    if (tx === undefined || tz === undefined) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      tx = (b.x - a.x) / l;
      tz = (b.z - a.z) / l;
    }
    if (i > 0) run += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    const nx = tz!;
    const nz = -tx!;
    const h = width / 2;
    pos.set([p.x + nx * h, y, p.z + nz * h, p.x - nx * h, y, p.z - nz * h], i * 6);
    uv.set([0, run * uvScale, 1, run * uvScale], i * 4);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
