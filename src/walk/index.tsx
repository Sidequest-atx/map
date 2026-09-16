/**
 * The walk, packaged for the landing page. Lazy-loads the WebGL scene behind
 * a poster frame, sits out entirely under reduced motion or WebGL failure,
 * pauses when off-story, and carries the little time-of-day override chip.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useAnimationFrame, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import type { TimeChoice } from "./lighting";
import type { PrologueMode } from "./camera";

const WalkScene = lazy(() => import("./Scene"));

const TIME_CYCLE: TimeChoice[] = ["auto", "morning", "day", "golden", "night"];
const TIME_ICON: Record<TimeChoice, string> = { auto: "◐", morning: "☀", day: "☀", golden: "☀", night: "☾" };

function Poster() {
  const [ok, setOk] = useState(true);
  if (!ok) return <div className="h-full w-full bg-field-2" aria-hidden />;
  return <img src="/walk-poster.webp" alt="" aria-hidden fetchPriority="high" className="h-full w-full object-cover" onError={() => setOk(false)} />;
}

function webglOk() {
  try {
    if (typeof location !== "undefined" && location.search.includes("force3d")) return true;
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    // Software rasterizers (VMs, remote desktops) render this at slideshow
    // speed — those readers get the poster, not a janky world.
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || "");
    if (/basic render|swiftshader|llvmpipe|software/i.test(r)) return false;
    return true;
  } catch {
    return false;
  }
}

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };

export function WalkExperience({
  walk,
  finaleScroll,
  layout,
  prologue,
  prologueMode,
}: {
  walk: MotionValue<number>;
  finaleScroll: MotionValue<number>;
  layout: "fixed" | "strip";
  /** drone-prologue progress; presence turns the flyover on */
  prologue?: MotionValue<number>;
  prologueMode?: PrologueMode;
}) {
  const reduced = useReducedMotion();
  const gl = useMemo(webglOk, []);
  const [time, setTime] = useState<TimeChoice>("auto");
  const [poor, setPoor] = useState(false);
  const [ready, setReady] = useState(false);

  // The finale's first half rises the camera to the top-down map framing.
  const rise = useTransform(finaleScroll, [0.06, 0.5], [0, 1]);
  // Keep the subject centered in the left (text-free) region on desktop,
  // easing back to true center as the finale takes over.
  const bias = useTransform(finaleScroll, [0, 0.35], [layout === "fixed" ? 0.185 : 0, 0]);

  // Run the frameloop only while the story or transition is on screen.
  // With the drone prologue the world is alive from the first frame.
  const [active, setActive] = useState(!!prologue);
  useMotionValueEvent(walk, "change", (v) => {
    setActive((!!prologue || v > 0.0005) && finaleScroll.get() < 0.995);
  });
  useMotionValueEvent(finaleScroll, "change", (v) => {
    setActive((!!prologue || walk.get() > 0.0005) && v < 0.995);
  });
  const chipRef = useRef<HTMLButtonElement>(null);
  useAnimationFrame(() => {
    const el = chipRef.current;
    if (!el) return;
    const v = finaleScroll.get();
    const o = v <= 0.3 ? 1 : v >= 0.5 ? 0 : 1 - (v - 0.3) / 0.2;
    el.style.opacity = o.toFixed(3);
    el.style.pointerEvents = o < 0.05 ? "none" : "auto";
  });

  // Building the world is the heaviest work on the page. The poster (which
  // looks like the opening frame) paints first; the scene starts once the
  // browser is idle after load, or as soon as the reader scrolls, taps or
  // types, so early taps on the header never wait behind the build. Without
  // the prologue it waits for the reader to start moving, as before.
  const [engaged, setEngaged] = useState(false);
  useEffect(() => {
    if (engaged) return;
    const go = () => setEngaged(true);
    const onScroll = () => {
      if (scrollY > 120 || walk.get() > 0) go();
    };
    const w = window as IdleWindow;
    let idleId: number | undefined;
    let timer: number | undefined;
    const schedule = () => {
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(go, { timeout: 2500 });
      else timer = window.setTimeout(go, 1500);
    };
    const inputs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    if (prologue) {
      if (document.readyState === "complete") schedule();
      else addEventListener("load", schedule, { once: true });
      for (const t of inputs) addEventListener(t, go, { once: true, passive: true });
    }
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("load", schedule);
      for (const t of inputs) removeEventListener(t, go);
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [engaged, walk, prologue]);

  if (reduced || !gl || poor) {
    return <Poster />;
  }

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0" aria-hidden>
        <Poster />
      </div>
      {engaged && (
        <Suspense fallback={null}>
          {/* The poster holds until every system is built and compiled, so the
              world never visibly assembles itself piece by piece. */}
          <div className={`absolute inset-0 transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`} aria-hidden>
            <WalkScene
              progress={walk}
              finale={rise}
              centerBias={bias}
              time={time}
              active={active}
              reduced={false}
              prologue={prologue}
              prologueMode={prologueMode}
              capture={typeof location !== "undefined" && location.search.includes("posterbuf")}
              onPoor={() => setPoor(true)}
              onReady={() => setReady(true)}
            />
          </div>
        </Suspense>
      )}
      {/* time-of-day override, for showing the street at night at noon */}
      <button
        ref={chipRef}
        type="button"
        onClick={() => setTime((t) => TIME_CYCLE[(TIME_CYCLE.indexOf(t) + 1) % TIME_CYCLE.length])}
        className="pointer-events-auto absolute bottom-3 left-4 flex min-h-6 items-center gap-1.5 rounded-full border border-line bg-surface/85 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase shadow-sm backdrop-blur-sm hover:text-ink"
      >
        <span className="sr-only">Time of day: </span>
        <span aria-hidden>{TIME_ICON[time]}</span>
        {time}
      </button>
      <p className="pointer-events-none absolute bottom-3 right-4 hidden font-mono text-[10px] tracking-[0.16em] text-ink-mute uppercase lg:block" aria-hidden>
        One sidewalk · you are the ring
      </p>
    </div>
  );
}
