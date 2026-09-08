/**
 * Four lighting rigs — morning, midday, golden hour, night — chosen by the
 * visitor's clock (overridable), crossfaded smoothly. The sun and its shadow
 * frustum follow the camera focus down the walk. At night the rig raises the
 * emissives: lit house windows, downtown facades, street lamps, signals,
 * headlights (read by the traffic system via walkState.night).
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { worldLib } from "./world/materials";
import { walkState } from "./state";

export type TimeName = "morning" | "day" | "golden" | "night";
export type TimeChoice = TimeName | "auto";

export function timeFromClock(d = new Date()): TimeName {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5.5 && h < 10) return "morning";
  if (h >= 10 && h < 16.5) return "day";
  if (h >= 16.5 && h < 20.25) return "golden";
  return "night";
}

type Rig = {
  sunDir: [number, number, number]; // direction the light comes FROM
  sunColor: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  bg: string;
  fogNear: number;
  fogFar: number;
  env: number;
  night: number; // 0..1 emissive drive
  exposure: number;
};

const RIGS: Record<TimeName, Rig> = {
  /* Day skies lean warm beige so the canvas melts into the site's field
     instead of reading as a blue-gray videogame sky. */
  morning: {
    sunDir: [0.75, 0.5, 0.35],
    sunColor: "#ffe3b5",
    sunI: 2.7,
    hemiSky: "#dfe3cf",
    hemiGround: "#8e876c",
    hemiI: 0.55,
    bg: "#e9e5d3",
    fogNear: 260,
    fogFar: 900,
    env: 0.35,
    night: 0,
    exposure: 1.0,
  },
  day: {
    sunDir: [0.35, 1.0, -0.25],
    sunColor: "#fff2d8",
    sunI: 3.1,
    hemiSky: "#dde4d0",
    hemiGround: "#97906f",
    hemiI: 0.6,
    bg: "#e8e4d3",
    fogNear: 300,
    fogFar: 1000,
    env: 0.4,
    night: 0,
    exposure: 1.0,
  },
  golden: {
    sunDir: [-0.85, 0.3, 0.3],
    sunColor: "#ffae62",
    sunI: 2.5,
    hemiSky: "#eed0a6",
    hemiGround: "#8b7a5c",
    hemiI: 0.5,
    bg: "#efdcbc",
    fogNear: 310,
    fogFar: 980,
    env: 0.32,
    night: 0.08,
    exposure: 1.02,
  },
  night: {
    sunDir: [-0.4, 0.8, 0.5],
    sunColor: "#8fa2cc",
    sunI: 0.5,
    hemiSky: "#2c3652",
    hemiGround: "#1a1c22",
    hemiI: 0.5,
    bg: "#121826",
    fogNear: 200,
    fogFar: 760,
    env: 0.1,
    night: 1,
    exposure: 0.98,
  },
};

export function Lighting({ choice, shadowSize, castShadow = true }: { choice: TimeChoice; shadowSize: number; castShadow?: boolean }) {
  const lib = worldLib();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { scene, gl } = useThree();

  const cur = useMemo(() => {
    const rig = RIGS[choice === "auto" ? timeFromClock() : choice];
    return {
      sunDir: new THREE.Vector3(...rig.sunDir).normalize(),
      sunColor: new THREE.Color(rig.sunColor),
      sunI: rig.sunI,
      hemiSky: new THREE.Color(rig.hemiSky),
      hemiGround: new THREE.Color(rig.hemiGround),
      hemiI: rig.hemiI,
      bg: new THREE.Color(rig.bg),
      fogNear: rig.fogNear,
      fogFar: rig.fogFar,
      env: rig.env,
      night: rig.night,
      exposure: rig.exposure,
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- seeded once, then damped per-frame

  const fog = useMemo(() => new THREE.Fog(cur.bg.clone(), cur.fogNear, cur.fogFar), []); // eslint-disable-line react-hooks/exhaustive-deps
  const bg = useMemo(() => cur.bg.clone(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const target = RIGS[choice === "auto" ? timeFromClock() : choice];
    const k = 2.4;
    const d = (a: number, b: number) => THREE.MathUtils.damp(a, b, k, dt);
    cur.sunI = d(cur.sunI, target.sunI);
    cur.hemiI = d(cur.hemiI, target.hemiI);
    cur.fogNear = d(cur.fogNear, target.fogNear);
    cur.fogFar = d(cur.fogFar, target.fogFar);
    cur.env = d(cur.env, target.env);
    cur.night = d(cur.night, target.night);
    cur.exposure = d(cur.exposure, target.exposure);
    const lc = 1 - Math.exp(-k * dt);
    cur.sunColor.lerp(new THREE.Color(target.sunColor), lc);
    cur.hemiSky.lerp(new THREE.Color(target.hemiSky), lc);
    cur.hemiGround.lerp(new THREE.Color(target.hemiGround), lc);
    cur.bg.lerp(new THREE.Color(target.bg), lc);
    cur.sunDir.lerp(new THREE.Vector3(...target.sunDir).normalize(), lc).normalize();

    walkState.night = cur.night;

    const s = sun.current;
    if (s) {
      const f = walkState.focus;
      s.color.copy(cur.sunColor);
      s.intensity = cur.sunI;
      s.position.set(f.x + cur.sunDir.x * 180, cur.sunDir.y * 180, f.z + cur.sunDir.z * 180);
      s.target.position.set(f.x, 0, f.z);
      s.target.updateMatrixWorld();
    }
    const h = hemi.current;
    if (h) {
      h.color.copy(cur.hemiSky);
      h.groundColor.copy(cur.hemiGround);
      h.intensity = cur.hemiI;
    }
    fog.color.copy(cur.bg);
    fog.near = cur.fogNear;
    fog.far = cur.fogFar;
    bg.copy(cur.bg);
    scene.fog = fog;
    scene.background = bg;
    scene.environmentIntensity = cur.env;
    gl.toneMappingExposure = cur.exposure;

    // emissives
    lib.mats.glassLit.emissiveIntensity = cur.night * 1.5;
    lib.mats.facade.emissiveIntensity = cur.night * 1.15;
    lib.mats.towerGlass.emissiveIntensity = cur.night * 1.3;
    lib.mats.lamp.emissiveIntensity = cur.night * 2.2;
    lib.mats.lampGlow.opacity = cur.night * 0.42;
  });

  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow={castShadow}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-85}
        shadow-camera-right={85}
        shadow-camera-top={85}
        shadow-camera-bottom={-85}
        shadow-camera-near={20}
        shadow-camera-far={460}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  );
}
