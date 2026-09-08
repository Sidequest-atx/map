/**
 * The drone prologue's Austin: Lady Bird Lake with kayakers and the arched
 * Congress bat bridge, the S-First-style second crossing, a west-downtown
 * grid of glass towers with the landmarks — Frost's crown, the Austonian,
 * the Independent's stacked blocks, the Google sail on the waterfront, the
 * UT Tower beyond the Capitol — plus the honest street level: cracked
 * sidewalks, cones, steel plates, downed scooters. Scenic: the walked route
 * never enters; the flyover camera owns this ground.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GeoBatch, once, ribbon, trs } from "./util";
import { worldLib, ATLAS_N } from "./materials";
import { rng, pick, clamp } from "./rng";
import { oak } from "./nature";
import { BRIDGE_CONGRESS, BRIDGE_FIRST, DISTRICT, LAKE, LM } from "./route";
import { walkState } from "../state";

const DECK_Y = 2.55;

/* ---------- small builders ---------- */

/** Remap a geometry's uv.x into one column of the 3-style tower texture. */
function uvStyle(g: THREE.BufferGeometry, style: number) {
  const uv = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setX(i, style / 3 + 0.008 + uv.getX(i) * (1 / 3 - 0.016));
  return g;
}

/** Variable-width ground strip along x (for the tapering lake). */
function lakeSurface(): THREE.BufferGeometry {
  const xs: number[] = [];
  for (let x = LAKE.xW; x <= LAKE.xE; x += 6) xs.push(x);
  const mid = (LAKE.zN + LAKE.zS) / 2;
  const halfAt = (x: number) => {
    const base = (LAKE.zS - LAKE.zN) / 2;
    if (x <= LAKE.taperFrom) return base;
    const t = clamp((x - LAKE.taperFrom) / (LAKE.xE - LAKE.taperFrom), 0, 1);
    return Math.max(1.0, base * Math.pow(1 - t, 0.75));
  };
  const midAt = (x: number) => {
    const t = clamp((x - LAKE.taperFrom) / (LAKE.xE - LAKE.taperFrom), 0, 1);
    return mid + Math.sin((x + 260) * 0.012) * 2.2 + t * 5; // gentle bend, hooking SE at the tail
  };
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  xs.forEach((x, i) => {
    const m = midAt(x);
    const h = halfAt(x);
    pos.push(x, 0, m - h, x, 0, m + h);
    uv.push(x / 34, 0, x / 34, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** One crack/pothole decal from the shared atlas. */
function crackDecal(b: GeoBatch, x: number, z: number, cell: number, yaw: number, scale: number, y = 0.052) {
  const g = new THREE.PlaneGeometry(1.9 * scale, 1.9 * scale);
  g.rotateX(-Math.PI / 2);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const cx = cell % ATLAS_N;
  const cy = Math.floor(cell / ATLAS_N);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (cx + uv.getX(i)) / ATLAS_N, 1 - (cy + 1 - uv.getY(i)) / ATLAS_N);
  }
  b.add(g, trs(x, y, z, yaw));
  g.dispose();
}

/** Traffic cone: orange body, white band, square base. */
export function cone(walls: GeoBatch, x: number, z: number, seed: number) {
  const r = rng(seed);
  const yaw = r() * Math.PI;
  const lean = r() < 0.18 ? 0.9 + r() * 0.5 : (r() - 0.5) * 0.1; // some knocked over
  const base = new THREE.BoxGeometry(0.42, 0.045, 0.42);
  walls.add(base, trs(x, 0.06, z, yaw, 1, 1, 1, lean * 0.2), "#c2521f");
  base.dispose();
  const body = new THREE.CylinderGeometry(0.055, 0.17, 0.62, 8);
  walls.add(body, trs(x + Math.sin(lean) * 0.3, 0.06 + Math.cos(lean) * 0.33, z, yaw, 1, 1, 1, lean), "#d97627");
  body.dispose();
  const band = new THREE.CylinderGeometry(0.095, 0.125, 0.14, 8);
  walls.add(band, trs(x + Math.sin(lean) * 0.42, 0.06 + Math.cos(lean) * 0.44, z, yaw, 1, 1, 1, lean), "#efe9dc");
  band.dispose();
}

/** Steel road plate over sidewalk work. */
export function steelPlate(plateB: GeoBatch, x: number, z: number, seed: number, big = false) {
  const r = rng(seed);
  const w = big ? 2.4 : 1.5 + r() * 0.5;
  const d = big ? 1.8 : 1.1 + r() * 0.4;
  const g = new THREE.BoxGeometry(w, 0.05, d);
  plateB.add(g, trs(x, 0.075, z, (r() - 0.5) * 0.5));
  g.dispose();
}

/** A shared-fleet scooter dumped across the pavement. */
export function scooter(walls: GeoBatch, metal: GeoBatch, x: number, z: number, seed: number) {
  const r = rng(seed);
  const yaw = r() * Math.PI * 2;
  const accents = ["#7bc74d", "#e8862e", "#4da3c7", "#e0e0dc"];
  const acc = pick(r, accents);
  // lying on its side: deck flat-ish, stem across the ground
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const deck = new THREE.BoxGeometry(1.02, 0.05, 0.15);
  walls.add(deck, trs(x, 0.08, z, yaw, 1, 1, 1, 0, Math.PI / 2 - 0.22), "#26292d");
  deck.dispose();
  const stem = new THREE.CylinderGeometry(0.028, 0.028, 0.92, 6);
  metal.add(stem, trs(x + cy * 0.62, 0.09, z - sy * 0.62, yaw, 1, 1, 1, Math.PI / 2 - 0.14, 0.3));
  stem.dispose();
  const bar = new THREE.CylinderGeometry(0.024, 0.024, 0.42, 6);
  bar.rotateZ(Math.PI / 2);
  metal.add(bar, trs(x + cy * 1.02, 0.13, z - sy * 1.02, yaw, 1, 1, 1, 0, 0.5));
  bar.dispose();
  for (const off of [-0.45, 0.5]) {
    const wheel = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8);
    wheel.rotateX(Math.PI / 2);
    walls.add(wheel, trs(x + cy * off, 0.09, z - sy * off, yaw, 1, 1, 1, 0, Math.PI / 2 - 0.2), "#1c1e20");
    wheel.dispose();
  }
  const fender = new THREE.BoxGeometry(0.22, 0.03, 0.12);
  walls.add(fender, trs(x - cy * 0.5, 0.12, z + sy * 0.5, yaw, 1, 1, 1, 0, Math.PI / 2 - 0.2), acc);
  fender.dispose();
}

/** Work-zone barricade (matches the walk's style). */
function barricade(walls: GeoBatch, metal: GeoBatch, x: number, z: number, yaw: number, seed: number) {
  const br = rng(seed);
  const lean = (br() - 0.5) * 0.12;
  for (const off of [-0.55, 0.55]) {
    const leg = new THREE.BoxGeometry(0.07, 1.15, 0.55);
    metal.add(leg, trs(x + Math.cos(yaw) * off, 0.55, z - Math.sin(yaw) * off, yaw, 1, 1, 1, 0.2, lean));
    leg.dispose();
  }
  const board = new THREE.BoxGeometry(1.55, 0.3, 0.06);
  walls.add(board, trs(x, 0.95, z, yaw, 1, 1, 1, 0, lean), "#d97627");
  board.dispose();
  for (const sx of [-0.5, 0.05, 0.6]) {
    const stripe = new THREE.BoxGeometry(0.16, 0.3, 0.02);
    walls.add(stripe, trs(x + Math.cos(yaw) * sx, 0.95, z - Math.sin(yaw) * sx, yaw + 0.12, 1, 1, 1, 0, lean), "#efe9dc");
    stripe.dispose();
  }
}

/* ---------- landmark towers ---------- */

function frostTower(glass: GeoBatch, walls: GeoBatch, trim: GeoBatch) {
  const { x, z } = LM.frost;
  const H = 72;
  const shaft = uvStyle(new THREE.CylinderGeometry(10.2, 11.2, H, 8, 1, true), 0);
  glass.add(shaft, trs(x, H / 2 + 0.1, z, Math.PI / 8));
  shaft.dispose();
  const cap = new THREE.CylinderGeometry(10.2, 10.2, 0.5, 8);
  walls.add(cap, trs(x, H + 0.3, z, Math.PI / 8), "#5d6a68");
  cap.dispose();
  // the folded-glass owl crown: a ring of tilted fins closing to a peak
  const crown = uvStyle(new THREE.ConeGeometry(10.6, 15, 8, 1, true), 0);
  glass.add(crown, trs(x, H + 7.6, z, Math.PI / 8));
  crown.dispose();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const fin = new THREE.BoxGeometry(0.35, 6.5, 2.6);
    walls.add(fin, trs(x + Math.cos(a) * 8.6, H + 3.4, z + Math.sin(a) * 8.6, -a, 1, 1, 1, 0.42), "#546260");
    fin.dispose();
  }
  const spire = new THREE.CylinderGeometry(0.16, 0.34, 9, 6);
  trim.add(spire, trs(x, H + 18.5, z));
  spire.dispose();
  // street-level podium
  const pod = new THREE.BoxGeometry(26, 6, 24);
  walls.add(pod, trs(x, 3, z), "#8a8378");
  pod.dispose();
}

function austonian(glass: GeoBatch, walls: GeoBatch, trim: GeoBatch) {
  const { x, z } = LM.austonian;
  const H = 86;
  const shaft = uvStyle(new THREE.CylinderGeometry(7.0, 7.5, H, 14, 1, true), 1);
  glass.add(shaft, trs(x, H / 2 + 0.1, z));
  shaft.dispose();
  for (let y = 10; y < H - 6; y += 9.5) {
    const ring = new THREE.CylinderGeometry(7.8, 7.8, 0.28, 14, 1, true);
    trim.add(ring, trs(x, y, z));
    ring.dispose();
  }
  const cap = new THREE.CylinderGeometry(7.1, 7.1, 0.6, 14);
  walls.add(cap, trs(x, H + 0.35, z), "#565049");
  cap.dispose();
  for (const [dx, dz] of [
    [-3, 0],
    [3, 0],
  ] as const) {
    const fin = new THREE.BoxGeometry(0.5, 7.5, 5.5);
    walls.add(fin, trs(x + dx, H + 3.4, z + dz), "#6e675c");
    fin.dispose();
  }
}

function independent(glass: GeoBatch, trim: GeoBatch, walls: GeoBatch) {
  const { x, z } = LM.independent;
  // the jenga: five stacked blocks, alternating cantilevers
  const blocks: [number, number][] = [
    [17, 0],
    [15.5, 3.6],
    [16, -3.4],
    [15.5, 3.2],
    [14, -2.8],
  ];
  let y = 0.1;
  blocks.forEach(([h, off], i) => {
    const b = uvStyle(new THREE.BoxGeometry(13.5, h, 13.5), 0);
    glass.add(b, trs(x + off, y + h / 2, z));
    b.dispose();
    const band = new THREE.BoxGeometry(14.1, 0.55, 14.1);
    walls.add(band, trs(x + off, y + h - 0.1, z), "#c9cec2");
    band.dispose();
    const capB = new THREE.BoxGeometry(13.2, 0.35, 13.2);
    walls.add(capB, trs(x + off, y + h + 0.22, z), "#4a4642");
    capB.dispose();
    y += h;
    void i;
  });
  void trim;
}

function sailTower(glass: GeoBatch, walls: GeoBatch, lib: ReturnType<typeof worldLib>) {
  const { x, z } = LM.sail;
  // curved lens plan, extruded tall, with a rising glass fin — the sail
  const H = 56;
  const shaft = uvStyle(new THREE.CylinderGeometry(9.6, 10.4, H, 18, 1, true), 1);
  glass.add(shaft, trs(x, H / 2 + 0.1, z, -0.35, 1, 1, 0.6));
  shaft.dispose();
  const cap = new THREE.CylinderGeometry(9.7, 9.7, 0.5, 18);
  walls.add(cap, trs(x, H + 0.3, z, -0.35, 1, 1, 0.6), "#5d6a68");
  cap.dispose();
  // the peak: a rising glass fin past the roofline — the sail
  const fin = new THREE.Shape();
  fin.moveTo(-8.5, 0);
  fin.lineTo(7.5, 0);
  fin.lineTo(-3.5, 22);
  fin.closePath();
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 1.8, bevelEnabled: false });
  const finUv = finG.getAttribute("uv");
  for (let i = 0; i < finUv.count; i++) finUv.setXY(i, 0.45, 0.5); // flat mid-glass sample
  glass.add(finG, trs(x - 1, H, z + 0.6, -0.35));
  finG.dispose();
  const podium = new THREE.BoxGeometry(24, 4.5, 16);
  walls.add(podium, trs(x + 2, 2.25, z + 3, -0.35), "#8a8378");
  podium.dispose();
  void lib;
}

function utTower(walls: GeoBatch, trim: GeoBatch, grass: GeoBatch) {
  const { x, z } = LM.utTower;
  const cream = "#dbceac";
  const shade = "#c8b995";
  // south mall lawn
  const lawn = new THREE.PlaneGeometry(56, 44);
  lawn.rotateX(-Math.PI / 2);
  grass.add(lawn, trs(x, 0.035, z + 6), "#5f7040");
  lawn.dispose();
  // main building base
  const base = new THREE.BoxGeometry(34, 9, 15);
  walls.add(base, trs(x, 4.5, z), cream);
  base.dispose();
  const baseRoof = new THREE.BoxGeometry(35, 0.6, 16);
  walls.add(baseRoof, trs(x, 9.2, z), "#8a5a3c");
  baseRoof.dispose();
  // the shaft
  const shaft = new THREE.BoxGeometry(9.5, 42, 9.5);
  walls.add(shaft, trs(x, 9 + 21, z), cream);
  shaft.dispose();
  // window strips
  for (const side of [-1, 1] as const) {
    const strip = new THREE.BoxGeometry(5.4, 38, 0.3);
    walls.add(strip, trs(x, 9 + 21, z + side * 4.75, 0), shade);
    strip.dispose();
    const stripX = new THREE.BoxGeometry(0.3, 38, 5.4);
    walls.add(stripX, trs(x + side * 4.75, 9 + 21, z), shade);
    stripX.dispose();
  }
  // clock faces
  for (const [ox, oz, yaw] of [
    [0, 5.05, 0],
    [0, -5.05, Math.PI],
    [5.05, 0, Math.PI / 2],
    [-5.05, 0, -Math.PI / 2],
  ] as const) {
    const face = new THREE.CircleGeometry(2.6, 20);
    trim.add(face, trs(x + ox, 47, z + oz, yaw));
    face.dispose();
  }
  // belfry colonnade + cap
  const belfryBase = new THREE.BoxGeometry(10.5, 1, 10.5);
  walls.add(belfryBase, trs(x, 51.5, z), cream);
  belfryBase.dispose();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const col = new THREE.CylinderGeometry(0.45, 0.45, 4.6, 6);
    walls.add(col, trs(x + Math.cos(a) * 3.9, 54.3, z + Math.sin(a) * 3.9), cream);
    col.dispose();
  }
  const cap = new THREE.BoxGeometry(9.8, 0.9, 9.8);
  walls.add(cap, trs(x, 57, z), cream);
  cap.dispose();
  const pyr = new THREE.ConeGeometry(5.4, 3.4, 4);
  walls.add(pyr, trs(x, 59.1, z, Math.PI / 4), "#8a5a3c");
  pyr.dispose();
}

/* ---------- the static district ---------- */

function buildDistrict() {
  const lib = worldLib();
  const water = new GeoBatch();
  const grass = new GeoBatch();
  const dirt = new GeoBatch();
  const road = new GeoBatch();
  const conc = new GeoBatch(); // tinted concrete (curbs etc.)
  const plainConc = new GeoBatch();
  const paint = new GeoBatch();
  const cracks = new GeoBatch();
  const walls = new GeoBatch();
  const metal = new GeoBatch();
  const trim = new GeoBatch();
  const glass = new GeoBatch(); // towerGlass
  const plate = new GeoBatch(); // steel plates
  const lamp = new GeoBatch();
  const glow = new GeoBatch();
  const trunkB = new GeoBatch();
  const folB = new GeoBatch();
  const batB = new GeoBatch(); // sleeping bat clusters
  const r = rng(7100);

  /* -- the lake -- */
  {
    const bed = lakeSurface(); // opaque dark bed so grass never ghosts through
    conc.add(bed, trs(0, 0.042, 0), "#2c4a44");
    bed.dispose();
    water.add(lakeSurface(), trs(0, 0.075, 0));
  }
  // shore bands: darker grass hugging the water, then the hike-and-bike trail
  const mid = (LAKE.zN + LAKE.zS) / 2;
  const shorePts = (side: -1 | 1, off: number) => {
    const pts: { x: number; z: number }[] = [];
    for (let x = LAKE.xW; x <= LAKE.xE - 8; x += 8) {
      const t = clamp((x - LAKE.taperFrom) / (LAKE.xE - LAKE.taperFrom), 0, 1);
      const half = Math.max(1.5, ((LAKE.zS - LAKE.zN) / 2) * Math.pow(1 - t, 0.75));
      const m = mid + Math.sin((x + 260) * 0.012) * 2.2 + t * 5;
      pts.push({ x, z: m + side * (half + off) });
    }
    return pts;
  };
  for (const side of [-1, 1] as const) {
    grass.add(ribbon(shorePts(side, 3.2), 8.5, 0.026, 1 / 9), undefined, "#586b3c");
    dirt.add(ribbon(shorePts(side, 6.2), 1.7, 0.032, 1 / 5)); // the trail
  }
  // shore oaks
  for (let i = 0; i < 26; i++) {
    const x = LAKE.xW + 14 + r() * (LAKE.xE - LAKE.xW - 40);
    const side = r() < 0.5 ? -1 : 1;
    const t = clamp((x - LAKE.taperFrom) / (LAKE.xE - LAKE.taperFrom), 0, 1);
    const half = Math.max(1.5, ((LAKE.zS - LAKE.zN) / 2) * Math.pow(1 - t, 0.75));
    const m = mid + Math.sin((x + 260) * 0.012) * 2.2 + t * 5;
    const z = m + side * (half + 9 + r() * 7);
    if (Math.abs(x - BRIDGE_CONGRESS.x) < 9 || Math.abs(x - BRIDGE_FIRST.x) < 8) continue;
    oak(trunkB, folB, x, z, 7200 + i, 3.4 + r() * 2.4);
  }
  // the tail of the lake disappears into trees (the walk stays dry)
  for (let i = 0; i < 7; i++) {
    oak(trunkB, folB, LAKE.xE - 12 + r() * 22, mid + 6 + (r() - 0.5) * 22, 7300 + i, 3.8 + r() * 2.2);
  }
  // boardwalk over the south shore edge (planks + rail posts)
  {
    const pts: { x: number; z: number }[] = [];
    for (let x = -78; x <= 26; x += 6) {
      const m = mid + Math.sin((x + 260) * 0.012) * 2.2;
      pts.push({ x, z: m + (LAKE.zS - LAKE.zN) / 2 - 1.2 + Math.sin(x * 0.05) * 1.4 });
    }
    conc.add(ribbon(pts, 2.4, 0.5, 1 / 4), undefined, "#9a8a6a");
    for (let i = 0; i < pts.length; i += 2) {
      const post = new THREE.CylinderGeometry(0.07, 0.07, 1.0, 5);
      metal.add(post, trs(pts[i].x, 0.9, pts[i].z - 1.1));
      post.dispose();
    }
  }

  /* -- bridges -- */
  for (const B of [BRIDGE_CONGRESS, BRIDGE_FIRST]) {
    const z0 = LAKE.zN - 9;
    const z1 = LAKE.zS + 9;
    const len = z1 - z0;
    const cz = (z0 + z1) / 2;
    // deck
    const deck = new THREE.BoxGeometry(B.w, 0.55, len);
    conc.add(deck, trs(B.x, DECK_Y, cz), "#cfc7b4");
    deck.dispose();
    // roadway + center line + sidewalks + railings
    const roadTop = new THREE.PlaneGeometry(B.w - 3.2, len - 1);
    roadTop.rotateX(-Math.PI / 2);
    road.add(roadTop, trs(B.x, DECK_Y + 0.29, cz));
    roadTop.dispose();
    for (let z = z0 + 3; z < z1 - 3; z += 4.2) {
      const dash = new THREE.PlaneGeometry(0.14, 2.1);
      dash.rotateX(-Math.PI / 2);
      paint.add(dash, trs(B.x, DECK_Y + 0.3, z));
      dash.dispose();
    }
    for (const side of [-1, 1] as const) {
      const walkStrip = new THREE.PlaneGeometry(1.35, len - 1);
      walkStrip.rotateX(-Math.PI / 2);
      plainConc.add(walkStrip, trs(B.x + side * (B.w / 2 - 0.95), DECK_Y + 0.3, cz));
      walkStrip.dispose();
      const railTop = new THREE.BoxGeometry(0.09, 0.09, len);
      trim.add(railTop, trs(B.x + side * (B.w / 2 - 0.1), DECK_Y + 1.18, cz));
      railTop.dispose();
      for (let pz = z0 + 1.5; pz < z1 - 1; pz += 4.4) {
        const post = new THREE.CylinderGeometry(0.05, 0.05, 0.88, 5);
        metal.add(post, trs(B.x + side * (B.w / 2 - 0.1), DECK_Y + 0.72, pz));
        post.dispose();
      }
    }
    // piers + (Congress) arch fascias
    const piers = [121, 130, 139, 148];
    for (const pz of piers) {
      const pier = new THREE.BoxGeometry(B.w - 1.5, DECK_Y, 1.7);
      conc.add(pier, trs(B.x, DECK_Y / 2 - 0.15, pz), "#b9b09c");
      pier.dispose();
    }
    if (B.arched) {
      for (const az of [125.5, 134.5, 143.5]) {
        for (const side of [-1, 1] as const) {
          const arch = new THREE.RingGeometry(3.1, 4.35, 16, 1, 0, Math.PI);
          arch.rotateY(Math.PI / 2);
          conc.add(arch, trs(B.x + side * (B.w / 2 - 0.05), 0.2, az), "#c4bba6");
          arch.dispose();
        }
        // deck soffit between arches carries the daytime bat roosts
        for (let i = 0; i < 3; i++) {
          const clump = new THREE.BoxGeometry(0.5 + r() * 0.7, 0.16, 0.24);
          batB.add(clump, trs(B.x - B.w / 2 + 1.4 + i * ((B.w - 2.8) / 2), DECK_Y - 0.36, az + (r() - 0.5) * 1.6));
          clump.dispose();
        }
      }
    }
    // bridge lamps
    for (const lz of [124, 136, 148]) {
      for (const side of [-1, 1] as const) {
        const pole = new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6);
        metal.add(pole, trs(B.x + side * (B.w / 2 - 0.45), DECK_Y + 1.9, lz));
        pole.dispose();
        const head = new THREE.SphereGeometry(0.16, 8, 6);
        lamp.add(head, trs(B.x + side * (B.w / 2 - 0.45), DECK_Y + 3.65, lz));
        head.dispose();
      }
    }
    // approach stubs joining the grid / south canopy
    const stubN = new THREE.PlaneGeometry(B.w - 3.2, 8);
    stubN.rotateX(-Math.PI / 2);
    road.add(stubN, trs(B.x, 0.031, z0 - 3.8));
    stubN.dispose();
    const stubS = new THREE.PlaneGeometry(B.w - 3.2, 10);
    stubS.rotateX(-Math.PI / 2);
    road.add(stubS, trs(B.x, 0.031, z1 + 4.6));
    stubS.dispose();
  }

  /* -- district hardscape, streets, sidewalks -- */
  {
    const base = new THREE.PlaneGeometry(DISTRICT.x1 - DISTRICT.x0 + 34, DISTRICT.z1 - DISTRICT.z0 + 10);
    base.rotateX(-Math.PI / 2);
    const uv = base.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 12, uv.getY(i) * 16);
    plainConc.add(base, trs((DISTRICT.x0 + DISTRICT.x1) / 2 - 12, 0.022, (DISTRICT.z0 + DISTRICT.z1) / 2));
    base.dispose();
  }
  const RW = 7;
  const roadRect = (x: number, z: number, w: number, d: number) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 8, (uv.getY(i) * d) / 8);
    road.add(g, trs(x, 0.03, z));
    g.dispose();
  };
  for (const ax of DISTRICT.avenues) roadRect(ax, (DISTRICT.z0 + DISTRICT.z1) / 2, RW, DISTRICT.z1 - DISTRICT.z0);
  for (const sz of DISTRICT.streets) roadRect((DISTRICT.x0 + DISTRICT.x1) / 2 - 12, sz, DISTRICT.x1 - DISTRICT.x0 + 34, RW);
  // lane dashes + crosswalks
  for (const ax of DISTRICT.avenues) {
    for (let z = DISTRICT.z0 + 4; z < DISTRICT.z1 - 4; z += 4.6) {
      if (DISTRICT.streets.some((sz) => Math.abs(sz - z) < 6)) continue;
      const dash = new THREE.PlaneGeometry(0.14, 2.2);
      dash.rotateX(-Math.PI / 2);
      paint.add(dash, trs(ax, 0.036, z));
      dash.dispose();
    }
    for (const sz of DISTRICT.streets) {
      for (const side of [-1, 1] as const) {
        for (let k = -2; k <= 2; k++) {
          const bar = new THREE.PlaneGeometry(0.42, 2.4);
          bar.rotateX(-Math.PI / 2);
          paint.add(bar, trs(ax + k * 0.85, 0.038, sz + side * (RW / 2 + 1.6)));
          bar.dispose();
        }
      }
    }
  }
  // sidewalk strips along every district street + avenue
  const walkStrips: { x0: number; x1: number; z0: number; z1: number }[] = [];
  for (const ax of DISTRICT.avenues) {
    for (const side of [-1, 1] as const) {
      walkStrips.push({ x0: ax + side * (RW / 2 + 1.2) - 0.9, x1: ax + side * (RW / 2 + 1.2) + 0.9, z0: DISTRICT.z0, z1: DISTRICT.z1 });
    }
  }
  for (const sz of DISTRICT.streets) {
    for (const side of [-1, 1] as const) {
      walkStrips.push({ x0: DISTRICT.x0 - 26, x1: DISTRICT.x1 + 4, z0: sz + side * (RW / 2 + 1.2) - 0.9, z1: sz + side * (RW / 2 + 1.2) + 0.9 });
    }
  }
  for (const s of walkStrips) {
    const g = new THREE.PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (s.x1 - s.x0)) / 3.4, (uv.getY(i) * (s.z1 - s.z0)) / 3.4);
    plainConc.add(g, trs((s.x0 + s.x1) / 2, 0.04, (s.z0 + s.z1) / 2));
    g.dispose();
  }

  /* -- downtown sidewalks are cracked too (the postcard carries the point) -- */
  for (const s of walkStrips) {
    const horiz = s.x1 - s.x0 > s.z1 - s.z0;
    const len = horiz ? s.x1 - s.x0 : s.z1 - s.z0;
    for (let d = 4; d < len - 4; d += 7 + r() * 9) {
      if (r() > 0.62) continue;
      const x = horiz ? s.x0 + d : (s.x0 + s.x1) / 2;
      const z = horiz ? (s.z0 + s.z1) / 2 : s.z0 + d;
      crackDecal(cracks, x, z, Math.floor(r() * 12), r() * Math.PI, 0.65 + r() * 0.45);
    }
  }
  crackDecal(cracks, 20.5, 74, 13, 0.4, 0.8);
  crackDecal(cracks, 62.5, 22, 14, 2.1, 0.7);
  crackDecal(cracks, 34, 3.5, 12, 1.2, 0.75);

  /* -- cones, steel plates, downed scooters -- */
  // two proper work zones: plate + cones + barricades
  const workZones: [number, number, number][] = [
    [DISTRICT.avenues[1] + RW / 2 + 1.2, 78, 0],
    [30, DISTRICT.streets[1] - RW / 2 - 1.2, Math.PI / 2],
  ];
  workZones.forEach(([wx, wz, wyaw], wi) => {
    steelPlate(plate, wx, wz, 7400 + wi, true);
    barricade(walls, metal, wx - Math.sin(wyaw + Math.PI / 2) * 2.6, wz - Math.cos(wyaw + Math.PI / 2) * 2.6, wyaw, 7500 + wi);
    barricade(walls, metal, wx + Math.sin(wyaw + Math.PI / 2) * 2.6, wz + Math.cos(wyaw + Math.PI / 2) * 2.6, wyaw, 7520 + wi);
    cone(walls, wx - 1.4, wz + 1.2, 7540 + wi);
    cone(walls, wx + 1.5, wz - 1.1, 7560 + wi);
  });
  // loose cones + solo plates along the strips
  const conePts: [number, number][] = [
    [17.2, 96],
    [54.2, 44],
    [61.8, 96],
    [12.2, 52],
    [20.4, 12.2],
    [46, 3.6],
    [61.8, -33.8],
    [37, 62.2],
    [-2, 99.6],
    [66, 62.4],
  ];
  conePts.forEach(([cx, cz], i) => cone(walls, cx, cz, 7600 + i));
  const platePts: [number, number][] = [
    [26, 96.2],
    [61.9, 30],
    [12.1, -12],
    [44, 53.8],
  ];
  platePts.forEach(([px, pz], i) => steelPlate(plate, px, pz, 7700 + i));
  // scooters dumped where riders left them
  const scooterPts: [number, number][] = [
    [19.9, 88],
    [21, 87.2],
    [54.1, 70],
    [61.9, 50],
    [40, 12.4],
    [41.3, 11.8],
    [12.4, 30],
    [-4, 96.4],
    [66.5, 3.9],
    [30, -33.6],
  ];
  scooterPts.forEach(([sx, sz], i) => scooter(walls, metal, sx, sz, 7800 + i));

  /* -- filler towers on the blocks -- */
  const towerLots: [number, number, number, number, number][] = [
    // [x, z, w(x), d(z), h]
    [30, 96, 14, 11, 34],
    [47, 95, 12, 12, 26],
    [68, 84, 13, 14, 44],
    [30, 66, 15, 13, 52],
    [47, 70, 11, 11, 30],
    [8, 74, 10, 12, 24],
    [36, 42, 14, 14, 58],
    [8, 36, 11, 12, 28],
    [68, 12, 13, 13, 40],
    [30, 18, 12, 12, 36],
    [47, 20, 11, 11, 24],
    [8, -8, 11, 11, 22],
    [36, -16, 13, 12, 46],
    [66, -20, 12, 12, 30],
    [20, -34, 11, 11, 26],
    [48, -36, 12, 12, 34],
    [-16, 76, 12, 12, 30],
    [-2, 44, 12, 13, 40],
    [-16, 28, 11, 11, 26],
    [-2, -18, 12, 12, 44],
    [-16, -26, 11, 12, 22],
  ];
  towerLots.forEach(([x, z, w, d, h], i) => {
    const style = i % 3;
    const shaft = uvStyle(new THREE.BoxGeometry(w, h, d), style);
    glass.add(shaft, trs(x, h / 2 + 0.1, z, (rng(7900 + i)() - 0.5) * 0.05));
    shaft.dispose();
    const parapetC = i % 2 ? "#565049" : "#3e3b38";
    const roof = new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4);
    walls.add(roof, trs(x, h + 0.3, z), parapetC);
    roof.dispose();
    const rr = rng(8000 + i);
    for (let u = 0; u < 2; u++) {
      const unit = new THREE.BoxGeometry(1.4 + rr() * 2, 1 + rr() * 1.2, 1.4 + rr() * 1.6);
      metal.add(unit, trs(x + (rr() - 0.5) * (w - 4), h + 1.1, z + (rr() - 0.5) * (d - 4), rr() * 3));
      unit.dispose();
    }
    // two towers get the rooftop pools the drone always finds
    if (i === 3 || i === 8) {
      const pool = new THREE.PlaneGeometry(w * 0.42, d * 0.3);
      pool.rotateX(-Math.PI / 2);
      water.add(pool, trs(x - w * 0.12, h + 0.62, z + d * 0.14));
      pool.dispose();
      const deck = new THREE.BoxGeometry(w * 0.6, 0.16, d * 0.48);
      conc.add(deck, trs(x - w * 0.12, h + 0.5, z + d * 0.14), "#d8d0bc");
      deck.dispose();
    }
  });

  /* -- the landmarks -- */
  frostTower(glass, walls, trim);
  austonian(glass, walls, trim);
  independent(glass, trim, walls);
  sailTower(glass, walls, lib);
  utTower(walls, trim, grass);

  /* -- waterfront green between the sail and the grid -- */
  for (let i = 0; i < 6; i++) {
    oak(trunkB, folB, -22 + r() * 18, 96 + r() * 14, 8600 + i, 3 + r() * 2);
  }

  return {
    water: water.build(),
    grass: grass.build(),
    dirt: dirt.build(),
    road: road.build(),
    conc: conc.build(),
    plainConc: plainConc.build(),
    paint: paint.build(),
    cracks: cracks.build(),
    walls: walls.build(),
    metal: metal.build(),
    trim: trim.build(),
    glass: glass.build(),
    plate: plate.build(),
    lamp: lamp.build(),
    glow: glow.build(),
    trunk: trunkB.build(),
    foliage: folB.build(),
    bats: batB.build(),
  };
}

const builtDistrict = once(buildDistrict);

export function District() {
  const lib = worldLib();
  const g = builtDistrict();
  return (
    <group>
      {g.water && <mesh geometry={g.water} material={lib.mats.water} />}
      {g.grass && <mesh geometry={g.grass} material={lib.mats.grass} receiveShadow />}
      {g.dirt && <mesh geometry={g.dirt} material={lib.mats.dirt} />}
      {g.road && <mesh geometry={g.road} material={lib.mats.asphalt} receiveShadow />}
      {g.conc && <mesh geometry={g.conc} material={lib.mats.concrete} castShadow receiveShadow />}
      {g.plainConc && <mesh geometry={g.plainConc} material={lib.mats.concretePlain} receiveShadow />}
      {g.paint && <mesh geometry={g.paint} material={lib.mats.paint} />}
      {g.cracks && <mesh geometry={g.cracks} material={lib.mats.cracks} />}
      {g.walls && <mesh geometry={g.walls} material={lib.mats.walls} castShadow receiveShadow />}
      {g.metal && <mesh geometry={g.metal} material={lib.mats.metal} castShadow />}
      {g.trim && <mesh geometry={g.trim} material={lib.mats.trim} castShadow />}
      {g.glass && <mesh geometry={g.glass} material={lib.mats.towerGlass} castShadow />}
      {g.plate && <mesh geometry={g.plate} material={lib.mats.plate} castShadow />}
      {g.lamp && <mesh geometry={g.lamp} material={lib.mats.lamp} />}
      {g.trunk && <mesh geometry={g.trunk} material={lib.mats.trunk} castShadow />}
      {g.foliage && <mesh geometry={g.foliage} material={lib.mats.foliage} castShadow />}
      {g.bats && <mesh geometry={g.bats} material={lib.mats.rubber} />}
    </group>
  );
}

/* ---------- the living layer: kayaks, the bat emergence, scenic traffic ---------- */

type Kayak = { hull: THREE.Group; cx: number; cz: number; ax: number; az: number; w: number; phase: number; paddle: THREE.Mesh };

function buildKayak(seed: number): { group: THREE.Group; paddle: THREE.Mesh } {
  const r = rng(seed);
  const colors = ["#b4452f", "#3d7a8a", "#c79a3a", "#5a7a45", "#8a4a6a"];
  const group = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 2.3, 3, 8),
    new THREE.MeshStandardMaterial({ color: pick(r, colors), roughness: 0.6 }),
  );
  hull.rotation.x = Math.PI / 2;
  hull.scale.y = 0.85;
  hull.scale.x = 0.9;
  hull.position.y = 0.06;
  group.add(hull);
  const skin = new THREE.MeshStandardMaterial({ color: "#c8987a", roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 3, 8), new THREE.MeshStandardMaterial({ color: "#e0d8c2", roughness: 0.9 }));
  torso.position.y = 0.42;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), skin);
  head.position.y = 0.72;
  group.add(head);
  const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6), new THREE.MeshStandardMaterial({ color: "#d8cfa8", roughness: 0.8 }));
  paddle.rotation.z = Math.PI / 2;
  paddle.position.y = 0.52;
  group.add(paddle);
  return { group, paddle };
}

/** A muted scenic car for the district loops (cheap, box-built). */
function buildBoxCar(seed: number): THREE.Group {
  const r = rng(seed);
  const colors = ["#8a8378", "#5d6a68", "#a89c82", "#6d5f56", "#4a5568", "#9a5540"];
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 4.1), new THREE.MeshStandardMaterial({ color: pick(r, colors), roughness: 0.5, metalness: 0.25 }));
  body.position.y = 0.42;
  body.castShadow = true;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 2.0), new THREE.MeshStandardMaterial({ color: "#242b31", roughness: 0.15, metalness: 0.5 }));
  cab.position.set(0, 0.88, -0.25);
  g.add(cab);
  return g;
}

type ShuttleLane = { a: THREE.Vector3; b: THREE.Vector3; cars: { g: THREE.Group; t: number; speed: number }[] };

export function DistrictLife() {
  const lib = worldLib();

  const kayaks = useMemo<Kayak[]>(() => {
    const defs: [number, number, number, number, number][] = [
      // [cx, cz, ax, az, w]
      [-56, 134, 30, 6, 0.05],
      [-102, 137, 42, 7, 0.038],
      [-20, 132, 22, 5, 0.06],
      [14, 136, 18, 4, 0.045],
      [-142, 133, 30, 6, 0.052],
    ];
    return defs.map(([cx, cz, ax, az, w], i) => {
      const { group, paddle } = buildKayak(8800 + i);
      return { hull: group, cx, cz, ax, az, w, phase: i * 1.9, paddle };
    });
  }, []);

  /* the emergence: a ribbon of bats curling out from under the Congress
     bridge and southeast over the water — night only; by day they sleep in
     the clusters under the deck */
  const batMesh = useRef<THREE.InstancedMesh>(null);
  const BATS = 220;
  const batGeo = useMemo(() => new THREE.PlaneGeometry(0.72, 0.2), []);
  const batMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#302a1e", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    [],
  );
  const batSeed = useMemo(() => Array.from({ length: BATS }, (_, i) => rng(9000 + i)()), []);

  const shuttles = useMemo<ShuttleLane[]>(() => {
    const lanes: [number, number, number, number, number][] = [
      // [x0, z0, x1, z1, n]
      [BRIDGE_CONGRESS.x - 1.6, 170, BRIDGE_CONGRESS.x - 1.6, 106, 2],
      [BRIDGE_CONGRESS.x + 1.6, 106, BRIDGE_CONGRESS.x + 1.6, 170, 2],
      [2, DISTRICT.streets[0] - 1.6, 78, DISTRICT.streets[0] - 1.6, 2],
      [78, DISTRICT.streets[0] + 1.6, 2, DISTRICT.streets[0] + 1.6, 1],
      [DISTRICT.avenues[1] - 1.6, 104, DISTRICT.avenues[1] - 1.6, -42, 2],
      [DISTRICT.avenues[1] + 1.6, -42, DISTRICT.avenues[1] + 1.6, 104, 1],
      [BRIDGE_FIRST.x - 1.5, 168, BRIDGE_FIRST.x - 1.5, 108, 1],
      [BRIDGE_FIRST.x + 1.5, 108, BRIDGE_FIRST.x + 1.5, 168, 1],
    ];
    let seed = 9200;
    return lanes.map(([x0, z0, x1, z1, n]) => ({
      a: new THREE.Vector3(x0, 0, z0),
      b: new THREE.Vector3(x1, 0, z1),
      cars: Array.from({ length: n }, (_, i) => ({ g: buildBoxCar(seed++), t: (i + 0.3) / n, speed: 0.032 + rng(seed + 31)() * 0.014 })),
    }));
  }, []);

  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const v3 = useMemo(() => new THREE.Vector3(), []);
  const s3 = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.06);
    const t = clock.elapsedTime;

    for (const k of kayaks) {
      k.phase += dt * k.w * 9;
      const x = k.cx + Math.sin(k.phase * 0.55) * k.ax;
      const z = k.cz + Math.sin(k.phase * 0.4 + 1.3) * k.az;
      const vx = Math.cos(k.phase * 0.55) * 0.55 * k.ax;
      const vz = Math.cos(k.phase * 0.4 + 1.3) * 0.4 * k.az;
      k.hull.position.set(x, 0.05 + Math.sin(k.phase * 2.1) * 0.025, z);
      k.hull.rotation.y = Math.atan2(vx, vz);
      k.paddle.rotation.x = Math.sin(k.phase * 2.1) * 0.5;
    }

    // bats
    const night = walkState.night;
    const bm = batMesh.current;
    if (bm) {
      const show = night > 0.22;
      bm.visible = show;
      batMat.opacity = clamp((night - 0.22) / 0.5, 0, 1) * 0.9;
      if (show) {
        for (let i = 0; i < BATS; i++) {
          const u = (batSeed[i] + t * 0.05 * (0.7 + batSeed[i] * 0.6)) % 1;
          const sway = batSeed[i] * Math.PI * 2;
          const x = BRIDGE_CONGRESS.x + 2 + u * 150 + Math.sin(u * 9 + sway) * (6 + u * 6);
          const z = 136 + u * 78 + Math.cos(u * 7 + sway) * (5 + u * 8);
          const y = DECK_Y - 0.6 + u * 30 + Math.sin(u * 16 + sway) * 1.6;
          e.set(0, Math.atan2(Math.cos(u * 9 + sway), 1), Math.sin(t * 26 + i) * 0.7);
          q.setFromEuler(e);
          v3.set(x, y, z);
          m4.compose(v3, q, s3);
          bm.setMatrixAt(i, m4);
        }
        bm.instanceMatrix.needsUpdate = true;
      }
    }

    // scenic traffic
    for (const lane of shuttles) {
      for (const c of lane.cars) {
        c.t = (c.t + c.speed * dt) % 1;
        c.g.position.lerpVectors(lane.a, lane.b, c.t);
        const onBridge =
          Math.abs(c.g.position.x - BRIDGE_CONGRESS.x) < 2.2 || Math.abs(c.g.position.x - BRIDGE_FIRST.x) < 2.2
            ? c.g.position.z > LAKE.zN - 10 && c.g.position.z < LAKE.zS + 10
            : false;
        c.g.position.y = onBridge ? DECK_Y + 0.3 : 0.03;
        c.g.rotation.y = Math.atan2(lane.b.x - lane.a.x, lane.b.z - lane.a.z);
      }
    }
    void lib;
  });

  return (
    <group>
      {kayaks.map((k, i) => (
        <primitive key={i} object={k.hull} />
      ))}
      <instancedMesh ref={batMesh} args={[batGeo, batMat, BATS]} frustumCulled={false} />
      {shuttles.map((lane, li) => lane.cars.map((c, ci) => <primitive key={`${li}-${ci}`} object={c.g} />))}
    </group>
  );
}
