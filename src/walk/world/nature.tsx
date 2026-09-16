/**
 * Live oaks, shrubs, weeds through the seams — and the one oak whose roots
 * are the story's villain, its root fan running under the heaved panel.
 */
import * as THREE from "three";
import { GeoBatch, once, trs } from "./util";
import { worldLib } from "./materials";
import { rng, pick } from "./rng";
import { lots } from "./lots";
import { DOWNTOWN_Z, GAPS, INTERSECTIONS, WALK, WALK_OFF, leftOf } from "./route";
import { ROOT_HEAVE } from "./defects";

const GREENS = ["#57703d", "#647f45", "#4c6636", "#71894f", "#5e7a41"] as const;
const DRY = ["#7d8a4d", "#8e9455", "#6f7c44"] as const;

/* One canopy primitive for every blob: batches copy it, so it is never mutated.
   (Building a fresh icosahedron per tree was ~0.5s of the page's build on a phone.) */
const blob = once(() => new THREE.IcosahedronGeometry(1, 1));

export function oak(trunkB: GeoBatch, folB: GeoBatch, x: number, z: number, seed: number, size: number) {
  const r = rng(seed);
  const h = size * (0.9 + r() * 0.3);
  const trunk = new THREE.CylinderGeometry(size * 0.09, size * 0.13, h, 7);
  trunkB.add(trunk, trs(x, h / 2, z, r() * 3, 1, 1, 1, (r() - 0.5) * 0.12, (r() - 0.5) * 0.12));
  trunk.dispose();
  const branch = new THREE.CylinderGeometry(size * 0.045, size * 0.07, h * 0.7, 6);
  trunkB.add(branch, trs(x + (r() - 0.5) * size * 0.3, h * 0.8, z + (r() - 0.5) * size * 0.3, r() * 3, 1, 1, 1, 0.7 + r() * 0.5, 0));
  branch.dispose();
  const blobs = 4 + Math.floor(r() * 3);
  const ico = blob();
  for (let i = 0; i < blobs; i++) {
    const br = size * (0.42 + r() * 0.35);
    const ang = (i / blobs) * Math.PI * 2 + r();
    const dist = size * 0.35 * r();
    // canopy hugs the trunk top — no floating blobs
    folB.add(
      ico,
      trs(x + Math.cos(ang) * dist, h * 0.82 + br * 0.55 + (r() - 0.5) * size * 0.18, z + Math.sin(ang) * dist, r() * 3, br * 1.15, br * 0.82, br * 1.15),
      pick(r, GREENS),
    );
  }
}

function bush(folB: GeoBatch, x: number, z: number, seed: number, s = 1) {
  const r = rng(seed);
  const ico = blob();
  const n = 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const br = s * (0.45 + r() * 0.3);
    folB.add(ico, trs(x + (r() - 0.5) * s * 1.2, br * 0.7, z + (r() - 0.5) * s * 0.8, r() * 3, br, br * 0.75, br), pick(r, GREENS));
  }
}

function weed(folB: GeoBatch, x: number, z: number, seed: number) {
  const r = rng(seed);
  const p = new THREE.PlaneGeometry(0.34, 0.4);
  p.translate(0, 0.2, 0);
  const c = pick(r, DRY);
  folB.add(p, trs(x, 0.05, z, r() * 3), c);
  folB.add(p, trs(x, 0.05, z, r() * 3 + Math.PI / 2), c);
  p.dispose();
}

function buildNature() {
  const trunkB = new GeoBatch();
  const folB = new GeoBatch();
  const r = rng(2620);

  /* yard + shrub planting per lot */
  for (const lot of lots()) {
    const lr = rng(lot.seed + 9);
    const fx = Math.sin(lot.yaw);
    const fz = Math.cos(lot.yaw);
    const lx = fz;
    const lz = -fx;
    const trees = lot.hero ? 0 : Math.floor(lr() * (lot.back ? 2 : 2.5));
    for (let i = 0; i < trees; i++) {
      const side = lr() < 0.5 ? -1 : 1;
      // clear of the footprint (house halfwidth ≤ ~6.7, garage edge ≤ ~8.8)
      const tx = lot.cx + lx * side * (9.5 + lr() * 3) + fx * (lr() - 0.3) * 6;
      const tz = lot.cz + lz * side * (9.5 + lr() * 3) + fz * (lr() - 0.3) * 6;
      oak(trunkB, folB, tx, tz, lot.seed + 31 + i, 3.4 + lr() * 2.2);
    }
    if (!lot.back && lr() < 0.75) {
      const n = 1 + Math.floor(lr() * 3);
      for (let i = 0; i < n; i++) {
        const off = -0.42 + (i / Math.max(1, n - 1)) * 0.84;
        bush(folB, lot.cx + lx * off * 8 + fx * 5.6, lot.cz + lz * off * 8 + fz * 5.6, lot.seed + 60 + i, 0.9 + lr() * 0.5);
      }
    }
  }

  /* planting-strip street trees along the walk */
  const stripOff = -(WALK_OFF - 5.5); // lateral from the walk toward the street
  for (let s = 9; s < WALK.length - 8; s += 15 + r() * 6) {
    const p = WALK.frame(s);
    if (INTERSECTIONS.some((i) => Math.hypot(i.at.x - p.x, i.at.z - p.z) < 13)) continue;
    const downtown = p.x > 122 && p.z < DOWNTOWN_Z;
    const n = leftOf(p.tx, p.tz);
    const x = p.x + n.x * stripOff;
    const z = p.z + n.z * stripOff;
    // keep clear of driveways
    if (lots().some((l) => l.drive && Math.hypot((l.drive.a.x + l.drive.b.x) / 2 - x, (l.drive.a.z + l.drive.b.z) / 2 - z) < 5.5)) continue;
    oak(trunkB, folB, x, z, 7000 + Math.floor(s), downtown ? 2.6 : 3 + r() * 1.6);
  }

  /* THE oak at the falls beat, roots running under the walk */
  {
    const p = WALK.frameF(ROOT_HEAVE.f);
    const n = leftOf(p.tx, p.tz);
    const bx = p.x + n.x * 3.1;
    const bz = p.z + n.z * 3.1;
    oak(trunkB, folB, bx, bz, 9911, 6.4);
    const rr = rng(9912);
    for (let i = 0; i < 5; i++) {
      const spread = (i / 4 - 0.5) * 2.2;
      const toward = -1; // toward the walk
      const p0 = new THREE.Vector3(bx, 0.22, bz);
      const p1 = new THREE.Vector3(bx + n.x * toward * 1.6 + p.tx * spread, 0.16 + rr() * 0.1, bz + n.z * toward * 1.6 + p.tz * spread);
      const p2 = new THREE.Vector3(bx + n.x * toward * (2.8 + rr()), 0.02, bz + n.z * toward * (2.8 + rr()) + p.tz * spread * 1.4);
      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      const tube = new THREE.TubeGeometry(curve, 7, 0.1 - i * 0.008, 5);
      trunkB.add(tube);
      tube.dispose();
    }
  }

  /* weeds through the seams and in the never-built dirt */
  for (let k = 0; k < 26; k++) {
    const f = 0.03 + r() * 0.92;
    if (GAPS.some(([a, b]) => f > a && f < b)) continue;
    const p = WALK.frameF(f);
    if (p.x > 122 && p.z < DOWNTOWN_Z) continue;
    const n = leftOf(p.tx, p.tz);
    const side = r() < 0.5 ? 1 : -1;
    weed(folB, p.x + n.x * side * 0.85, p.z + n.z * side * 0.85, 8100 + k);
  }
  for (const [a, b] of GAPS) {
    for (let k = 0; k < 7; k++) {
      const p = WALK.frameF(a + (b - a) * r());
      const n = leftOf(p.tx, p.tz);
      weed(folB, p.x + n.x * (r() - 0.5) * 1.6, p.z + n.z * (r() - 0.5) * 1.6, 8600 + k);
    }
  }

  /* a loose grove behind the far side of block A, filling the frame */
  for (let k = 0; k < 14; k++) {
    oak(trunkB, folB, 46 + r() * 40, 210 + r() * 180, 8800 + k, 3.5 + r() * 2.5);
  }
  for (let k = 0; k < 10; k++) {
    oak(trunkB, folB, -66 - r() * 34, 200 + r() * 190, 8900 + k, 3.5 + r() * 2.5);
  }

  /* the neighborhood park filling the inside of the L (between B and C) */
  for (let k = 0; k < 16; k++) {
    const px = 14 + r() * 96;
    const pz = 62 + r() * 100;
    if (px > 118 && pz < 104) continue; // stay out of downtown paving
    if (Math.abs(pz - 120) < 8.5) continue; // and off the I2 cross street
    oak(trunkB, folB, px, pz, 9300 + k, 3.8 + r() * 2.6);
  }

  return { trunk: trunkB.build(), foliage: folB.build() };
}

const builtNature = once(buildNature);

export function Nature() {
  const lib = worldLib();
  const g = builtNature();
  return (
    <group>
      {g.trunk && <mesh geometry={g.trunk} material={lib.mats.trunk} castShadow receiveShadow />}
      {g.foliage && <mesh geometry={g.foliage} material={lib.mats.foliage} castShadow receiveShadow />}
    </group>
  );
}
