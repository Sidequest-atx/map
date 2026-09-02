import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MotionValue } from "motion/react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * The landing's left canvas: one winding sidewalk in plan view, and the page
 * is a walk down it. A "you" dot holds the camera focus while the world
 * glides past, spring-smoothed. The world is a real block: lawns, front
 * walks, driveways, a street with cars and manholes, houses and buildings
 * and trees — all placed with path-normal offsets so they follow the curve.
 * The story's defects sit along the route where their chapters live, and
 * everything except the walk itself is a still drawing.
 */

const PATH_D =
  "M600 5560 C 600 5400, 600 5240, 600 5080 C 600 4820, 330 4740, 330 4480 C 330 4220, 870 4140, 870 3880 " +
  "C 870 3620, 330 3540, 330 3280 C 330 3020, 870 2940, 870 2680 " +
  "C 870 2420, 330 2340, 330 2080 C 330 1820, 870 1740, 870 1480 " +
  "C 870 1220, 480 1150, 480 900 C 480 650, 600 520, 600 260";

// The street keeps the sidewalk company: the same curve, shifted east.
const STREET_D =
  "M705 5560 C 705 5400, 705 5240, 705 5080 C 705 4820, 435 4740, 435 4480 C 435 4220, 975 4140, 975 3880 " +
  "C 975 3620, 435 3540, 435 3280 C 435 3020, 975 2940, 975 2680 " +
  "C 975 2420, 435 2340, 435 2080 C 435 1820, 975 1740, 975 1480 " +
  "C 975 1220, 585 1150, 585 900 C 585 650, 705 520, 705 260";

const SAMPLES = 420;
const RIBBON = 52;
const JOINT_EVERY = 118;

const SCENES = { missing: 0.18, broken: 0.34, math: 0.5, falls: 0.645, precedent: 0.79, count: 0.9 } as const;

type Pt = { x: number; y: number; a: number };

function samplePath(d: string): Pt[] {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
  el.setAttribute("d", d);
  const L = el.getTotalLength();
  const out: Pt[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const p = el.getPointAtLength((L * i) / SAMPLES);
    out.push({ x: p.x, y: p.y, a: 0 });
  }
  for (let i = 0; i <= SAMPLES; i++) {
    const p0 = out[Math.max(0, i - 1)];
    const p1 = out[Math.min(SAMPLES, i + 1)];
    out[i].a = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  }
  return out;
}

const at = (pts: Pt[], f: number) => pts[Math.round(Math.min(Math.max(f, 0), 1) * SAMPLES)];
const deg = (rad: number) => (rad * 180) / Math.PI;

/** Polyline along the sampled path between two fractions, with an optional
    per-sample normal offset — so overlays follow the curve, never cut it. */
function subPath(pts: Pt[], f1: number, f2: number, wiggle?: (i: number) => number) {
  const i1 = Math.max(0, Math.round(f1 * SAMPLES));
  const i2 = Math.min(SAMPLES, Math.round(f2 * SAMPLES));
  let d = "";
  for (let i = i1; i <= i2; i++) {
    const p = pts[i];
    const w = wiggle ? wiggle(i - i1) : 0;
    const x = p.x - Math.sin(p.a) * w;
    const y = p.y + Math.cos(p.a) * w;
    d += (i === i1 ? "M" : " L") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d;
}

/** The never-built stretch, in path fractions. */
const GAP: [number, number] = [0.163, 0.197];

/** Group positioned on the path at fraction f, rotated to the walk direction. */
function Scene({ pts, f, children, rotate = true, d = 0 }: { pts: Pt[]; f: number; children: React.ReactNode; rotate?: boolean; d?: number }) {
  const p = at(pts, f);
  const nx = -Math.sin(p.a);
  const ny = Math.cos(p.a);
  const x = p.x + nx * d;
  const y = p.y + ny * d;
  return <g transform={`translate(${x} ${y})${rotate ? ` rotate(${deg(p.a) + 90})` : ""}`}>{children}</g>;
}

/** A plan-view house: hipped roof, a porch step toward the walk. */
function House({ w = 96, h = 74, tilt = 0 }: { w?: number; h?: number; tilt?: number }) {
  return (
    <g transform={`rotate(${tilt})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="3" fill="var(--olive-800)" opacity="0.07" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="3" fill="none" stroke="var(--line-strong)" strokeWidth="1.6" opacity="0.5" />
      <path d={`M${-w / 2} ${-h / 2} L${-w / 2 + 16} 0 L${-w / 2} ${h / 2} M${w / 2} ${-h / 2} L${w / 2 - 16} 0 L${w / 2} ${h / 2} M${-w / 2 + 16} 0 L${w / 2 - 16} 0`} fill="none" stroke="var(--line-strong)" strokeWidth="1.1" opacity="0.35" />
      <rect x={-12} y={h / 2} width="24" height="9" fill="none" stroke="var(--line-strong)" strokeWidth="1.2" opacity="0.4" />
    </g>
  );
}

/** A plan-view car. Nose points along local -y. */
function Car({ tone = 0.5 }: { tone?: number }) {
  return (
    <g>
      <rect x="-11" y="-24" width="22" height="48" rx="7" fill="var(--olive-800)" opacity={tone} />
      <rect x="-8" y="-12" width="16" height="8" rx="2" fill="var(--field)" opacity="0.8" />
      <rect x="-8" y="10" width="16" height="7" rx="2" fill="var(--field)" opacity="0.65" />
      <circle cx="-12.5" cy="-10" r="1.6" fill="var(--olive-800)" opacity={tone} />
      <circle cx="12.5" cy="-10" r="1.6" fill="var(--olive-800)" opacity={tone} />
    </g>
  );
}

function Manhole({ r = 9 }: { r?: number }) {
  return (
    <g>
      <circle r={r} fill="var(--field-3)" stroke="var(--line-strong)" strokeWidth="1.4" opacity="0.9" />
      <circle r={r - 3.2} fill="none" stroke="var(--line-strong)" strokeWidth="0.9" opacity="0.6" />
      <path d={`M${-r + 3} -2 L${r - 3} -2 M${-r + 3} 2 L${r - 3} 2`} stroke="var(--line-strong)" strokeWidth="0.9" opacity="0.55" />
    </g>
  );
}

function Tree({ r }: { r: number }) {
  return (
    <g opacity="0.4">
      <circle r={r} fill="var(--olive-300)" opacity="0.5" />
      <circle r={r * 0.64} fill="var(--olive-400)" opacity="0.4" />
      <circle cx={-r * 0.22} cy={-r * 0.16} r={r * 0.28} fill="var(--olive-200)" opacity="0.55" />
    </g>
  );
}

/* Austin landmarks, plan view, drawn as the actual places — not icons. */

/** Barton Springs: Barton Creek widens into the dammed pool. Deck and
    bathhouse on the north bank, diving board, lawn and trees on the
    south hillside, the creek leaving over the downstream dam. */
function BartonSprings() {
  return (
    <g>
      <ellipse cx="8" cy="34" rx="92" ry="20" fill="var(--olive-200)" opacity="0.3" />
      <path d="M-104 10 C -88 4, -76 8, -64 2 M64 -8 C 78 -10, 90 -4, 104 2" fill="none" stroke="var(--info)" strokeWidth="9" strokeLinecap="round" opacity="0.4" />
      <path d="M-64 -12 C -34 -20, 34 -18, 64 -16 L 64 6 C 34 14, -34 12, -64 10 Z" fill="var(--info-bg)" stroke="var(--info)" strokeWidth="1.6" />
      <path d="M-64 -12 L-64 10 M64 -16 L64 6" stroke="var(--line-strong)" strokeWidth="3" opacity="0.7" />
      <path d="M-58 -16 L58 -20" stroke="var(--surface)" strokeWidth="6" opacity="0.9" />
      <rect x="-44" y="-34" width="30" height="11" rx="1.5" fill="var(--olive-800)" opacity="0.12" />
      <rect x="-44" y="-34" width="30" height="11" rx="1.5" fill="none" stroke="var(--line-strong)" strokeWidth="1.2" opacity="0.55" />
      <path d="M20 -18 L20 -8" stroke="var(--line-strong)" strokeWidth="2.4" opacity="0.7" />
      <path d="M-20 -4 C -17 -6, -14 -2, -11 -4 M28 -6 C 31 -8, 34 -4, 37 -6" fill="none" stroke="var(--info)" strokeWidth="1.4" opacity="0.7" strokeLinecap="round" />
      <circle cx="-30" cy="32" r="9" fill="var(--olive-400)" opacity="0.4" />
      <circle cx="12" cy="38" r="11" fill="var(--olive-300)" opacity="0.4" />
      <circle cx="52" cy="30" r="8" fill="var(--olive-400)" opacity="0.35" />
    </g>
  );
}

const CAPITOL_WALKS = "M0 74 L0 30 M0 74 L-56 26 M0 74 L56 26 M-88 -2 L-38 -2 M88 -2 L38 -2 M-62 -78 L-26 -40 M62 -78 L26 -40";

/** The Texas Capitol: sunset-red granite cross with the dome at the
    crossing, set on grounds laced with the Great Walk's radiating
    sidewalks — which is, after all, the subject of this page. */
function Capitol() {
  return (
    <g>
      <rect x="-88" y="-78" width="176" height="152" rx="4" fill="var(--olive-200)" opacity="0.2" />
      <rect x="-88" y="-78" width="176" height="152" rx="4" fill="none" stroke="var(--line)" strokeWidth="1.2" opacity="0.6" />
      <path d={CAPITOL_WALKS} fill="none" stroke="var(--line)" strokeWidth="7" opacity="0.4" />
      <path d={CAPITOL_WALKS} fill="none" stroke="var(--surface)" strokeWidth="5" opacity="0.95" />
      <rect x="-58" y="-16" width="116" height="34" rx="2" fill="var(--sev-severe-bg)" stroke="var(--line-strong)" strokeWidth="1.6" />
      <rect x="-15" y="-58" width="30" height="88" rx="2" fill="var(--sev-severe-bg)" stroke="var(--line-strong)" strokeWidth="1.5" />
      <circle r="19" fill="var(--sev-severe-bg)" stroke="var(--line-strong)" strokeWidth="1.8" />
      <circle r="11" fill="none" stroke="var(--line-strong)" strokeWidth="1" opacity="0.6" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="0" y1="-17" x2="0" y2="-7" transform={`rotate(${a})`} stroke="var(--line-strong)" strokeWidth="1" opacity="0.45" />
      ))}
      <circle r="2.5" fill="var(--line-strong)" opacity="0.6" />
    </g>
  );
}

/** UT: the Main Building and Tower (burnt orange) over the South Mall,
    its twin walks running down the lawns to Littlefield Fountain. */
function UtTower() {
  return (
    <g>
      <rect x="-36" y="-52" width="72" height="30" rx="2" fill="var(--olive-800)" opacity="0.08" />
      <rect x="-36" y="-52" width="72" height="30" rx="2" fill="none" stroke="var(--line-strong)" strokeWidth="1.6" opacity="0.55" />
      <rect x="-12" y="-48" width="24" height="24" fill="var(--sev-moderate-bg)" stroke="var(--sev-moderate)" strokeWidth="1.8" />
      <rect x="-6" y="-42" width="12" height="12" fill="none" stroke="var(--sev-moderate)" strokeWidth="1" opacity="0.7" />
      <rect x="-30" y="-16" width="60" height="66" fill="var(--olive-200)" opacity="0.28" />
      <path d="M-30 -16 L-30 50 M30 -16 L30 50 M-10 -16 L-10 50 M10 -16 L10 50 M-30 8 L30 8 M-30 30 L30 30" stroke="var(--surface)" strokeWidth="4" opacity="0.95" fill="none" />
      <circle cy="62" r="10" fill="var(--info-bg)" stroke="var(--info)" strokeWidth="1.6" />
      <circle cy="62" r="4" fill="none" stroke="var(--info)" strokeWidth="1" opacity="0.6" />
    </g>
  );
}

/** Plan-view hazard barricade: striped board on two feet, set across the walk. */
function Barricade({ id }: { id: string }) {
  return (
    <g>
      <clipPath id={id}>
        <rect x="-30" y="-6.5" width="60" height="13" rx="2.5" />
      </clipPath>
      <rect x="-32" y="-9" width="7" height="18" rx="1.5" fill="var(--olive-800)" opacity="0.5" />
      <rect x="25" y="-9" width="7" height="18" rx="1.5" fill="var(--olive-800)" opacity="0.5" />
      <rect x="-30" y="-6.5" width="60" height="13" rx="2.5" fill="var(--surface)" />
      <g clipPath={`url(#${id})`}>
        {[-36, -20, -4, 12, 28].map((x0) => (
          <path key={x0} d={`M${x0} 8 L${x0 + 13} -8 L${x0 + 21} -8 L${x0 + 8} 8 Z`} fill="var(--sev-moderate)" opacity="0.9" />
        ))}
      </g>
      <rect x="-30" y="-6.5" width="60" height="13" rx="2.5" fill="none" stroke="var(--line-strong)" strokeWidth="1.6" />
    </g>
  );
}

/* Wear is the default state of this walk. Cracks are grown with a seeded
   random walk — many short segments, small heading jitter, shallow hairline
   branches — because real concrete fractures meander; a few straight
   segments meeting at wide angles reads as a chemistry diagram instead. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chain of quadratic curves through midpoints: no polyline corners left. */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 3) return "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L");
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
}

function crackShape(seed: number, span?: number) {
  const r = rng(seed);
  const sp = span ?? 38 + r() * 20;
  // Personality, all drawn from the seed so no two cracks share a character:
  const wob = 0.2 + r() * 0.45; // how much it wanders
  const turnP = 0.07 + r() * 0.16; // how often it takes a real turn
  const stride = 1.8 + r() * 2.2; // segment length
  const branchMax = Math.floor(r() * 4); // 0–3 hairline branches
  const cY = (v: number) => Math.max(-23, Math.min(23, v));
  let x = -sp / 2;
  let y = cY((r() - 0.5) * 30);
  let a = (r() - 0.5) * 0.5;
  const main: [number, number][] = [[x, y]];
  const branches: { d: string; w: number }[] = [];
  const steps = 16 + Math.floor(r() * 12);
  for (let i = 0; i < steps; i++) {
    if (r() < turnP) a += (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.7);
    else a += (r() - 0.5) * wob * 2;
    a = Math.max(-1.15, Math.min(1.15, a));
    const len = stride * (0.6 + r() * 0.8);
    x += Math.cos(a) * len;
    y = cY(y + Math.sin(a) * len);
    main.push([x, y]);
    if (r() < 0.13 && branches.length < branchMax) {
      const bpts: [number, number][] = [[x, y]];
      let bx = x;
      let by = y;
      let ba = a + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.7);
      const bs = 3 + Math.floor(r() * 5);
      for (let j = 0; j < bs; j++) {
        ba += (r() - 0.5) * 0.6;
        const bl = 1.4 + r() * 2;
        bx += Math.cos(ba) * bl;
        by = cY(by + Math.sin(ba) * bl);
        bpts.push([bx, by]);
      }
      branches.push({ d: smoothPath(bpts), w: 0.7 + r() * 0.4 });
    }
  }
  return { main: smoothPath(main), branches, w: 1.05 + r() * 0.7 };
}

function Crack({ seed, rot = 0, o = 0.62, span }: { seed: number; rot?: number; o?: number; span?: number }) {
  const c = crackShape(seed, span);
  return (
    <g transform={rot ? `rotate(${rot})` : undefined} opacity={o}>
      {c.w > 1.45 && (
        <path d={c.main} fill="none" stroke="var(--line-strong)" strokeWidth={c.w * 2.4} strokeLinejoin="round" strokeLinecap="round" opacity="0.14" />
      )}
      <path d={c.main} fill="none" stroke="var(--line-strong)" strokeWidth={c.w} strokeLinejoin="round" strokeLinecap="round" />
      {c.branches.map((b, i) => (
        <path key={i} d={b.d} fill="none" stroke="var(--line-strong)" strokeWidth={b.w} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </g>
  );
}

/** A tuft of weeds pushing up through a seam. Blades fan from one point. */
function Weed({ s = 1 }: { s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <path
        d="M0 0 C -1 -3, -3 -5, -5.5 -7 M0 0 C -0.5 -4, -1.2 -7, -2 -10 M0 0 C 0.4 -4, 1 -7, 2.5 -9.5 M0 0 C 1 -3, 3 -5, 5 -6 M0 0 C 0.1 -3, -0.4 -6, 0.6 -8"
        fill="none"
        stroke="var(--olive-500)"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.75"
      />
    </g>
  );
}

/** A panel lifted out of plane: slight rotation, shadow line on the low lip. */
function Heave({ tilt }: { tilt: number }) {
  return (
    <g transform={`rotate(${tilt})`}>
      <rect x="-24" y="-26" width="48" height="30" fill="var(--surface)" stroke="var(--line)" strokeWidth="1.2" />
      <path d="M-24 4 L24 4" stroke="var(--olive-900)" strokeWidth="3" opacity="0.28" strokeLinecap="round" />
    </g>
  );
}

const CRACKS: [number, number, number][] = [
  // [fraction, seed, rotation] — rotation 90 runs the crack along the walk
  [0.045, 11, 0], [0.075, 23, 90], [0.115, 37, 0], [0.148, 41, 0],
  [0.222, 53, 0], [0.248, 67, 90], [0.298, 71, 0],
  [0.375, 83, 0], [0.408, 89, 90], [0.44, 97, 0], [0.455, 103, 0],
  [0.545, 109, 0], [0.578, 113, 90], [0.612, 127, 0],
  [0.688, 131, 0], [0.715, 137, 0], [0.748, 139, 90],
  [0.832, 149, 0], [0.862, 151, 0],
];
const CHIPS: [number, number][] = [
  [0.06, 1], [0.155, -1], [0.235, 1], [0.43, -1], [0.53, 1], [0.705, -1], [0.845, 1],
];
const STAINS: [number, number, number][] = [
  [0.1, 46, 0.07], [0.255, 58, 0.1], [0.395, 44, 0.06], [0.565, 52, 0.09], [0.72, 40, 0.06], [0.86, 48, 0.08],
];
const HEAVES: [number, number][] = [[0.09, 2.2], [0.42, -2.6], [0.6, 2], [0.755, -2.2]];
const WEEDS: [number, number, number][] = [
  // [fraction, side, scale] — at the edge seam, blades leaning outward
  [0.05, 1, 1], [0.125, -1, 1.2], [0.235, 1, 0.9], [0.315, -1, 1.1],
  [0.435, 1, 1], [0.555, -1, 1.25], [0.63, 1, 0.85], [0.735, -1, 1.1], [0.815, 1, 0.95],
];

export function SidewalkWalk({ progress }: { progress: MotionValue<number> }) {
  const reduced = useReducedMotion();
  const pts = useMemo(() => samplePath(PATH_D), []);
  const streetPts = useMemo(() => samplePath(STREET_D), []);

  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const smooth = useSpring(progress, { stiffness: 55, damping: 18, mass: 0.6 });
  const drive = reduced ? progress : smooth;
  const x = useTransform(drive, (p) => -at(pts, p).x);
  const y = useTransform(drive, (p) => -at(pts, p).y);

  const joints = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const step = Math.max(1, Math.round((JOINT_EVERY / 5600) * SAMPLES));
    for (let i = step; i < SAMPLES; i += step) {
      const p = pts[i];
      const nx = -Math.sin(p.a);
      const ny = Math.cos(p.a);
      const h = RIBBON / 2 - 2;
      out.push({ x1: p.x - nx * h, y1: p.y - ny * h, x2: p.x + nx * h, y2: p.y + ny * h });
    }
    return out;
  }, [pts]);

  /** A strip crossing the block at fraction f, from side a to side b (offsets). */
  const strip = (f: number, from: number, to: number) => {
    const p = at(pts, f);
    const nx = -Math.sin(p.a);
    const ny = Math.cos(p.a);
    return { x1: p.x + nx * from, y1: p.y + ny * from, x2: p.x + nx * to, y2: p.y + ny * to };
  };
  const walkways = [0.08, 0.26, 0.42, 0.58, 0.72].map((f) => strip(f, -26, -128));
  const driveways = [0.13, 0.47, 0.76].map((f) => strip(f, 56, -128));

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden bg-field">
      <svg className="h-full w-full" aria-hidden focusable="false">
        <g transform={`translate(${box.w / 2} ${box.h * 0.62})`}>
          <motion.g style={{ x, y }}>
            {/* lawns */}
            <ellipse cx="180" cy="3620" rx="240" ry="420" fill="var(--olive-200)" opacity="0.14" />
            <ellipse cx="1090" cy="2350" rx="260" ry="480" fill="var(--olive-200)" opacity="0.12" />
            <ellipse cx="210" cy="1500" rx="220" ry="380" fill="var(--olive-200)" opacity="0.13" />

            {/* driveways and front walks, under everything paved */}
            {driveways.map((s, i) => (
              <line key={`d${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--field-3)" strokeWidth="26" opacity="0.85" />
            ))}
            {walkways.map((s, i) => (
              <line key={`w${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--surface)" strokeWidth="9" opacity="0.95" />
            ))}

            {/* the street: asphalt, edge lines, a faded center dash.
                Butt caps: the drawing ends on a square cut, not a pill. */}
            <path d={STREET_D} fill="none" stroke="var(--line-strong)" strokeWidth="104" strokeLinecap="butt" opacity="0.3" />
            <path d={STREET_D} fill="none" stroke="var(--field-3)" strokeWidth="98" strokeLinecap="butt" opacity="0.95" />
            <path d={STREET_D} fill="none" stroke="var(--sev-moderate)" strokeWidth="3" strokeDasharray="30 38" opacity="0.35" />

            {/* street furniture */}
            {[0.22, 0.45, 0.68, 0.86].map((f, i) => (
              <Scene key={`m${i}`} pts={streetPts} f={f} d={i % 2 ? 14 : -12}>
                <Manhole />
              </Scene>
            ))}
            {/* cars: two parked, two in the lanes */}
            <Scene pts={streetPts} f={0.15} d={36}>
              <Car tone={0.45} />
            </Scene>
            <Scene pts={streetPts} f={0.57} d={36}>
              <Car tone={0.42} />
            </Scene>
            <Scene pts={streetPts} f={0.36} d={-13}>
              <Car tone={0.55} />
            </Scene>
            <Scene pts={streetPts} f={0.8} d={13}>
              <g transform="rotate(180)">
                <Car tone={0.55} />
              </g>
            </Scene>

            {/* the dirt desire-line, visible where the ribbon is missing */}
            <path d={PATH_D} fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="3 14" opacity="0.7" />

            {/* the sidewalk ribbon */}
            <path d={PATH_D} fill="none" stroke="var(--line-strong)" strokeWidth={RIBBON + 5} strokeLinecap="butt" opacity="0.55" />
            <path d={PATH_D} fill="none" stroke="var(--surface)" strokeWidth={RIBBON} strokeLinecap="butt" />
            {joints.map((j, i) => (
              <line key={i} x1={j.x1} y1={j.y1} x2={j.x2} y2={j.y2} stroke="var(--line)" strokeWidth="1.5" />
            ))}
            {/* a utility cover set into the walk */}
            <Scene pts={pts} f={0.28}>
              <Manhole r={7} />
            </Scene>

            {/* everyday wear: stains, lifted panels, cracks, chips, weeds */}
            {STAINS.map(([f, len, o], i) => (
              <Scene key={`st${i}`} pts={pts} f={f}>
                <rect x={-RIBBON / 2 + 2} y={-len / 2} width={RIBBON - 4} height={len} fill="var(--olive-800)" opacity={o} />
              </Scene>
            ))}
            {HEAVES.map(([f, tilt], i) => (
              <Scene key={`hv${i}`} pts={pts} f={f}>
                <Heave tilt={tilt} />
              </Scene>
            ))}
            {CRACKS.map(([f, seed, rot], i) => (
              <Scene key={`cr${i}`} pts={pts} f={f}>
                <Crack seed={seed} rot={rot} o={0.5 + (i % 3) * 0.13} />
              </Scene>
            ))}
            {CHIPS.map(([f, side], i) => (
              <Scene key={`ch${i}`} pts={pts} f={f}>
                <g transform={`scale(${side} 1)`}>
                  <circle cx={RIBBON / 2 + 2} cy="0" r="6.5" fill="var(--field)" />
                  <path d={`M${RIBBON / 2 - 5} -6 L${RIBBON / 2 - 1} -1 L${RIBBON / 2 - 6} 5`} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" opacity="0.6" />
                </g>
              </Scene>
            ))}
            {WEEDS.map(([f, side, s], i) => (
              <Scene key={`wd${i}`} pts={pts} f={f} d={side * 23}>
                <g transform={`rotate(${side * 90})`}>
                  <Weed s={s} />
                </g>
              </Scene>
            ))}

            {/* cars parked in the driveways; the middle one noses across the walk */}
            <Scene pts={pts} f={0.13} d={-66}>
              <g transform="rotate(90)">
                <Car tone={0.4} />
              </g>
            </Scene>
            <Scene pts={pts} f={0.47} d={-6}>
              <g transform="rotate(90)">
                <Car tone={0.5} />
              </g>
            </Scene>
            <Scene pts={pts} f={0.76} d={-60}>
              <g transform="rotate(-90)">
                <Car tone={0.38} />
              </g>
            </Scene>

            {/* ---- never built: the ribbon stops for a curved stretch. The
                 erase and the dirt both follow the sampled path, so the gap
                 bends with the sidewalk instead of cutting straight across ---- */}
            <path d={subPath(pts, GAP[0], GAP[1])} fill="none" stroke="var(--field)" strokeWidth={RIBBON + 11} strokeLinecap="butt" />
            <path d={subPath(pts, GAP[0], GAP[1])} fill="none" stroke="var(--olive-100)" strokeWidth={RIBBON - 2} strokeLinecap="butt" opacity="0.28" />
            {GAP.map((f) => {
              const s = strip(f, -RIBBON / 2, RIBBON / 2);
              return <line key={f} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--line-strong)" strokeWidth="2.6" opacity="0.75" />;
            })}
            <path
              d={subPath(pts, GAP[0] - 0.002, GAP[1] + 0.002, (i) => 8 * Math.sin(i * 0.85) + 3 * Math.sin(i * 2.1))}
              fill="none"
              stroke="var(--olive-700)"
              strokeWidth="12"
              strokeLinecap="round"
              opacity="0.24"
            />
            <path
              d={subPath(pts, GAP[0] - 0.002, GAP[1] + 0.002, (i) => 8 * Math.sin(i * 0.85) + 3 * Math.sin(i * 2.1))}
              fill="none"
              stroke="var(--olive-800)"
              strokeWidth="2"
              strokeDasharray="6 10"
              opacity="0.35"
            />
            {([[0.168, 6], [0.174, -9], [0.181, 8], [0.188, -6], [0.194, 5]] as const).map(([f, dd], i) => (
              <Scene key={`pb${i}`} pts={pts} f={f} d={dd} rotate={false}>
                <circle r="2.2" fill="var(--olive-700)" opacity="0.45" />
              </Scene>
            ))}
            <Scene pts={pts} f={0.17} d={-10} rotate={false}>
              <path d="M-5 -4 L0 -7 L4 -4 L2 0 L-4 0 Z" fill="var(--field-3)" stroke="var(--line-strong)" strokeWidth="0.9" opacity="0.7" />
            </Scene>
            <Scene pts={pts} f={0.191} d={11} rotate={false}>
              <path d="M0 -4 L5 -6 L8 -2 L4 1 L0 0 Z" fill="var(--field-3)" stroke="var(--line-strong)" strokeWidth="0.9" opacity="0.6" />
            </Scene>
            {([[0.167, -14, 1.15, 0], [0.176, 12, 0.9, 15], [0.186, -12, 1.05, -12], [0.195, 13, 0.8, 8]] as const).map(([f, dd, s, rr], i) => (
              <Scene key={`gw${i}`} pts={pts} f={f} d={dd} rotate={false}>
                <g transform={`rotate(${rr})`}>
                  <Weed s={s} />
                </g>
              </Scene>
            ))}
            <Scene pts={pts} f={GAP[0] - 0.003}>
              <Barricade id="nb-near" />
            </Scene>
            <Scene pts={pts} f={GAP[1] + 0.003}>
              <Barricade id="nb-far" />
            </Scene>
            <Scene pts={pts} f={SCENES.missing} rotate={false}>
              <text x="48" y="5" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                never built
              </text>
            </Scene>

            {/* ---- failing: fractures and a hedge over the edge ---- */}
            <Scene pts={pts} f={SCENES.broken}>
              <g transform="translate(0 -6)">
                <Crack seed={201} rot={90} o={0.85} span={64} />
              </g>
              <g transform="translate(0 44)">
                <Crack seed={202} o={0.7} />
              </g>
              <g transform="translate(5 12)">
                <Weed s={1.2} />
              </g>
              <ellipse cx={-RIBBON / 2 - 8} cy="-70" rx="34" ry="26" fill="var(--olive-400)" opacity="0.5" />
              <ellipse cx={-RIBBON / 2 + 6} cy="-58" rx="22" ry="16" fill="var(--olive-300)" opacity="0.55" />
            </Scene>
            <Scene pts={pts} f={SCENES.broken} rotate={false}>
              <text x="48" y="-4" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                failing the test
              </text>
            </Scene>

            {/* ---- the math: a reported panel got its patch — in this story
                 the patch is the WIN. Its unreported neighbor is the problem. ---- */}
            <Scene pts={pts} f={SCENES.math}>
              <rect x="-20" y="-58" width="38" height="44" rx="3" fill="var(--field-2)" stroke="var(--olive-600)" strokeWidth="1.8" />
              <rect x="-14" y="-6" width="30" height="26" rx="3" fill="var(--field-2)" stroke="var(--olive-600)" strokeWidth="1.5" opacity="0.9" />
              <g transform="translate(-2 46)">
                <Crack seed={216} o={0.9} span={56} />
              </g>
              <g transform="translate(4 58) rotate(72)">
                <Crack seed={218} o={0.7} span={34} />
              </g>
            </Scene>
            <Scene pts={pts} f={SCENES.math} rotate={false}>
              <text x="48" y="-30" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                patched: someone reported it
              </text>
              <text x="48" y="52" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)" opacity="0.85">
                nobody reported this one
              </text>
            </Scene>

            {/* ---- the falls: root, heave, half an inch, and what it did ---- */}
            <Scene pts={pts} f={SCENES.falls}>
              <circle cx={-RIBBON / 2 - 74} cy="-6" r="64" fill="var(--olive-400)" opacity="0.4" />
              <circle cx={-RIBBON / 2 - 74} cy="-6" r="40" fill="var(--olive-300)" opacity="0.45" />
              <path d={`M${-RIBBON / 2 - 40} -4 C -30 -6, -10 -2, ${RIBBON / 2 - 4} 2 M${-RIBBON / 2 - 34} 14 C -20 16, -6 12, 12 16`} fill="none" stroke="var(--olive-700)" strokeWidth="3" opacity="0.5" strokeLinecap="round" />
              <g transform="rotate(-5)">
                <rect x={-RIBBON / 2 + 2} y="-48" width={RIBBON - 4} height="52" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
              </g>
              <path d={`M${-RIBBON / 2 + 2} 6 L${RIBBON / 2 - 2} 4`} stroke="var(--olive-900)" strokeWidth="3.5" opacity="0.55" />
              <g transform={`translate(${RIBBON / 2 + 44} 44) rotate(64)`} opacity="0.9">
                <circle cx="-20" cy="0" r="11" fill="none" stroke="var(--olive-800)" strokeWidth="2.6" />
                <circle cx="22" cy="0" r="11" fill="none" stroke="var(--olive-800)" strokeWidth="2.6" />
                <path d="M-20 0 L-6 -16 L12 -16 M-6 -16 L-9 0 M12 -16 L22 0 M-9 0 L12 -16 M12 -16 L17 -24" fill="none" stroke="var(--olive-800)" strokeWidth="2.3" strokeLinejoin="round" />
              </g>
              <g transform={`translate(${-RIBBON / 2 - 34} 60) rotate(12)`}>
                <circle cx="24" cy="-26" r="6" fill="var(--olive-800)" />
                <path d="M0 0 C 6 -12 14 -20 21 -23" fill="none" stroke="var(--olive-800)" strokeWidth="8" strokeLinecap="round" />
                <path d="M16 -20 L32 -12 M16 -20 L30 -30" fill="none" stroke="var(--olive-800)" strokeWidth="5.5" strokeLinecap="round" />
                <path d="M1 -1 L10 7 L20 9 M1 -1 L-8 8 L-12 16" fill="none" stroke="var(--olive-800)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </Scene>
            <Scene pts={pts} f={SCENES.falls} rotate={false}>
              <path d="M30 -30 L44 -30" stroke="var(--olive-800)" strokeWidth="1.4" opacity="0.7" fill="none" />
              <text x="50" y="-25" fontSize="16" fontWeight="600" fill="var(--olive-800)" fontFamily="var(--font-mono)">
                ½ in
              </text>
            </Scene>

            {/* ---- the precedent: the defect gets its legal name ---- */}
            <Scene pts={pts} f={SCENES.precedent}>
              <circle cx={-RIBBON / 2 + 12} cy="0" r="9" fill="none" stroke="var(--sev-moderate)" strokeWidth="3" opacity="0.85" />
              <circle cx={-RIBBON / 2 + 12} cy="0" r="3" fill="var(--sev-moderate)" opacity="0.85" />
              <path d="M-26 -34 L-10 -26 L-2 -10" fill="none" stroke="var(--line-strong)" strokeWidth="2" opacity="0.8" />
            </Scene>
            <Scene pts={pts} f={SCENES.precedent} rotate={false}>
              <rect x="44" y="-14" width="108" height="26" rx="5" fill="var(--field)" stroke="var(--olive-800)" strokeWidth="1.5" />
              <text x="98" y="4" textAnchor="middle" fontSize="14" fill="var(--olive-800)" fontFamily="var(--font-mono)">
                ADA barrier
              </text>
            </Scene>

            {/* ---- the count: reported, fixed, verified ---- */}
            <Scene pts={pts} f={SCENES.count}>
              <rect x={-RIBBON / 2 + 2} y="-52" width={RIBBON - 4} height="58" fill="var(--field-2)" stroke="var(--line-strong)" strokeWidth="1.8" />
              <g transform="translate(0 -78)">
                <path d="M0 -22 C -8 -22 -14 -16 -14 -8 C -14 2 0 14 0 14 C 0 14 14 2 14 -8 C 14 -16 8 -22 0 -22 Z" fill="var(--olive-700)" />
                <path d="M-6 -9 L-1 -4 L7 -13" fill="none" stroke="var(--field)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </Scene>
            <Scene pts={pts} f={SCENES.count} rotate={false}>
              <text x="48" y="-14" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                reported → verified fixed
              </text>
            </Scene>

            {/* ---- the walk ends where the map begins ---- */}
            <Scene pts={pts} f={0.985} rotate={false}>
              <text textAnchor="middle" y="-12" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                the map takes it from here
              </text>
              <path d="M0 0 L0 26 M-8 18 L0 28 L8 18" fill="none" stroke="var(--ink-mute)" strokeWidth="2" strokeLinecap="round" />
            </Scene>

            {/* houses along the near side, faces to the walk */}
            {(
              [
                [0.08, -180, -2],
                [0.26, -186, 3],
                [0.42, -178, -3],
                [0.58, -188, 2],
                [0.72, -180, -2],
              ] as const
            ).map(([f, d, tilt], i) => (
              <Scene key={`h${i}`} pts={pts} f={f} d={d}>
                <House tilt={tilt} />
              </Scene>
            ))}
            {/* denser blocks near the end of the walk */}
            <Scene pts={pts} f={0.85} d={-205}>
              <g>
                <rect x="-78" y="-58" width="156" height="116" rx="2" fill="var(--olive-800)" opacity="0.09" />
                <rect x="-78" y="-58" width="156" height="116" rx="2" fill="none" stroke="var(--line-strong)" strokeWidth="1.8" opacity="0.5" />
                <rect x="-66" y="-46" width="132" height="92" fill="none" stroke="var(--line-strong)" strokeWidth="0.9" opacity="0.3" />
                {[-40, -6, 28].map((xx, i) => (
                  <rect key={i} x={xx} y="-22" width="16" height="16" fill="none" stroke="var(--line-strong)" strokeWidth="1.1" opacity="0.4" />
                ))}
              </g>
            </Scene>
            <Scene pts={pts} f={0.94} d={-195}>
              <g transform="rotate(4)">
                <rect x="-64" y="-48" width="128" height="96" rx="2" fill="var(--olive-800)" opacity="0.09" />
                <rect x="-64" y="-48" width="128" height="96" rx="2" fill="none" stroke="var(--line-strong)" strokeWidth="1.8" opacity="0.5" />
                <rect x="-18" y="-14" width="18" height="18" fill="none" stroke="var(--line-strong)" strokeWidth="1.1" opacity="0.4" />
              </g>
            </Scene>
            {/* houses across the street */}
            {(
              [
                [0.18, 208, 3],
                [0.3, 214, -2],
                [0.5, 214, -2],
                [0.66, 210, 3],
                [0.82, 208, 2],
              ] as const
            ).map(([f, d, tilt], i) => (
              <Scene key={`hf${i}`} pts={pts} f={f} d={d}>
                <House w={88} h={68} tilt={tilt} />
              </Scene>
            ))}

            {/* Austin, off in the drawing's distance */}
            <Scene pts={pts} f={0.56} d={252} rotate={false}>
              <BartonSprings />
              <text y="66" textAnchor="middle" fontSize="12" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                barton springs
              </text>
            </Scene>
            <Scene pts={pts} f={0.93} d={216} rotate={false}>
              <UtTower />
              <text y="86" textAnchor="middle" fontSize="12" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                ut tower
              </text>
            </Scene>
            <Scene pts={pts} f={0.975} d={-212} rotate={false}>
              <Capitol />
              <text y="90" textAnchor="middle" fontSize="12" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                the capitol
              </text>
            </Scene>

            {/* trees, both sides */}
            {(
              [
                [0.12, -108, 34],
                [0.31, -100, 42],
                [0.53, -104, 32],
                [0.77, -110, 40],
                [0.22, 176, 40],
                [0.4, 182, 46],
                [0.62, 178, 36],
                [0.88, 176, 42],
              ] as const
            ).map(([f, d, r], i) => (
              <Scene key={`t${i}`} pts={pts} f={f} d={d} rotate={false}>
                <Tree r={r} />
              </Scene>
            ))}
          </motion.g>

          {/* you, walking */}
          <g>
            <motion.circle
              r="13"
              fill="var(--olive-600)"
              opacity="0.25"
              initial={reduced ? undefined : { r: 13, opacity: 0.3 }}
              animate={reduced ? undefined : { r: [13, 26], opacity: [0.3, 0] }}
              transition={{ repeat: Infinity, duration: 2.1, ease: "easeOut" }}
            />
            <circle r="8" fill="var(--olive-700)" stroke="var(--field)" strokeWidth="3" />
          </g>
        </g>
      </svg>

      <p className="pointer-events-none absolute bottom-3 left-4 hidden font-mono text-[10px] tracking-[0.16em] text-ink-mute uppercase lg:block">
        One sidewalk · plan view · you are the dot
      </p>
    </div>
  );
}
