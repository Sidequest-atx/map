import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * The moving fact: at the CDC's national rate (about 3 million older-adult
 * fall ER visits a year), one lands every ~10.5 seconds. This ticks while the
 * reader reads. Derived, labeled, and frozen under reduced motion.
 */
const SECONDS_PER_VISIT = 31_536_000 / 3_000_000; // ≈ 10.5 s

export function FallTicker() {
  const reduced = useReducedMotion();
  const started = useRef(Date.now());
  const [n, setN] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setN(Math.floor((Date.now() - started.current) / 1000 / SECONDS_PER_VISIT));
    }, 1000);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <div
      className="rounded-[var(--r-md)] bg-olive-600/8 px-4 py-3.5"
      title="Derived: CDC reports about 3 million ER visits for older-adult falls each year; 31,536,000 seconds ÷ 3,000,000 ≈ one every 11 seconds."
    >
      {reduced ? (
        <p className="font-sans text-[0.95rem] leading-relaxed text-ink">
          At the national rate, a fall sends an older American to an emergency room about{" "}
          <b>every 11 seconds</b>.
        </p>
      ) : (
        <p className="font-sans text-[0.95rem] leading-relaxed text-ink">
          Since you opened this page, about{" "}
          <b className="font-mono text-[1.05rem] tabular-nums">{n.toLocaleString("en-US")}</b>{" "}
          older American{n === 1 ? "" : "s"} {n === 1 ? "has" : "have"} been sent to an emergency room by a fall. One
          every 11 seconds, at the national rate.
        </p>
      )}
    </div>
  );
}
