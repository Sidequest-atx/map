import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CountUp } from "../components/CountUp";
import { Motif } from "../components/Motif";
import { Marquee } from "../components/ui/marquee";
import { NEIGHBORHOODS } from "../data/places";
import { useReports } from "../data/store";
import { fmtInt } from "../lib/format";
import { staticMapUrl, useMapboxToken } from "../lib/mapbox";

/**
 * The landing page in the Atlas grammar: a narrative rail of numbers on the
 * left, the map as evidence on the right. The magnitude is the City's own;
 * our live counts sit underneath and never round up.
 */
export default function Mission() {
  const reports = useReports();
  const { token: mapboxToken } = useMapboxToken();

  const live = useMemo(() => {
    const real = reports.filter((r) => !r.duplicateOf);
    return {
      total: real.length,
      open: real.filter((r) => r.status !== "resolved").length,
      fixed: real.filter((r) => r.status === "resolved" && r.verified).length,
    };
  }, [reports]);

  const mapUrl = useMemo(
    () => (mapboxToken ? staticMapUrl(reports.filter((r) => r.status !== "resolved").slice(0, 60), 1280, 1280) : null),
    [reports, mapboxToken],
  );

  return (
    <>
      {/* ---- Split screen: rail of numbers + map as evidence ---- */}
      <section className="flex min-h-[calc(100dvh-var(--topbar-h))] flex-col lg:flex-row">
        <div className="shrink-0 border-b border-line bg-surface p-6 sm:p-8 lg:w-[27rem] lg:overflow-y-auto lg:border-r lg:border-b-0 xl:w-[30rem]">
          <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
            SideQuest ATX · Northwest Austin
          </p>

          <h1 className="mt-3 font-serif text-[2.5rem] leading-[1.04] font-medium tracking-[-0.02em] xl:text-[2.8rem]">
            Miles you can't walk.
          </h1>

          <p className="mt-4 font-sans text-[0.95rem] leading-relaxed text-ink-soft">
            Austin knows its sidewalks are broken. Nobody counts them panel by panel, so nothing gets fixed. We photograph
            every hazard, put it on a public map, and track it until a second photo proves the repair.
          </p>

          <div
            className="mt-6 rounded-[var(--r-md)] bg-olive-600/8 px-4 py-3"
            title="City of Austin Sidewalk Program: absent sidewalk in the pedestrian network."
          >
            <div className="font-sans text-[2.6rem] leading-none font-bold tracking-tight text-olive-800 tabular-nums">
              <CountUp value={1500} suffix=" mi" />
            </div>
            <div className="mt-1.5 font-sans text-[12px] text-ink-soft">of missing sidewalk in Austin</div>
          </div>

          <dl className="mt-5 space-y-2 font-sans text-[13px]">
            <div
              className="flex items-baseline justify-between gap-4"
              title="City of Austin Sidewalk Program estimate for completing and repairing the network."
            >
              <dt className="text-ink-soft">Repair and construction backlog</dt>
              <dd className="font-semibold text-ink tabular-nums">≈ $1B</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4" title="At current funding levels, by the City's own math.">
              <dt className="text-ink-soft">Completion at today's funding</dt>
              <dd className="font-semibold text-ink tabular-nums">~a century</dd>
            </div>
            <div
              className="flex items-baseline justify-between gap-4"
              title="Miles rated deficient only because of vegetation. Clearing it is the adjacent landowner's job: no bond, no wait."
            >
              <dt className="text-ink-soft">Deficient from vegetation alone</dt>
              <dd className="font-semibold text-ink tabular-nums">214 mi</dd>
            </div>
            <div
              className="flex items-baseline justify-between gap-4"
              title="CDC: about 1 in 4 adults 65+ falls each year; falls are the leading cause of injury death in that age group."
            >
              <dt className="text-ink-soft">Adults 65+ who fall each year</dt>
              <dd className="font-semibold text-ink tabular-nums">1 in 4</dd>
            </div>
          </dl>

          <p className="mt-4 rounded-[var(--r-md)] bg-field-2 px-3.5 py-2.5 font-sans text-[12px] leading-snug text-ink-soft">
            Those are the City's and the CDC's numbers, not ours. Ours start at zero below, and we never round up.
          </p>

          <p className="mt-5 text-[0.95rem] leading-relaxed text-ink-soft italic">
            Our 80-year-old grandmother broke her finger on a root-lifted panel nobody had reported.
          </p>

          <div className="btn-row mt-6">
            <Link to="/map" className="btn btn--primary" viewTransition>
              See the live map
            </Link>
            <Link to="/app" className="btn" viewTransition>
              Get the app
            </Link>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <p className="flex items-center gap-2 font-sans text-[11px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-olive-500 opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-olive-600" />
              </span>
              Our count · live
            </p>
            <div className="mt-2 flex gap-6 font-sans text-[13px]">
              <span>
                <b className="text-ink tabular-nums">{fmtInt(live.total)}</b> <span className="text-ink-mute">on file</span>
              </span>
              <span>
                <b className="text-ink tabular-nums">{fmtInt(live.open)}</b> <span className="text-ink-mute">open</span>
              </span>
              <span>
                <b className="text-ink tabular-nums">{fmtInt(live.fixed)}</b> <span className="text-ink-mute">verified fixed</span>
              </span>
            </div>
          </div>
        </div>

        <Link to="/map" viewTransition className="group relative block min-h-[42vh] flex-1 bg-field-2" aria-label="Open the live map">
          {mapUrl ? (
            <img src={mapUrl} alt="Map of Northwest Austin sidewalk hazards" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center font-sans text-[13px] text-ink-mute">The map is loading.</div>
          )}
          <span className="absolute right-4 bottom-4 inline-flex items-center gap-2 rounded-full bg-olive-800 px-4 py-2 font-sans text-[13px] font-semibold text-ink-on-dark shadow-lg transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none">
            Open the live map →
          </span>
        </Link>
      </section>

      {/* ---- Neighborhood marquee ---- */}
      <div className="border-y border-line bg-surface py-2.5" aria-hidden>
        <Marquee speed="slow" pauseOnHover className="[--gap:2.5rem]">
          {NEIGHBORHOODS.map((n) => (
            <span key={n} className="flex items-center gap-10 font-sans text-[12px] tracking-[0.08em] whitespace-nowrap text-ink-mute uppercase">
              {n}
              <i className="size-1 rounded-full bg-olive-400" />
            </span>
          ))}
        </Marquee>
      </div>

      {/* ---- How it works, in one breath ---- */}
      <section className="section--tight">
        <div className="wrap">
          <div className="grid gap-6 font-sans sm:grid-cols-3">
            {[
              ["Photograph it", "One clear frame from the app. GPS locks at the shutter, written into the photo itself."],
              ["We route it", "Structural defects go to Austin 311 with a tracked ticket. Vegetation goes to the landowner."],
              ["Proof closes it", "Nothing is marked fixed without a second photo and a named sign-off."],
            ].map(([t, b], i) => (
              <div key={t} className="rounded-[var(--r-lg)] border border-line bg-surface p-5">
                <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-olive-600 uppercase">Step {i + 1}</p>
                <h2 className="mt-2 font-serif text-[1.25rem] font-medium">{t}</h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{b}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 font-sans text-[13px] text-ink-soft">
            <Link to="/how" viewTransition>
              The full operating model
            </Link>{" "}
            ·{" "}
            <Link to="/data" viewTransition>
              Every number, downloadable
            </Link>
          </p>
        </div>
      </section>

      {/* ---- The promise ---- */}
      <section className="section section--band promise-band has-motif">
        <Motif kind="lip" opacity={0.14} style={{ color: "var(--olive-800)" }} />
        <div className="wrap stack stack--lg">
          <p>No one's grandmother should be injured by a sidewalk a photograph could have fixed.</p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <Link to="/app" className="btn btn--primary btn--lg" viewTransition>
              Get the app
            </Link>
            <Link to="/map" className="btn btn--lg" viewTransition>
              See the live map
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
