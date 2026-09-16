/** Canvas assembly for the 3D walk. Heavy — always loaded lazily. */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { MotionValue } from "motion/react";
import { TIER_ORDER, initialTier, tier as tierFor, tierPinned, type TierName } from "./quality";
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
import { once } from "./world/util";

/** Measures the real frame rate once after warmup and reports it. Remounted
    on every tier change (via key), so each tier is judged on its own. */
function PerfGuard({ onMeasured }: { onMeasured: (fps: number) => void }) {
  const st = useMemo(() => ({ n: 0, t: 0, done: false }), []);
  useFrame((_, dt) => {
    if (st.done) return;
    st.n++;
    if (st.n <= 50) return; // warmup: shader compiles, staged builds
    st.t += Math.min(dt, 0.5);
    if (st.n >= 170) {
      st.done = true;
      onMeasured(120 / st.t);
    }
  });
  return null;
}

/* Any non-XR render target gives the same program key (no tone mapping,
   working color space), so a 1x1 stand-in matches the composer's buffers. */
const offscreenKey = once(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));

/**
 * One world system, mounted hidden until its shaders are ready. Drawing a
 * material before its program links makes that draw wait on the driver,
 * which measured ~3s of frozen main thread at phone speed. compileAsync hands
 * the work to KHR_parallel_shader_compile and polls, so the page stays live.
 * Only the first mount is gated: a later tier change recompiles on draw.
 */
function Stage({ children, offscreen, onReady }: { children: ReactNode; offscreen: boolean; onReady: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const { gl, camera, scene } = useThree();
  const init = useRef({ offscreen, onReady });
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    let alive = true;
    g.visible = false;
    const prev = gl.getRenderTarget();
    if (init.current.offscreen) gl.setRenderTarget(offscreenKey());
    const compiled = gl.compileAsync(g, camera, scene);
    gl.setRenderTarget(prev);
    // Never strand a system behind a driver that never reports ready.
    const late = new Promise((r) => setTimeout(r, 6000));
    Promise.race([compiled, late])
      .catch(() => {})
      .then(() => {
        if (!alive) return;
        g.visible = true;
        init.current.onReady();
      });
    return () => {
      alive = false;
      g.visible = true;
    };
  }, [gl, camera, scene]);
  return <group ref={ref}>{children}</group>;
}

/** Mounts the world one system at a time, each after the last is compiled,
    so neither the build nor the shader compile freezes the page. */
function Staged({ children, offscreen, onDone }: { children: ReactNode[]; offscreen: boolean; onDone?: () => void }) {
  // Start empty: the canvas + environment setup is its own task, and the
  // first system builds a frame later rather than stacked on top of it.
  const [n, setN] = useState(0);
  const done = n > children.length;
  useEffect(() => {
    if (n !== 0) return;
    const id = requestAnimationFrame(() => setN(1));
    return () => cancelAnimationFrame(id);
  }, [n]);
  useEffect(() => {
    if (done) onDone?.();
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps -- fire once
  return (
    <>
      {children.slice(0, n).map((c, i) => (
        <Stage key={i} offscreen={offscreen} onReady={() => setN((v) => Math.max(v, i + 2))}>
          {c}
        </Stage>
      ))}
    </>
  );
}

function Env() {
  const { gl, scene } = useThree();
  // Layout effect: the environment map is part of every lit material's
  // shader, so it has to exist before the first stage compiles.
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    return () => {
      env.texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
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
  /** called once the whole world is built, compiled and drawing */
  onReady?: () => void;
};

export default function WalkScene({ progress, finale, centerBias, time, active, reduced, prologue, prologueMode, debugFleet, capture, onPoor, onReady }: WalkSceneProps) {
  const [built, setBuilt] = useState(false);
  // The GPU name only picks the starting tier; measurement decides the rest.
  const [tierName, setTierName] = useState<TierName>(initialTier);
  const pinned = useMemo(tierPinned, []);
  const tier = useMemo(() => tierFor(tierName), [tierName]);

  const onMeasured = (fps: number) => {
    if (pinned) return;
    const i = TIER_ORDER.indexOf(tierName);
    const last = i === TIER_ORDER.length - 1;
    // Anything under ~22fps is not worth watching at this cost: drop a tier.
    // Only when the cheapest tier still can't hold 15fps is the poster right.
    if (!last && fps < 22) setTierName(TIER_ORDER[i + 1]);
    else if (last && fps < 15) onPoor?.();
  };

  return (
    <Canvas
      orthographic
      // "percentage" = PCFShadowMap. three r185 deprecated PCFSoftShadowMap
      // (r3f's default) and already falls back to PCF, logging a warning each time.
      shadows={tier.shadows ? "percentage" : false}
      dpr={tier.dpr}
      frameloop={active ? "always" : "never"}
      camera={{ position: [220, 280, 520], zoom: 16, near: 5, far: 1500 }}
      gl={{ antialias: !tier.postfx, powerPreference: "high-performance", preserveDrawingBuffer: !!capture }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        // Shader diagnostics are for development: in production they add three
        // info-log reads per program and echo harmless driver warnings (ANGLE's
        // X3595 on the environment filter) into every visitor's console.
        gl.debug.checkShaderErrors = import.meta.env.DEV;
      }}
    >
      <Env />
      <Lighting choice={time} shadowSize={tier.shadowSize} shadowSpan={tier.shadowSpan} castShadow={tier.shadows} />
      <Staged
        offscreen={tier.postfx}
        onDone={() => {
          setBuilt(true);
          onReady?.();
        }}
      >
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
      <CameraRig progress={progress} finale={finale} centerBias={centerBias} reduced={!!reduced} prologue={prologue} prologueMode={prologueMode} built={built} />
      {/* frames during the build are cheap and would flatter the measurement */}
      {built && <PerfGuard key={tierName} onMeasured={onMeasured} />}
      {tier.postfx && (
        <EffectComposer multisampling={tier.msaa}>
          {/* Contact shading: grounds every house, tree and curb. High tier only. */}
          {tier.ao && <N8AO aoRadius={4} distanceFalloff={1} intensity={2.2} quality="high" halfRes depthAwareUpsampling />}
          {tier.msaa === 0 && <SMAA />}
          {/* Night lamps, lit windows and beacons get a soft halo instead of a hard cutout. */}
          <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.28} radius={0.72} />
          <Vignette eskil={false} offset={0.22} darkness={0.32} />
          {/* The composer bypasses the renderer's own tone mapping (three only
              applies it when drawing straight to canvas), so ACES must run
              here — without this the postfx path ships flat, ungraded color. */}
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <HueSaturation saturation={0.14} />
          <BrightnessContrast contrast={0.07} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
