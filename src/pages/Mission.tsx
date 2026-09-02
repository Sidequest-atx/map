import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { CountUp } from "../components/CountUp";
import { Motif } from "../components/Motif";
import { useReports } from "../data/store";
import { fmtInt } from "../lib/format";
import { staticMapUrl, useMapboxToken } from "../lib/mapbox";

/**
 * The landing is a narrated report in the Confidanz Atlas grammar: one fact
 * per viewport, sourced under the element it belongs to, and the scroll ends
 * by handing the reader the live map. Every figure here is the City's, the
 * CDC's, or a federal court's; our own count starts at zero on the map.
 */

const CHAPTERS = [
  { id: "missing", label: "Never built" },
  { id: "broken", label: "Failing" },
  { id: "math", label: "The math" },
  { id: "falls", label: "The falls" },
  { id: "precedent", label: "The precedent" },
  { id: "count", label: "The count" },
] as const;

const PLAN_URL = "https://www.austintexas.gov/transportation-public-works/sidewalks-crossings-and-shared-streets-plan";
const CDC_URL = "https://www.cdc.gov/falls/data-research/facts-stats/index.html";
const AJPH_URL = "https://pubmed.ncbi.nlm.nih.gov/16735616/";
const WILLITS_URL = "https://legalaidatwork.org/willits-v-city-of-los-angeles-sidewalk-settlement-announced-2/";

export default function Mission() {
  const reports = useReports();
  const { token: mapboxToken } = useMapboxToken();
  const reduced = useReducedMotion();

  const live = useMemo(() => {
    const real = reports.filter((r) => !r.duplicateOf);
    return {
      total: real.length,
      open: real.filter((r) => r.status !== "resolved").length,
      fixed: real.filter((r) => r.status === "resolved" && r.verified).length,
    };
  }, [reports]);

  const mapUrl = useMemo(
    () => (mapboxToken ? staticMapUrl(reports.filter((r) => r.status !== "resolved").slice(0, 60), 1280, 960) : null),
    [reports, mapboxToken],
  );

  return (
    <>
      <ChapterRail />

      {/* ---- Prologue: the question nobody can answer ---- */}
      <section
        id="prologue"
        className="has-motif relative grid min-h-[calc(100dvh-var(--topbar-h))] content-center overflow-hidden bg-olive-900 text-ink-on-dark"
      >
        <Motif kind="crack" opacity={0.14} style={{ color: "var(--olive-400)" }} />
        <div className="wrap pb-16">
          <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-ink-on-dark-soft uppercase">
            SideQuest ATX · Northwest Austin
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-[clamp(2.3rem,5.2vw,3.8rem)] leading-[1.06] font-medium tracking-[-0.02em] text-balance">
            How many of Austin's sidewalks could put someone on the ground?
          </h1>
          <Rise delay={0.6}>
            <p className="mt-6 font-serif text-[clamp(1.5rem,3vw,2.1rem)] italic">Nobody knows.</p>
          </Rise>
          <Rise delay={1.1}>
            <p className="mt-5 max-w-xl font-sans text-[0.95rem] leading-relaxed text-ink-on-dark-soft">
              The City measures its network in miles. No one counts it panel by panel. Here is what the miles already
              say, and where the counting starts.
            </p>
          </Rise>
        </div>
        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2" aria-hidden>
          <span className="font-sans text-[10px] tracking-[0.2em] text-ink-on-dark-soft uppercase">Scroll</span>
          <motion.span
            className="block h-9 w-px origin-top bg-ink-on-dark-soft/70"
            animate={reduced ? undefined : { scaleY: [0.15, 1, 0.15] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
          />
        </div>
      </section>

      {/* ---- Ch. 1: what was never built ---- */}
      <Chapter id="missing" motif={<Motif kind="panels" opacity={0.09} style={{ color: "var(--olive-800)" }} />}>
        <Claim>The first problem isn't broken sidewalk. It's sidewalk that was never built.</Claim>
        <Rise delay={0.1}>
          <p className="mt-6 font-sans text-[clamp(3.6rem,9vw,6.5rem)] leading-[1.04] font-bold tracking-tight text-olive-800 tabular-nums">
            <CountUp value={1500} suffix=" mi" duration={1.8} />
          </p>
          <p className="mt-2 font-sans text-[0.95rem] text-ink-soft">
            of Austin street frontage with no sidewalk at all. About the drive from Austin to Washington, DC.
          </p>
        </Rise>
        <Rise delay={0.2} className="mt-8 max-w-xl">
          <div className="flex items-baseline justify-between font-sans text-[13px]">
            <span className="text-ink-soft">Street frontage with a sidewalk</span>
            <span className="font-semibold text-ink tabular-nums">2,800 of 4,800 mi</span>
          </div>
          <div className="mt-2">
            <Bar pct={58} />
          </div>
        </Rise>
        <Source href={PLAN_URL}>City of Austin, Sidewalks, Crossings &amp; Shared Streets Plan (2023)</Source>
      </Chapter>

      {/* ---- Ch. 2: what exists is failing ---- */}
      <Chapter id="broken" align="end" motif={<Motif kind="roots" opacity={0.11} style={{ color: "var(--olive-800)" }} />}>
        <Claim>Most of what was built is failing the City's own test.</Claim>
        <Rise delay={0.1}>
          <p className="mt-6 font-sans text-[clamp(3.6rem,9vw,6.5rem)] leading-[1.04] font-bold tracking-tight text-olive-800 tabular-nums">
            <CountUp value={32} suffix="%" duration={1.5} />
          </p>
          <p className="mt-2.5 max-w-xl font-sans text-[0.95rem] text-ink-soft">
            of the existing network rates functionally acceptable. The rest is cracked, heaved, blocked, or out of
            slope.
          </p>
        </Rise>
        <Rise delay={0.2} className="mt-8 max-w-xl">
          <p className="font-sans text-[12px] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            Austin properties that can reach, on a sidewalk
          </p>
          <div className="mt-3 space-y-3 font-sans text-[13px]">
            {(
              [
                ["A school", 51],
                ["A transit stop", 35],
                ["A grocery store", 20],
              ] as const
            ).map(([label, pct]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between">
                  <span className="text-ink-soft">{label}</span>
                  <span className="font-semibold text-ink tabular-nums">{pct}%</span>
                </div>
                <div className="mt-1.5">
                  <Bar pct={pct} />
                </div>
              </div>
            ))}
          </div>
        </Rise>
        <Source href={PLAN_URL}>City of Austin, Sidewalks, Crossings &amp; Shared Streets Plan (2023)</Source>
      </Chapter>

      {/* ---- Ch. 3: the math ---- */}
      <Chapter id="math">
        <Claim>The City priced the fix. Then it did the math on the money.</Claim>
        <Rise delay={0.1}>
          <p className="mt-6 font-sans text-[clamp(3.6rem,9vw,6.5rem)] leading-[1.04] font-bold tracking-tight text-olive-800 tabular-nums">
            <CountUp value={90} suffix="+ years" duration={1.5} />
          </p>
          <p className="mt-2.5 max-w-xl font-sans text-[0.95rem] text-ink-soft">
            to finish the network at today's funding. That is the plan's own projection, not a critic's.
          </p>
        </Rise>
        <Rise delay={0.2} className="mt-8 max-w-xl space-y-2 font-sans text-[13px]">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-soft">Building the planned network</span>
            <span className="font-semibold text-ink tabular-nums">≈ $903M</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-soft">Just maintaining the existing 2,800 miles</span>
            <span className="font-semibold text-ink tabular-nums">≈ $30M every year</span>
          </div>
        </Rise>
        <Source href={PLAN_URL}>City of Austin, Sidewalks, Crossings &amp; Shared Streets Plan (2023)</Source>
      </Chapter>

      {/* ---- Ch. 4: the human cost ---- */}
      <Chapter id="falls" align="end" motif={<Motif kind="walker" opacity={0.13} style={{ color: "var(--olive-800)" }} />}>
        <Claim>The years are not free. They are paid in falls.</Claim>
        <Rise delay={0.1}>
          <p className="mt-6 font-sans text-[clamp(3.6rem,9vw,6.5rem)] leading-[1.04] font-bold tracking-tight text-olive-800 tabular-nums">
            1 in 4
          </p>
          <p className="mt-2.5 max-w-xl font-sans text-[0.95rem] text-ink-soft">
            adults 65 and older falls each year. Falls send about 3 million older Americans to an emergency room
            annually.
          </p>
        </Rise>
        <Rise delay={0.2} className="mt-8 max-w-xl">
          <div className="rounded-[var(--r-md)] bg-olive-600/8 px-4 py-3.5">
            <p className="font-sans text-[0.95rem] leading-relaxed text-ink">
              <b className="tabular-nums">73%</b> of outdoor falls are set off by the environment itself, and they
              happen, in the study's words, "on sidewalks, curbs, and streets."
            </p>
          </div>
        </Rise>
        <Source href={CDC_URL}>CDC, Older Adult Falls</Source>
        <Source href={AJPH_URL}>Li et al., American Journal of Public Health (2006)</Source>
      </Chapter>

      {/* ---- Ch. 5: the precedent ---- */}
      <Chapter id="precedent">
        <Claim>Cities that don't count their sidewalks eventually get counted by a court.</Claim>
        <Rise delay={0.1}>
          <p className="mt-6 font-sans text-[clamp(3.6rem,9vw,6.5rem)] leading-[1.04] font-bold tracking-tight text-olive-800 tabular-nums">
            <CountUp value={1.4} prefix="$" suffix="B" decimals={1} duration={1.5} />
          </p>
          <p className="mt-2.5 max-w-xl font-sans text-[0.95rem] text-ink-soft">
            is what Los Angeles agreed to spend on sidewalk repair over 30 years after residents with mobility
            disabilities sued under the ADA. It is the largest disability-access settlement in US history.
          </p>
        </Rise>
        <Source href={WILLITS_URL}>Willits v. City of Los Angeles (2015)</Source>
      </Chapter>

      {/* ---- Ch. 6: the turn ---- */}
      <Chapter id="count">
        <Claim>Every number above is an estimate. Not one points to a panel.</Claim>
        <Rise delay={0.1}>
          <p className="mt-5 max-w-xl font-sans text-[0.95rem] leading-relaxed text-ink-soft">
            No agency can name the slab that breaks the next hip, so no crew gets sent to it. That is the missing
            dataset, and it doesn't take a bond to build. It takes photographs.
          </p>
          <p className="mt-4 max-w-xl font-sans text-[0.95rem] leading-relaxed text-ink">
            Fixing this takes <b>policy</b> and <b>action</b>. The City's plan above is the policy. The map below is
            the action.
          </p>
        </Rise>
        <Rise delay={0.2} className="mt-7 max-w-xl space-y-2.5 font-sans text-[14px]">
          {(
            [
              ["Photograph it", "one clear frame; GPS locks at the shutter."],
              ["We route it", "structural defects to Austin 311 with a tracked ticket, vegetation to the landowner."],
              ["Proof closes it", "nothing is marked fixed without a second photo and a named sign-off."],
            ] as const
          ).map(([t, b]) => (
            <p key={t} className="leading-relaxed">
              <b className="text-ink">{t}:</b> <span className="text-ink-soft">{b}</span>
            </p>
          ))}
        </Rise>
        <Rise delay={0.3} className="mt-7 max-w-xl">
          <p className="rounded-[var(--r-md)] bg-field-2 px-3.5 py-2.5 font-sans text-[12px] leading-snug text-ink-soft">
            Everything above is the City's, the CDC's, and a federal court's. Our numbers start at zero on the map
            below, and we never round up.
          </p>
          <p className="mt-5 font-serif text-[1.05rem] leading-relaxed text-ink-soft italic">
            Our 80-year-old grandmother broke her finger on a root-lifted panel nobody had reported.
          </p>
          <div className="btn-row mt-6">
            <Link to="/app" className="btn btn--primary" viewTransition>
              Get the app
            </Link>
            <Link to="/how" className="btn" viewTransition>
              How it works
            </Link>
          </div>
        </Rise>
      </Chapter>

      {/* ---- Finale: the scroll becomes the map ---- */}
      <MapFinale mapUrl={mapUrl} live={live} />
    </>
  );
}

/* ================= building blocks ================= */

function Chapter({
  id,
  align = "start",
  motif,
  children,
}: {
  id: string;
  align?: "start" | "end";
  motif?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="has-motif grid min-h-[88vh] content-center py-16">
      {motif}
      <div className="wrap">
        <div className={`max-w-2xl lg:max-w-3xl ${align === "end" ? "lg:ml-auto" : ""}`}>{children}</div>
      </div>
    </section>
  );
}

function Claim({ children }: { children: ReactNode }) {
  return (
    <Rise>
      <h2 className="max-w-2xl font-serif text-[clamp(1.8rem,3.8vw,2.5rem)] leading-[1.08] font-medium tracking-[-0.02em] text-balance">
        {children}
      </h2>
    </Rise>
  );
}

function Rise({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 26 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

function Bar({ pct }: { pct: number }) {
  const reduced = useReducedMotion();
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-olive-600/12">
      <motion.div
        className="h-full rounded-full bg-olive-600"
        initial={reduced ? { width: `${pct}%` } : { width: "0%" }}
        whileInView={{ width: `${pct}%` }}
        viewport={{ once: true, amount: 0.9 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

function Source({ href, children }: { href: string; children: ReactNode }) {
  return (
    <p className="mt-4 font-sans text-[11.5px] text-ink-mute first-of-type:mt-6">
      Source:{" "}
      <a href={href} rel="noopener" target="_blank" className="underline decoration-line underline-offset-2 hover:text-ink-soft">
        {children}
      </a>
    </p>
  );
}

/** Right-edge dot rail, the narrated-report signature. Desktop only. */
function ChapterRail() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const ids = ["prologue", ...CHAPTERS.map((c) => c.id), "finale"];
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);
  const visible = active !== null && active !== "prologue" && active !== "finale";
  return (
    <nav
      aria-label="Story chapters"
      className={`fixed top-1/2 right-5 z-10 hidden -translate-y-1/2 flex-col items-end gap-3 transition-opacity duration-500 xl:flex ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {CHAPTERS.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => document.getElementById(c.id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" })}
          className="group flex items-center gap-2.5"
          aria-label={c.label}
          aria-current={active === c.id ? "true" : undefined}
        >
          <span className="font-sans text-[11px] text-ink-mute opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {c.label}
          </span>
          <span
            className={`rounded-full transition-all duration-300 ${
              active === c.id ? "h-5 w-1.5 bg-olive-700" : "h-1.5 w-1.5 bg-olive-600/35 group-hover:bg-olive-600/70"
            }`}
          />
        </button>
      ))}
    </nav>
  );
}

function MapFinale({ mapUrl, live }: { mapUrl: string | null; live: { total: number; open: number; fixed: number } }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const scale = useTransform(scrollYProgress, [0, 0.55], [0.86, 1]);
  const radius = useTransform(scrollYProgress, [0, 0.55], ["1.5rem", "0rem"]);
  const [engaged, setEngaged] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => setEngaged(v > 0.58));

  return (
    <section ref={ref} id="finale" className="relative h-[230vh] bg-field">
      <div className="sticky top-0 h-dvh overflow-hidden">
        <motion.div
          className="absolute inset-0 overflow-hidden bg-field-2"
          style={reduced ? undefined : { scale, borderRadius: radius }}
        >
          <Link to="/map" viewTransition className="group block h-full w-full" aria-label="Open the live map">
            {mapUrl ? (
              <img
                src={mapUrl}
                alt="Map of Northwest Austin sidewalk hazards"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center font-sans text-[13px] text-ink-mute">
                The map is loading.
              </div>
            )}
            <span className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-olive-900/55 to-transparent" aria-hidden />
          </Link>
        </motion.div>

        <motion.div
          className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-9"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={reduced ? undefined : engaged ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="pointer-events-auto max-w-md rounded-[var(--r-lg)] bg-olive-900/92 p-5 text-ink-on-dark shadow-xl sm:p-6">
            <p className="flex items-center gap-2 font-sans text-[11px] font-semibold tracking-[0.14em] text-ink-on-dark-soft uppercase">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-olive-400 opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-olive-300" />
              </span>
              Our count · live
            </p>
            <p className="mt-2.5 font-serif text-[1.55rem] leading-tight font-medium">The count starts at zero.</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-sans text-[13px] text-ink-on-dark-soft">
              <span>
                <b className="text-ink-on-dark tabular-nums">{fmtInt(live.total)}</b> on file
              </span>
              <span>
                <b className="text-ink-on-dark tabular-nums">{fmtInt(live.open)}</b> open
              </span>
              <span>
                <b className="text-ink-on-dark tabular-nums">{fmtInt(live.fixed)}</b> verified fixed
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link to="/map" className="btn btn--dark btn--sm" viewTransition>
                Open the live map →
              </Link>
              <Link to="/app" className="btn btn--ghost-dark btn--sm" viewTransition>
                Get the app
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
