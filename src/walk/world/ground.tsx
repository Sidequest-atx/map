/**
 * Everything that lies on the earth: terrain, asphalt, curbs, lane paint,
 * crosswalks, the sidewalk itself slab by slab (aged, lipped, cracked,
 * heaved, missing, patched, or never built), driveways and front walks.
 * All of it merges into one mesh per material.
 */
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GeoBatch, once, ribbon, trs } from "./util";
import { worldLib } from "./materials";
import { walkState } from "../state";
import { clamp, rng } from "./rng";
import {
  CURB_H,
  CURB_W,
  DOWNTOWN_Z,
  GAPS,
  INTERSECTIONS,
  LANE_W,
  SLAB_L,
  SLAB_W,
  STREET,
  STREET_W,
  WALK,
  inAnyGap,
  leftOf,
  type P,
} from "./route";
import { ATLAS_N } from "./materials";
import { CRACKS, FRESH_RANGE, MISSING_SLABS, STREET_POTHOLES, WALK_POTHOLES, heaveAt } from "./defects";
import { lots } from "./lots";

/* ---------- small helpers ---------- */

function groundRect(w: number, d: number, uvPerM = 1 / 8) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * uvPerM, uv.getY(i) * d * uvPerM);
  return g;
}

/** A flat unit decal plane windowed to one crack-atlas cell. */
function atlasPlane(cell: number) {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  const col = cell % ATLAS_N;
  const row = Math.floor(cell / ATLAS_N);
  const pad = 0.012;
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      col / ATLAS_N + pad + uv.getX(i) * (1 / ATLAS_N - pad * 2),
      (ATLAS_N - 1 - row) / ATLAS_N + pad + uv.getY(i) * (1 / ATLAS_N - pad * 2),
    );
  }
  return g;
}

function distToStreet(p: P) {
  const s = STREET.closestS(p);
  const f = STREET.frame(s);
  return Math.hypot(f.x - p.x, f.z - p.z);
}

/** Split a sampled path into runs that stay clear of the intersections. */
function clearRuns(pts: { x: number; z: number }[], clearance: number, ofMain: boolean) {
  const runs: { x: number; z: number }[][] = [];
  let cur: { x: number; z: number }[] = [];
  for (const p of pts) {
    const blocked = ofMain
      ? INTERSECTIONS.some((i) => Math.hypot(i.at.x - p.x, i.at.z - p.z) < clearance)
      : distToStreet(p) < clearance;
    if (blocked) {
      if (cur.length > 2) runs.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length > 2) runs.push(cur);
  return runs;
}

const isDowntown = (p: P) => p.x > 122 && p.z < DOWNTOWN_Z + 2;

/* ---------- the build ---------- */

function buildGround() {
  const grass = new GeoBatch();
  const road = new GeoBatch();
  const conc = new GeoBatch();
  const paint = new GeoBatch();
  const paintY = new GeoBatch();
  const cracks = new GeoBatch();
  const dirt = new GeoBatch();
  const plainConc = new GeoBatch();

  /* terrain */
  {
    const g = new THREE.PlaneGeometry(760, 1100, 46, 46);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 84, uv.getY(i) * 122);
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    const r = rng(31);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      // large-scale mottling so the tile repeat disappears at altitude
      const wx = pos.getX(i);
      const wz = pos.getY(i); // pre-rotation plane: y maps to world z
      const big = 0.9 + 0.14 * Math.sin(wx * 0.011 + 1.7) * Math.sin(wz * 0.013 + 0.4) + 0.06 * Math.sin(wx * 0.031 - wz * 0.017);
      const v = big * (0.92 + r() * 0.12);
      col[i * 3] = v;
      col[i * 3 + 1] = v * (0.97 + r() * 0.05);
      col[i * 3 + 2] = v * 0.98;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    grass.add(g, trs(75, 0, 150));
    g.dispose();
  }

  /* downtown paving plane */
  plainConc.add(groundRect(78, 182), trs(152, 0.03, 12));

  /* roads */
  road.add(ribbon(STREET.pts, STREET_W + 0.9, 0.02, 1 / 7.5));
  for (const i of INTERSECTIONS) road.add(ribbon(i.path.pts, STREET_W + 0.6, 0.017, 1 / 7.5));

  /* the cul-de-sac bulb where the walk begins */
  {
    const bulb = new THREE.CircleGeometry(10.6, 40);
    bulb.rotateX(-Math.PI / 2);
    const uv = bulb.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.8, uv.getY(i) * 2.8);
    road.add(bulb, trs(0, 0.022, 452));
    bulb.dispose();
    // curb ring with a gap where the street enters (toward -z)
    const gap = Math.asin(4.4 / 10.8);
    const ring = new THREE.RingGeometry(10.6, 11.05, 44, 1, Math.PI / 2 + gap, Math.PI * 2 - gap * 2);
    ring.rotateX(-Math.PI / 2);
    conc.add(ring, trs(0, CURB_H, 452), "#ddd6c6");
    const ringFace = new THREE.RingGeometry(10.5, 11.25, 44, 1, Math.PI / 2 + gap, Math.PI * 2 - gap * 2);
    ringFace.rotateX(-Math.PI / 2);
    conc.add(ringFace, trs(0, CURB_H / 2, 452), "#6f6a5e");
    ring.dispose();
    ringFace.dispose();
  }

  /* curbs: raised top + darker face hint, broken at intersections */
  const curbAt = (pts: { x: number; z: number }[][]) => {
    for (const run of pts) {
      conc.add(ribbon(run, CURB_W + 0.5, CURB_H / 2, 1 / 4), undefined, "#6f6a5e");
      conc.add(ribbon(run, CURB_W, CURB_H, 1 / 4), undefined, "#ddd6c6");
    }
  };
  const edge = STREET_W / 2 + CURB_W / 2 + 0.18;
  curbAt(clearRuns(STREET.offset(edge), 6.4, true));
  curbAt(clearRuns(STREET.offset(-edge), 6.4, true));
  for (const i of INTERSECTIONS) {
    curbAt(clearRuns(i.path.offset(edge), 6.4, false));
    curbAt(clearRuns(i.path.offset(-edge), 6.4, false));
  }

  /* lane paint */
  const dashGeo = new THREE.PlaneGeometry(0.14, 3);
  dashGeo.rotateX(-Math.PI / 2);
  for (let s = 6; s < STREET.length - 6; s += 9.5) {
    const p = STREET.frame(s);
    if (INTERSECTIONS.some((i) => Math.abs(i.mainS - s) < 8)) continue;
    if (isDowntown(p)) continue;
    paintY.add(dashGeo, trs(p.x, 0.046, p.z, Math.atan2(p.tx, p.tz)));
  }
  // downtown: double yellow + white edge lines
  const dtPts = STREET.pts.filter((p) => isDowntown(p) && p.z > -52);
  if (dtPts.length > 2) {
    for (const off of [-0.16, 0.16])
      for (const run of clearRuns(dtPts.map((p) => ({ x: p.x + leftOf(p.tx, p.tz).x * off, z: p.z + leftOf(p.tx, p.tz).z * off })), 7.5, true))
        paintY.add(ribbon(run, 0.1, 0.046, 1));
    for (const off of [-(STREET_W / 2 - 0.28), STREET_W / 2 - 0.28])
      for (const run of clearRuns(dtPts.map((p) => ({ x: p.x + leftOf(p.tx, p.tz).x * off, z: p.z + leftOf(p.tx, p.tz).z * off })), 7.5, true))
        paint.add(ribbon(run, 0.11, 0.046, 1));
  }

  /* stop bars + continental crosswalks */
  const bar = new THREE.PlaneGeometry(LANE_W - 0.5, 0.5);
  bar.rotateX(-Math.PI / 2);
  const cwBar = new THREE.PlaneGeometry(0.42, 2.6);
  cwBar.rotateX(-Math.PI / 2);
  for (const i of INTERSECTIONS) {
    const yawMain = (() => {
      const p = STREET.frame(i.mainS);
      return Math.atan2(p.tx, p.tz);
    })();
    const pAt = STREET.frame(i.mainS);
    const n = leftOf(pAt.tx, pAt.tz);
    const t = { x: pAt.tx, z: pAt.tz };
    // main-street stop bars, both approaches, in the approach lane
    paint.add(bar, trs(pAt.x + t.x * -6.6 + n.x * -(LANE_W / 2), 0.048, pAt.z + t.z * -6.6 + n.z * -(LANE_W / 2), yawMain));
    paint.add(bar, trs(pAt.x + t.x * 6.6 + n.x * (LANE_W / 2), 0.048, pAt.z + t.z * 6.6 + n.z * (LANE_W / 2), yawMain));
    // cross-street stop bars
    const pc = i.path.frame(i.path.length / 2);
    const yawX = Math.atan2(pc.tx, pc.tz);
    const nc = leftOf(pc.tx, pc.tz);
    paint.add(bar, trs(i.at.x - pc.tx * 6.6 - nc.x * (LANE_W / 2), 0.048, i.at.z - pc.tz * 6.6 - nc.z * (LANE_W / 2), yawX));
    paint.add(bar, trs(i.at.x + pc.tx * 6.6 + nc.x * (LANE_W / 2), 0.048, i.at.z + pc.tz * 6.6 + nc.z * (LANE_W / 2), yawX));
    if (i.signal) {
      // piano-key crosswalks on all four legs
      for (const legAlongMain of [true, false]) {
        for (const sgn of [-1, 1]) {
          for (let lat = -3.4; lat <= 3.4; lat += 0.78) {
            if (legAlongMain) {
              // crossing the main street: bars parallel to main travel
              paint.add(cwBar, trs(pAt.x + t.x * sgn * 5.1 + n.x * lat, 0.049, pAt.z + t.z * sgn * 5.1 + n.z * lat, yawMain));
            } else {
              paint.add(cwBar, trs(i.at.x + pc.tx * sgn * 5.1 + nc.x * lat, 0.049, i.at.z + pc.tz * sgn * 5.1 + nc.z * lat, yawX));
            }
          }
        }
      }
    }
  }
  bar.dispose();
  cwBar.dispose();
  dashGeo.dispose();

  /* ---------- the sidewalk, slab by slab ---------- */
  const slabGeo = new THREE.BoxGeometry(SLAB_W, 0.12, SLAB_L - 0.06);
  const r = rng(555);
  const L = WALK.length;
  const slabCount = Math.floor(L / SLAB_L);
  // pre-index cracks/potholes by slab
  const crackBySlab = new Map<number, (typeof CRACKS)[number]>();
  for (const c of CRACKS) crackBySlab.set(Math.round((c.f * L) / SLAB_L), c);
  const holeBySlab = new Map<number, (typeof WALK_POTHOLES)[number]>();
  for (const h of WALK_POTHOLES) holeBySlab.set(Math.round((h.f * L) / SLAB_L), h);
  const missingSet = new Set(MISSING_SLABS.map((f) => Math.round((f * L) / SLAB_L)));

  for (let i = 0; i < slabCount; i++) {
    const s = i * SLAB_L + SLAB_L / 2;
    const f = s / L;
    if (inAnyGap(f - SLAB_L / L / 2, f + SLAB_L / L / 2)) continue;
    const p = WALK.frame(s);
    const yaw = Math.atan2(p.tx, p.tz);

    if (missingSet.has(i)) {
      dirt.add(groundRect(SLAB_W + 0.3, SLAB_L + 0.2, 1 / 3), trs(p.x, 0.028, p.z, yaw));
      // rubble
      for (let k = 0; k < 3; k++) {
        const g = new THREE.BoxGeometry(0.28 + r() * 0.3, 0.09, 0.2 + r() * 0.25);
        conc.add(g, trs(p.x + (r() - 0.5) * 1.4, 0.06, p.z + (r() - 0.5) * 1.4, r() * 3, 1, 1, 1, 0, (r() - 0.5) * 0.4), "#b9b1a0");
        g.dispose();
      }
      continue;
    }

    const heave = heaveAt(f);
    const fresh = f > FRESH_RANGE[0] && f < FRESH_RANGE[1];
    let tintV: number;
    const roll = r();
    if (fresh) tintV = 1.12;
    else if (roll < 0.42) tintV = 0.95 + r() * 0.09;
    else if (roll < 0.72) tintV = 0.86 + r() * 0.09;
    else if (roll < 0.9) tintV = 0.76 + r() * 0.09;
    else tintV = 0.68 + r() * 0.07;

    const lip = fresh ? 0 : heave ? heave.lift : r() < 0.38 ? 0 : (r() - 0.5) * 0.1;
    const rx = ((heave ? heave.tiltX : (r() - 0.5) * 1.1) * Math.PI) / 180;
    const rz = ((heave ? heave.tiltZ : (r() - 0.5) * 0.8) * Math.PI) / 180;
    const y = 0.075 + lip;
    const m = trs(p.x, y, p.z, yaw, 1, 1, 1, rx, rz);
    conc.add(slabGeo, m, new THREE.Color(tintV, tintV * 0.995, tintV * 0.975));

    const top = trs(0, 0.066, 0, 0);
    const crack = crackBySlab.get(i);
    if (crack && !fresh) {
      const g = atlasPlane(crack.cell);
      const dm = m.clone().multiply(top).multiply(trs(0, 0.004, 0, crack.yaw, 2.6 * crack.scale, 1, 2.7 * crack.scale));
      cracks.add(g, dm);
      g.dispose();
    }
    const hole = holeBySlab.get(i);
    if (hole && !fresh) {
      const g = atlasPlane(hole.cell);
      const dm = m.clone().multiply(top).multiply(trs(hole.d, 0.005, 0, r() * 3, 1.9 * hole.scale, 1, 1.9 * hole.scale));
      cracks.add(g, dm);
      g.dispose();
    }
    // extra cracking radiating on the root-heave slabs
    if (heave && heave.lift > 0.1) {
      const g = atlasPlane(2);
      cracks.add(g, m.clone().multiply(top).multiply(trs(0.1, 0.006, 0.2, 1.2, 2.3, 1, 2.3)));
      g.dispose();
    }
  }
  slabGeo.dispose();

  /* never-built stretches: a worn dirt desire line through the grass */
  for (const [g1, g2] of GAPS) {
    const pts: { x: number; z: number }[] = [];
    const s1 = g1 * L;
    const s2 = g2 * L;
    let k = 0;
    for (let s = s1 - 1; s <= s2 + 1; s += 0.6) {
      const p = WALK.frame(s);
      const n = leftOf(p.tx, p.tz);
      const lat = 0.5 * Math.sin(k * 0.5) + 0.24 * Math.sin(k * 1.35);
      pts.push({ x: p.x + n.x * lat, z: p.z + n.z * lat });
      k++;
    }
    dirt.add(ribbon(pts, 1.1, 0.032, 1 / 3));
  }

  /* driveways + front walks */
  for (const lot of lots()) {
    if (lot.drive) {
      const { a, b } = lot.drive;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const g = new THREE.PlaneGeometry(3.3, len + 1);
      g.rotateX(-Math.PI / 2);
      const uvA = g.getAttribute("uv") as THREE.BufferAttribute;
      for (let i2 = 0; i2 < uvA.count; i2++) uvA.setXY(i2, uvA.getX(i2), (uvA.getY(i2) * (len + 1)) / 3);
      conc.add(g, trs((a.x + b.x) / 2, 0.05, (a.z + b.z) / 2, Math.atan2(b.x - a.x, b.z - a.z)), "#cfc8b8");
      g.dispose();
    }
    if (lot.walkway) {
      const { a, b } = lot.walkway;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const g = new THREE.PlaneGeometry(1.0, len);
      g.rotateX(-Math.PI / 2);
      conc.add(g, trs((a.x + b.x) / 2, 0.045, (a.z + b.z) / 2, Math.atan2(b.x - a.x, b.z - a.z)), "#e2dbca");
      g.dispose();
    }
  }

  /* street potholes */
  for (const [sf, lane, cell, scale] of STREET_POTHOLES) {
    const p = STREET.frameF(sf);
    const n = leftOf(p.tx, p.tz);
    const g = atlasPlane(cell);
    cracks.add(g, trs(p.x + n.x * lane, 0.052, p.z + n.z * lane, r() * 3, 2.0 * scale, 1, 2.0 * scale));
    g.dispose();
  }

  return { grass: grass.build(), road: road.build(), conc: conc.build(), paint: paint.build(), paintY: paintY.build(), cracks: cracks.build(), dirt: dirt.build(), plainConc: plainConc.build() };
}

const builtGround = once(buildGround);

/** Which crack atlas shows follows the shot: the bold one reads from the
    aerial beats, the true-width one takes over as the camera lands on a panel. */
function CrackLod() {
  const lib = worldLib();
  useFrame(() => {
    const near = clamp((18 - walkState.view) / 8, 0, 1);
    const far = lib.mats.cracks;
    const close = lib.mats.cracksNear;
    far.opacity = 1 - near;
    close.opacity = near;
    far.visible = near < 0.995;
    close.visible = near > 0.005;
  });
  return null;
}

export function Ground() {
  const lib = worldLib();
  const g = builtGround();
  return (
    <group>
      {g.grass && <mesh geometry={g.grass} material={lib.mats.grass} receiveShadow />}
      {g.plainConc && <mesh geometry={g.plainConc} material={lib.mats.concretePlain} receiveShadow />}
      {g.road && <mesh geometry={g.road} material={lib.mats.asphalt} receiveShadow />}
      {g.conc && <mesh geometry={g.conc} material={lib.mats.concrete} receiveShadow castShadow />}
      {g.paint && <mesh geometry={g.paint} material={lib.mats.paint} receiveShadow />}
      {g.paintY && <mesh geometry={g.paintY} material={lib.mats.paintYellow} receiveShadow />}
      {g.dirt && <mesh geometry={g.dirt} material={lib.mats.dirt} receiveShadow />}
      {g.cracks && <mesh geometry={g.cracks} material={lib.mats.cracks} receiveShadow />}
      {g.cracks && <mesh geometry={g.cracks} material={lib.mats.cracksNear} receiveShadow />}
      <CrackLod />
    </group>
  );
}
