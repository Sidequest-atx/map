/**
 * The seeded house generator. Every parcel from the plat gets a one-of-a-kind
 * house — story count, palette, roof, porch, garage, chimney, shutters, AC
 * unit, window layout all drawn from the lot's seed — but the architecture
 * merges into a handful of draw calls. Windows split into two merged sets:
 * ones that light up at night and ones that stay dark.
 */
import * as THREE from "three";
import { GeoBatch, once, trs } from "./util";
import { worldLib } from "./materials";
import { rng, pick } from "./rng";
import { lots, type Lot } from "./lots";

/* Palette graded to the site: creams, warm tans, olive-grays, sun-baked
   brick — no cool blues, so the world sits inside the brand's beige field. */
const WALLS = ["#e2dbc9", "#d6cbb2", "#c4bda8", "#a9af97", "#9aa38e", "#b58a6c", "#cbb894", "#d8cfb6", "#a45140", "#b0a488", "#8f8873"] as const;
const ROOFS = ["#4f4a42", "#5e5850", "#6f5c4b", "#474f41", "#7b4c3b", "#57544a", "#3f3d36"] as const;
const ACCENTS = ["#5d3f35", "#41503c", "#4e4438", "#6a3b33", "#2f4a3c", "#54442f"] as const;

/** Pitched roof: slopes (roof material) + gable infill (wall material). */
function roofGeos(w: number, d: number, rise: number, over = 0.55) {
  const hw = w / 2 + over;
  const hd = d / 2 + over;
  const slopes = new THREE.BufferGeometry();
  // ridge along local x
  const rInset = 0;
  const e = [
    [-hw, 0, -hd],
    [hw, 0, -hd],
    [hw, 0, hd],
    [-hw, 0, hd],
  ];
  const r0 = [-w / 2 + rInset, rise, 0];
  const r1 = [w / 2 - rInset, rise, 0];
  const tri = (a: number[], b: number[], c: number[]) => [...a, ...b, ...c];
  const pos = new Float32Array([
    // +z slope
    ...tri(e[3], e[2], r1),
    ...tri(e[3], r1, r0),
    // -z slope
    ...tri(e[1], e[0], r0),
    ...tri(e[1], r0, r1),
  ]);
  slopes.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    uv[i * 2] = (pos[i * 3] + hw) / (hw * 2);
    uv[i * 2 + 1] = (pos[i * 3 + 2] + hd) / (hd * 2);
  }
  slopes.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  slopes.computeVertexNormals();

  const gables = new THREE.BufferGeometry();
  const gp = new Float32Array([...tri(e[0], e[3], r0), ...tri(e[2], e[1], r1)]);
  gables.setAttribute("position", new THREE.BufferAttribute(gp, 3));
  const guv = new Float32Array((gp.length / 3) * 2);
  gables.setAttribute("uv", new THREE.BufferAttribute(guv, 2));
  gables.computeVertexNormals();
  return { slopes, gables };
}

type Batches = {
  walls: GeoBatch;
  roofs: GeoBatch;
  trim: GeoBatch;
  glassCool: GeoBatch;
  glassLit: GeoBatch;
  metal: GeoBatch;
};

function buildHouse(b: Batches, lot: Lot) {
  const r = rng(lot.seed);
  const twoStory = !lot.back && r() < 0.34;
  const gableEnd = !twoStory && r() < 0.3;
  const wall = pick(r, WALLS);
  const roof = pick(r, ROOFS);
  const accent = pick(r, ACCENTS);
  const scale = lot.back ? 0.92 : 1;

  let w = (twoStory ? 8.6 + r() * 1.6 : 11 + r() * 2.4) * scale;
  let d = (8 + r() * 1.4) * scale;
  const h = (twoStory ? 5.9 : 3.1) * scale;
  const rise = (twoStory ? 2.2 : 2.6) * scale * (0.85 + r() * 0.35);
  if (gableEnd) {
    const t = w;
    w = d;
    d = t;
  }

  const { cx, cz, yaw } = lot;
  const base = trs(cx, 0.02, cz, yaw);
  const at = (lx: number, ly: number, lz: number, ryaw = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
    base.clone().multiply(trs(lx, ly, lz, ryaw, sx, sy, sz, rx, rz));

  // body
  const body = new THREE.BoxGeometry(w, h, d);
  b.walls.add(body, at(0, h / 2, 0), wall);
  body.dispose();
  // foundation strip
  const found = new THREE.BoxGeometry(w + 0.2, 0.35, d + 0.2);
  b.walls.add(found, at(0, 0.18, 0), "#8f887a");
  found.dispose();

  // roof (ridge along the long axis; gableEnd turns it toward the street)
  const rg = roofGeos(gableEnd ? d : w, gableEnd ? w : d, rise);
  const roofYaw = gableEnd ? Math.PI / 2 : 0;
  b.roofs.add(rg.slopes, at(0, h, 0, roofYaw), roof);
  b.walls.add(rg.gables, at(0, h, 0, roofYaw), wall);
  rg.slopes.dispose();
  rg.gables.dispose();

  // chimney
  if (r() < 0.42) {
    const ch = new THREE.BoxGeometry(0.62, rise + 1.1, 0.62);
    b.walls.add(ch, at(w * (r() < 0.5 ? -0.22 : 0.22), h + rise / 2 + 0.2, (r() - 0.5) * d * 0.2), "#7d6a58");
    ch.dispose();
  }

  const front = d / 2;
  const win = new THREE.PlaneGeometry(1.0, 1.15);
  const winWide = new THREE.PlaneGeometry(1.7, 1.25);
  const doorG = new THREE.BoxGeometry(1.05, 2.15, 0.12);
  const shutter = new THREE.BoxGeometry(0.24, 1.15, 0.05);

  // front door, off-center
  const doorX = w * (r() < 0.5 ? -0.16 : 0.16);
  b.walls.add(doorG, at(doorX, 1.1, front + 0.04), accent);

  // front windows
  const winY = twoStory ? 1.7 : 1.75;
  const spots = [-w * 0.34, -w * 0.1, w * 0.14, w * 0.34].filter((x) => Math.abs(x - doorX) > 1.3);
  const useShutters = r() < 0.3;
  const nWin = lot.back ? 2 : 2 + Math.floor(r() * (spots.length - 1));
  for (let i = 0; i < Math.min(nWin, spots.length); i++) {
    const wide = r() < 0.3;
    const g = wide ? winWide : win;
    const target = r() < 0.55 ? b.glassLit : b.glassCool;
    target.add(g, at(spots[i], winY, front + 0.03));
    if (useShutters && !wide) {
      b.walls.add(shutter, at(spots[i] - 0.68, winY, front + 0.04), accent);
      b.walls.add(shutter, at(spots[i] + 0.68, winY, front + 0.04), accent);
    }
    if (twoStory) (r() < 0.55 ? b.glassLit : b.glassCool).add(win, at(spots[i], 4.4, front + 0.03));
  }
  // one window per side
  const sideG = win;
  const sideYawL = Math.PI / 2;
  (r() < 0.4 ? b.glassLit : b.glassCool).add(sideG, at(w / 2 + 0.03, winY, (r() - 0.5) * d * 0.4, sideYawL));
  (r() < 0.4 ? b.glassLit : b.glassCool).add(sideG, at(-w / 2 - 0.03, winY, (r() - 0.5) * d * 0.4, -sideYawL));

  // porch
  if (!lot.back && !twoStory && r() < 0.45) {
    const pw = 3.6;
    const slab = new THREE.BoxGeometry(pw, 0.22, 1.7);
    b.trim.add(slab, at(doorX, 0.13, front + 0.9));
    const post = new THREE.CylinderGeometry(0.09, 0.09, 2.45, 8);
    b.trim.add(post, at(doorX - pw / 2 + 0.25, 1.35, front + 1.5));
    b.trim.add(post, at(doorX + pw / 2 - 0.25, 1.35, front + 1.5));
    const proof = new THREE.BoxGeometry(pw + 0.4, 0.14, 2.0);
    b.roofs.add(proof, at(doorX, 2.62, front + 0.85, 0, 1, 1, 1, 0.1), roof);
    slab.dispose();
    post.dispose();
    proof.dispose();
  }

  // garage beside the drive
  if (lot.drive) {
    const gb = lot.drive.b;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // lateral component of the drive endpoint relative to the house center
    const dxw = gb.x - cx;
    const dzw = gb.z - cz;
    const latX = dxw - (dxw * fx + dzw * fz) * fx;
    const latZ = dzw - (dxw * fx + dzw * fz) * fz;
    const gx = cx + latX;
    const gz = cz + latZ;
    const gw = 4.0;
    const gd = 6.2;
    const gh = 2.9;
    const gBase = trs(gx, 0.02, gz, yaw);
    const gAt = (lx: number, ly: number, lz: number) => gBase.clone().multiply(trs(lx, ly, lz));
    const gGeo = new THREE.BoxGeometry(gw, gh, gd);
    b.walls.add(gGeo, gAt(0, gh / 2, -0.6), wall);
    gGeo.dispose();
    const gr = roofGeos(gw, gd, 1.1, 0.4);
    b.roofs.add(gr.slopes, gBase.clone().multiply(trs(0, gh, -0.6, Math.PI / 2)), roof);
    b.walls.add(gr.gables, gBase.clone().multiply(trs(0, gh, -0.6, Math.PI / 2)), wall);
    gr.slopes.dispose();
    gr.gables.dispose();
    const doorPlane = new THREE.PlaneGeometry(3.2, 2.25);
    b.walls.add(doorPlane, gAt(0, 1.2, gd / 2 - 0.55), "#ded8c9");
    doorPlane.dispose();
    // door panel lines
    for (let k = 0; k < 3; k++) {
      const line = new THREE.BoxGeometry(3.2, 0.05, 0.02);
      b.walls.add(line, gAt(0, 0.7 + k * 0.55, gd / 2 - 0.53), "#b3ac9c");
      line.dispose();
    }
  }

  // AC unit on a side wall
  if (!lot.back && r() < 0.6) {
    const ac = new THREE.BoxGeometry(0.75, 0.7, 0.75);
    const side = r() < 0.5 ? 1 : -1;
    b.metal.add(ac, at(side * (w / 2 + 0.5), 0.37, (r() - 0.5) * d * 0.5));
    ac.dispose();
  }

  win.dispose();
  winWide.dispose();
  doorG.dispose();
  shutter.dispose();
}

function buildAll() {
  const b: Batches = {
    walls: new GeoBatch(),
    roofs: new GeoBatch(),
    trim: new GeoBatch(),
    glassCool: new GeoBatch(),
    glassLit: new GeoBatch(),
    metal: new GeoBatch(),
  };
  for (const lot of lots()) buildHouse(b, lot);
  return {
    walls: b.walls.build(),
    roofs: b.roofs.build(),
    trim: b.trim.build(),
    glassCool: b.glassCool.build(),
    glassLit: b.glassLit.build(),
    metal: b.metal.build(),
  };
}

const builtHouses = once(buildAll);

export function Houses() {
  const lib = worldLib();
  const g = builtHouses();
  return (
    <group>
      {g.walls && <mesh geometry={g.walls} material={lib.mats.walls} castShadow receiveShadow />}
      {g.roofs && <mesh geometry={g.roofs} material={lib.mats.roofs} castShadow receiveShadow />}
      {g.trim && <mesh geometry={g.trim} material={lib.mats.trim} castShadow receiveShadow />}
      {g.glassCool && <mesh geometry={g.glassCool} material={lib.mats.glassCool} />}
      {g.glassLit && <mesh geometry={g.glassLit} material={lib.mats.glassLit} />}
      {g.metal && <mesh geometry={g.metal} material={lib.mats.metal} castShadow />}
    </group>
  );
}
