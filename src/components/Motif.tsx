import type { CSSProperties } from "react";

/**
 * Translucent sidewalk motifs. Decorative, aria-hidden, pointer-events none.
 * Each is an abstract line drawing of the thing we actually fix: fracture
 * lines, panel joints, a root under a slab, a lifted lip. Drawn in
 * currentColor at low opacity so they sit inside any section's palette.
 */
export type MotifKind = "crack" | "panels" | "root" | "lip" | "branch" | "walker" | "roots";

const PATHS: Record<MotifKind, { viewBox: string; d: string[]; width: number }> = {
  // A long fracture with two branches, running diagonally.
  crack: {
    viewBox: "0 0 600 400",
    width: 2.2,
    d: [
      "M-10 60 L70 84 L118 72 L176 126 L214 118 L268 174 L322 166 L360 214 L418 206 L470 268 L518 262 L560 318 L612 326",
      "M176 126 L162 168 L190 206 L178 252",
      "M418 206 L446 170 L498 158 L524 110",
      "M322 166 L330 206 L372 238",
    ],
  },
  // Sidewalk panel joints in one-point perspective.
  panels: {
    viewBox: "0 0 800 300",
    width: 1.6,
    d: [
      "M0 300 L360 0 M130 300 L400 0 M260 300 L440 0 M390 300 L480 0 M520 300 L520 0 M650 300 L560 0 M780 300 L600 0",
      "M-20 280 L820 280 M20 230 L780 230 M60 185 L740 185 M95 150 L705 150 M125 122 L675 122 M150 100 L650 100 M170 82 L630 82",
    ],
  },
  // A root running under a slab and pushing the joint up.
  root: {
    viewBox: "0 0 600 300",
    width: 2.4,
    d: [
      "M-10 250 C 60 250, 90 236, 140 226 C 220 210, 250 238, 300 214 C 350 190, 380 196, 430 204 C 500 216, 540 250, 620 252",
      "M140 226 C 150 260, 170 282, 200 296 M300 214 C 290 250, 310 276, 340 298 M430 204 C 445 236, 470 258, 500 272",
      "M0 178 L260 178 L260 162 L620 162",
    ],
  },
  // Two panels, one lifted: the mark, enlarged and open.
  lip: {
    viewBox: "0 0 600 240",
    width: 2.4,
    d: ["M-20 170 L300 170 M300 170 L300 134 M300 134 L620 134", "M-20 190 L300 190 M300 154 L620 154"],
  },
  // A frieze: two strides, a lifted joint, and the trip it causes.
  walker: {
    viewBox: "0 0 800 300",
    width: 2.2,
    d: [
      // ground with the lifted panel
      "M-20 250 L470 250 L470 230 L820 230",
      // figure one, mid-stride
      "M96 116 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0",
      "M108 129 L114 190 M110 143 L86 174 M110 143 L136 170 M114 190 L95 221 L80 248 M114 190 L136 219 L150 248",
      // figure two, mid-stride
      "M287 114 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0",
      "M301 127 L306 188 M303 141 L328 170 M303 141 L279 168 M306 188 L285 220 L272 248 M306 188 L328 218 L342 248",
      // figure three, toe caught on the lip, pitched forward
      "M591 140 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0",
      "M540 190 L584 152 M584 152 L630 140 M584 152 L622 176 M540 190 L560 214 L552 230 M540 190 L504 220 L468 244",
      // the sudden-motion marks behind the fall
      "M508 168 C 498 176, 498 188, 508 196 M492 160 C 480 170, 480 186, 492 196",
    ],
  },
  // A tree whose roots outgrew the panel: trunk, flared roots, heaved slab.
  roots: {
    viewBox: "0 0 600 400",
    width: 2.3,
    d: [
      // trunk down from the canopy, one limb out
      "M276 -10 C 274 50, 278 100, 268 140 M330 -10 C 332 60, 326 105, 342 142 M330 30 C 356 40, 372 34, 392 14",
      // the roots, far too big
      "M268 140 C 230 170, 170 190, 60 200 M150 193 C 130 214, 118 236, 112 262",
      "M342 142 C 396 176, 470 196, 560 202 M470 196 C 486 224, 494 252, 496 284",
      "M300 150 C 292 210, 286 270, 282 340 M282 156 C 250 220, 236 270, 228 330 M322 158 C 352 224, 366 276, 372 334",
      // the slab, heaved and cracked open over the trunk
      "M-20 262 L120 262 C 180 258, 220 232, 268 222 M332 224 C 390 234, 440 258, 620 260",
      "M268 222 L260 196 M332 224 L344 198",
      // the grade the sidewalk was poured at
      "M-20 286 L620 286",
    ],
  },
  // Alligator cracking: a small cellular network.
  branch: {
    viewBox: "0 0 400 400",
    width: 1.8,
    d: [
      "M40 60 L120 90 L170 50 L240 80 L300 40 L360 90 M120 90 L110 160 L160 210 L230 190 L240 80 M160 210 L150 290 L220 330 L290 300 L310 220 L230 190 M310 220 L370 230 L380 160 L300 120 L240 80 M110 160 L50 190 L60 270 L150 290 M60 270 L40 350 L130 380 L220 330 M290 300 L330 370",
    ],
  },
};

export function Motif({
  kind,
  className = "",
  style,
  opacity = 0.1,
}: {
  kind: MotifKind;
  className?: string;
  style?: CSSProperties;
  opacity?: number;
}) {
  const m = PATHS[kind];
  return (
    <svg
      className={`motif motif--${kind} ${className}`}
      viewBox={m.viewBox}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
      style={{ opacity, ...style }}
    >
      {m.d.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={m.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
