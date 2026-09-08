/**
 * Cars. Licensed models (see public/models/cars/manifest.json) normalized to
 * real-world lengths, driving both directions on the main street and the
 * signalized cross streets: they follow their lane, keep headway, brake for
 * ambers they can't clear, queue at reds, and roll through the 4-way after a
 * stop. Headlights and taillights come up with walkState.night; brake lights
 * flare when decelerating. The Cybertruck runs in the main flow.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { BEATS, INTERSECTIONS, LANES, LANE_W, WALK, leftOf, Path2 } from "../world/route";
import { lots } from "../world/lots";
import { walkState } from "../state";
import { signalPhases, type Phase } from "./signals";

const BASE = "/models/cars/";

type FleetName = "sedan" | "suv" | "pickup" | "police" | "bus" | "cybertruck";
const FLEET: Record<FleetName, { file: string; len: number; yawFix: number }> = {
  sedan: { file: "sedan.glb", len: 4.6, yawFix: 0 },
  suv: { file: "suv-crossover.glb", len: 4.7, yawFix: 0 },
  pickup: { file: "pickup.glb", len: 5.3, yawFix: 0 },
  police: { file: "suv-large.glb", len: 5.0, yawFix: 0 },
  bus: { file: "bus.glb", len: 11.0, yawFix: Math.PI },
  cybertruck: { file: "cybertruck.glb", len: 5.7, yawFix: 0 },
};

/** Neutralize a loud baked livery (the bus's transit blues and yellows). */
function neutralizeLivery(m: THREE.Material): THREE.Material {
  const sm = m as THREE.MeshStandardMaterial;
  if (!sm.color) return m;
  const { r, g, b } = sm.color;
  if (b > r + 0.12 && b > 0.3) {
    const c = sm.clone();
    c.color.set("#8a9179"); // brand olive-gray where the blue was
    return c;
  }
  if (r > 0.55 && g > 0.4 && b < 0.25) {
    const c = sm.clone();
    c.color.set("#b0a488");
    return c;
  }
  return m;
}

/** Scale/orient/ground a loaded scene to a drivable prototype. */
function normalize(src: THREE.Object3D, len: number, yawFix: number, police = false, neutral = false): THREE.Group {
  const root = new THREE.Group();
  const inner = src.clone(true);
  inner.rotation.y = yawFix;
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(wrap);
  const size = bb.getSize(new THREE.Vector3());
  const horizLen = Math.max(size.x, size.z);
  const scale = len / (horizLen || 1);
  wrap.scale.setScalar(scale);
  // if the long axis is x, rotate so it runs along z (travel axis)
  if (size.x > size.z) inner.rotation.y += Math.PI / 2;
  wrap.updateMatrixWorld(true);
  const bb2 = new THREE.Box3().setFromObject(wrap);
  wrap.position.y = -bb2.min.y;
  wrap.position.x = -(bb2.min.x + bb2.max.x) / 2;
  wrap.position.z = -(bb2.min.z + bb2.max.z) / 2;
  wrap.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      if (police) {
        // re-livery: saturated body panels go white, everything else stays
        const relivery = (m: THREE.Material): THREE.Material => {
          const sm = m as THREE.MeshStandardMaterial;
          if (sm.color) {
            const { r, g, b } = sm.color;
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            if (sat > 0.18 && Math.max(r, g, b) > 0.25) {
              const c = sm.clone();
              c.color.set("#e6e6e2");
              return c;
            }
          }
          return m;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(relivery) : relivery(mesh.material);
      }
      if (neutral) {
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(neutralizeLivery) : neutralizeLivery(mesh.material);
      }
    }
  });
  root.add(wrap);
  const bb3 = new THREE.Box3().setFromObject(wrap);
  if (police) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.14, 0.32),
      new THREE.MeshStandardMaterial({ color: "#20242c", roughness: 0.4 }),
    );
    bar.position.set(0, bb3.max.y + 0.06, -0.35);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.12, 0.26),
      new THREE.MeshStandardMaterial({ color: "#8c1f1f", emissive: "#c22", emissiveIntensity: 0.5 }),
    );
    red.position.set(-0.24, 0.02, 0);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.12, 0.26),
      new THREE.MeshStandardMaterial({ color: "#1f3a8c", emissive: "#22c", emissiveIntensity: 0.5 }),
    );
    blue.position.set(0.24, 0.02, 0);
    bar.add(red, blue);
    root.add(bar);
  }
  return root;
}

/* ---------- lights each car carries ---------- */

let glowTex: THREE.Texture | null = null;
function getGlowTex() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 40, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(255,220,160,0.9)");
  g.addColorStop(1, "rgba(255,220,160,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

type CarLights = {
  head: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
};

function makeLights(group: THREE.Group, len: number): CarLights {
  const head = new THREE.MeshStandardMaterial({ color: "#fff6dd", emissive: "#ffefc4", emissiveIntensity: 0 });
  const tail = new THREE.MeshStandardMaterial({ color: "#5a1512", emissive: "#ff2418", emissiveIntensity: 0 });
  const disc = new THREE.CircleGeometry(0.09, 8);
  for (const sx of [-0.62, 0.62]) {
    const hm = new THREE.Mesh(disc, head);
    hm.position.set(sx, 0.62, len / 2 + 0.02);
    group.add(hm);
    const tm = new THREE.Mesh(disc, tail);
    tm.position.set(sx, 0.68, -len / 2 - 0.02);
    tm.rotation.y = Math.PI;
    group.add(tm);
  }
  const glow = new THREE.MeshBasicMaterial({
    map: getGlowTex(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const gp = new THREE.PlaneGeometry(3.4, 6.5);
  gp.rotateX(-Math.PI / 2);
  const gm = new THREE.Mesh(gp, glow);
  gm.position.set(0, 0.06, len / 2 + 3.4);
  group.add(gm);
  return { head, tail, glow };
}

/* ---------- lane bookkeeping ---------- */

type StopLine = { s: number; inter: string; kind: "main" | "cross"; sign: boolean };
type Lane = { path: Path2; kind: "main" | "cross"; stops: StopLine[]; loopGap: number };

function buildLanes(): Lane[] {
  const lanes: Lane[] = [];
  const mk = (path: Path2, kind: "main" | "cross"): Lane => {
    const stops: StopLine[] = [];
    for (const i of INTERSECTIONS) {
      const s = path.closestS(i.at);
      const p = path.frame(s);
      if (Math.hypot(p.x - i.at.x, p.z - i.at.z) > LANE_W * 1.6) continue; // lane doesn't pass through
      if (s > 12 && s < path.length - 6) {
        stops.push({ s: s - 8.4, inter: i.id, kind, sign: !i.signal });
      }
    }
    stops.sort((a, b) => a.s - b.s);
    return { path, kind, stops, loopGap: 6 };
  };
  lanes.push(mk(LANES.fwd, "main"));
  lanes.push(mk(LANES.rev, "main"));
  for (const i of INTERSECTIONS) {
    if (!i.signal) continue;
    lanes.push(mk(i.lanes.fwd, "cross"));
    lanes.push(mk(i.lanes.rev, "cross"));
  }
  return lanes;
}

type Car = {
  model: FleetName;
  laneIdx: number;
  s: number;
  v: number;
  len: number;
  group: THREE.Group | null;
  lights: CarLights | null;
  stopHold: number;
  passedSign: string | null;
  braking: number;
};

function useFleetProtos(): Record<FleetName, THREE.Group> {
  const sedan = useGLTF(BASE + FLEET.sedan.file);
  const suv = useGLTF(BASE + FLEET.suv.file);
  const pickup = useGLTF(BASE + FLEET.pickup.file);
  const police = useGLTF(BASE + FLEET.police.file);
  const bus = useGLTF(BASE + FLEET.bus.file);
  const cyber = useGLTF(BASE + FLEET.cybertruck.file);
  return useMemo(() => {
    return {
      sedan: normalize(sedan.scene, FLEET.sedan.len, FLEET.sedan.yawFix),
      suv: normalize(suv.scene, FLEET.suv.len, FLEET.suv.yawFix),
      pickup: normalize(pickup.scene, FLEET.pickup.len, FLEET.pickup.yawFix),
      police: normalize(police.scene, FLEET.police.len, FLEET.police.yawFix, true),
      bus: normalize(bus.scene, FLEET.bus.len, FLEET.bus.yawFix, false, true),
      cybertruck: normalize(cyber.scene, FLEET.cybertruck.len, FLEET.cybertruck.yawFix),
    } satisfies Record<FleetName, THREE.Group>;
  }, [sedan, suv, pickup, police, bus, cyber]);
}

/** DEV: the six prototypes parked nose-south by the cul-de-sac, for
    checking scale and facing. */
export function FleetLineup() {
  const protos = useFleetProtos();
  const names = Object.keys(protos) as FleetName[];
  return (
    <group>
      {names.map((n, i) => (
        <primitive key={n} object={protos[n].clone(true)} position={[-34 + i * 9, 0.02, 428]} />
      ))}
    </group>
  );
}

export function Traffic({ maxCars }: { maxCars: number }) {
  const protos = useFleetProtos();

  const lanes = useMemo(buildLanes, []);

  const cars = useMemo<Car[]>(() => {
    const list: [FleetName, number, number][] = [
      // [model, laneIdx, start fraction]
      ["sedan", 0, 0.06],
      ["cybertruck", 0, 0.3],
      ["bus", 0, 0.55],
      ["pickup", 0, 0.8],
      ["suv", 1, 0.12],
      ["police", 1, 0.45],
      ["sedan", 1, 0.74],
      ["suv", 2, 0.2],
      ["sedan", 3, 0.6],
      ["pickup", 4, 0.35],
      ["sedan", 5, 0.7],
    ];
    return list.slice(0, Math.max(4, maxCars + 3)).map(([model, laneIdx, f]) => ({
      model,
      laneIdx,
      s: lanes[laneIdx].path.length * f,
      v: 6,
      len: FLEET[model].len,
      group: null,
      lights: null,
      stopHold: 0,
      passedSign: null,
      braking: 0,
    }));
  }, [lanes, maxCars]);

  /* parked cars: driveways, plus the pickup nosed across the walk */
  const parked = useMemo(() => {
    const out: { model: FleetName; x: number; z: number; yaw: number }[] = [];
    const withDrives = lots().filter((l) => l.drive && !l.back);
    const models: FleetName[] = ["suv", "sedan", "pickup", "sedan", "suv", "pickup"];
    const step = Math.max(1, Math.floor(withDrives.length / 6));
    let mi = 0;
    for (let i = 0; i < withDrives.length && mi < 6; i += step) {
      const l = withDrives[i];
      const { a, b } = l.drive!;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      out.push({ model: models[mi], x: b.x * 0.35 + a.x * 0.65, z: b.z * 0.35 + a.z * 0.65, yaw, });
      mi++;
    }
    // the one that noses across the sidewalk, right before the broken beat
    const p = WALK.frameF(BEATS.broken - 0.03);
    const n = leftOf(p.tx, p.tz);
    const near = withDrives
      .map((l) => ({ l, d: Math.hypot(l.cx - p.x, l.cz - p.z) }))
      .sort((q, w) => q.d - w.d)[0];
    if (near) {
      const { a, b } = near.l.drive!;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      out.push({ model: "pickup", x: p.x + n.x * 0.4, z: p.z + n.z * 0.4, yaw });
    }
    return out;
  }, []);

  const carRefs = useRef(cars);
  carRefs.current = cars;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const night = walkState.night;
    // per-lane ordering for headway
    for (let li = 0; li < lanes.length; li++) {
      const lane = lanes[li];
      const inLane = carRefs.current.filter((c) => c.laneIdx === li).sort((a, b) => a.s - b.s);
      for (let ci = 0; ci < inLane.length; ci++) {
        const car = inLane[ci];
        const cruise = lane.kind === "main" ? 9.2 : 7.2;
        let vTarget = cruise;

        // leader
        const leader = inLane[(ci + 1) % inLane.length];
        if (leader !== car) {
          let gap = leader.s - car.s;
          if (gap < 0) gap += lane.path.length;
          gap -= (leader.len + car.len) / 2 + 2.2;
          if (gap < 14) vTarget = Math.min(vTarget, Math.max(0, leader.v * Math.min(1, gap / 10) + gap * 0.28));
        }

        // an ambulance on scene: queue up behind it like anybody else
        const inc = walkState.incident;
        if (inc.active && li === inc.lane) {
          const d = inc.s - car.s - car.len / 2 - 5.2;
          if (d > -4 && d < 42) {
            vTarget = Math.min(vTarget, Math.sqrt(2 * 3.4 * Math.max(0.01, d - 1.4)));
            if (d <= 1.7) vTarget = 0;
          }
        }

        // signals + stop signs
        car.stopHold = Math.max(0, car.stopHold - dt);
        for (const st of lane.stops) {
          let d = st.s - car.s;
          if (d < -4 || d > 42) continue;
          const stopId = `${st.inter}@${Math.floor(st.s)}`;
          if (st.sign) {
            if (car.passedSign === stopId) continue;
            if (d <= 1.6 && car.v < 0.4) {
              car.stopHold = car.stopHold > 0 ? car.stopHold : 0.85;
              if (car.stopHold <= dt * 2) car.passedSign = stopId;
            }
            if (d > 0) vTarget = Math.min(vTarget, Math.sqrt(2 * 3.2 * Math.max(0.01, d - 1.2)));
            if (car.stopHold > 0 && d <= 1.8) vTarget = 0;
          } else {
            const ph: Phase = signalPhases[st.inter]?.[st.kind] ?? "G";
            const mustStop = ph === "R" || (ph === "A" && d > car.v * 2.0);
            if (mustStop && d > -1) {
              vTarget = Math.min(vTarget, Math.sqrt(2 * 3.4 * Math.max(0.01, d - 1.4)));
              if (d <= 1.7) vTarget = 0;
            }
          }
        }
        if (car.passedSign && !lane.stops.some((st) => `${st.inter}@${Math.floor(st.s)}` === car.passedSign && st.s > car.s - 6)) {
          car.passedSign = null;
        }

        const dv = vTarget - car.v;
        const accel = dv >= 0 ? Math.min(dv, 2.7 * dt * 10) * 0.28 : Math.max(dv, -6.5 * dt * 10) * 0.42;
        car.braking = THREE.MathUtils.damp(car.braking, dv < -0.6 ? 1 : 0, 8, dt);
        car.v = Math.max(0, car.v + accel * dt * 3.2);
        car.s += car.v * dt;
        if (car.s > lane.path.length - 3) {
          car.s = 3;
          car.passedSign = null;
        }

        const g = car.group;
        if (g) {
          const p = lane.path.frame(car.s);
          g.position.set(p.x, 0.02, p.z);
          g.rotation.y = Math.atan2(p.tx, p.tz);
          if (car.lights) {
            car.lights.head.emissiveIntensity = night * 2.4;
            car.lights.tail.emissiveIntensity = night * 0.8 + car.braking * 1.6;
            car.lights.glow.opacity = night * 0.4;
          }
        }
      }
    }
  });

  return (
    <group>
      {cars.map((car, i) => (
        <group
          key={i}
          ref={(g) => {
            car.group = g;
            if (g && !car.lights) {
              const inst = protos[car.model].clone(true);
              g.add(inst);
              car.lights = makeLights(g, car.len);
            }
          }}
        />
      ))}
      {parked.map((p, i) => (
        <ParkedCar key={`p${i}`} proto={protos[p.model]} x={p.x} z={p.z} yaw={p.yaw} />
      ))}
    </group>
  );
}

function ParkedCar({ proto, x, z, yaw }: { proto: THREE.Group; x: number; z: number; yaw: number }) {
  const obj = useMemo(() => proto.clone(true), [proto]);
  return <primitive object={obj} position={[x, 0.02, z]} rotation={[0, yaw, 0]} />;
}

for (const f of Object.values(FLEET)) useGLTF.preload(BASE + f.file);
