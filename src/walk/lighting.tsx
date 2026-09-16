/**
 * Four lighting rigs — morning, midday, golden hour, night — chosen by the
 * visitor's clock (overridable), crossfaded smoothly. The sun and its shadow
 * frustum follow the camera focus down the walk. At night the rig raises the
 * emissives: lit house windows, downtown facades, street lamps, signals,
 * headlights (read by the traffic system via walkState.night).
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
  /* Fog note: the ortho camera rides 420 units from its focus, so anything
     nearer than ~460 fogs the SUBJECT itself. Fog starts past the focus
     plane — the world in frame stays clean, only the far edges dissolve
     into the page. */
  morning: {
    sunDir: [0.75, 0.5, 0.35],
    sunColor: "#ffe3b5",
    sunI: 2.7,
    hemiSky: "#dfe3cf",
    hemiGround: "#8e876c",
    hemiI: 0.55,
    bg: "#e9e5d3",
    fogNear: 470,
    fogFar: 1250,
    env: 0.45,
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
    fogNear: 480,
    fogFar: 1350,
    env: 0.5,
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
    fogNear: 470,
    fogFar: 1250,
    env: 0.42,
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
    fogNear: 380,
    fogFar: 1000,
    env: 0.14,
    night: 1,
    exposure: 0.98,
  },
};

export function Lighting({ choice, shadowSize, shadowSpan = 85, castShadow = true }: { choice: TimeChoice; shadowSize: number; shadowSpan?: number; castShadow?: boolean }) {
  const lib = worldLib();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const span = useRef(shadowSpan);
  const { scene, gl } = useThree();

  // three only allocates a shadow map when it finds one missing, so a changed
  // mapSize (an adaptive tier step) is ignored until the old target is gone.
  useEffect(() => {
    const s = sun.current;
    if (!s?.shadow.map) return;
    s.shadow.map.dispose();
    (s.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null;
  }, [shadowSize]);

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
  // Fog is part of every material's shader, so it must be on the scene before
  // the world compiles (Scene.tsx compiles each stage as it mounts), not on the
  // first frame, or each program would be built twice.
  useLayoutEffect(() => {
    scene.fog = fog;
    scene.background = bg;
  }, [scene, fog, bg]);

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
      // A frustum sized for the widest shot spends its whole map on scenery
      // that is off-screen, and a half-inch lip's shadow becomes stairsteps.
      // Track the camera's framing instead; the floor keeps tall casters
      // (houses, oaks) inside the box at the closest beats.
      const want = THREE.MathUtils.clamp(walkState.view * 1.3, 14, shadowSpan);
      span.current = THREE.MathUtils.damp(span.current, want, 3, dt);
      const sc = s.shadow.camera as THREE.OrthographicCamera;
      sc.left = -span.current;
      sc.right = span.current;
      sc.top = span.current;
      sc.bottom = -span.current;
      sc.updateProjectionMatrix();
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
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan}
        shadow-camera-bottom={-shadowSpan}
        shadow-camera-near={20}
        shadow-camera-far={460}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  );
}
