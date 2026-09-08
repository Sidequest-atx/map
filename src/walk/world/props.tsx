/**
 * Street furniture and story props: mailboxes, stop signs, streetlights,
 * hydrants, benches, the barricades at the never-built stretches, the orange
 * ADA spray ring, the asphalt patch, the verified-fixed pin — and the soft
 * ring that is "you", walking.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GeoBatch, once, trs } from "./util";
import { worldLib } from "./materials";
import { rng } from "./rng";
import { lots } from "./lots";
import { BEATS, INTERSECTIONS, STREET, STREET_W, WALK, leftOf } from "./route";
import { BARRICADES } from "./defects";
import { cone, scooter, steelPlate } from "./district";
import { walkState } from "../state";

function buildProps() {
  const metal = new GeoBatch();
  const trim = new GeoBatch();
  const walls = new GeoBatch(); // tinted odds and ends
  const lampB = new GeoBatch(); // emissive lamp heads
  const spray = new GeoBatch();
  const pin = new GeoBatch();
  const conc = new GeoBatch();
  const plate = new GeoBatch();

  /* mailboxes at the curb strip */
  for (const lot of lots()) {
    if (!lot.mailbox) continue;
    const { x, z, yaw } = lot.mailbox;
    const post = new THREE.BoxGeometry(0.09, 1.05, 0.09);
    metal.add(post, trs(x, 0.53, z, yaw));
    post.dispose();
    const box = new THREE.BoxGeometry(0.52, 0.3, 0.26);
    walls.add(box, trs(x, 1.16, z, yaw), rng(lot.seed + 77)() < 0.5 ? "#3a3f45" : "#5c5148");
    box.dispose();
    // flag
    const flag = new THREE.BoxGeometry(0.05, 0.22, 0.03);
    walls.add(flag, trs(x + Math.cos(yaw) * 0.28, 1.32, z - Math.sin(yaw) * 0.28, yaw), "#b23239");
    flag.dispose();
  }

  /* stop signs at the 4-way (I1) */
  const i1 = INTERSECTIONS[0];
  const corners: [number, number, number][] = [
    [i1.at.x + 6.3, i1.at.z + 7.6, Math.PI],
    [i1.at.x - 6.3, i1.at.z - 7.6, 0],
    [i1.at.x + 7.6, i1.at.z - 6.3, Math.PI / 2],
    [i1.at.x - 7.6, i1.at.z + 6.3, -Math.PI / 2],
  ];
  for (const [sx, sz, syaw] of corners) {
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6);
    metal.add(pole, trs(sx, 1.15, sz));
    pole.dispose();
    const back = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8);
    back.rotateX(Math.PI / 2);
    walls.add(back, trs(sx, 2.35, sz, syaw), "#e8e2d4");
    back.dispose();
    const face = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 8);
    face.rotateX(Math.PI / 2);
    walls.add(face, trs(sx, 2.35, sz, syaw), "#a8332e");
    face.dispose();
  }

  /* downtown cobra streetlights + suburban lamps every couple of lots,
     so night has pools of light between the porch glows */
  const lampSpots: { x: number; z: number; yaw: number }[] = [];
  for (const side of [-1, 1] as const) {
    for (let z = 92; z > -54; z -= 26) {
      if (INTERSECTIONS.some((i) => i.signal && Math.abs(i.at.z - z) < 9)) continue;
      lampSpots.push({ x: 150 + side * (STREET_W / 2 + 0.9), z: z + (side === 1 ? 13 : 0), yaw: side === -1 ? Math.PI / 2 : -Math.PI / 2 });
    }
  }
  {
    let flip = 1;
    for (let s = 20; s < STREET.length - 30; s += 47) {
      const p = STREET.frame(s);
      if (p.x > 120 && p.z < 108) continue; // downtown has its own
      if (INTERSECTIONS.some((i) => Math.hypot(i.at.x - p.x, i.at.z - p.z) < 12)) continue;
      const n = leftOf(p.tx, p.tz);
      const off = (STREET_W / 2 + 0.9) * flip;
      lampSpots.push({ x: p.x + n.x * off, z: p.z + n.z * off, yaw: Math.atan2(n.x * flip, n.z * flip) + Math.PI });
      flip = -flip as 1 | -1;
    }
  }
  const glowB = new GeoBatch();
  for (const { x, z, yaw } of lampSpots) {
    const pole = new THREE.CylinderGeometry(0.09, 0.13, 7.6, 7);
    metal.add(pole, trs(x, 3.8, z));
    pole.dispose();
    const arm = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6);
    arm.rotateZ(Math.PI / 2);
    metal.add(arm, trs(x - Math.sin(yaw) * 1.2, 7.5, z - Math.cos(yaw) * 1.2, yaw + Math.PI / 2));
    arm.dispose();
    const head = new THREE.BoxGeometry(0.9, 0.18, 0.34);
    lampB.add(head, trs(x - Math.sin(yaw) * 2.4, 7.42, z - Math.cos(yaw) * 2.4, yaw + Math.PI / 2));
    head.dispose();
    const pool = new THREE.PlaneGeometry(8.5, 8.5);
    pool.rotateX(-Math.PI / 2);
    glowB.add(pool, trs(x - Math.sin(yaw) * 2.4, 0.09, z - Math.cos(yaw) * 2.4));
    pool.dispose();
  }
  // suburban utility poles, far side of A
  for (let z = 420; z > 200; z -= 42) {
    const pole = new THREE.CylinderGeometry(0.11, 0.15, 8.2, 6);
    metal.add(pole, trs(7.2, 4.1, z));
    pole.dispose();
  }

  /* fire hydrants near the walk */
  for (const f of [0.115, 0.52, 0.87]) {
    const p = WALK.frameF(f);
    const n = leftOf(p.tx, p.tz);
    const hx = p.x + n.x * -1.6;
    const hz = p.z + n.z * -1.6;
    const body = new THREE.CylinderGeometry(0.16, 0.2, 0.62, 8);
    walls.add(body, trs(hx, 0.36, hz), "#b23a2c");
    body.dispose();
    const cap = new THREE.SphereGeometry(0.17, 8, 6);
    walls.add(cap, trs(hx, 0.72, hz), "#b23a2c");
    cap.dispose();
    const side = new THREE.CylinderGeometry(0.07, 0.07, 0.46, 6);
    side.rotateZ(Math.PI / 2);
    walls.add(side, trs(hx, 0.45, hz), "#8d2d22");
    side.dispose();
  }

  /* benches by the downtown walk */
  for (const z of [78, 44, -6]) {
    const bx = 150 - 9.6;
    const seat = new THREE.BoxGeometry(0.55, 0.08, 1.9);
    trim.add(seat, trs(bx, 0.48, z));
    seat.dispose();
    const back = new THREE.BoxGeometry(0.08, 0.5, 1.9);
    trim.add(back, trs(bx - 0.28, 0.78, z));
    back.dispose();
    for (const dz of [-0.8, 0.8]) {
      const leg = new THREE.BoxGeometry(0.5, 0.48, 0.08);
      metal.add(leg, trs(bx, 0.24, z + dz));
      leg.dispose();
    }
  }

  /* barricades closing the never-built stretches */
  BARRICADES.forEach((f, bi) => {
    const p = WALK.frameF(f);
    const yaw = Math.atan2(p.tx, p.tz) + Math.PI / 2;
    const br = rng(4000 + bi);
    const lean = (br() - 0.5) * 0.12;
    for (const off of [-0.55, 0.55]) {
      const leg = new THREE.BoxGeometry(0.07, 1.15, 0.55);
      metal.add(leg, trs(p.x + Math.cos(yaw) * off, 0.55, p.z - Math.sin(yaw) * off, yaw, 1, 1, 1, 0.2, lean));
      leg.dispose();
    }
    const board = new THREE.BoxGeometry(1.55, 0.3, 0.06);
    walls.add(board, trs(p.x, 0.95, p.z, yaw, 1, 1, 1, 0, lean), "#d97627");
    board.dispose();
    for (const sx of [-0.5, 0.05, 0.6]) {
      const stripe = new THREE.BoxGeometry(0.16, 0.3, 0.02);
      walls.add(stripe, trs(p.x + Math.cos(yaw) * sx, 0.95, p.z - Math.sin(yaw) * sx, yaw + 0.12, 1, 1, 1, 0, lean), "#efe9dc");
      stripe.dispose();
    }
  });

  /* the ADA spray ring at the precedent lip */
  {
    const p = WALK.frameF(BEATS.precedent);
    const ring = new THREE.RingGeometry(0.5, 0.66, 24);
    ring.rotateX(-Math.PI / 2);
    spray.add(ring, trs(p.x + 0.2, 0.21, p.z + 0.3));
    ring.dispose();
    const tick = new THREE.PlaneGeometry(0.1, 0.5);
    tick.rotateX(-Math.PI / 2);
    spray.add(tick, trs(p.x + 0.2, 0.21, p.z + 0.95));
    tick.dispose();
  }

  /* the patched panel at the math beat (the reported one, fixed) */
  {
    const p = WALK.frameF(BEATS.math - 0.006);
    const yaw = Math.atan2(p.tx, p.tz);
    const patch = new THREE.PlaneGeometry(1.35, 2.6);
    patch.rotateX(-Math.PI / 2);
    conc.add(patch, trs(p.x, 0.145, p.z, yaw), "#565049");
    patch.dispose();
  }

  /* the verified-fixed pin, planted by the fresh panel (street side, so
     the downtown trees never hide it) */
  {
    const p = WALK.frameF(BEATS.count);
    const n = leftOf(p.tx, p.tz);
    const px = p.x - n.x * 1.4;
    const pz = p.z - n.z * 1.4;
    const head = new THREE.SphereGeometry(0.55, 12, 10);
    pin.add(head, trs(px, 2.2, pz));
    head.dispose();
    const tip = new THREE.ConeGeometry(0.42, 1.3, 10);
    tip.rotateX(Math.PI);
    pin.add(tip, trs(px, 1.2, pz));
    tip.dispose();
  }

  /* downtown walk clutter: cones, a steel plate over open work, and the
     scooters riders dumped across the pavement (urban obstacles, per the
     drone's own street level) */
  {
    const at = (f: number, lat: number) => {
      const p = WALK.frameF(f);
      const n = leftOf(p.tx, p.tz);
      return { x: p.x + n.x * lat, z: p.z + n.z * lat };
    };
    // a small work zone: plate + cone pair
    const wz = at(0.806, 0.15);
    steelPlate(plate, wz.x, wz.z, 5100, true);
    const c1 = at(0.8, 0.55);
    cone(walls, c1.x, c1.z, 5110);
    const c2 = at(0.812, -0.4);
    cone(walls, c2.x, c2.z, 5120);
    for (const [f, lat, seed] of [
      [0.772, 0.6, 5130],
      [0.882, -0.45, 5140],
      [0.937, 0.5, 5150],
    ] as const) {
      const p = at(f, lat);
      cone(walls, p.x, p.z, seed);
    }
    const sp = at(0.926, 0.3);
    steelPlate(plate, sp.x, sp.z, 5160);
    for (const [f, lat, seed] of [
      [0.788, 0.35, 5200],
      [0.836, 0.6, 5210],
      [0.8365, 0.1, 5215],
      [0.912, -0.55, 5220],
      [0.955, 0.5, 5230],
    ] as const) {
      const p = at(f, lat);
      scooter(walls, metal, p.x, p.z, seed);
    }
  }

  /* crosswalk signal-adjacent curb ramps hinted with pale wedges */
  for (const i of INTERSECTIONS) {
    if (!i.signal) continue;
    const p = STREET.frame(i.mainS);
    const n = leftOf(p.tx, p.tz);
    for (const sgn of [-1, 1]) {
      const wedge = new THREE.BoxGeometry(1.3, 0.09, 1.3);
      conc.add(wedge, trs(p.x + p.tx * sgn * 6.4 + n.x * 6.4, 0.1, p.z + p.tz * sgn * 6.4 + n.z * 6.4, 0, 1, 1, 1, 0.06 * sgn), "#e6dfcd");
      wedge.dispose();
    }
  }

  return {
    metal: metal.build(),
    trim: trim.build(),
    walls: walls.build(),
    lamp: lampB.build(),
    glow: glowB.build(),
    spray: spray.build(),
    pin: pin.build(),
    conc: conc.build(),
    plate: plate.build(),
  };
}

/** Soft double ring gliding down the walk — the reader. */
function YouMarker() {
  const lib = worldLib();
  const g1 = useRef<THREE.Mesh>(null);
  const g2 = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.RingGeometry(0.42, 0.6, 26);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const geoDot = useMemo(() => {
    const g = new THREE.CircleGeometry(0.3, 20);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#4f6b3a", transparent: true, opacity: 0.85, depthWrite: false }),
    [],
  );
  const matPulse = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#4f6b3a", transparent: true, opacity: 0.3, depthWrite: false }),
    [],
  );
  void lib;
  useFrame(({ clock }) => {
    const p = WALK.frame(walkState.s);
    const fade = 1 - walkState.rise;
    if (g1.current) {
      g1.current.position.set(p.x, 0.22, p.z);
      (g1.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * fade;
    }
    if (g2.current) {
      const k = (clock.elapsedTime % 2.2) / 2.2;
      g2.current.position.set(p.x, 0.2, p.z);
      g2.current.scale.setScalar(1 + k * 2.6);
      (g2.current.material as THREE.MeshBasicMaterial).opacity = 0.34 * (1 - k) * fade;
    }
  });
  return (
    <>
      <mesh ref={g1} geometry={geoDot} material={mat} />
      <mesh ref={g2} geometry={geo} material={matPulse} />
    </>
  );
}

const builtProps = once(buildProps);

export function Props() {
  const lib = worldLib();
  const g = builtProps();
  return (
    <group>
      {g.metal && <mesh geometry={g.metal} material={lib.mats.metal} castShadow />}
      {g.trim && <mesh geometry={g.trim} material={lib.mats.trim} castShadow />}
      {g.walls && <mesh geometry={g.walls} material={lib.mats.walls} castShadow />}
      {g.lamp && <mesh geometry={g.lamp} material={lib.mats.lamp} />}
      {g.glow && <mesh geometry={g.glow} material={lib.mats.lampGlow} />}
      {g.spray && <mesh geometry={g.spray} material={lib.mats.spray} />}
      {g.pin && <mesh geometry={g.pin} material={lib.mats.pin} castShadow />}
      {g.conc && <mesh geometry={g.conc} material={lib.mats.concrete} receiveShadow />}
      {g.plate && <mesh geometry={g.plate} material={lib.mats.plate} castShadow />}
      <YouMarker />
    </group>
  );
}
