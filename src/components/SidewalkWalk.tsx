import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MotionValue } from "motion/react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * The landing's left canvas: one winding sidewalk in plan view, and the page
 * is a walk down it. A "you" dot holds the camera focus while the world
 * glides past, spring-smoothed; the story's defects appear along the route
 * where their chapters live. The drawings are static — the only motion is
 * the walk itself.
 */

const PATH_D =
  "M600 5080 C 600 4820, 330 4740, 330 4480 C 330 4220, 870 4140, 870 3880 " +
  "C 870 3620, 330 3540, 330 3280 C 330 3020, 870 2940, 870 2680 " +
  "C 870 2420, 330 2340, 330 2080 C 330 1820, 870 1740, 870 1480 " +
  "C 870 1220, 480 1150, 480 900 C 480 650, 600 520, 600 260";

const SAMPLES = 420;
const RIBBON = 52; // sidewalk width in world units
const JOINT_EVERY = 118; // world units between panel joints

// Where each scene sits along the walk (fraction of total path length).
const SCENES = { missing: 0.18, broken: 0.34, math: 0.5, falls: 0.645, precedent: 0.79, count: 0.9 } as const;

type Pt = { x: number; y: number; a: number };

function usePathSamples() {
  const pathRef = useRef<SVGPathElement>(null);
  const [pts, setPts] = useState<Pt[] | null>(null);
  useLayoutEffect(() => {
    const el = pathRef.current;
    if (!el) return;
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
    setPts(out);
  }, []);
  return { pathRef, pts };
}

const at = (pts: Pt[], f: number) => pts[Math.round(Math.min(Math.max(f, 0), 1) * SAMPLES)];
const deg = (rad: number) => (rad * 180) / Math.PI;

/** Group positioned on the path at fraction f, rotated to the walk direction. */
function Scene({ pts, f, children, rotate = true }: { pts: Pt[]; f: number; children: React.ReactNode; rotate?: boolean }) {
  const p = at(pts, f);
  return <g transform={`translate(${p.x} ${p.y})${rotate ? ` rotate(${deg(p.a) + 90})` : ""}`}>{children}</g>;
}

export function SidewalkWalk({ progress }: { progress: MotionValue<number> }) {
  const reduced = useReducedMotion();
  const { pathRef, pts } = usePathSamples();

  // Camera anchor in pixels: percentage transforms don't resolve reliably on
  // SVG groups, so measure the canvas and place the anchor ourselves.
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

  // Camera: the focused path point maps to a fixed anchor in the viewport.
  const x = useTransform(drive, (p) => (pts ? -at(pts, p).x : 0));
  const y = useTransform(drive, (p) => (pts ? -at(pts, p).y : 0));

  // Panel joints, computed once from the samples.
  const joints = useMemo(() => {
    if (!pts) return [];
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

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden bg-field">
      <svg className="h-full w-full" aria-hidden focusable="false">
        {/* the world glides under a fixed camera anchor */}
        <g transform={`translate(${box.w / 2} ${box.h * 0.62})`}>
          <motion.g style={{ x, y }}>
            {/* sampling source; also the dirt desire-path where nothing was built */}
            <path ref={pathRef} d={PATH_D} fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="3 14" opacity="0.7" />

            {pts && (
              <>
                {/* lawns and canopies, barely-there zoning */}
                <ellipse cx="180" cy="3620" rx="240" ry="420" fill="var(--olive-200)" opacity="0.16" />
                <ellipse cx="1010" cy="2350" rx="260" ry="480" fill="var(--olive-200)" opacity="0.14" />
                <ellipse cx="210" cy="1500" rx="220" ry="380" fill="var(--olive-200)" opacity="0.15" />
                {[
                  [150, 4520, 92],
                  [1035, 3880, 110],
                  [140, 3210, 84],
                  [1046, 2680, 96],
                  [1040, 1480, 118],
                  [300, 860, 90],
                ].map(([cx, cy, r], i) => (
                  <g key={i} opacity="0.35">
                    <circle cx={cx} cy={cy} r={r} fill="var(--olive-300)" opacity="0.45" />
                    <circle cx={cx} cy={cy} r={r * 0.62} fill="var(--olive-400)" opacity="0.35" />
                    <circle cx={cx - r * 0.2} cy={cy - r * 0.15} r={r * 0.28} fill="var(--olive-200)" opacity="0.5" />
                  </g>
                ))}

                {/* the sidewalk ribbon: edges, then surface, then joints */}
                <path d={PATH_D} fill="none" stroke="var(--line-strong)" strokeWidth={RIBBON + 5} strokeLinecap="round" opacity="0.55" />
                <path d={PATH_D} fill="none" stroke="var(--surface)" strokeWidth={RIBBON} strokeLinecap="round" />
                {joints.map((j, i) => (
                  <line key={i} x1={j.x1} y1={j.y1} x2={j.x2} y2={j.y2} stroke="var(--line)" strokeWidth="1.5" />
                ))}

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
                  {/* the canopy whose roots did it */}
                  <circle cx={-RIBBON / 2 - 74} cy="-6" r="64" fill="var(--olive-400)" opacity="0.4" />
                  <circle cx={-RIBBON / 2 - 74} cy="-6" r="40" fill="var(--olive-300)" opacity="0.45" />
                  <path d={`M${-RIBBON / 2 - 40} -4 C -30 -6, -10 -2, ${RIBBON / 2 - 4} 2 M${-RIBBON / 2 - 34} 14 C -20 16, -6 12, 12 16`} fill="none" stroke="var(--olive-700)" strokeWidth="3" opacity="0.5" strokeLinecap="round" />
                  {/* the heaved panel: one slab rotated out of plane */}
                  <g transform="rotate(-5)">
                    <rect x={-RIBBON / 2 + 2} y="-48" width={RIBBON - 4} height="52" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
                  </g>
                  <path d={`M${-RIBBON / 2 + 2} 6 L${RIBBON / 2 - 2} 4`} stroke="var(--olive-900)" strokeWidth="3.5" opacity="0.55" />
                  {/* who it got: a tipped bike and a pitched walker, signage register */}
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
              </>
            )}
          </motion.g>

          {/* you, walking */}
          {pts && (
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
          )}
        </g>
      </svg>

      <p className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] tracking-[0.16em] text-ink-mute uppercase">
        One sidewalk · plan view · you are the dot
      </p>
    </div>
  );
}
