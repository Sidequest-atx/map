import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { MotionValue } from "motion/react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * The landing's left canvas: one winding sidewalk, and the page is a walk
 * down it. The world is drawn axonometrically — the ground plane (street,
 * ribbon, cracks, dirt) is authored in plan and sheared by one projection
 * matrix, while houses, cars, trees and landmarks stand up out of it as
 * lit volumes and upright vignettes, depth-sorted back to front. A "you"
 * dot holds the camera focus while the world glides past, spring-smoothed.
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
/** Samples per panel — joints and panel tints must share this so the
    color changes land exactly on the joint lines. */
const JOINT_STEP = Math.max(1, Math.round((JOINT_EVERY / 5600) * SAMPLES));
const PANEL_F = JOINT_STEP / SAMPLES;

const SCENES = { missing: 0.18, broken: 0.34, math: 0.5, falls: 0.645, precedent: 0.79, count: 0.9 } as const;

/* ---------- projection ---------- */
/* Dimetric shear: plan x → (0.866, 0.5), plan y → (−0.866, 0.5). The whole
   ground plane renders through ISO_M; anything standing un-shears itself
   with UNISO (its exact inverse) so verticals stay vertical on screen. */
const ISO_M = "matrix(0.866 0.5 -0.866 0.5 0 0)";
const UNISO = "matrix(0.57737 -0.57737 1 1 0 0)";
/** Project a plan-local point at height z into screen-local coordinates. */
const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * 0.866, (x + y) * 0.5 - z];
const poly = (ps: [number, number][]) => ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

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

/** The never-built stretches, in path fractions: the labeled suburban one
    the story stops at, and a second, wordless one on the way downtown. */
const GAPS: [number, number][] = [
  [0.163, 0.197],
  [0.826, 0.846],
];
const inAnyGap = (f1: number, f2: number) => GAPS.some(([g1, g2]) => f2 > g1 - 0.004 && f1 < g2 + 0.004);

/** Flat, on the ground: positioned on the path, optionally rotated to the
    walk direction. Rendered inside the projection, so it shears with it. */
function Scene({ pts, f, children, rotate = true, d = 0 }: { pts: Pt[]; f: number; children: ReactNode; rotate?: boolean; d?: number }) {
  const p = at(pts, f);
  const nx = -Math.sin(p.a);
  const ny = Math.cos(p.a);
  const x = p.x + nx * d;
  const y = p.y + ny * d;
  return <g transform={`translate(${x} ${y})${rotate ? ` rotate(${deg(p.a) + 90})` : ""}`}>{children}</g>;
}

/** Standing: un-shears back to screen space so its children draw upright
    (billboards, or manual iso volumes via iso()). */
function Bill({ children }: { children: ReactNode }) {
  return <g transform={UNISO}>{children}</g>;
}

/* ---------- standing volumes ---------- */

function boxCorners(w: number, d: number, rot: number): [number, number][] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return ([
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ] as [number, number][]).map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

/** A shaded box standing on the ground (or on z0). Light from plan NW:
    each wall gets a shade by its outward normal; walls paint back-to-front. */
function IsoBox({
  w,
  d,
  h,
  rot = 0,
  z0 = 0,
  top,
  wall,
  line = "var(--line-strong)",
  lineW = 1,
  o = 1,
  mullions = false,
}: {
  w: number;
  d: number;
  h: number;
  rot?: number;
  z0?: number;
  top: string;
  wall: string;
  line?: string;
  lineW?: number;
  o?: number;
  mullions?: boolean;
}) {
  const cs = boxCorners(w, d, rot);
  const b = cs.map(([x, y]) => iso(x, y, z0));
  const t = cs.map(([x, y]) => iso(x, y, z0 + h));
  const light = [-0.7071, -0.7071];
  const walls = [0, 1, 2, 3]
    .map((i) => {
      const j = (i + 1) % 4;
      const ex = cs[j][0] - cs[i][0];
      const ey = cs[j][1] - cs[i][1];
      const len = Math.hypot(ex, ey) || 1;
      const nx = ey / len;
      const ny = -ex / len;
      const bright = 0.5 + 0.5 * (nx * light[0] + ny * light[1]);
      return { i, j, midY: (b[i][1] + b[j][1]) / 2, shade: (1 - bright) * 0.3 };
    })
    .sort((a, bb) => a.midY - bb.midY);
  return (
    <g opacity={o}>
      {z0 === 0 && <polygon points={poly(b.map(([px, py]) => [px + 5, py + 4] as [number, number]))} fill="var(--olive-900)" opacity="0.09" />}
      {walls.map(({ i, j, shade }) => (
        <g key={i}>
          <polygon points={poly([b[i], b[j], t[j], t[i]])} fill={wall} stroke={line} strokeWidth={lineW} strokeLinejoin="round" />
          <polygon points={poly([b[i], b[j], t[j], t[i]])} fill="var(--olive-900)" opacity={shade} />
          {mullions &&
            [0.25, 0.5, 0.75].map((u) => {
              const px = b[i][0] + (b[j][0] - b[i][0]) * u;
              const py = b[i][1] + (b[j][1] - b[i][1]) * u;
              return <line key={u} x1={px} y1={py - 3} x2={px} y2={py - h + 3} stroke={line} strokeWidth="0.9" opacity="0.35" />;
            })}
        </g>
      ))}
      <polygon points={poly(t)} fill={top} stroke={line} strokeWidth={lineW} strokeLinejoin="round" />
    </g>
  );
}

/** A house: tall shaded walls under a full-width pitched roof with eaves.
    The roof's two slopes take the light differently, so the volume reads
    at a glance. */
function IsoHouse({
  w = 64,
  d = 58,
  h = 30,
  rh = 20,
  rot = 0,
  roof = "var(--olive-400)",
}: {
  w?: number;
  d?: number;
  h?: number;
  rh?: number;
  rot?: number;
  roof?: string;
}) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const rp = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const ow = w + 10;
  const od = d + 10;
  const eaves = [rp(-ow / 2, -od / 2), rp(ow / 2, -od / 2), rp(ow / 2, od / 2), rp(-ow / 2, od / 2)];
  const e = eaves.map(([x, y]) => iso(x, y, h));
  const r1 = iso(...rp(-w / 2 + 12, 0), h + rh);
  const r2 = iso(...rp(w / 2 - 12, 0), h + rh);
  const slopeA = [e[0], e[1], r2, r1] as [number, number][];
  const slopeB = [e[3], e[2], r2, r1] as [number, number][];
  const gableL = [e[0], e[3], r1] as [number, number][];
  const gableR = [e[1], e[2], r2] as [number, number][];
  const faces = [
    { q: slopeA, fill: roof, shade: 0.24 },
    { q: slopeB, fill: roof, shade: 0.03 },
    { q: gableL, fill: roof, shade: 0.14 },
    { q: gableR, fill: roof, shade: 0.14 },
  ].sort((a, b) => Math.max(...a.q.map((p) => p[1])) - Math.max(...b.q.map((p) => p[1])));
  return (
    <g>
      <IsoBox w={w} d={d} h={h} rot={rot} top="var(--field-3)" wall="var(--field-3)" lineW={1.1} />
      {faces.map(({ q, fill, shade }, i) => (
        <g key={i}>
          <polygon points={poly(q)} fill={fill} stroke="var(--line-strong)" strokeWidth="1.1" strokeLinejoin="round" />
          <polygon points={poly(q)} fill="var(--olive-900)" opacity={shade} />
        </g>
      ))}
      <line x1={r1[0]} y1={r1[1]} x2={r2[0]} y2={r2[1]} stroke="var(--line-strong)" strokeWidth="1.3" opacity="0.75" />
    </g>
  );
}

/** A car: body box, glass cabin, four wheels, nose along the heading. */
function IsoCar({ rot = 0 }: { rot?: number }) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const rp = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const wheels = [rp(-14, -10), rp(14, -10), rp(-14, 10), rp(14, 10)].map(([x, y]) => iso(x, y, 0));
  const shadow = boxCorners(48, 24, rot).map(([x, y]) => iso(x, y, 0));
  return (
    <g>
      <polygon points={poly(shadow.map(([px, py]) => [px + 4, py + 3] as [number, number]))} fill="var(--olive-900)" opacity="0.09" />
      {wheels.map(([wx, wy], i) => (
        <ellipse key={i} cx={wx} cy={wy} rx="4" ry="2.6" fill="var(--olive-900)" opacity="0.7" />
      ))}
      <IsoBox w={44} d={20} h={11} rot={rot} z0={2} top="var(--olive-400)" wall="var(--olive-600)" lineW={0.9} />
      <IsoBox w={24} d={16} h={8} rot={rot} z0={13} top="var(--olive-200)" wall="var(--olive-100)" lineW={0.8} />
    </g>
  );
}

/** A tree: trunk up, canopy cluster floating at height. */
function IsoTree({ r }: { r: number }) {
  const h = r * 0.9 + 10;
  return (
    <g>
      <ellipse cx="0" cy="0" rx={r * 0.55} ry={r * 0.28} fill="var(--olive-800)" opacity="0.1" />
      <line x1="0" y1="0" x2="0" y2={-h} stroke="var(--olive-800)" strokeWidth="3" opacity="0.55" strokeLinecap="round" />
      <circle cy={-h - r * 0.5} r={r} fill="var(--olive-400)" opacity="0.75" />
      <circle cx={-r * 0.3} cy={-h - r * 0.66} r={r * 0.62} fill="var(--olive-300)" opacity="0.8" />
      <circle cx={r * 0.32} cy={-h - r * 0.35} r={r * 0.5} fill="var(--olive-500)" opacity="0.55" />
    </g>
  );
}

/** An A-frame hazard barricade, striped board facing the viewer. */
function IsoBarricade({ id }: { id: string }) {
  return (
    <g>
      <clipPath id={id}>
        <rect x="-24" y="-24" width="48" height="11" rx="2" />
      </clipPath>
      <ellipse cy="1" rx="26" ry="4" fill="var(--olive-800)" opacity="0.1" />
      <path d="M-18 0 L-14 -14 M-10 0 L-14 -14 M18 0 L14 -14 M10 0 L14 -14" stroke="var(--olive-800)" strokeWidth="2.4" opacity="0.6" strokeLinecap="round" />
      <rect x="-24" y="-24" width="48" height="11" rx="2" fill="var(--surface)" />
      <g clipPath={`url(#${id})`}>
        {[-30, -17, -4, 9, 22].map((x0) => (
          <path key={x0} d={`M${x0} -12 L${x0 + 10} -25 L${x0 + 17} -25 L${x0 + 7} -12 Z`} fill="var(--sev-moderate)" opacity="0.9" />
        ))}
      </g>
      <rect x="-24" y="-24" width="48" height="11" rx="2" fill="none" stroke="var(--line-strong)" strokeWidth="1.4" />
    </g>
  );
}

/** A low hedge: two mounded circles hugging the ground. */
function Bush() {
  return (
    <g>
      <ellipse cy="1" rx="30" ry="5" fill="var(--olive-800)" opacity="0.08" />
      <circle cx="-11" cy="-9" r="14" fill="var(--olive-400)" opacity="0.7" />
      <circle cx="10" cy="-7" r="11" fill="var(--olive-300)" opacity="0.75" />
    </g>
  );
}

/* ---------- upright vignettes: Austin, recognizable in silhouette ---------- */

/** The Texas Capitol in elevation: wings, portico, drum, ribbed dome,
    lantern, and the Goddess of Liberty on top. Sunset-red granite. */
function CapitolBill() {
  return (
    <g>
      <ellipse cy="2" rx="84" ry="6" fill="var(--olive-800)" opacity="0.08" />
      <rect x="-78" y="-7" width="156" height="7" fill="var(--sev-severe-bg)" stroke="var(--line-strong)" strokeWidth="1.1" />
      <rect x="-70" y="-30" width="140" height="23" fill="var(--sev-severe-bg)" stroke="var(--line-strong)" strokeWidth="1.4" />
      {[-60, -50, -40, -30, 30, 40, 50, 60].map((wx) => (
        <g key={wx}>
          <rect x={wx - 1.6} y="-26" width="3.2" height="6" fill="var(--line-strong)" opacity="0.35" />
          <rect x={wx - 1.6} y="-17" width="3.2" height="6" fill="var(--line-strong)" opacity="0.3" />
        </g>
      ))}
      <rect x="-20" y="-42" width="40" height="35" fill="var(--sev-severe-bg)" stroke="var(--line-strong)" strokeWidth="1.4" />
      <path d="M-14 -36 L-14 -8 M-7 -36 L-7 -8 M0 -36 L0 -8 M7 -36 L7 -8 M14 -36 L14 -8" stroke="var(--line-strong)" strokeWidth="1" opacity="0.5" />
      <path d="M-22 -42 L0 -50 L22 -42 Z" fill="var(--sev-severe-bg)" stroke="var(--line-strong)" strokeWidth="1.3" />
      <rect x="-13" y="-63" width="26" height="14" fill="var(--sev-severe-bg)" stroke="var(--line-strong)" strokeWidth="1.3" />
      <path d="M-9 -61 L-9 -50 M-3 -61 L-3 -50 M3 -61 L3 -50 M9 -61 L9 -50" stroke="var(--line-strong)" strokeWidth="0.9" opacity="0.5" />
      <path d="M-13 -63 C -13 -84, 13 -84, 13 -63 Z" fill="var(--sev-severe-bg)" stroke="var(--line-strong)" strokeWidth="1.4" />
      <path d="M0 -78 L0 -63 M-7 -75 L-7 -63 M7 -75 L7 -63" stroke="var(--line-strong)" strokeWidth="0.8" opacity="0.4" />
      <rect x="-3" y="-82" width="6" height="6" fill="var(--sev-severe-bg)" stroke="var(--line-strong)" strokeWidth="1" />
      <path d="M0 -82 L0 -90 M-3 -87 L3 -87" stroke="var(--line-strong)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cy="-91.5" r="1.6" fill="var(--line-strong)" />
    </g>
  );
}

/** A pickup truck: cab forward, open bed behind. As Austin as the oaks. */
function IsoPickup({ rot = 0 }: { rot?: number }) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const rp = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const wheels = [rp(-15, -10), rp(15, -10), rp(-15, 10), rp(15, 10)].map(([x, y]) => iso(x, y, 0));
  const shadow = boxCorners(50, 24, rot).map(([x, y]) => iso(x, y, 0));
  const cabOff = iso(...rp(12, 0), 0);
  const bedOff = iso(...rp(-10, 0), 0);
  return (
    <g>
      <polygon points={poly(shadow.map(([px, py]) => [px + 4, py + 3] as [number, number]))} fill="var(--olive-900)" opacity="0.09" />
      {wheels.map(([wx, wy], i) => (
        <ellipse key={i} cx={wx} cy={wy} rx="4.2" ry="2.7" fill="var(--olive-900)" opacity="0.7" />
      ))}
      <IsoBox w={48} d={21} h={11} rot={rot} z0={2} top="var(--olive-500)" wall="var(--olive-700)" lineW={0.9} />
      <g transform={`translate(${bedOff[0]} ${bedOff[1]})`}>
        <IsoBox w={22} d={17} h={1.5} rot={rot} z0={13} top="var(--olive-800)" wall="var(--olive-700)" lineW={0.7} o={0.85} />
      </g>
      <g transform={`translate(${cabOff[0]} ${cabOff[1]})`}>
        <IsoBox w={16} d={17} h={8} rot={rot} z0={13} top="var(--olive-200)" wall="var(--olive-100)" lineW={0.8} />
      </g>
    </g>
  );
}

/** A curbside mailbox on its post, flag up. */
function Mailbox() {
  return (
    <g>
      <ellipse cy="1" rx="5" ry="2" fill="var(--olive-800)" opacity="0.12" />
      <line y2="-13" stroke="var(--olive-800)" strokeWidth="2" strokeLinecap="round" />
      <rect x="-5.5" y="-20" width="11" height="7.5" rx="3" fill="var(--field-3)" stroke="var(--line-strong)" strokeWidth="1" />
      <path d="M5 -20 L5 -24 L7.5 -24" fill="none" stroke="var(--sev-severe)" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  );
}

/** Barton Springs' flat half: the creek widening into the dammed pool.
    Lies on the ground plane; trees and the bathhouse stand separately. */
function BartonPool() {
  return (
    <g>
      <ellipse cx="8" cy="34" rx="92" ry="22" fill="var(--olive-200)" opacity="0.35" />
      <path d="M-104 10 C -88 4, -76 8, -64 2 M64 -8 C 78 -10, 90 -4, 104 2" fill="none" stroke="var(--info)" strokeWidth="9" strokeLinecap="round" opacity="0.4" />
      <path d="M-64 -12 C -34 -20, 34 -18, 64 -16 L 64 6 C 34 14, -34 12, -64 10 Z" fill="var(--info-bg)" stroke="var(--info)" strokeWidth="1.6" />
      <path d="M-64 -12 L-64 10 M64 -16 L64 6" stroke="var(--line-strong)" strokeWidth="3" opacity="0.7" />
      <path d="M-58 -16 L58 -20" stroke="var(--surface)" strokeWidth="6" opacity="0.9" />
      <path d="M-20 -4 C -17 -6, -14 -2, -11 -4 M28 -6 C 31 -8, 34 -4, 37 -6 M2 2 C 5 0, 8 4, 11 2" fill="none" stroke="var(--info)" strokeWidth="1.4" opacity="0.7" strokeLinecap="round" />
    </g>
  );
}

/* ---------- cracks: grown, unique, smooth ---------- */

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

/** A tuft of weeds pushing up through a seam — standing, so it reads as
    growth, not marks on the pavement. */
function Weed({ s = 1 }: { s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <path
        d="M0 0 C -1 -3, -3 -5, -5.5 -7 M0 0 C -0.5 -4, -1.2 -7, -2 -10 M0 0 C 0.4 -4, 1 -7, 2.5 -9.5 M0 0 C 1 -3, 3 -5, 5 -6 M0 0 C 0.1 -3, -0.4 -6, 0.6 -8"
        fill="none"
        stroke="var(--olive-500)"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.85"
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

/* ---------- placement data ---------- */

const CRACKS: [number, number, number][] = [
  // [fraction, seed, rotation] — rotation 90 runs the crack along the walk
  [0.045, 11, 0], [0.075, 23, 90], [0.115, 37, 0], [0.148, 41, 0],
  [0.222, 53, 0], [0.248, 67, 90], [0.298, 71, 0],
  [0.375, 83, 0], [0.408, 89, 90], [0.44, 97, 0], [0.455, 103, 0],
  [0.545, 109, 0], [0.578, 113, 90], [0.612, 127, 0],
  [0.688, 131, 0], [0.715, 137, 0], [0.748, 139, 90],
  [0.808, 149, 0], [0.862, 151, 0],
];
const CHIPS: [number, number][] = [
  [0.06, 1], [0.155, -1], [0.235, 1], [0.43, -1], [0.53, 1], [0.705, -1], [0.856, 1],
];

/* No two panels the same age: seeded per-panel tints, boundaries locked to
   the joint lines, following the curve via subPath. Most panels are lightly
   aged, some plainly dirty, a few filthy; the stretch by the fresh verified
   panel stays newer. */
const PANEL_TINTS: [number, number, number][] = (() => {
  const r = rng(7);
  const out: [number, number, number][] = [];
  for (let k = 0; (k + 1) * PANEL_F < 0.985; k++) {
    const f = k * PANEL_F;
    if (inAnyGap(f, f + PANEL_F)) continue;
    const roll = r();
    let o: number;
    if (roll < 0.3) o = 0.025 + r() * 0.03;
    else if (roll < 0.5) o = 0.06 + r() * 0.04;
    else if (roll < 0.6) o = 0.1 + r() * 0.05;
    else if (roll < 0.65) o = 0.16 + r() * 0.06;
    else continue;
    if (f > 0.88) o *= 0.4;
    out.push([f, f + PANEL_F, o]);
  }
  return out;
})();

const HEAVES: [number, number][] = [[0.09, 2.2], [0.42, -2.6], [0.6, 2], [0.755, -2.2]];
const WEEDS: [number, number, number][] = [
  // [fraction, side, scale] — standing at the edge seams
  [0.05, 1, 1], [0.125, -1, 1.2], [0.235, 1, 0.9], [0.315, -1, 1.1],
  [0.435, 1, 1], [0.557, -1, 1.25], [0.63, 1, 0.85], [0.735, -1, 1.1], [0.815, 1, 0.95],
];

/* The neighborhood: a real street of homes. [fraction, d, tilt°, variant]
   Variants: 0 = ranch (long and low, side to the street), 1 = two-story
   (compact, taller), 2 = gable-end to the street. The walk urbanizes after
   ~0.74, where DOWNTOWN takes over. */
const NEAR_HOUSES: [number, number, number, number][] = [
  [0.045, -182, -2, 0], [0.105, -178, 2, 1], [0.155, -186, 0, 2], [0.215, -180, 3, 0],
  [0.27, -184, -3, 1], [0.325, -178, 2, 0], [0.385, -186, -2, 2], [0.44, -180, 2, 1],
  [0.5, -184, -2, 0], [0.57, -178, 3, 2], [0.63, -185, -2, 0], [0.72, -180, 2, 1],
];
const FAR_HOUSES: [number, number, number, number][] = [
  [0.06, 210, 3, 1], [0.13, 216, -2, 0], [0.205, 208, 2, 2], [0.28, 214, -2, 0],
  [0.35, 210, 3, 1], [0.425, 216, -3, 0], [0.495, 210, 2, 2], [0.6, 214, -2, 0],
  [0.665, 208, 3, 1], [0.72, 214, -2, 0],
];
/* Downtown: taller mullioned blocks rising toward the Capitol. [f, d, w, dd, h] */
const DOWNTOWN: [number, number, number, number, number][] = [
  [0.78, -198, 104, 78, 62], [0.85, -205, 118, 88, 74], [0.905, -208, 96, 74, 88], [0.94, -195, 100, 78, 68],
  [0.8, 205, 100, 78, 58], [0.87, 210, 108, 84, 92], [0.935, 212, 96, 76, 76],
];
const TREES: [number, number, number][] = [
  // suburban live oaks, both sides
  [0.075, -112, 36], [0.24, -108, 42], [0.36, -104, 30], [0.475, -110, 38], [0.6, -106, 32], [0.7, -112, 40],
  [0.09, 178, 32], [0.245, 182, 44], [0.41, 176, 34], [0.53, 184, 40], [0.685, 178, 30],
  // downtown street trees, planted and regular
  [0.77, -44, 15], [0.86, -44, 15], [0.955, -44, 14],
];
const MAILBOXES: number[] = [0.105, 0.215, 0.325, 0.44, 0.57, 0.7];

type Standing = { k: string; depth: number; x: number; y: number; node: ReactNode };

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
    for (let i = JOINT_STEP; i < SAMPLES; i += JOINT_STEP) {
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
  /* every near house gets a front walk; a handful of lots get driveways */
  const walkways = NEAR_HOUSES.map(([f]) => strip(f, -26, -136));
  const driveways = [0.13, 0.325, 0.47, 0.63, 0.76].map((f) => strip(f, 56, -136));

  /* Everything that stands gets collected here and painted back-to-front
     (screen depth in this shear is simply plan x + y). */
  const standing = useMemo(() => {
    const out: Standing[] = [];
    const add = (k: string, src: Pt[], f: number, d: number, make: (a: number) => ReactNode, dx = 0, dy = 0, bias = 0) => {
      const p = at(src, f);
      const nx = -Math.sin(p.a);
      const ny = Math.cos(p.a);
      const px = p.x + nx * d + dx;
      const py = p.y + ny * d + dy;
      out.push({ k, depth: px + py + bias, x: px, y: py, node: make(p.a) });
    };

    const HOUSE_KIND = [
      { w: 82, d: 46, h: 21, rh: 13, end: false, roof: "var(--olive-400)" }, // ranch, long side to the street
      { w: 56, d: 50, h: 34, rh: 18, end: false, roof: "var(--olive-500)" }, // two-story
      { w: 52, d: 62, h: 26, rh: 18, end: true, roof: "var(--olive-300)" }, // gable end to the street
    ] as const;
    NEAR_HOUSES.forEach(([f, d, tilt, v], i) => {
      const k = HOUSE_KIND[v];
      add(`nh${i}`, pts, f, d, (a) => (
        <IsoHouse w={k.w} d={k.d} h={k.h} rh={k.rh} roof={k.roof} rot={a + (k.end ? Math.PI / 2 : 0) + (tilt * Math.PI) / 180} />
      ));
    });
    FAR_HOUSES.forEach(([f, d, tilt, v], i) => {
      const k = HOUSE_KIND[v];
      add(`fh${i}`, pts, f, d, (a) => (
        <IsoHouse
          w={k.w * 0.88}
          d={k.d * 0.88}
          h={k.h * 0.88}
          rh={k.rh * 0.88}
          roof={k.roof}
          rot={a + (k.end ? Math.PI / 2 : 0) + (tilt * Math.PI) / 180}
        />
      ));
    });
    DOWNTOWN.forEach(([f, d, w, dd, h], i) =>
      add(`dt${i}`, pts, f, d, (a) => (
        <IsoBox w={w} d={dd} h={h} rot={a + Math.PI / 2 + (i % 3) * 0.04} top="var(--field-2)" wall="var(--field-3)" lineW={1.2} mullions />
      )),
    );
    MAILBOXES.forEach((f, i) =>
      add(`mb${i}`, pts, f, 44, () => (
        <Bill>
          <Mailbox />
        </Bill>
      )),
    );
    TREES.forEach(([f, d, r], i) =>
      add(`t${i}`, pts, f, d, () => (
        <Bill>
          <IsoTree r={r} />
        </Bill>
      )),
    );
    // the tree whose roots heave the falls-scene panel
    add("fallsTree", pts, SCENES.falls, -(RIBBON / 2 + 74), () => (
      <Bill>
        <IsoTree r={38} />
      </Bill>
    ));
    // hedge crowding the walk in the broken scene
    add("hedge", pts, SCENES.broken, -(RIBBON / 2 + 16), () => (
      <Bill>
        <Bush />
      </Bill>
    ));
    // street cars and pickups: parked and in the lanes
    add("car1", streetPts, 0.15, 36, (a) => <IsoCar rot={a} />);
    add("car2", streetPts, 0.57, 36, (a) => <IsoPickup rot={a} />);
    add("car3", streetPts, 0.36, -13, (a) => <IsoCar rot={a} />);
    add("car4", streetPts, 0.8, 13, (a) => <IsoCar rot={a + Math.PI} />);
    // driveway vehicles; the middle one noses across the walk
    add("dcar1", pts, 0.13, -66, (a) => <IsoCar rot={a + Math.PI / 2} />);
    add("dcar2", pts, 0.47, -8, (a) => <IsoCar rot={a + Math.PI / 2} />);
    add("dcar3", pts, 0.76, -60, (a) => <IsoPickup rot={a - Math.PI / 2} />);
    // barricades at both ends of each never-built stretch
    GAPS.forEach(([g1, g2], gi) => {
      add(`barA${gi}`, pts, g1 - 0.004, 0, () => (
        <Bill>
          <IsoBarricade id={`nb${gi}-near`} />
        </Bill>
      ));
      add(`barB${gi}`, pts, g2 + 0.004, 0, () => (
        <Bill>
          <IsoBarricade id={`nb${gi}-far`} />
        </Bill>
      ));
    });
    // weeds through the seams, and in the gap's dirt
    WEEDS.forEach(([f, side, s], i) =>
      add(`w${i}`, pts, f, side * 23, () => (
        <Bill>
          <Weed s={s} />
        </Bill>
      )),
    );
    ([[0.167, -13, 1.15], [0.176, 11, 0.9], [0.186, -11, 1.05], [0.195, 12, 0.8], [0.831, -12, 0.95], [0.84, 11, 0.85]] as const).forEach(
      ([f, d, s], i) =>
        add(`gw${i}`, pts, f, d, () => (
          <Bill>
            <Weed s={s} />
          </Bill>
        )),
    );
    // the fallen walker, mid-tumble beside the heaved panel
    add("walker", pts, 0.634, -(RIBBON / 2 + 30), () => (
      <Bill>
        <g transform="rotate(10)">
          <circle cx="24" cy="-26" r="6" fill="var(--olive-800)" />
          <path d="M0 0 C 6 -12 14 -20 21 -23" fill="none" stroke="var(--olive-800)" strokeWidth="8" strokeLinecap="round" />
          <path d="M16 -20 L32 -12 M16 -20 L30 -30" fill="none" stroke="var(--olive-800)" strokeWidth="5.5" strokeLinecap="round" />
          <path d="M1 -1 L10 7 L20 9 M1 -1 L-8 8 L-12 16" fill="none" stroke="var(--olive-800)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </Bill>
    ));
    // the verified-fixed pin planted by the fresh panel
    add("pin", pts, 0.906, -4, () => (
      <Bill>
        <ellipse cy="1" rx="10" ry="3.5" fill="var(--olive-800)" opacity="0.14" />
        <g transform="translate(0 -16)">
          <path d="M0 -22 C -8 -22 -14 -16 -14 -8 C -14 2 0 14 0 14 C 0 14 14 2 14 -8 C 14 -16 8 -22 0 -22 Z" fill="var(--olive-700)" />
          <path d="M-6 -9 L-1 -4 L7 -13" fill="none" stroke="var(--field)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </Bill>
    ));
    // Austin, standing in the drawing's distance
    add("capitol", pts, 0.975, -212, () => (
      <Bill>
        <CapitolBill />
        <text y="18" textAnchor="middle" fontSize="12" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
          the capitol
        </text>
      </Bill>
    ));
    add("bartonHouse", pts, 0.56, 252, () => <IsoBox w={30} d={12} h={10} rot={0} top="var(--field-2)" wall="var(--field-3)" lineW={1} />, -29, -28);
    ([[-30, 32, 16], [12, 38, 19], [52, 30, 14]] as const).forEach(([dx, dy, r], i) =>
      add(`bt${i}`, pts, 0.56, 252, () => (
        <Bill>
          <IsoTree r={r} />
        </Bill>
      ), dx, dy),
    );

    return out.sort((a, b) => a.depth - b.depth);
  }, [pts, streetPts]);

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden bg-field">
      <svg className="h-full w-full" aria-hidden focusable="false">
        <g transform={`translate(${box.w / 2} ${box.h * 0.62})`}>
          <g transform={ISO_M}>
            <motion.g style={{ x, y }}>
              {/* the land itself: suburban lawns give way to downtown paving */}
              <path d={subPath(pts, 0.01, 0.745, () => -152)} fill="none" stroke="var(--olive-200)" strokeWidth="120" strokeLinecap="butt" opacity="0.26" />
              <path d={subPath(pts, 0.03, 0.735, () => 176)} fill="none" stroke="var(--olive-200)" strokeWidth="110" strokeLinecap="butt" opacity="0.2" />
              <path d={subPath(pts, 0.765, 0.985, () => -142)} fill="none" stroke="var(--field-3)" strokeWidth="130" strokeLinecap="butt" opacity="0.45" />
              <path d={subPath(pts, 0.77, 0.985, () => 168)} fill="none" stroke="var(--field-3)" strokeWidth="112" strokeLinecap="butt" opacity="0.4" />

              {/* driveways and front walks, under everything paved */}
              {driveways.map((s, i) => (
                <line key={`d${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--field-3)" strokeWidth="26" opacity="0.85" />
              ))}
              {walkways.map((s, i) => (
                <line key={`w${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--surface)" strokeWidth="9" opacity="0.95" />
              ))}

              {/* the street: asphalt, edge lines, a faded center dash */}
              <path d={STREET_D} fill="none" stroke="var(--line-strong)" strokeWidth="104" strokeLinecap="butt" opacity="0.3" />
              <path d={STREET_D} fill="none" stroke="var(--field-3)" strokeWidth="98" strokeLinecap="butt" opacity="0.95" />
              <path d={STREET_D} fill="none" stroke="var(--sev-moderate)" strokeWidth="3" strokeDasharray="30 38" opacity="0.35" />
              {[0.22, 0.45, 0.68, 0.86].map((f, i) => (
                <Scene key={`m${i}`} pts={streetPts} f={f} d={i % 2 ? 14 : -12}>
                  <Manhole />
                </Scene>
              ))}

              {/* the dirt desire-line, visible where the ribbon is missing */}
              <path d={PATH_D} fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="3 14" opacity="0.7" />

              {/* the sidewalk ribbon, aged panel by panel */}
              <path d={PATH_D} fill="none" stroke="var(--line-strong)" strokeWidth={RIBBON + 5} strokeLinecap="butt" opacity="0.55" />
              <path d={PATH_D} fill="none" stroke="var(--surface)" strokeWidth={RIBBON} strokeLinecap="butt" />
              {PANEL_TINTS.map(([f1, f2, o], i) => (
                <path key={`pt${i}`} d={subPath(pts, f1, f2)} fill="none" stroke="var(--olive-800)" strokeWidth={RIBBON - 2} strokeLinecap="butt" opacity={o} />
              ))}
              {joints.map((j, i) => (
                <line key={i} x1={j.x1} y1={j.y1} x2={j.x2} y2={j.y2} stroke="var(--line)" strokeWidth="1.5" />
              ))}
              <Scene pts={pts} f={0.28}>
                <Manhole r={7} />
              </Scene>

              {/* everyday wear: lifted panels, cracks, chipped-off edges */}
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

              {/* ---- never built: the ribbon stops for curved stretches —
                   the labeled suburban one, and a wordless one downtown ---- */}
              {GAPS.map(([g1, g2], gi) => (
                <g key={`gap${gi}`}>
                  <path d={subPath(pts, g1, g2)} fill="none" stroke="var(--field)" strokeWidth={RIBBON + 11} strokeLinecap="butt" />
                  <path d={subPath(pts, g1, g2)} fill="none" stroke="var(--olive-100)" strokeWidth={RIBBON - 2} strokeLinecap="butt" opacity="0.28" />
                  {[g1, g2].map((f) => {
                    const s = strip(f, -RIBBON / 2, RIBBON / 2);
                    return <line key={f} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--line-strong)" strokeWidth="2.6" opacity="0.75" />;
                  })}
                  <path
                    d={subPath(pts, g1 - 0.002, g2 + 0.002, (i) => 8 * Math.sin(i * 0.85) + 3 * Math.sin(i * 2.1))}
                    fill="none"
                    stroke="var(--olive-700)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    opacity="0.24"
                  />
                  <path
                    d={subPath(pts, g1 - 0.002, g2 + 0.002, (i) => 8 * Math.sin(i * 0.85) + 3 * Math.sin(i * 2.1))}
                    fill="none"
                    stroke="var(--olive-800)"
                    strokeWidth="2"
                    strokeDasharray="6 10"
                    opacity="0.35"
                  />
                </g>
              ))}
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

              {/* ---- failing: fractures on the ground ---- */}
              <Scene pts={pts} f={SCENES.broken}>
                <g transform="translate(0 -6)">
                  <Crack seed={201} rot={90} o={0.85} span={64} />
                </g>
                <g transform="translate(0 44)">
                  <Crack seed={202} o={0.7} />
                </g>
              </Scene>

              {/* ---- the math: the reported panel got its patch (the win);
                   nobody reported the cracked stretch a block on ---- */}
              <Scene pts={pts} f={SCENES.math}>
                <rect x="-20" y="-58" width="38" height="44" rx="3" fill="var(--field-2)" stroke="var(--olive-600)" strokeWidth="1.8" />
                <rect x="-14" y="-6" width="30" height="26" rx="3" fill="var(--field-2)" stroke="var(--olive-600)" strokeWidth="1.5" opacity="0.9" />
              </Scene>
              <Scene pts={pts} f={0.555}>
                <g transform="translate(0 4)">
                  <Crack seed={216} o={0.9} span={56} />
                </g>
                <g transform="translate(5 18) rotate(72)">
                  <Crack seed={218} o={0.7} span={34} />
                </g>
              </Scene>

              {/* ---- the falls: roots, a heaved panel, the tipped bike ---- */}
              <Scene pts={pts} f={SCENES.falls}>
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
              </Scene>

              {/* ---- the precedent: the defect gets its legal name ---- */}
              <Scene pts={pts} f={SCENES.precedent}>
                <circle cx={-RIBBON / 2 + 12} cy="0" r="9" fill="none" stroke="var(--sev-moderate)" strokeWidth="3" opacity="0.85" />
                <circle cx={-RIBBON / 2 + 12} cy="0" r="3" fill="var(--sev-moderate)" opacity="0.85" />
                <path d="M-26 -34 L-10 -26 L-2 -10" fill="none" stroke="var(--line-strong)" strokeWidth="2" opacity="0.8" />
              </Scene>

              {/* ---- the count: the fresh, verified panel ---- */}
              <Scene pts={pts} f={SCENES.count}>
                <rect x={-RIBBON / 2 + 2} y="-52" width={RIBBON - 4} height="58" fill="var(--field-2)" stroke="var(--line-strong)" strokeWidth="1.8" />
              </Scene>

              {/* Barton Springs' water lies flat on the ground */}
              <Scene pts={pts} f={0.56} d={252} rotate={false}>
                <BartonPool />
              </Scene>

              {/* everything that stands, painted back to front */}
              {standing.map((s) => (
                <g key={s.k} transform={`translate(${s.x} ${s.y})`}>
                  {s.node}
                </g>
              ))}

              {/* labels, upright and never occluded */}
              <Scene pts={pts} f={SCENES.missing} rotate={false}>
                <Bill>
                  <text x="52" y="2" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                    never built
                  </text>
                </Bill>
              </Scene>
              <Scene pts={pts} f={SCENES.broken} rotate={false}>
                <Bill>
                  <text x="52" y="-6" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                    failing the test
                  </text>
                </Bill>
              </Scene>
              <Scene pts={pts} f={SCENES.math} rotate={false}>
                <Bill>
                  <text x="50" y="-14" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                    patched: someone reported it
                  </text>
                </Bill>
              </Scene>
              <Scene pts={pts} f={0.555} rotate={false}>
                <Bill>
                  <text x="46" y="10" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)" opacity="0.9">
                    nobody reported this one
                  </text>
                </Bill>
              </Scene>
              <Scene pts={pts} f={SCENES.falls} rotate={false}>
                <Bill>
                  <path d="M28 -4 L42 -4" stroke="var(--olive-800)" strokeWidth="1.4" opacity="0.7" fill="none" />
                  <text x="48" y="1" fontSize="16" fontWeight="600" fill="var(--olive-800)" fontFamily="var(--font-mono)">
                    ½ in
                  </text>
                </Bill>
              </Scene>
              <Scene pts={pts} f={SCENES.precedent} rotate={false}>
                <Bill>
                  <rect x="44" y="-16" width="108" height="26" rx="5" fill="var(--field)" stroke="var(--olive-800)" strokeWidth="1.5" />
                  <text x="98" y="2" textAnchor="middle" fontSize="14" fill="var(--olive-800)" fontFamily="var(--font-mono)">
                    ADA barrier
                  </text>
                </Bill>
              </Scene>
              <Scene pts={pts} f={SCENES.count} rotate={false}>
                <Bill>
                  <text x="52" y="-22" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                    reported → verified fixed
                  </text>
                </Bill>
              </Scene>
              <Scene pts={pts} f={0.56} d={252} rotate={false}>
                <Bill>
                  <text y="60" textAnchor="middle" fontSize="12" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                    barton springs
                  </text>
                </Bill>
              </Scene>
              <Scene pts={pts} f={0.985} rotate={false}>
                <Bill>
                  <text textAnchor="middle" y="-16" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                    the map takes it from here
                  </text>
                  <path d="M0 -4 L0 22 M-8 14 L0 24 L8 14" fill="none" stroke="var(--ink-mute)" strokeWidth="2" strokeLinecap="round" />
                </Bill>
              </Scene>
            </motion.g>
          </g>

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
        One sidewalk · you are the dot
      </p>
    </div>
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
