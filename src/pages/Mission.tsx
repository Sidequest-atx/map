import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { CountUp } from "../components/CountUp";
import DiveMap from "../components/DiveMap";
import { FallTicker } from "../components/FallTicker";
import { Motif } from "../components/Motif";
import { SidewalkSpine } from "../components/SidewalkSpine";
import { useReports } from "../data/store";
import { fmtInt } from "../lib/format";
import { staticMapUrl, useMapboxToken } from "../lib/mapbox";

/**
 * The landing is a narrated report: one researched fact per viewport on the
 * left, and one continuous engineering drawing of a sidewalk on the right
 * that degrades in lockstep with the story. The scroll ends by diving the
 * camera into the live map. Every figure is the City's, the CDC's, a
 * journal's, or a court's; derived arithmetic is labeled where it sits.
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
const NCHS_URL = "https://www.cdc.gov/nchs/products/databriefs/db532.htm";
const NHTSA_URL = "https://www.nhtsa.gov/press-releases/nhtsa-estimates-39345-traffic-fatalities-2024";
const SBC_URL = "https://www.tandfonline.com/doi/full/10.1080/01441647.2022.2055674";
const NCOA_URL = "https://www.ncoa.org/article/get-the-facts-on-falls-prevention/";

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return active;
}

export default function Mission() {
  const reports = useReports();
  const { token: mapboxToken } = useMapboxToken();
  const reduced = useReducedMotion();

  const active = useActiveSection(["prologue", ...CHAPTERS.map((c) => c.id), "finale"]);
  const chapterIndex = CHAPTERS.findIndex((c) => c.id === active);
  const stage = active === "finale" ? 5 : Math.max(chapterIndex, 0);

  // Mount the live dive map a beat before the reader reaches it.
  const [mapArmed, setMapArmed] = useState(false);
  useEffect(() => {
    if (!mapArmed && (chapterIndex >= 2 || active === "finale")) setMapArmed(true);
  }, [chapterIndex, active, mapArmed]);

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
      <ChapterRail active={active} reduced={reduced} />

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

      {/* ---- The story: text left, the degrading sidewalk right ---- */}
      <div className="wrap lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,33rem)] lg:gap-14">
        <div>
          <Chapter id="missing">
            <Claim>The first problem isn't broken sidewalk. It's sidewalk that was never built.</Claim>
            <Rise delay={0.1}>
              <p className="mt-6 font-sans text-[clamp(3.4rem,8vw,6rem)] leading-[1.04] font-bold tracking-tight text-olive-800 tabular-nums">
                <CountUp value={1500} suffix=" mi" duration={1.8} />
              </p>
              <p className="mt-2.5 max-w-xl font-sans text-[0.95rem] text-ink-soft">
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
            <SidewalkSpine stage={0} className="mt-8 w-full max-w-md lg:hidden" />
            <Source href={PLAN_URL}>City of Austin, Sidewalks, Crossings &amp; Shared Streets Plan (2023)</Source>
          </Chapter>

          <Chapter id="broken">
            <Claim>Most of what was built is failing the City's own test.</Claim>
            <Rise delay={0.1}>
              <p className="mt-6 font-sans text-[clamp(3.4rem,8vw,6rem)] leading-[1.04] font-bold tracking-tight text-olive-800 tabular-nums">
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
            <SidewalkSpine stage={1} className="mt-8 w-full max-w-md lg:hidden" />
            <Source href={PLAN_URL}>City of Austin, Sidewalks, Crossings &amp; Shared Streets Plan (2023)</Source>
          </Chapter>

          <Chapter id="math">
            <Claim>The City priced the fix. Then it did the math on the money.</Claim>
            <Rise delay={0.1}>
              <p className="mt-6 font-sans text-[clamp(3.4rem,8vw,6rem)] leading-[1.04] font-bold tracking-tight text-olive-800 tabular-nums">
                <CountUp value={90} suffix="+ years" duration={1.5} />
              </p>
              <p
                className="mt-2.5 max-w-xl font-sans text-[0.95rem] text-ink-soft"
                title="Derived from the plan's own 90+ year projection: born 2026, finished after 2116."
              >
                to finish the network at today's funding, by the plan's own projection. A child born in Austin today
                will be past retirement age when it's done.
              </p>
            </Rise>
            <Rise delay={0.2} className="mt-8 max-w-xl space-y-2 font-sans text-[13px]">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-ink-soft">Building the planned network, once</span>
                <span className="font-semibold text-ink tabular-nums">≈ $903M</span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-ink-soft">Just maintaining the existing 2,800 miles</span>
                <span className="font-semibold text-ink tabular-nums">≈ $30M every year</span>
              </div>
              <div
                className="flex items-baseline justify-between gap-4"
                title="Derived: $80B ÷ 365 ≈ $219M/day; $903M ÷ $219M ≈ 4.1 days."
              >
                <span className="text-ink-soft">What the US spends on fall injuries, every 4 days</span>
                <span className="font-semibold text-ink tabular-nums">≈ $903M</span>
              </div>
            </Rise>
            <Rise delay={0.25} className="mt-4 max-w-xl">
              <p className="font-sans text-[0.95rem] leading-relaxed text-ink">
                Read that last row again: America's fall-injury bill covers Austin's entire sidewalk build-out{" "}
                <b>every four days</b>.
              </p>
            </Rise>
            <Source href={PLAN_URL}>City of Austin, Sidewalks, Crossings &amp; Shared Streets Plan (2023)</Source>
            <Source href={NCOA_URL}>$80B/yr in older-adult fall care: NCOA / Injury Prevention (2024)</Source>
          </Chapter>

          <Chapter id="falls">
            <Claim>The years are not free. They are paid in falls.</Claim>
            <Rise delay={0.1}>
              <p className="mt-5 max-w-xl font-sans text-[0.95rem] leading-relaxed text-ink-soft">
                Streets are engineered so a car never feels a half inch. Bodies got no such engineering: the same lip a
                tire ignores stops a bike wheel and catches a toe.
              </p>
            </Rise>
            <Rise delay={0.15}>
              <p className="mt-6 font-sans text-[clamp(3.4rem,8vw,6rem)] leading-[1.04] font-bold tracking-tight text-olive-800 tabular-nums">
                1 in 4
              </p>
              <p className="mt-2.5 max-w-xl font-sans text-[0.95rem] text-ink-soft">
                adults 65 and older falls each year.
              </p>
            </Rise>
            <Rise delay={0.2} className="mt-6 max-w-xl">
              <FallTicker />
            </Rise>
            <Rise delay={0.25} className="mt-4 max-w-xl">
              <p className="font-sans text-[0.95rem] leading-relaxed text-ink">
                In 2023, falls killed <b className="tabular-nums">41,000+</b> Americans over 65 — more than car crashes
                killed Americans <i>of every age</i> (<span className="tabular-nums">40,901</span>).
              </p>
            </Rise>
            <Rise delay={0.3} className="mt-4 max-w-xl">
              <div className="rounded-[var(--r-md)] bg-olive-600/8 px-4 py-3.5">
                <p className="font-sans text-[0.95rem] leading-relaxed text-ink">
                  <b className="tabular-nums">73%</b> of outdoor falls are set off by the environment itself — "on
                  sidewalks, curbs, and streets."
                </p>
              </div>
              <p className="mt-3 font-sans text-[13px] leading-relaxed text-ink-soft">
                Cyclists too: in study after study, 60–95% of riders treated in emergency rooms crashed with no car
                involved, and surface hazards are a leading factor.
              </p>
            </Rise>
            <SidewalkSpine stage={3} className="mt-8 w-full max-w-md lg:hidden" />
            <Source href={CDC_URL}>CDC, Older Adult Falls</Source>
            <Source href={NCHS_URL}>Fall deaths: CDC/NCHS Data Brief 532 (2023)</Source>
            <Source href={NHTSA_URL}>Traffic deaths: NHTSA (2023)</Source>
            <Source href={AJPH_URL}>Li et al., American Journal of Public Health (2006)</Source>
            <Source href={SBC_URL}>Utriainen et al., Transport Reviews (2022)</Source>
          </Chapter>

          <Chapter id="precedent">
            <Claim>Cities that don't count their sidewalks eventually get counted by a court.</Claim>
            <Rise delay={0.1}>
              <p className="mt-6 font-sans text-[clamp(3.4rem,8vw,6rem)] leading-[1.04] font-bold tracking-tight text-olive-800 tabular-nums">
                <CountUp value={1.4} prefix="$" suffix="B" decimals={1} duration={1.5} />
              </p>
              <p className="mt-2.5 max-w-xl font-sans text-[0.95rem] text-ink-soft">
                is what Los Angeles agreed to spend on sidewalk repair over 30 years after residents with mobility
                disabilities sued under the ADA. The largest disability-access settlement in US history.
              </p>
            </Rise>
            <Source href={WILLITS_URL}>Willits v. City of Los Angeles (2015)</Source>
          </Chapter>

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
                Everything above is the City's, the CDC's, the journals', and a federal court's. Our numbers start at
                zero on the map below, and we never round up.
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
        </div>

        {/* the sidewalk, degrading beside the story */}
        <div className="hidden lg:block">
          <div className="sticky top-[var(--topbar-h)] flex h-[calc(100dvh-var(--topbar-h))] items-center">
            <SidewalkSpine stage={stage} className="w-full" />
          </div>
        </div>
      </div>

      {/* ---- Finale: the scroll dives into the map ---- */}
      <MapFinale armed={mapArmed} live={live} mapUrl={mapUrl} />
    </>
  );
}

/* ================= building blocks ================= */

function Chapter({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} className="grid min-h-[88vh] content-center py-16">
      <div className="max-w-2xl">{children}</div>
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
    <p className="mt-1.5 font-sans text-[11.5px] text-ink-mute first-of-type:mt-6">
      Source:{" "}
      <a href={href} rel="noopener" target="_blank" className="underline decoration-line underline-offset-2 hover:text-ink-soft">
        {children}
      </a>
    </p>
  );
}

/** Right-edge dot rail, the narrated-report signature. Desktop only. */
function ChapterRail({ active, reduced }: { active: string | null; reduced: boolean | null }) {
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

function MapFinale({
  armed,
  live,
  mapUrl,
}: {
  armed: boolean;
  live: { total: number; open: number; fixed: number };
  mapUrl: string | null;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const [engaged, setEngaged] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => setEngaged(v > 0.72));
  const [failed, setFailed] = useState(false);
  const { token } = useMapboxToken();
  const liveMap = armed && Boolean(token) && !failed;

  return (
    <section ref={ref} id="finale" className="relative h-[300vh] bg-field">
      <div className="sticky top-0 h-dvh overflow-hidden bg-field-2">
        {liveMap ? (
          <DiveMap progress={scrollYProgress} onFail={() => setFailed(true)} />
        ) : mapUrl ? (
          <img src={mapUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center font-sans text-[13px] text-ink-mute">
            The map is loading.
          </div>
        )}

        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-olive-900/55 to-transparent" aria-hidden />
        <Link
          to="/map"
          viewTransition
          aria-label="Open the live map"
          className={engaged ? "absolute inset-0" : "hidden"}
        />

        <motion.div
          className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-9"
          initial={false}
          animate={engaged ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
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
