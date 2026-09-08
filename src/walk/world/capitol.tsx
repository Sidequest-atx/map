/**
 * The Texas Capitol, the walk's destination: sunset-red granite wings, a
 * columned portico under a pediment, the ribbed drum, the dome, the lantern,
 * and the Goddess of Liberty — on fenced grounds with live oaks and a flag.
 */
import * as THREE from "three";
import { GeoBatch, once, trs } from "./util";
import { worldLib } from "./materials";
import { rng } from "./rng";
import { CAPITOL_AT } from "./route";
import { oak } from "./nature";

function buildCapitol() {
  const granite = new GeoBatch();
  const domeB = new GeoBatch();
  const walls = new GeoBatch();
  const trim = new GeoBatch();
  const glass = new GeoBatch();
  const metal = new GeoBatch();
  const lawn = new GeoBatch();
  const conc = new GeoBatch();
  const trunkB = new GeoBatch();
  const folB = new GeoBatch();
  const r = rng(1836);

  const { x: CX, z: CZ } = CAPITOL_AT;
  const at = (lx: number, ly: number, lz: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
    trs(CX + lx, ly, CZ + lz, ry, sx, sy, sz, rx, rz);

  /* grounds: lawn over the downtown paving, fenced, gated walkway */
  {
    const g = new THREE.PlaneGeometry(96, 74);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 11, uv.getY(i) * 8.5);
    lawn.add(g, at(0, 0.045, 2), "#f0efe6");
    g.dispose();
    // low granite perimeter wall with a gate gap on the south side
    const rail = (len: number, lx: number, lz: number, ry = 0) => {
      const w = new THREE.BoxGeometry(len, 0.75, 0.45);
      granite.add(w, at(lx, 0.4, lz, ry));
      w.dispose();
    };
    rail(41, -25.5, 39); // south, west of gate
    rail(41, 25.5, 39); // south, east of gate
    rail(96, 0, -35);
    rail(74, -47.8, 2, Math.PI / 2);
    rail(74, 47.8, 2, Math.PI / 2);
    // gate piers
    for (const gx of [-4.5, 4.5]) {
      const p = new THREE.BoxGeometry(1.1, 1.9, 1.1);
      granite.add(p, at(gx, 0.95, 39));
      p.dispose();
    }
    // walkway from the gate to the steps
    const wk = new THREE.PlaneGeometry(4.2, 26);
    wk.rotateX(-Math.PI / 2);
    conc.add(wk, at(0, 0.055, 26), "#e8e2d2");
    wk.dispose();
    // oval drive hint: two arcs of pale path
    const arc = new THREE.RingGeometry(16, 19.4, 40, 1, 0, Math.PI);
    arc.rotateX(-Math.PI / 2);
    conc.add(arc, at(0, 0.05, 16, Math.PI), "#ddd6c4");
    arc.dispose();
  }

  /* wings */
  for (const side of [-1, 1]) {
    const wing = new THREE.BoxGeometry(27, 9.5, 13);
    granite.add(wing, at(side * 20.5, 4.77, -2));
    wing.dispose();
    // cornice reads from above, so it stays granite-pale, not stark white
    const cornice = new THREE.BoxGeometry(27.9, 0.7, 13.9);
    walls.add(cornice, at(side * 20.5, 9.85, -2), "#d9c4b6");
    cornice.dispose();
    // two rows of windows on the south face
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 6; i++) {
        const win = new THREE.PlaneGeometry(1.15, 1.9);
        glass.add(win, at(side * (9.3 + i * 4.35), 2.9 + row * 4.1, 4.56));
        win.dispose();
      }
    }
    // pilaster hints
    for (let i = 0; i < 7; i++) {
      const p = new THREE.BoxGeometry(0.5, 9.5, 0.22);
      granite.add(p, at(side * (7.2 + i * 4.35), 4.77, 4.62));
      p.dispose();
    }
  }

  /* center block + portico */
  {
    const center = new THREE.BoxGeometry(19, 12, 19);
    granite.add(center, at(0, 6, -3));
    center.dispose();
    const cornice = new THREE.BoxGeometry(19.9, 0.8, 19.9);
    walls.add(cornice, at(0, 12.3, -3), "#d9c4b6");
    cornice.dispose();
    // steps
    for (let i = 0; i < 4; i++) {
      const st = new THREE.BoxGeometry(12 - i * 0.8, 0.32, 1.1);
      granite.add(st, at(0, 0.18 + i * 0.32, 10.4 - i * 1.05));
      st.dispose();
    }
    // portico slab + columns + pediment
    const porch = new THREE.BoxGeometry(11.5, 0.5, 4.4);
    granite.add(porch, at(0, 1.5, 8.2));
    porch.dispose();
    for (let i = 0; i < 6; i++) {
      const col = new THREE.CylinderGeometry(0.42, 0.46, 6.4, 10);
      trim.add(col, at(-4.6 + i * 1.84, 4.95, 9.4));
      col.dispose();
    }
    // entablature + pediment (triangular prism via cylinder with 3 segments)
    const ent = new THREE.BoxGeometry(12.2, 0.9, 5);
    trim.add(ent, at(0, 8.6, 8.2));
    ent.dispose();
    const ped = new THREE.CylinderGeometry(2.6, 2.6, 12, 3, 1);
    ped.rotateZ(Math.PI / 2);
    ped.rotateX(Math.PI); // flat base down, ridge up
    granite.add(ped, at(0, 9.6, 8.2, 0, 1, 0.62, 0.36));
    ped.dispose();
    // grand doorway
    const door = new THREE.BoxGeometry(2.6, 4.2, 0.3);
    walls.add(door, at(0, 2.2, 6.62), "#4a3a30");
    door.dispose();
  }

  /* drum, colonnade, dome, lantern, goddess */
  {
    const drumBase = new THREE.CylinderGeometry(6.4, 6.8, 2.2, 18);
    granite.add(drumBase, at(0, 13.3, -3));
    drumBase.dispose();
    const drum = new THREE.CylinderGeometry(5.6, 5.6, 5.4, 18);
    granite.add(drum, at(0, 17, -3));
    drum.dispose();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const col = new THREE.CylinderGeometry(0.3, 0.3, 5.2, 8);
      trim.add(col, at(Math.cos(a) * 6.05, 17, -3 + Math.sin(a) * 6.05));
      col.dispose();
      const win = new THREE.PlaneGeometry(0.9, 2.4);
      glass.add(win, at(Math.cos(a + 0.13) * 5.62, 17, -3 + Math.sin(a + 0.13) * 5.62, Math.atan2(Math.cos(a + 0.13), Math.sin(a + 0.13))));
      win.dispose();
    }
    const drumCap = new THREE.CylinderGeometry(6.3, 6.3, 0.7, 18);
    trim.add(drumCap, at(0, 20.05, -3));
    drumCap.dispose();
    const dome = new THREE.SphereGeometry(5.9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    domeB.add(dome, at(0, 20.4, -3, 0, 1, 1.05, 1));
    dome.dispose();
    // ribs
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rib = new THREE.BoxGeometry(0.22, 5.6, 0.22);
      domeB.add(rib, at(Math.cos(a) * 4.1, 23.3, -3 + Math.sin(a) * 4.1, 0, 1, 1, 1, Math.sin(a) * 0.72, -Math.cos(a) * 0.72));
      rib.dispose();
    }
    const lantern = new THREE.CylinderGeometry(1.15, 1.3, 2.4, 10);
    granite.add(lantern, at(0, 27.2, -3));
    lantern.dispose();
    const lanternCap = new THREE.SphereGeometry(1.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    domeB.add(lanternCap, at(0, 28.4, -3));
    lanternCap.dispose();
    // the Goddess of Liberty, raised star in hand
    const body = new THREE.CylinderGeometry(0.16, 0.3, 1.5, 6);
    metal.add(body, at(0, 30.2, -3));
    body.dispose();
    const head = new THREE.SphereGeometry(0.2, 6, 5);
    metal.add(head, at(0, 31.1, -3));
    head.dispose();
    const arm = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5);
    metal.add(arm, at(0.28, 31.3, -3, 0, 1, 1, 1, 0, -0.6));
    arm.dispose();
    const star = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 5);
    star.rotateX(Math.PI / 2);
    metal.add(star, at(0.55, 31.85, -3));
    star.dispose();
  }

  /* the Texas flag */
  {
    const pole = new THREE.CylinderGeometry(0.07, 0.09, 11, 6);
    metal.add(pole, at(-14, 5.5, 26));
    pole.dispose();
    const blue = new THREE.PlaneGeometry(0.85, 1.5);
    walls.add(blue, at(-13.55, 10.1, 26, Math.PI / 2), "#2a3f6b");
    blue.dispose();
    const red = new THREE.PlaneGeometry(1.7, 0.75);
    walls.add(red, at(-12.28, 9.73, 26, Math.PI / 2), "#b23239");
    red.dispose();
    const white = new THREE.PlaneGeometry(1.7, 0.75);
    walls.add(white, at(-12.28, 10.48, 26, Math.PI / 2), "#eeeae0");
    white.dispose();
  }

  /* grounds oaks */
  const spots: [number, number][] = [
    [-32, 26], [32, 24], [-38, -8], [38, -12], [-20, 32], [20, 33], [-42, 12], [42, 14],
  ];
  for (let i = 0; i < spots.length; i++) {
    oak(trunkB, folB, CX + spots[i][0], CZ + spots[i][1], 4400 + i * 7, 3.6 + r() * 1.8);
  }

  return {
    granite: granite.build(),
    dome: domeB.build(),
    walls: walls.build(),
    trim: trim.build(),
    glass: glass.build(),
    metal: metal.build(),
    lawn: lawn.build(),
    conc: conc.build(),
    trunk: trunkB.build(),
    foliage: folB.build(),
  };
}

const builtCapitol = once(buildCapitol);

export function Capitol() {
  const lib = worldLib();
  const g = builtCapitol();
  return (
    <group>
      {g.lawn && <mesh geometry={g.lawn} material={lib.mats.grass} receiveShadow />}
      {g.conc && <mesh geometry={g.conc} material={lib.mats.concrete} receiveShadow />}
      {g.granite && <mesh geometry={g.granite} material={lib.mats.granite} castShadow receiveShadow />}
      {g.dome && <mesh geometry={g.dome} material={lib.mats.dome} castShadow receiveShadow />}
      {g.walls && <mesh geometry={g.walls} material={lib.mats.walls} castShadow />}
      {g.trim && <mesh geometry={g.trim} material={lib.mats.trim} castShadow receiveShadow />}
      {g.glass && <mesh geometry={g.glass} material={lib.mats.glassLit} />}
      {g.metal && <mesh geometry={g.metal} material={lib.mats.metal} castShadow />}
      {g.trunk && <mesh geometry={g.trunk} material={lib.mats.trunk} castShadow receiveShadow />}
      {g.foliage && <mesh geometry={g.foliage} material={lib.mats.foliage} castShadow receiveShadow />}
    </group>
  );
}
