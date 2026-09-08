/**
 * Pedestrians. A small mixed cast walks the sidewalk — the elderly walkers
 * foregrounded: one with a cane, one pushing a walker frame who detours into
 * the grass around the root heave, one who stops and steps carefully over a
 * lifted lip. And one scripted moment: when the reader reaches the falls
 * chapter, an elderly walker catches a toe on the heaved panel and goes
 * down — once, slowly, without slapstick — and stays down beside it.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { LANES, WALK, leftOf } from "../world/route";
import { ROOT_HEAVE } from "../world/defects";
import { rng, pick, clamp } from "../world/rng";
import { walkState } from "../state";

const SKIN = ["#c8987a", "#8a5f45", "#6b4630", "#e0b090", "#a3714f"] as const;
const SHIRTS = ["#7d8598", "#9c6b5d", "#5d7261", "#b0a184", "#6d5f79", "#a84f42", "#4f6b8a"] as const;
const PANTS = ["#3f4652", "#5a5347", "#6b7280", "#4a3f38", "#2f3e4d"] as const;
const HAIR = ["#d8d3c8", "#e5e2da", "#4a3b2d", "#2b2622", "#8a8078", "#b5a893"] as const;

type Parts = {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  aid?: THREE.Group;
};

function capsule(r: number, len: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), mat);
  m.castShadow = true;
  return m;
}

function buildPerson(seed: number, kind: "elderly" | "adult" | "jogger", aid: "none" | "cane" | "walker" | "dog"): Parts {
  const r = rng(seed);
  const std = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const skin = std(pick(r, SKIN));
  const shirt = std(pick(r, SHIRTS));
  const pants = std(pick(r, PANTS));
  const hair = std(kind === "elderly" ? HAIR[Math.floor(r() * 3)] : pick(r, HAIR));

  const h = kind === "elderly" ? 0.94 : 1.0;
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobs
  root.add(body);

  const legLen = 0.78 * h;
  const hipY = legLen + 0.06;
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  for (const [g, sx] of [
    [legL, -0.11],
    [legR, 0.11],
  ] as const) {
    g.position.set(sx, hipY, 0);
    const leg = capsule(0.075, legLen - 0.2, pants);
    leg.position.y = -legLen / 2;
    g.add(leg);
    body.add(g);
  }

  const torso = new THREE.Group();
  torso.position.y = hipY;
  body.add(torso);
  const chest = capsule(0.17 * h, 0.42 * h, shirt);
  chest.position.y = 0.34 * h;
  torso.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13 * h, 10, 8), skin);
  head.position.y = 0.72 * h;
  head.castShadow = true;
  torso.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135 * h, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), hair);
  cap.position.y = 0.75 * h;
  torso.add(cap);

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  for (const [g, sx] of [
    [armL, -0.24 * h],
    [armR, 0.24 * h],
  ] as const) {
    g.position.set(sx, 0.56 * h, 0);
    const arm = capsule(0.055, 0.42 * h, shirt);
    arm.position.y = -0.26 * h;
    g.add(arm);
    torso.add(g);
  }

  if (kind === "elderly") torso.rotation.x = 0.22; // the hunch

  const parts: Parts = { root, body, torso, legL, legR, armL, armR };

  if (aid === "cane") {
    const cane = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.85, 6), std("#6b4a2f"));
    stick.position.y = -0.42;
    stick.castShadow = true;
    cane.add(stick);
    cane.position.set(0, -0.4 * h, 0.06);
    armR.add(cane);
    armR.rotation.x = -0.5;
    parts.aid = cane;
  }
  if (aid === "walker") {
    const wk = new THREE.Group();
    const mm = new THREE.MeshStandardMaterial({ color: "#9aa0a8", metalness: 0.6, roughness: 0.4 });
    for (const [x, z] of [
      [-0.28, 0.3],
      [0.28, 0.3],
      [-0.28, 0.02],
      [0.28, 0.02],
    ] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.78, 6), mm);
      leg.position.set(x, 0.39, z);
      wk.add(leg);
    }
    for (const z of [0.3, 0.02] as const) {
      const barT = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.56, 6), mm);
      barT.rotation.z = Math.PI / 2;
      barT.position.set(0, 0.78, z);
      wk.add(barT);
    }
    for (const x of [-0.28, 0.28] as const) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), mm);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(x, 0.78, 0.16);
      wk.add(rail);
    }
    wk.position.set(0, 0, 0.42);
    root.add(wk);
    // hands forward onto the frame
    armL.rotation.x = -0.85;
    armR.rotation.x = -0.85;
    parts.aid = wk;
  }
  if (aid === "dog") {
    const dog = new THREE.Group();
    const dm = std("#7a5c3f");
    const bodyM = capsule(0.09, 0.3, dm);
    bodyM.rotation.z = Math.PI / 2;
    bodyM.position.y = 0.26;
    dog.add(bodyM);
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), dm);
    headM.position.set(0, 0.36, 0.26);
    dog.add(headM);
    for (const [x, z] of [
      [-0.06, 0.14],
      [0.06, 0.14],
      [-0.06, -0.14],
      [0.06, -0.14],
    ] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 5), dm);
      leg.position.set(x, 0.11, z);
      dog.add(leg);
    }
    dog.position.set(0.55, 0, 0.3);
    root.add(dog);
    parts.aid = dog;
  }
  return parts;
}

/** Austin EMS box ambulance, built from primitives, facing +z. */
function buildAmbulance() {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: "#eceae2", roughness: 0.42, metalness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2b2e33", roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: "#242b31", roughness: 0.14, metalness: 0.5 });
  const stripe = new THREE.MeshStandardMaterial({ color: "#b02c25", roughness: 0.55 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.95, 3.6), white);
  box.position.set(0, 1.42, -0.9);
  box.castShadow = true;
  group.add(box);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.25, 1.9), white);
  cab.position.set(0, 1.05, 1.75);
  cab.castShadow = true;
  group.add(cab);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.1), glass);
  shield.position.set(0, 1.42, 2.62);
  shield.rotation.x = 0.28;
  group.add(shield);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 0.9), white);
  hood.position.set(0, 0.72, 2.75);
  group.add(hood);
  for (const side of [-1, 1] as const) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 3.55), stripe);
    band.position.set(side * 1.09, 1.06, -0.9);
    group.add(band);
    const cabBand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 1.85), stripe);
    cabBand.position.set(side * 0.99, 0.98, 1.75);
    group.add(cabBand);
  }
  const rearBand = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.34, 0.04), stripe);
  rearBand.position.set(0, 1.06, -2.71);
  group.add(rearBand);
  for (const [sx, sz] of [
    [-0.85, 1.75],
    [0.85, 1.75],
    [-0.85, -1.9],
    [0.85, -1.9],
  ] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, 0.42, sz);
    group.add(wheel);
  }
  // light bar
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.42), dark);
  bar.position.set(0, 2.5, 0.55);
  group.add(bar);
  const beaconR = new THREE.MeshStandardMaterial({ color: "#8c1f1f", emissive: "#e42618", emissiveIntensity: 0.2 });
  const beaconW = new THREE.MeshStandardMaterial({ color: "#c9cdd4", emissive: "#dfe8ff", emissiveIntensity: 0.2 });
  const bR = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.15, 0.36), beaconR);
  bR.position.set(-0.4, 2.52, 0.55);
  group.add(bR);
  const bW = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.15, 0.36), beaconW);
  bW.position.set(0.4, 2.52, 0.55);
  group.add(bW);
  group.visible = false;
  return { group, beaconR, beaconW };
}

type Walker = {
  parts: Parts;
  f0: number;
  f1: number;
  s: number;
  dir: 1 | -1;
  speed: number;
  lat: number;
  phase: number;
  kind: "elderly" | "adult" | "jogger";
  detour: boolean;
  careful: boolean;
  /** walk fraction of a lip this walker catches a toe on (near-miss) */
  stumbleF?: number;
  stumbleT: number;
  stumbleCool: number;
};

const CAREFUL_LIP = 0.42; // the lip the careful stepper crawls over

export function People({ maxPeople }: { maxPeople: number }) {
  const L = WALK.length;

  const cast = useMemo(() => {
    const defs: [number, "elderly" | "adult" | "jogger", "none" | "cane" | "walker" | "dog", number, number, number, boolean, boolean, number?][] = [
      // [seed, kind, aid, f0, f1, speed, detour, careful, stumbleF]
      [21, "elderly", "cane", 0.28, 0.4, 0.55, false, false, 0.3],
      [22, "elderly", "walker", 0.6, 0.7, 0.42, true, false],
      [29, "elderly", "none", 0.185, 0.31, 0.52, false, false, 0.225],
      [23, "elderly", "none", 0.375, 0.47, 0.6, false, true],
      [24, "adult", "dog", 0.04, 0.19, 1.15, false, false],
      [25, "jogger", "none", 0.02, 0.58, 2.5, false, false],
      [26, "adult", "none", 0.74, 0.94, 1.25, false, false],
      [27, "elderly", "cane", 0.86, 0.965, 0.5, false, false],
      [28, "adult", "none", 0.47, 0.6, 1.2, false, false],
    ];
    return defs.slice(0, Math.max(4, maxPeople + 1)).map(([seed, kind, aid, f0, f1, speed, detour, careful, stumbleF], i): Walker => {
      const parts = buildPerson(seed, kind, aid);
      return {
        parts,
        f0,
        f1,
        s: (f0 + (f1 - f0) * ((i * 0.37) % 1)) * L,
        dir: i % 2 === 0 ? 1 : -1,
        speed,
        lat: i % 2 === 0 ? 0.32 : -0.32,
        phase: i * 1.7,
        kind,
        detour,
        careful,
        stumbleF,
        stumbleT: 0,
        stumbleCool: 0,
      };
    });
  }, [maxPeople, L]);

  /* the fall actor */
  const fallActor = useMemo(() => buildPerson(99, "elderly", "cane"), []);
  const fall = useRef({ state: "armed" as "armed" | "walking" | "falling" | "down", t: 0, s: ROOT_HEAVE.f * L - 9 });
  const sHeave = ROOT_HEAVE.f * L;

  /* the response: a neighbor who calls it in, the ambulance, two medics */
  const bystander = useMemo(() => buildPerson(101, "adult", "none"), []);
  const medics = useMemo(() => {
    const uniform = () =>
      [buildPerson(102, "adult", "none"), buildPerson(103, "adult", "none")].map((m) => {
        m.root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && mesh.geometry.type === "CapsuleGeometry") {
            mesh.material = new THREE.MeshStandardMaterial({ color: "#31435c", roughness: 0.85 });
          }
        });
        m.root.visible = false;
        return m;
      });
    return uniform();
  }, []);
  const ambulance = useMemo(buildAmbulance, []);
  const resp = useRef({
    state: "idle" as "idle" | "calling" | "enroute" | "onscene",
    t: 0,
    ambS: 0,
    ambV: 0,
    byS: 0.6 * L,
    byDir: 1 as 1 | -1,
    byPhase: 0,
  });
  const sceneRevS = useMemo(() => LANES.rev.closestS(WALK.frame(sHeave)), [sHeave]);
  const stopRevS = sceneRevS - 1.5;

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);

    for (const w of cast) {
      let speed = w.speed;
      // careful stepper: crawl over the known lip
      const sLip = CAREFUL_LIP * L;
      const dLip = Math.abs(w.s - sLip);
      let stepBoost = 0;
      if (w.careful && dLip < 2.2) {
        speed *= 0.32;
        stepBoost = (1 - dLip / 2.2) * 0.5;
      }
      // the near-miss: a toe catches the lip, arms fly out, they catch it
      w.stumbleCool = Math.max(0, w.stumbleCool - dt);
      if (w.stumbleF !== undefined && w.stumbleT <= 0 && w.stumbleCool <= 0) {
        const dS = w.stumbleF * L - w.s;
        if (Math.abs(dS) < 0.6 && Math.sign(dS || 1) === w.dir) {
          w.stumbleT = 1.15;
          w.stumbleCool = 7;
        }
      }
      let stumblePulse = 0;
      if (w.stumbleT > 0) {
        w.stumbleT -= dt;
        const k = 1 - clamp(w.stumbleT / 1.15, 0, 1);
        stumblePulse = Math.sin(Math.min(k * 1.8, 1) * Math.PI);
        speed *= 0.22 + 0.5 * k; // near stop, then gathering themselves
      }

      w.s += speed * w.dir * dt;
      if (w.s > w.f1 * L) {
        w.s = w.f1 * L;
        w.dir = -1;
      } else if (w.s < w.f0 * L) {
        w.s = w.f0 * L;
        w.dir = 1;
      }
      w.phase += speed * dt * (w.kind === "jogger" ? 5.4 : 4.4);

      // walker-frame detour around the root heave
      let lat = w.lat;
      if (w.detour) {
        const d = Math.abs(w.s - sHeave);
        if (d < 7) lat += (1 - d / 7) * 1.9;
      }

      const p = WALK.frame(w.s);
      const n = leftOf(p.tx, p.tz);
      const { root, body, legL, legR, armL, armR, torso } = w.parts;
      root.position.set(p.x + n.x * lat, 0.14, p.z + n.z * lat);
      root.rotation.y = Math.atan2(p.tx * w.dir, p.tz * w.dir);
      root.rotation.x = stumblePulse * 0.34; // the pitch of the caught trip
      const amp = w.kind === "jogger" ? 0.85 : w.kind === "elderly" ? 0.34 : 0.55;
      const sw = Math.sin(w.phase);
      legL.rotation.x = sw * amp + stepBoost * Math.max(0, Math.sin(w.phase)) * 1.2;
      legR.rotation.x = -sw * amp + stepBoost * Math.max(0, -Math.sin(w.phase)) * 1.2;
      if (stumblePulse > 0.05) {
        // arms flare for balance
        armL.rotation.x = -1.3 * stumblePulse;
        armR.rotation.x = -1.15 * stumblePulse;
        armL.rotation.z = 0.8 * stumblePulse;
        armR.rotation.z = -0.8 * stumblePulse;
      } else if (w.parts.aid && w.kind === "elderly" && armR.children.length) {
        // cane plants with the opposite leg; frame stays level
        armL.rotation.z = 0;
        armR.rotation.z = 0;
      } else {
        armL.rotation.x = -sw * amp * 0.7;
        armR.rotation.x = sw * amp * 0.7;
        armL.rotation.z = 0;
        armR.rotation.z = 0;
      }
      body.position.y = Math.abs(Math.cos(w.phase)) * (w.kind === "jogger" ? 0.07 : 0.025) - stumblePulse * 0.07;
      if (w.kind === "jogger") torso.rotation.x = 0.12;
    }

    /* ---- the fall ---- */
    const fa = fall.current;
    const reader = walkState.s;
    const { root, body, torso, legL, legR, armL, armR } = fallActor;
    const place = (s: number, lat: number) => {
      const p = WALK.frame(s);
      const n = leftOf(p.tx, p.tz);
      root.position.set(p.x + n.x * lat, 0.14, p.z + n.z * lat);
      root.rotation.y = Math.atan2(p.tx, p.tz);
    };
    switch (fa.state) {
      case "armed": {
        root.visible = reader > sHeave - 60 && reader < sHeave + 30;
        fa.s = sHeave - 9;
        place(fa.s, 0.3);
        if (reader > sHeave - 26 && reader < sHeave + 6) {
          fa.state = "walking";
        }
        break;
      }
      case "walking": {
        root.visible = true;
        fa.s += 0.55 * dt;
        fa.t += dt * 3.2;
        place(fa.s, 0.3);
        const sw = Math.sin(fa.t * 2.2);
        legL.rotation.x = sw * 0.34;
        legR.rotation.x = -sw * 0.34;
        body.position.y = Math.abs(Math.cos(fa.t * 2.2)) * 0.02;
        if (fa.s >= sHeave - 0.55) {
          fa.state = "falling";
          fa.t = 0;
        }
        break;
      }
      case "falling": {
        fa.t += dt;
        const k = clamp(fa.t / 1.15, 0, 1);
        const e = k * k * (3 - k); // slow catch, accelerating drop, soft settle
        place(fa.s + k * 0.15, 0.3 * (1 - k * 0.8));
        root.rotation.x = e * 1.42;
        // land ON the heaved panel (its lip stands ~0.3 above grade)
        root.position.y = 0.14 + Math.sin(Math.min(k, 0.4) * Math.PI) * 0.05 + e * 0.24;
        torso.rotation.x = 0.22 + e * 0.25;
        armL.rotation.x = -e * 1.9;
        armR.rotation.x = -e * 1.6;
        legL.rotation.x = e * 0.5;
        legR.rotation.x = -e * 0.25;
        if (k >= 1) {
          fa.state = "down";
          fa.t = 0;
        }
        break;
      }
      case "down": {
        fa.t += dt;
        // a small, human stir — reaching toward the lip
        armR.rotation.x = -1.6 + Math.sin(fa.t * 1.4) * 0.08;
        // re-arm only when the reader has scrolled well away
        if (reader < sHeave - 55 || reader > sHeave + 60) {
          fa.state = "armed";
          root.rotation.x = 0;
          torso.rotation.x = 0.22;
          armL.rotation.x = 0;
          armR.rotation.x = -0.5;
          legL.rotation.x = 0;
          legR.rotation.x = 0;
        }
        break;
      }
    }

    /* ---- the response: neighbor calls, ambulance comes, medics kneel ---- */
    const rs = resp.current;
    const heaveWorld = WALK.frame(sHeave);
    const heaveN = leftOf(heaveWorld.tx, heaveWorld.tz);
    const down = fa.state === "down";

    // the neighbor: ambient on the far edge until the fall — then they
    // hurry over, stop short, and get on the phone
    {
      const { root, body, legL, legR, armL, armR, torso } = bystander;
      const target = sHeave - 2.6;
      let walking = true;
      let speed = 1.1;
      if (down || fa.state === "falling") {
        const d = target - rs.byS;
        if (Math.abs(d) > 0.3) {
          rs.byDir = (Math.sign(d) || 1) as 1 | -1;
          speed = 2.0;
        } else {
          walking = false;
        }
      } else {
        if (rs.byS > 0.687 * L) rs.byDir = -1;
        if (rs.byS < 0.606 * L) rs.byDir = 1;
      }
      if (walking) {
        rs.byS += speed * rs.byDir * dt;
        rs.byPhase += speed * dt * 4.2;
      }
      const p = WALK.frame(rs.byS);
      const n = leftOf(p.tx, p.tz);
      root.position.set(p.x + n.x * -0.34, 0.14, p.z + n.z * -0.34);
      if (walking) {
        root.rotation.y = Math.atan2(p.tx * rs.byDir, p.tz * rs.byDir);
        const sw = Math.sin(rs.byPhase);
        legL.rotation.x = sw * 0.55;
        legR.rotation.x = -sw * 0.55;
        armL.rotation.x = -sw * 0.4;
        armR.rotation.x = sw * 0.4;
        armR.rotation.z = 0;
        body.position.y = Math.abs(Math.cos(rs.byPhase)) * 0.03;
        torso.rotation.x = 0;
      } else {
        const fx = fallActor.root.position;
        root.rotation.y = Math.atan2(fx.x - root.position.x, fx.z - root.position.z);
        legL.rotation.x = 0;
        legR.rotation.x = 0;
        armR.rotation.x = -2.5; // phone to the ear
        armR.rotation.z = -0.5;
        armL.rotation.x = -0.25;
        torso.rotation.x = 0.12;
        body.position.y = 0;
      }
    }

    // dispatch
    const resetResponse = () => {
      rs.state = "idle";
      rs.t = 0;
      ambulance.group.visible = false;
      for (const m of medics) m.root.visible = false;
      walkState.incident.active = false;
    };
    switch (rs.state) {
      case "idle": {
        if (down && fa.t > 0.8) {
          rs.state = "calling";
          rs.t = 0;
        }
        break;
      }
      case "calling": {
        if (!down) {
          resetResponse();
          break;
        }
        rs.t += dt;
        if (rs.t > 2.4) {
          rs.state = "enroute";
          rs.t = 0;
          rs.ambS = Math.max(4, stopRevS - 135);
          rs.ambV = 0;
          ambulance.group.visible = true;
        }
        break;
      }
      case "enroute": {
        if (!down) {
          resetResponse();
          break;
        }
        const d = stopRevS - rs.ambS;
        const vAllow = Math.min(15, Math.sqrt(2 * 3.2 * Math.max(0.01, d)));
        rs.ambV = Math.min(rs.ambV + 7 * dt, vAllow);
        rs.ambS += rs.ambV * dt;
        walkState.incident.active = true;
        walkState.incident.lane = 1;
        walkState.incident.s = stopRevS;
        if (d < 0.4) {
          rs.state = "onscene";
          rs.t = 0;
          for (const m of medics) m.root.visible = true;
        }
        break;
      }
      case "onscene": {
        if (!down) {
          resetResponse();
          break;
        }
        rs.t += dt;
        const doorP = LANES.rev.frame(Math.max(0, stopRevS - 3.4));
        const dn = leftOf(doorP.tx, doorP.tz);
        const fp = fallActor.root.position;
        medics.forEach((m, mi) => {
          const sx = doorP.x + dn.x * (mi ? -0.9 : 0.9);
          const sz = doorP.z + dn.z * (mi ? -0.9 : 0.9);
          const tx = fp.x + heaveN.x * (mi ? 1.2 : -0.7) + heaveWorld.tx * (mi ? -0.9 : 0.9);
          const tz = fp.z + heaveN.z * (mi ? 1.2 : -0.7) + heaveWorld.tz * (mi ? -0.9 : 0.9);
          const k = clamp((rs.t - mi * 0.55) / 2.3, 0, 1);
          const e = k * k * (3 - 2 * k);
          const { root, body, legL, legR, armL, armR, torso } = m;
          root.position.set(sx + (tx - sx) * e, 0.14, sz + (tz - sz) * e);
          root.rotation.y = Math.atan2(fp.x - root.position.x, fp.z - root.position.z);
          if (k < 1) {
            const ph = rs.t * 7 + mi * 2;
            const sw = Math.sin(ph);
            legL.rotation.x = sw * 0.6;
            legR.rotation.x = -sw * 0.6;
            armL.rotation.x = -sw * 0.35;
            armR.rotation.x = sw * 0.35;
            body.position.y = Math.abs(Math.cos(ph)) * 0.03;
            torso.rotation.x = 0.1;
          } else {
            // kneeling at the patient
            body.position.y = -0.32;
            legL.rotation.x = 1.4;
            legR.rotation.x = 1.35;
            torso.rotation.x = 0.42;
            armL.rotation.x = -0.95 + Math.sin(rs.t * 1.8 + mi) * 0.07;
            armR.rotation.x = -0.8 + Math.cos(rs.t * 1.6 + mi) * 0.07;
          }
        });
        break;
      }
    }

    // ambulance pose + beacons
    if (ambulance.group.visible) {
      const p = LANES.rev.frame(rs.ambS);
      ambulance.group.position.set(p.x, 0.02, p.z);
      ambulance.group.rotation.y = Math.atan2(p.tx, p.tz);
      const ph = Math.sin(clock.elapsedTime * 13) > 0;
      ambulance.beaconR.emissiveIntensity = ph ? 3.4 : 0.25;
      ambulance.beaconW.emissiveIntensity = ph ? 0.3 : 3.0;
    }
  });

  return (
    <group>
      {cast.map((w, i) => (
        <primitive key={i} object={w.parts.root} />
      ))}
      <primitive object={fallActor.root} />
      <primitive object={bystander.root} />
      {medics.map((m, i) => (
        <primitive key={`m${i}`} object={m.root} />
      ))}
      <primitive object={ambulance.group} />
    </group>
  );
}
