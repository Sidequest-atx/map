/** DEV HARNESS ONLY — scroll rig + time chips for building the 3D walk.
    Not linked from anywhere; remove the /walkdev route before shipping.
    Scroll 0–22% scrubs the drone prologue, 22–85% the walk, 85–100% the
    finale rise. */
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useMotionValue, useScroll, useTransform } from "motion/react";
import type { TimeChoice } from "../walk/lighting";
import { walkState } from "../walk/state";
import { WALK } from "../walk/world/route";

const WalkScene = lazy(() => import("../walk/Scene"));

const TIMES: TimeChoice[] = ["auto", "morning", "day", "golden", "night"];
const P0 = 0.22; // scroll fraction where the prologue ends
const JUMPS: [string, number][] = [
  ["lake", 0.001],
  ["bridge", 0.3 * P0],
  ["canyon", 0.46 * P0],
  ["topdown", 0.7 * P0],
  ["pull", 0.86 * P0],
  ["start", P0 + 0.004],
  ["missing", P0 + 0.18 * 0.63],
  ["broken", P0 + 0.34 * 0.63],
  ["barton", P0 + 0.44 * 0.63],
  ["math", P0 + 0.5 * 0.63],
  ["falls", P0 + 0.645 * 0.63],
  ["precedent", P0 + 0.79 * 0.63],
  ["count", P0 + 0.9 * 0.63],
  ["capitol", P0 + 0.985 * 0.63],
  ["rise", 0.925],
  ["top", 0.999],
];

export default function WalkDev() {
  const { scrollYProgress } = useScroll();
  const pro = useTransform(scrollYProgress, [0, P0], [0, 1]);
  const walk = useTransform(scrollYProgress, [P0, 0.85], [0, 1]);
  const fin = useTransform(scrollYProgress, [0.85, 1], [0, 1]);
  const bias = useMotionValue(0);
  const [time, setTime] = useState<TimeChoice>("day");
  const hud = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (hud.current) {
        const p = WALK.frame(walkState.s);
        hud.current.textContent = `u=${walkState.u.toFixed(3)} s=${walkState.s.toFixed(1)} f=${(walkState.s / WALK.length).toFixed(3)} L=${WALK.length.toFixed(0)} xz=(${p.x.toFixed(0)},${p.z.toFixed(0)}) rise=${walkState.rise.toFixed(2)}`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div style={{ height: "1700vh" }}>
      <div className="fixed inset-0">
        <Suspense fallback={<div className="grid h-full place-items-center font-mono text-sm">building the world…</div>}>
          <WalkScene
            progress={walk}
            finale={fin}
            centerBias={bias}
            time={time}
            active
            prologue={pro}
            prologueMode="scrub"
            debugFleet={location.search.includes("fleet")}
            capture={location.search.includes("capture")}
          />
        </Suspense>
      </div>
      <div ref={hud} className="fixed bottom-2 left-2 z-10 rounded bg-olive-900/80 px-2 py-1 font-mono text-[11px] text-white" />
      <div className="fixed top-2 left-2 z-10 flex flex-wrap gap-1 font-mono text-[11px]">
        {TIMES.map((t) => (
          <button
            key={t}
            onClick={() => setTime(t)}
            className={`rounded border border-line px-2 py-0.5 ${time === t ? "bg-olive-700 text-white" : "bg-surface"}`}
          >
            {t}
          </button>
        ))}
        {JUMPS.map(([name, p]) => (
          <button
            key={name}
            onClick={() => window.scrollTo({ top: p * (document.documentElement.scrollHeight - innerHeight) })}
            className="rounded border border-line bg-surface px-2 py-0.5"
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
