/**
 * Downtown: mid-rise blocks hugging the walk on the last leg, facades from
 * the canvas atlas (their windows light at night), parapets, rooftop units,
 * awnings at street level, and a taller second rank filling the skyline.
 */
import * as THREE from "three";
import { GeoBatch, once, trs } from "./util";
import { worldLib, FACADE_STYLES } from "./materials";
import { rng, pick } from "./rng";
import { DOWNTOWN_Z, FROST_CLEAR, INTERSECTIONS } from "./route";

const ROOFS = ["#4a4642", "#565049", "#3e3b38"] as const;
const AWNINGS = ["#7a3f35", "#33503f", "#3c4a63", "#6b5433", "#54394f"] as const;

/** One vertical facade plane, uv-windowed to a style column, floors scaled. */
function facadePlane(width: number, height: number, style: number) {
  const g = new THREE.PlaneGeometry(width, height);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const floors = Math.min(1, height / 26);
  const pad = 0.006;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, style / FACADE_STYLES + pad + uv.getX(i) * (1 / FACADE_STYLES - pad * 2), uv.getY(i) * floors);
  }
  return g;
}

type B = { facades: GeoBatch; walls: GeoBatch; metal: GeoBatch };

function building(b: B, r: () => number, cx: number, cz: number, w: number, d: number, h: number) {
  const style = Math.floor(r() * FACADE_STYLES);
  // four faces, segmented so windows keep sane proportions
  const faces: [number, number, number, number, number][] = [
    // [len, ox, oz, yaw, offAxis] — front (+z), back, right (+x), left
    [w, 0, d / 2, 0, 0],
    [w, 0, -d / 2, Math.PI, 0],
    [d, w / 2, 0, Math.PI / 2, 0],
    [d, -w / 2, 0, -Math.PI / 2, 0],
  ];
  for (const [len, ox, oz, yaw] of faces) {
    const segs = Math.max(1, Math.round(len / 10));
    const segLen = len / segs;
    for (let sIdx = 0; sIdx < segs; sIdx++) {
      const along = -len / 2 + segLen * (sIdx + 0.5);
      const g = facadePlane(segLen, h, style);
      const lx = ox + (yaw === 0 || yaw === Math.PI ? along * (yaw === Math.PI ? -1 : 1) : 0);
      const lz = oz + (yaw === Math.PI / 2 || yaw === -Math.PI / 2 ? along * (yaw === Math.PI / 2 ? -1 : 1) : 0);
      b.facades.add(g, trs(cx + lx, h / 2 + 0.02, cz + lz, yaw));
      g.dispose();
    }
  }
  // core (fills corners), roof cap + parapet
  const core = new THREE.BoxGeometry(w - 0.08, h, d - 0.08);
  b.walls.add(core, trs(cx, h / 2, cz), "#8a8378");
  core.dispose();
  const roofC = pick(r, ROOFS);
  const roof = new THREE.BoxGeometry(w + 0.15, 0.35, d + 0.15);
  b.walls.add(roof, trs(cx, h + 0.15, cz), roofC);
  roof.dispose();
  // parapet as a rim, so the roof surface actually shows from above
  const rimT = 0.35;
  const rimX = new THREE.BoxGeometry(w + 0.35, 0.75, rimT);
  b.walls.add(rimX, trs(cx, h + 0.4, cz - d / 2 - 0.08), "#6e675c");
  b.walls.add(rimX, trs(cx, h + 0.4, cz + d / 2 + 0.08), "#6e675c");
  rimX.dispose();
  const rimZ = new THREE.BoxGeometry(rimT, 0.75, d + 0.35);
  b.walls.add(rimZ, trs(cx - w / 2 - 0.08, h + 0.4, cz), "#6e675c");
  b.walls.add(rimZ, trs(cx + w / 2 + 0.08, h + 0.4, cz), "#6e675c");
  rimZ.dispose();
  // rooftop units
  const units = 1 + Math.floor(r() * 3);
  for (let i = 0; i < units; i++) {
    const u = new THREE.BoxGeometry(1.2 + r() * 2, 0.9 + r() * 1.4, 1.2 + r() * 1.6);
    b.metal.add(u, trs(cx + (r() - 0.5) * (w - 4), h + 1 + 0.4, cz + (r() - 0.5) * (d - 4), r() * 3));
    u.dispose();
  }
}

function buildDowntown() {
  const b: B = { facades: new GeoBatch(), walls: new GeoBatch(), metal: new GeoBatch() };
  const r = rng(6001);
  const skip = (z: number, half: number) => INTERSECTIONS.some((i) => i.signal && Math.abs(i.at.z - z) < half + 10);
  // the west-side notch where Frost Bank Tower stands (built in district.tsx)
  const inFrostSlot = (side: number, z: number, half: number) =>
    side === -1 && z + half > FROST_CLEAR[0] && z - half < FROST_CLEAR[1];

  // front rows on both sides of the last leg
  for (const side of [-1, 1] as const) {
    let z = DOWNTOWN_Z - 4;
    while (z > -52) {
      const w = 13 + r() * 11; // along z
      const d = 15 + r() * 8; // toward the street
      if (!skip(z - w / 2, w / 2) && !inFrostSlot(side, z - w / 2, w / 2)) {
        const h = 9 + r() * 16;
        const cx = 150 + side * (11.6 + d / 2);
        building(b, r, cx, z - w / 2, d, w, h);
        // awning over the walk side: a sloped canopy off the front face
        if (side === -1 && r() < 0.55) {
          const aw = new THREE.BoxGeometry(1.7, 0.12, w * 0.55);
          b.walls.add(
            aw,
            trs(150 - 11.6 - 0.75, 3.3, z - w / 2, 0, 1, 1, 1, 0, THREE.MathUtils.degToRad(14)),
            pick(r, AWNINGS),
          );
          aw.dispose();
        }
      }
      z -= w + 2.5 + r() * 4;
    }
  }
  // taller second rank, sparser
  for (const side of [-1, 1] as const) {
    let z = DOWNTOWN_Z - 14;
    while (z > -44) {
      const w = 16 + r() * 14;
      if (r() < 0.75 && !inFrostSlot(side, z - w / 2, w / 2)) {
        const d = 16 + r() * 10;
        const h = 22 + r() * 22;
        building(b, r, 150 + side * (34 + d / 2 + r() * 8), z - w / 2, d, w, h);
      }
      z -= w + 6 + r() * 10;
    }
  }
  return { facades: b.facades.build(), walls: b.walls.build(), metal: b.metal.build() };
}

const builtDowntown = once(buildDowntown);

export function Downtown() {
  const lib = worldLib();
  const g = builtDowntown();
  return (
    <group>
      {g.walls && <mesh geometry={g.walls} material={lib.mats.walls} castShadow receiveShadow />}
      {g.facades && <mesh geometry={g.facades} material={lib.mats.facade} castShadow />}
      {g.metal && <mesh geometry={g.metal} material={lib.mats.metal} castShadow />}
    </group>
  );
}
