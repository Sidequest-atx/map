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

            {/* the street: asphalt, edge lines, a faded center dash */}
            <path d={STREET_D} fill="none" stroke="var(--line-strong)" strokeWidth="104" strokeLinecap="round" opacity="0.3" />
            <path d={STREET_D} fill="none" stroke="var(--field-3)" strokeWidth="98" strokeLinecap="round" opacity="0.95" />
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
            <path d={PATH_D} fill="none" stroke="var(--line-strong)" strokeWidth={RIBBON + 5} strokeLinecap="round" opacity="0.55" />
            <path d={PATH_D} fill="none" stroke="var(--surface)" strokeWidth={RIBBON} strokeLinecap="round" />
            {joints.map((j, i) => (
              <line key={i} x1={j.x1} y1={j.y1} x2={j.x2} y2={j.y2} stroke="var(--line)" strokeWidth="1.5" />
            ))}
            {/* a utility cover set into the walk */}
            <Scene pts={pts} f={0.28}>
              <Manhole r={7} />
            </Scene>

            {/* ---- never built: the ribbon simply stops for a stretch ---- */}
            <Scene pts={pts} f={SCENES.missing}>
              <rect x={-RIBBON / 2 - 5} y={-95} width={RIBBON + 10} height={190} fill="var(--field)" />
              <path d={`M${-RIBBON / 2} -95 L${-RIBBON / 2} 95 M${RIBBON / 2} -95 L${RIBBON / 2} 95`} stroke="var(--line)" strokeWidth="1.6" strokeDasharray="5 7" opacity="0.8" />
              {[-64, -30, 4, 38, 70].map((yy, i) => (
                <circle key={i} cx={i % 2 ? 7 : -6} cy={yy} r="2.3" fill="var(--olive-700)" opacity="0.4" />
              ))}
            </Scene>
            <Scene pts={pts} f={SCENES.missing} rotate={false}>
              <text x="48" y="5" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                never built
              </text>
            </Scene>

            {/* ---- failing: fractures and a hedge over the edge ---- */}
            <Scene pts={pts} f={SCENES.broken}>
              <path d="M-26 -38 L-8 -30 L2 -14 L-4 4 L10 18 L4 34 M-8 -30 L-18 -12 M2 -14 L18 -8" fill="none" stroke="var(--line-strong)" strokeWidth="2.2" strokeLinejoin="round" opacity="0.9" />
              <path d="M-26 52 L-2 60 L8 74" fill="none" stroke="var(--line-strong)" strokeWidth="1.8" opacity="0.7" />
              <ellipse cx={-RIBBON / 2 - 8} cy="-70" rx="34" ry="26" fill="var(--olive-400)" opacity="0.5" />
              <ellipse cx={-RIBBON / 2 + 6} cy="-58" rx="22" ry="16" fill="var(--olive-300)" opacity="0.55" />
            </Scene>
            <Scene pts={pts} f={SCENES.broken} rotate={false}>
              <text x="48" y="-4" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                failing the test
              </text>
            </Scene>

            {/* ---- the math: patched, repatched, never rebuilt ---- */}
            <Scene pts={pts} f={SCENES.math}>
              <rect x="-20" y="-60" width="38" height="46" rx="3" fill="var(--olive-800)" opacity="0.14" />
              <rect x="-14" y="8" width="30" height="34" rx="3" fill="var(--olive-800)" opacity="0.1" />
              <path d="M-24 62 L-4 70 L2 86 M10 -86 L22 -72" fill="none" stroke="var(--line-strong)" strokeWidth="2" opacity="0.8" />
            </Scene>
            <Scene pts={pts} f={SCENES.math} rotate={false}>
              <text x="48" y="2" fontSize="15" fill="var(--ink-mute)" fontFamily="var(--font-mono)">
                patched, not rebuilt
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
              <g transform={`translate(${-RIBBON / 2 - 34} 78) rotate(12)`}>
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
                [0.5, 214, -2],
                [0.82, 208, 2],
              ] as const
            ).map(([f, d, tilt], i) => (
              <Scene key={`hf${i}`} pts={pts} f={f} d={d}>
                <House w={88} h={68} tilt={tilt} />
              </Scene>
            ))}

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
              animate={reduced ? undefined : { r: [13, 26], opacity: [0.3, 0] }}
              transition={{ repeat: Infinity, duration: 2.1, ease: "easeOut" }}
            />
            <circle r="8" fill="var(--olive-700)" stroke="var(--field)" strokeWidth="3" />
          </g>
        </g>
      </svg>

      <p className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] tracking-[0.16em] text-ink-mute uppercase">
        One sidewalk · plan view · you are the dot
      </p>
    </div>
  );
}
