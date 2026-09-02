import { motion, useReducedMotion } from "motion/react";

/**
 * The landing's one visual system: a sidewalk in section view, drawn in the
 * register of an engineering drawing (datum lines, hatched sub-base, extension
 * lines, a dimensioned defect), that degrades in lockstep with the story.
 *
 * Stages follow the chapters:
 *   0 missing   — one built panel; the next one only dashed. Never poured.
 *   1 broken    — the second panel exists but a fracture opens.
 *   2 math      — a second crack; nothing gets repaired while money waits.
 *   3 falls     — a root heaves the joint into a measured half-inch lip, and
 *                 the comparison rows play: the same lip vs a car, a bike, a
 *                 walker (solid pictograms in the crosswalk-signal language).
 *   4 precedent — the defect gets its legal name.
 *   5 count     — repaired: defects clear, a report pin marks the fix.
 */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function SidewalkSpine({ stage, className = "" }: { stage: number; className?: string }) {
  const reduced = useReducedMotion();

  // A path that draws itself in when `on`, and politely leaves when not.
  const line = (on: boolean, delay = 0) => ({
    initial: false as const,
    animate: on ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 },
    transition: reduced
      ? { duration: 0 }
      : { pathLength: { duration: 0.9, ease: EASE, delay }, opacity: { duration: 0.25, delay } },
  });
  const fade = (on: boolean, delay = 0) => ({
    initial: false as const,
    animate: on ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 },
    transition: reduced ? { duration: 0 } : { duration: 0.6, ease: EASE, delay },
  });

  const s = stage;
  const lipUp = s === 3 || s === 4; // the joint sits heaved through falls + precedent
  const repaired = s >= 5;

  return (
    <svg viewBox="0 0 560 430" className={className} aria-hidden focusable="false" style={{ color: "var(--olive-800)" }}>
      {/* ============ comparison rows: the same half inch, three outcomes ============ */}
      <g style={{ opacity: 1 }}>
        {/* row grounds with the same mini-lip */}
        <motion.path d="M60 88 L330 88 L330 81 L500 81" {...line(s === 3)} fill="none" stroke="currentColor" strokeWidth="1.8" />
        <motion.path d="M60 150 L330 150 L330 143 L500 143" {...line(s === 3, 0.1)} fill="none" stroke="currentColor" strokeWidth="1.8" />
        <motion.path d="M60 212 L330 212 L330 205 L500 205" {...line(s === 3, 0.2)} fill="none" stroke="currentColor" strokeWidth="1.8" />

        {/* car: already past the lip, unbothered (streaks where it crossed) */}
        <motion.g {...fade(s === 3, 0.45)}>
          <path
            d="M356 60 Q356 54 364 53 L382 51 Q391 42 405 42 L421 42 Q433 42 439 50 L451 53 Q459 55 459 61 L459 66 Q459 70 453 70 L362 70 Q356 70 356 65 Z"
            fill="currentColor"
            opacity="0.92"
          />
          <circle cx="381" cy="73" r="7.5" fill="currentColor" />
          <circle cx="437" cy="73" r="7.5" fill="currentColor" />
          <path d="M312 62 L342 62 M306 70 L336 70" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
          <text x="500" y="101" textAnchor="end" fontSize="12" fill="currentColor" opacity="0.8" fontFamily="var(--font-mono)">
            doesn't notice
          </text>
        </motion.g>

        {/* bike + rider: front wheel into the lip face, rider pitching */}
        <motion.g {...fade(s === 3, 0.7)}>
          <g transform="rotate(-9 322 140)">
            <circle cx="319" cy="140" r="10" fill="none" stroke="currentColor" strokeWidth="2.6" />
            <circle cx="273" cy="140" r="10" fill="none" stroke="currentColor" strokeWidth="2.6" />
            <path d="M273 140 L288 122 L308 122 M288 122 L285 140 M308 122 L319 140 M285 140 L308 122" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M308 122 L313 114 M285 122 L282 115 L276 115" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            {/* rider, thick-stroke pictogram */}
            <circle cx="304" cy="94" r="5.5" fill="currentColor" />
            <path d="M283 116 C 288 106 295 101 301 101" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
            <path d="M299 103 L311 112" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            <path d="M284 116 L292 127 L288 136" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <text x="500" y="163" textAnchor="end" fontSize="12" fill="currentColor" opacity="0.8" fontFamily="var(--font-mono)">
            wheel stops. the rider doesn't.
          </text>
        </motion.g>

        {/* walker: toe caught, pitched forward */}
        <motion.g {...fade(s === 3, 0.95)}>
          <circle cx="367" cy="168" r="6" fill="currentColor" />
          <path d="M342 196 C 348 184 356 176 363 173" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
          <path d="M358 176 L374 184 M358 176 L372 166" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
          <path d="M343 195 L352 203 L362 205 M343 195 L334 204 L330 212" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <text x="500" y="225" textAnchor="end" fontSize="12" fill="currentColor" opacity="0.8" fontFamily="var(--font-mono)">
            toe catches at ¼ in
          </text>
        </motion.g>
      </g>

      {/* ============ main section view ============ */}
      {/* left panel, always there once the story starts */}
      <motion.path d="M24 272 L272 272 M24 292 L272 292 M24 272 L24 292 M272 272 L272 292" {...line(s >= 0)} fill="none" stroke="currentColor" strokeWidth="2.2" />

      {/* right panel: dashed ghost while it was never built */}
      <motion.g {...fade(s === 0)}>
        <path d="M280 272 L536 272 M280 292 L536 292 M536 272 L536 292" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="6 6" opacity="0.55" />
        <text x="408" y="264" textAnchor="middle" fontSize="10.5" fill="currentColor" opacity="0.65" fontFamily="var(--font-mono)">
          never built
        </text>
      </motion.g>

      {/* right panel, real from the broken chapter on; heaves during falls/precedent */}
      <motion.g
        initial={false}
        animate={{ opacity: s >= 1 ? 1 : 0, y: lipUp ? -12 : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.8, ease: EASE }}
      >
        <path d="M280 272 L536 272 M280 292 L536 292 M280 272 L280 292 M536 272 L536 292" fill="none" stroke="currentColor" strokeWidth="2.2" />
      </motion.g>

      {/* sub-base hatching, the drafting convention */}
      <motion.path
        d="M32 306 L44 294 M52 306 L64 294 M72 306 L84 294 M92 306 L104 294 M112 306 L124 294 M132 306 L144 294 M152 306 L164 294 M172 306 L184 294 M192 306 L204 294 M212 306 L224 294 M232 306 L244 294 M252 306 L264 294 M288 306 L300 294 M308 306 L320 294 M328 306 L340 294 M348 306 L360 294 M368 306 L380 294 M388 306 L400 294 M408 306 L420 294 M428 306 L440 294 M448 306 L460 294 M468 306 L480 294 M488 306 L500 294 M508 306 L520 294"
        {...line(s >= 0, 0.3)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.32"
      />

      {/* fracture one: opens in the broken chapter, gone when repaired */}
      <motion.path d="M148 272 L144 279 L151 285 L146 292" {...line(s >= 1 && !repaired)} fill="none" stroke="currentColor" strokeWidth="2" />
      <motion.path d="M148 272 L128 270 M148 272 L169 274" {...line(s >= 1 && !repaired, 0.25)} fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />

      {/* fracture two: the years pass, nothing gets fixed */}
      <motion.path d="M214 272 L219 280 L212 287 L217 292 M214 272 L198 270 M214 272 L233 271" {...line(s >= 2 && !repaired, 0.15)} fill="none" stroke="currentColor" strokeWidth="1.8" />

      {/* the root that pays for all of it */}
      <motion.path
        d="M304 330 C 290 318 283 306 286 296 C 288 290 294 287 302 288 M296 316 C 286 314 278 316 272 322 M298 302 C 308 300 316 303 322 310"
        {...line(s >= 3 && !repaired, 0.1)}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />

      {/* the dimension: extension lines + arrows + the number that trips people */}
      <motion.g {...fade(lipUp, 0.5)}>
        <path d="M272 272 L240 272 M280 260 L240 260" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
        <path d="M246 260 L246 272 M246 260 L243.5 264 M246 260 L248.5 264 M246 272 L243.5 268 M246 272 L248.5 268" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <text x="226" y="270" textAnchor="end" fontSize="12.5" fontWeight="600" fill="currentColor" fontFamily="var(--font-mono)">
          ½ in
        </text>
      </motion.g>

      {/* the legal name */}
      <motion.g {...fade(s === 4, 0.3)}>
        <path d="M292 258 L318 240" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
        <rect x="318" y="228" width="102" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <text x="369" y="242" textAnchor="middle" fontSize="10.5" fill="currentColor" fontFamily="var(--font-mono)">
          ADA barrier
        </text>
      </motion.g>

      {/* the repair: a pin where a photograph closed the loop */}
      <motion.g {...fade(repaired, 0.35)}>
        <path d="M276 224 C 268 224 262 230 262 238 C 262 248 276 260 276 260 C 276 260 290 248 290 238 C 290 230 284 224 276 224 Z" fill="currentColor" opacity="0.95" />
        <path d="M270 237 L275 242 L283 233" fill="none" stroke="var(--field)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <text x="276" y="212" textAnchor="middle" fontSize="10.5" fill="currentColor" opacity="0.8" fontFamily="var(--font-mono)">
          reported → verified fixed
        </text>
      </motion.g>

      {/* title block */}
      <text x="24" y="352" fontSize="10" letterSpacing="1.6" fill="currentColor" opacity="0.5" fontFamily="var(--font-mono)">
        SIDEWALK — SECTION VIEW
      </text>
      <motion.text
        initial={false}
        animate={{ opacity: 0.5 }}
        x="536"
        y="352"
        textAnchor="end"
        fontSize="10"
        letterSpacing="1.6"
        fill="currentColor"
        fontFamily="var(--font-mono)"
      >
        {repaired ? "AS REPAIRED" : s >= 3 ? "AS FOUND" : s >= 1 ? "AS BUILT" : "AS PLANNED"}
      </motion.text>
    </svg>
  );
}
