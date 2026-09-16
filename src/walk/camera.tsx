/**
 * The director. An orthographic camera rides the walk as scroll advances,
 * dipping low and close at the defect beats, drifting toward Barton Springs
 * once, pulling wide for the Capitol — and, in the finale, rising to a
 * north-up top-down view that hands off to the real map.
 */
import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import { BARTON_BEAT, BEATS, WALK, leftOf } from "./world/route";
import { clamp, smoothstep } from "./world/rng";
import { walkState } from "./state";

type Key = { f: number; el: number; az: number; view: number; lat: number; fwd: number };
const K = (f: number, el: number, az: number, view: number, lat = 0, fwd = 6): Key => ({ f, el, az, view, lat, fwd });

const KEYS: Key[] = [
  K(0, 36, 38, 48, -2, 8),
  K(BEATS.missing - 0.045, 36, 38, 46),
  K(BEATS.missing, 31, 45, 38, 0, 5),
  K(0.245, 36, 38, 46),
  K(0.302, 30, 33, 19, -0.3, 2.2), // dropping toward the walk
  /* THE PANEL. The page's whole claim is that nobody knows this network by
     the panel, so once per scroll the camera has to actually be down on one:
     a lifted, cracked slab filling the frame, lip in profile. */
  K(BEATS.broken, 20, 30, 8, -0.1, 1.1),
  K(0.372, 30, 34, 21, -0.2, 2.4), // and back up
  K(0.395, 36, 38, 46),
  K(BARTON_BEAT, 30, 50, 86, -34, 4),
  K(0.475, 36, 38, 46),
  K(BEATS.math, 29, 34, 33, 0, 4),
  K(0.555, 29, 36, 32, 0, 4),
  K(0.6, 36, 38, 46),
  K(BEATS.falls, 20, 26, 16, 0.4, 1.6),
  K(0.7, 36, 38, 48),
  K(BEATS.precedent, 26, 32, 29, 0, 3),
  K(0.84, 35, 40, 52),
  K(BEATS.count, 30, 36, 34, 0, 4),
  K(0.945, 33, 46, 62, 4, 10),
  K(1, 34, 54, 78, 7, 16),
];

function paramsAt(f: number): Key {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (f >= KEYS[i].f && f <= KEYS[i + 1].f) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  const t = smoothstep(clamp((f - a.f) / (b.f - a.f || 1), 0, 1));
  const m = (x: number, y: number) => x + (y - x) * t;
  return { f, el: m(a.el, b.el), az: m(a.az, b.az), view: m(a.view, b.view), lat: m(a.lat, b.lat), fwd: m(a.fwd, b.fwd) };
}

/** Finale destination: north-up top-down framed on downtown and the
    Capitol — the handoff cuts to the real map over the real Capitol, so the
    last 3D frame and the first map frame are both "downtown Austin". */
const RISE = { el: 86.5, az: 4, view: 250, focus: { x: 148, z: 0 } };

const DIST = 420;

/* ---------- the drone prologue ----------
   Five beats emulating the reference footage: down-the-lake open with the
   kayakers, the rise over the bat bridge, the Congress-axis canyon with the
   Capitol dead center, the straight top-down over streets and sidewalks,
   then the long pull to the suburbs that lands exactly on the walk's first
   frame. In auto mode the beats play on the clock and hold before the pull;
   scroll owns the descent. In scrub mode scroll owns all of it. */

type FlyKey = { u: number; x: number; z: number; el: number; az: number; view: number };
const F = (u: number, x: number, z: number, el: number, az: number, view: number): FlyKey => ({ u, x, z, el, az, view });

/** Where the walk camera starts (KEYS[0]), as a fly key at u=1. */
function walkStartKey(): FlyKey {
  const k0 = KEYS[0];
  const wf = WALK.frame(k0.fwd);
  const n = leftOf(wf.tx, wf.tz);
  return { u: 1, x: wf.x + n.x * k0.lat, z: wf.z + n.z * k0.lat, el: k0.el, az: k0.az, view: k0.view };
}

const FLY: FlyKey[] = [
  F(0.0, -40, 126, 8, -90, 58),
  F(0.14, 2, 122, 20, -72, 78),
  F(0.3, 58, 114, 40, -38, 112),
  F(0.44, 150, 0, 14, 0, 64),
  F(0.56, 150, -52, 16, 2, 76),
  F(0.7, 44, 40, 86, -16, 148),
  F(0.84, 20, 210, 64, 24, 230),
  F(0.94, 0, 330, 46, 34, 130),
];

/** Auto mode: seconds to reach the hold point. */
const AUTO_DUR = 26;
/** Auto mode holds here (after the top-down); scroll owns the descent. */
const HOLD_U = 0.7;

function flyParamsAt(u: number, endKey: FlyKey): FlyKey {
  const keys = [...FLY, endKey];
  let a = keys[0];
  let b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (u >= keys[i].u && u <= keys[i + 1].u) {
      a = keys[i];
      b = keys[i + 1];
      break;
    }
  }
  const t = smoothstep(clamp((u - a.u) / (b.u - a.u || 1), 0, 1));
  const m = (x: number, y: number) => x + (y - x) * t;
  return { u, x: m(a.x, b.x), z: m(a.z, b.z), el: m(a.el, b.el), az: m(a.az, b.az), view: m(a.view, b.view) };
}

export type PrologueMode = "auto" | "scrub";

export function CameraRig({
  progress,
  finale,
  centerBias,
  reduced,
  prologue,
  prologueMode = "auto",
  built = true,
}: {
  progress: MotionValue<number>;
  finale: MotionValue<number>;
  centerBias: MotionValue<number>;
  reduced: boolean;
  /** false while the world is still compiling behind the poster */
  built?: boolean;
  /** prologue progress: scroll-out of the prologue viewport (auto) or the
      full scrub track; undefined = no drone prologue (dev harness default) */
  prologue?: MotionValue<number>;
  prologueMode?: PrologueMode;
}) {
  const { camera, size } = useThree();
  const sm = useRef({ s: WALK.length * 0.0, rise: 0, bias: 0, u: prologue ? 0 : 1, clock: 0 });
  const v = useRef({
    focus: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    look: new THREE.Vector3(),
  });
  const endKey = useRef<FlyKey | null>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = sm.current;
    const lam = reduced ? 30 : 2.4;
    t.s = THREE.MathUtils.damp(t.s, clamp(progress.get(), 0, 1) * WALK.length, lam, dt);
    t.rise = THREE.MathUtils.damp(t.rise, clamp(finale.get(), 0, 1), reduced ? 30 : 3.2, dt);
    t.bias = THREE.MathUtils.damp(t.bias, centerBias.get(), 3.5, dt);

    /* -- prologue progress -- */
    let uTarget = 1;
    if (prologue) {
      const pv = clamp(prologue.get(), 0, 1);
      if (prologueMode === "scrub") {
        uTarget = pv;
      } else {
        // the flyover's clock starts when the world is shown, not while it builds
        if (built) t.clock += dt;
        const autoU = Math.min(HOLD_U, (t.clock / AUTO_DUR) * HOLD_U);
        // scroll owns the descent — but contributes nothing until it moves
        const descentU = pv > 0.0005 ? HOLD_U + pv * (1 - HOLD_U) : 0;
        uTarget = Math.max(autoU, descentU);
      }
      if (progress.get() > 0.002 || t.rise > 0.01) uTarget = 1; // the story owns it now
    }
    t.u = reduced ? uTarget : THREE.MathUtils.damp(t.u, uTarget, 2.8, dt);
    const u = clamp(t.u, 0, 1);
    walkState.u = u;

    const f = t.s / WALK.length;
    const p = paramsAt(f);
    const rise = smoothstep(t.rise);
    let biasEff = t.bias;

    const wf = WALK.frame(t.s + p.fwd);
    const n = leftOf(wf.tx, wf.tz);
    const { focus, dir, up, right, look } = v.current;
    focus.set(wf.x + n.x * p.lat, 0, wf.z + n.z * p.lat);
    focus.x += (RISE.focus.x - focus.x) * rise;
    focus.z += (RISE.focus.z - focus.z) * rise;

    let el = THREE.MathUtils.degToRad(p.el + (RISE.el - p.el) * rise);
    let az = THREE.MathUtils.degToRad(p.az + (RISE.az - p.az) * rise);
    let view = p.view + (RISE.view - p.view) * rise;

    /* -- while the prologue owns the camera, fly the beats; the last
          stretch eases into the walk's own live framing so a fast scroll
          can never pop the cut -- */
    if (u < 0.9995) {
      if (!endKey.current) endKey.current = walkStartKey();
      const fp = flyParamsAt(u, endKey.current);
      // idle drift at the hold: the world keeps breathing under a held frame
      const holding = prologueMode === "auto" && Math.abs(u - HOLD_U) < 0.02 && uTarget <= HOLD_U + 0.001;
      const drift = holding ? 1 : 0;
      const k = smoothstep(clamp((u - 0.86) / 0.14, 0, 1));
      const fx = fp.x + Math.sin(t.clock * 0.42) * 2.6 * drift;
      const fz = fp.z + Math.cos(t.clock * 0.31) * 2.2 * drift;
      focus.set(fx + (focus.x - fx) * k, 0, fz + (focus.z - fz) * k);
      const fel = THREE.MathUtils.degToRad(fp.el);
      const faz = THREE.MathUtils.degToRad(fp.az + Math.sin(t.clock * 0.23) * 1.6 * drift);
      el = fel + (el - fel) * k;
      az = faz + (az - faz) * k;
      view = fp.view + (view - fp.view) * k;
      // prologue copy sits left of frame — nudge the subject right
      biasEff = -0.09 + (t.bias + 0.09) * k;
    }

    dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const upBlend = smoothstep(clamp((THREE.MathUtils.radToDeg(el) - 60) / 24, 0, 1));
    up.set(0, 1 - upBlend, -upBlend).normalize();
    look.copy(dir).negate();
    right.crossVectors(look, up).normalize();

    // keep the subject centered in the visible (left-of-text) region
    const viewW = view * (size.width / size.height);
    focus.addScaledVector(right, biasEff * viewW);

    camera.position.set(focus.x + dir.x * DIST, focus.y + dir.y * DIST, focus.z + dir.z * DIST);
    camera.up.copy(up);
    camera.lookAt(focus);
    const ortho = camera as THREE.OrthographicCamera;
    ortho.zoom = size.height / view;
    ortho.updateProjectionMatrix();

    walkState.focus.x = focus.x;
    walkState.focus.z = focus.z;
    walkState.s = t.s;
    walkState.rise = rise;
    walkState.view = view;
    walkState.f = f;
  });

  return null;
}
