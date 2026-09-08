/**
 * Barton Springs as a real place: the spring-green pool behind its dam, the
 * creek entering and leaving, the bathhouse, the diving board, towels on the
 * lawn — with the water actually moving.
 */
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GeoBatch, once, trs, ribbon } from "./util";
import { worldLib } from "./materials";
import { rng, pick } from "./rng";
import { BARTON_AT } from "./route";
import { oak } from "./nature";

const TOWELS = ["#b2543f", "#3d5c88", "#c9a13c", "#5b7d54", "#8a4a6b", "#d8d2c0"] as const;

function buildBarton() {
  const conc = new GeoBatch();
  const water = new GeoBatch();
  const trim = new GeoBatch();
  const walls = new GeoBatch();
  const roofs = new GeoBatch();
  const towels = new GeoBatch();
  const trunkB = new GeoBatch();
  const folB = new GeoBatch();
  const r = rng(1917);

  const { x: BX, z: BZ } = BARTON_AT;
  const at = (lx: number, ly: number, lz: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
    trs(BX + lx, ly, BZ + lz, ry, sx, sy, sz, rx, rz);

  /* deck around the pool */
  {
    const deck = new THREE.PlaneGeometry(42, 21);
    deck.rotateX(-Math.PI / 2);
    const uv = deck.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3);
    conc.add(deck, at(0, 0.055, 0), "#ded7c5");
    deck.dispose();
  }
  /* the pool itself + coping */
  {
    const pool = new THREE.PlaneGeometry(36, 14.5);
    pool.rotateX(-Math.PI / 2);
    water.add(pool, at(0, 0.1, 0));
    pool.dispose();
    const copeL = new THREE.BoxGeometry(37.4, 0.16, 0.7);
    trim.add(copeL, at(0, 0.12, -7.6));
    trim.add(copeL, at(0, 0.12, 7.6));
    copeL.dispose();
    const copeS = new THREE.BoxGeometry(0.7, 0.16, 15.9);
    trim.add(copeS, at(-18.35, 0.12, 0));
    copeS.dispose();
    // the dam at the east end, water sheeting over
    const dam = new THREE.BoxGeometry(1.6, 0.6, 15.9);
    conc.add(dam, at(18.6, 0.3, 0), "#c9c2ae");
    dam.dispose();
  }
  /* the creek, in and out */
  {
    const inPts = [
      { x: BX - 42, z: BZ + 14 },
      { x: BX - 32, z: BZ + 8 },
      { x: BX - 24, z: BZ + 3 },
      { x: BX - 18.5, z: BZ + 0.5 },
    ];
    water.add(ribbon(inPts, 4.2, 0.06, 1 / 6));
    const outPts = [
      { x: BX + 19.2, z: BZ },
      { x: BX + 27, z: BZ + 3 },
      { x: BX + 36, z: BZ + 10 },
      { x: BX + 44, z: BZ + 20 },
    ];
    water.add(ribbon(outPts, 3.4, 0.055, 1 / 6));
  }
  /* bathhouse on the north side */
  {
    const bh = new THREE.BoxGeometry(11, 3.4, 4.6);
    walls.add(bh, at(-6, 1.72, -13), "#c9b799");
    bh.dispose();
    const roof = new THREE.BoxGeometry(12, 0.3, 5.6);
    roofs.add(roof, at(-6, 3.6, -13), "#5e5953");
    roof.dispose();
    for (let i = 0; i < 4; i++) {
      const col = new THREE.CylinderGeometry(0.12, 0.12, 3.3, 6);
      trim.add(col, at(-11 + i * 3.4, 1.65, -10.9));
      col.dispose();
    }
  }
  /* diving board on the south deck */
  {
    const base = new THREE.BoxGeometry(0.5, 0.7, 0.5);
    trim.add(base, at(4, 0.35, 8.4));
    base.dispose();
    const plank = new THREE.BoxGeometry(0.55, 0.09, 3.4);
    trim.add(plank, at(4, 0.78, 7.1));
    plank.dispose();
  }
  /* towels + umbrellas on the south lawn */
  for (let i = 0; i < 9; i++) {
    const tw = new THREE.PlaneGeometry(0.9, 1.9);
    tw.rotateX(-Math.PI / 2);
    towels.add(tw, at(-14 + r() * 28, 0.075, 10.5 + r() * 7, r() * 3), pick(r, TOWELS));
    tw.dispose();
  }
  for (let i = 0; i < 2; i++) {
    const px = -8 + i * 15 + r() * 3;
    const pz = 12 + r() * 3;
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5);
    trim.add(pole, at(px, 1.1, pz));
    pole.dispose();
    const um = new THREE.ConeGeometry(1.5, 0.65, 8);
    towels.add(um, at(px, 2.25, pz), pick(r, TOWELS));
    um.dispose();
  }
  /* pecans and oaks hugging the water */
  const spots: [number, number, number][] = [
    [-26, -10, 4.6], [8, -14.5, 5.2], [22, -9, 4.2], [-34, 6, 4.4], [30, 14, 4.8], [-4, 16.5, 3.6], [16, 17, 3.2],
  ];
  spots.forEach(([lx, lz, s], i) => oak(trunkB, folB, BX + lx, BZ + lz, 5200 + i * 11, s));

  return {
    conc: conc.build(),
    water: water.build(),
    trim: trim.build(),
    walls: walls.build(),
    roofs: roofs.build(),
    towels: towels.build(),
    trunk: trunkB.build(),
    foliage: folB.build(),
  };
}

const builtBarton = once(buildBarton);

export function Barton() {
  const lib = worldLib();
  const g = builtBarton();
  useFrame((_, dt) => {
    lib.tex.water.offset.x += dt * 0.006;
    lib.tex.water.offset.y -= dt * 0.0035;
  });
  return (
    <group>
      {g.conc && <mesh geometry={g.conc} material={lib.mats.concrete} receiveShadow />}
      {g.water && <mesh geometry={g.water} material={lib.mats.water} />}
      {g.trim && <mesh geometry={g.trim} material={lib.mats.trim} castShadow receiveShadow />}
      {g.walls && <mesh geometry={g.walls} material={lib.mats.walls} castShadow receiveShadow />}
      {g.roofs && <mesh geometry={g.roofs} material={lib.mats.roofs} castShadow />}
      {g.towels && <mesh geometry={g.towels} material={lib.mats.walls} />}
      {g.trunk && <mesh geometry={g.trunk} material={lib.mats.trunk} castShadow receiveShadow />}
      {g.foliage && <mesh geometry={g.foliage} material={lib.mats.foliage} castShadow receiveShadow />}
    </group>
  );
}
