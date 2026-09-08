/**
 * The story's captions, pinned to world anchors, styled like the site's
 * annotations. Each fades in as the reader approaches its beat and out as
 * they pass; all of them bow out during the finale rise.
 */
import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { BARTON_AT, BEATS, CAPITOL_AT, GAPS, WALK, leftOf } from "./world/route";
import { walkState } from "./state";
import { clamp } from "./world/rng";

type L = {
  f?: number; // walk fraction anchor
  at?: [number, number]; // or a fixed plan point
  dy?: number; // world height
  lat?: number;
  text: string;
  sub?: string;
  boxed?: boolean;
  range?: number;
};

const LABELS: L[] = [
  { f: (GAPS[0][0] + GAPS[0][1]) / 2, text: "never built", lat: 3, dy: 1.2 },
  { f: BEATS.broken, text: "failing the test", lat: 3.4, dy: 1 },
  { f: BEATS.math - 0.006, text: "patched: someone reported it", lat: 3.2, dy: 1 },
  { f: 0.555, text: "nobody reported this one", lat: -3, dy: 0.8 },
  { f: BEATS.falls, text: "½ in", sub: "is all it takes", lat: -3.6, dy: 1.4, boxed: true },
  { f: BEATS.precedent, text: "ADA barrier", lat: 3.2, dy: 1.1, boxed: true },
  { f: BEATS.count, text: "reported → verified fixed", lat: -3.4, dy: 1.6 },
  { at: [BARTON_AT.x, BARTON_AT.z + 14], text: "barton springs", dy: 0.6, range: 70 },
  { at: [CAPITOL_AT.x - 24, CAPITOL_AT.z + 34], text: "the capitol", dy: 1, range: 90 },
  { f: 0.985, text: "the map takes it from here", lat: -7, dy: 4.5 },
];

function Label({ l }: { l: L }) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorS = l.f !== undefined ? l.f * WALK.length : null;
  let x: number;
  let z: number;
  if (l.at) {
    x = l.at[0];
    z = l.at[1];
  } else {
    const p = WALK.frameF(l.f!);
    const n = leftOf(p.tx, p.tz);
    x = p.x + n.x * (l.lat ?? 3);
    z = p.z + n.z * (l.lat ?? 3);
  }
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    let d: number;
    if (anchorS !== null) {
      d = Math.abs(walkState.s - anchorS);
    } else {
      d = Math.hypot(walkState.focus.x - x, walkState.focus.z - z);
    }
    const range = l.range ?? 34;
    // wordless during the drone prologue; captions belong to the walk
    const walking = clamp((walkState.u - 0.96) / 0.04, 0, 1);
    const o = clamp(1.15 - d / range, 0, 1) * (1 - clamp(walkState.rise * 2.2, 0, 1)) * walking;
    el.style.opacity = String(o);
    el.style.transform = `translateY(${(1 - o) * 6}px)`;
  });
  return (
    <Html position={[x, l.dy ?? 1, z]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div
        ref={ref}
        className={
        l.boxed
          ? "rounded-md border-[1.5px] border-olive-800 bg-surface/95 px-2.5 py-1 font-mono text-[13px] whitespace-nowrap text-olive-800 shadow-sm"
          : "rounded bg-surface/85 px-2 py-0.5 font-mono text-[12.5px] whitespace-nowrap text-ink-soft shadow-sm"
        }
        style={{ opacity: 0, transition: "opacity 120ms linear" }}
      >
        {l.text}
        {l.sub && <span className="ml-1.5 text-ink-mute">{l.sub}</span>}
      </div>
    </Html>
  );
}

export function Labels() {
  return (
    <>
      {LABELS.map((l, i) => (
        <Label key={i} l={l} />
      ))}
    </>
  );
}
