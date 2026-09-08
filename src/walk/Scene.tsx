/** Canvas assembly for the 3D walk. Heavy — always loaded lazily. */
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer, SMAA, TiltShift2, Vignette } from "@react-three/postprocessing";
import type { MotionValue } from "motion/react";
import { detectTier } from "./quality";
import { Lighting, type TimeChoice } from "./lighting";
import { CameraRig, type PrologueMode } from "./camera";
import { Ground } from "./world/ground";
import { District, DistrictLife } from "./world/district";
import { Houses } from "./world/houses";
import { Nature } from "./world/nature";
import { Downtown } from "./world/downtown";
import { Capitol } from "./world/capitol";
import { Barton } from "./world/barton";
import { Props } from "./world/props";
import { Signals } from "./traffic/signals";
import { FleetLineup, Traffic } from "./traffic/traffic";
import { People } from "./people/people";
import { Labels } from "./labels";

/** Watches real frame times after warmup; if the hardware can't hold a
    watchable rate, the experience swaps itself for the poster. */
function PerfGuard({ onPoor }: { onPoor: () => void }) {
  const st = useMemo(() => ({ n: 0, t: 0, done: false }), []);
  useFrame((_, dt) => {
    if (st.done) return;
    st.n++;
    if (st.n <= 50) return; // warmup: shader compiles, staged builds
    st.t += Math.min(dt, 0.5);
    if (st.n >= 170) {
      st.done = true;
      if (st.t / 120 > 1 / 14) onPoor();
    }
  });
  return null;
}

function Staged({ children }: { children: ReactNode[] }) {
  const [n, setN] = useState(1);
  useEffect(() => {
    if (n >= children.length) return;
    const id = requestAnimationFrame(() => setN((v) => v + 1));
    return () => cancelAnimationFrame(id);
  }, [n, children.length]);
  return <>{children.slice(0, n)}</>;
}

function Env() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    // Parallel shader compilation (KHR_parallel_shader_compile) — without
    // this, Windows/ANGLE compiles every program serially on first render
    // and the first frame can stall for many seconds.
    gl.compileAsync(scene, camera).catch(() => {});
    return () => {
      env.texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, camera]);
  return null;
}

export type WalkSceneProps = {
  progress: MotionValue<number>;
  finale: MotionValue<number>;
  centerBias: MotionValue<number>;
  time: TimeChoice;
  active: boolean;
  reduced?: boolean;
  /** drone-prologue progress (scroll-out in auto mode, full track in scrub) */
  prologue?: MotionValue<number>;
  prologueMode?: PrologueMode;
  /** dev-only: park the six car prototypes by the cul-de-sac */
  debugFleet?: boolean;
  /** dev-only: keep the drawing buffer so a poster frame can be captured */
  capture?: boolean;
  /** called once if measured frame rate is too poor to be worth showing */
  onPoor?: () => void;
};

export default function WalkScene({ progress, finale, centerBias, time, active, reduced, prologue, prologueMode, debugFleet, capture, onPoor }: WalkSceneProps) {
  const tier = useMemo(detectTier, []);
  return (
    <Canvas
      orthographic
      shadows={tier.shadows}
      dpr={tier.dpr}
      frameloop={active ? "always" : "never"}
      camera={{ position: [220, 280, 520], zoom: 16, near: 5, far: 1500 }}
      gl={{ antialias: !tier.postfx, powerPreference: "high-performance", preserveDrawingBuffer: !!capture }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      <Env />
      <Lighting choice={time} shadowSize={tier.shadowSize} castShadow={tier.shadows} />
      {/* one world system per frame, so the build never freezes the page */}
      <Staged>
        <Ground />
        <Houses />
        <Nature />
        <Downtown />
        <District />
        <Capitol />
        <Barton />
        <Props />
        <Signals />
        <Suspense fallback={null}>
          <Traffic maxCars={tier.ambientCars} />
          {debugFleet && <FleetLineup />}
        </Suspense>
        <People maxPeople={tier.pedestrians} />
        <DistrictLife />
        <Labels />
      </Staged>
      <CameraRig progress={progress} finale={finale} centerBias={centerBias} reduced={!!reduced} prologue={prologue} prologueMode={prologueMode} />
      {onPoor && <PerfGuard onPoor={onPoor} />}
      {tier.postfx && (
        <EffectComposer multisampling={0}>
          <SMAA />
          <TiltShift2 blur={0.045} taper={0.85} />
          <Vignette eskil={false} offset={0.22} darkness={0.38} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
