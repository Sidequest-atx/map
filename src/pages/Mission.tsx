import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { CountUp } from "../components/CountUp";
import { Still } from "../components/Media";
import { useReports } from "../data/store";
import { fmtInt } from "../lib/format";
import { HERO, type StillId } from "../lib/media";
import { staticMapUrl, useMapboxToken } from "../lib/mapToken";

/**
 * The landing: a photo-led civic page in the institutional grammar of a
 * university homepage. A rendered hero, three ways a sidewalk fails, the
 * City's own numbers in alternating image-and-text sections, the live count,
 * and how a report becomes a proven fix. Every figure is the City's, the
 * CDC's, a journal's, or a court's; derived arithmetic is labeled where it sits.
 */

const PLAN_URL = "https://www.austintexas.gov/transportation-public-works/sidewalks-crossings-and-shared-streets-plan";
const CDC_URL = "https://www.cdc.gov/falls/data-research/facts-stats/index.html";
const AJPH_URL = "https://pubmed.ncbi.nlm.nih.gov/16735616/";
const WILLITS_URL = "https://legalaidatwork.org/willits-v-city-of-los-angeles-sidewalk-settlement-announced-2/";
const NCHS_URL = "https://www.cdc.gov/nchs/products/databriefs/db532.htm";
const NHTSA_URL = "https://www.nhtsa.gov/press-releases/nhtsa-estimates-39345-traffic-fatalities-2024";
const SBC_URL = "https://www.tandfonline.com/doi/full/10.1080/01441647.2022.2055674";
const NCOA_URL = "https://www.ncoa.org/article/get-the-facts-on-falls-prevention/";

export default function Mission() {
  const reports = useReports();
  const { token } = useMapboxToken();

  const live = useMemo(() => {
    const real = reports.filter((r) => !r.duplicateOf);
    return {
      total: real.length,
      open: real.filter((r) => r.status !== "resolved").length,
      fixed: real.filter((r) => r.status === "resolved" && r.verified).length,
    };
  }, [reports]);

  const mapUrl = useMemo(
    () => (token ? staticMapUrl(reports.filter((r) => r.status !== "resolved").slice(0, 60), 1280, 960) : null),
    [reports, token],
  );

  return (
    <>
      <Hero />

      {/* Three ways a sidewalk fails, as the camera found them. */}
      <section className="band band--deep" aria-labelledby="stories-title">
        <div className="wrap">
          <h2 id="stories-title" className="sr-only">
            The gap, panel by panel
          </h2>
          <div className="stories">
            <Story href="#missing" id="neverBuilt" title="Never built" blurb="1,500 miles of Austin street frontage have no sidewalk at all. This street is one of them." />
            <Story href="#falls" id="falls" title="Paid in falls" blurb="One in four adults over 65 falls each year. Most outdoor falls start on the ground itself." />
            <Story
              href="#broken"
              id="failing"
              lead
              title="Failing the City's own test"
              blurb="The City scored these blocks itself: red is functionally deficient. Citywide, only 32% of existing sidewalk passes, and no list names the panels in the other 68%."
            />
          </div>
        </div>
      </section>

      <section className="wrap feature" aria-labelledby="intro-title">
        <div className="feature-media">
          <Still id="conditions" captioned />
        </div>
        <div className="feature-body">
          <h2 id="intro-title">Austin knows its sidewalks by the mile. Nobody knows them by the panel.</h2>
          <p>
            This is the City's own map of one Northwest Austin neighborhood: in 2020 its assessors rated 2,580 of the 5,923 sidewalk segments
            here functionally deficient. The City can price the entire fix and still can't name the slab that breaks the next hip. SideQuest ATX
            is a volunteer-run map of the same streets, built one photographed panel at a time, and every report stays open until a second photo
            proves the repair.
          </p>
          <div className="stats">
            <Stat label="of this neighborhood's assessed segments rate functionally deficient" title="Derived from the City's sidewalk inventory clipped to the Anderson Mill / Westwood area: 2,580 deficient of 5,923 assessed (3,343 acceptable), 221 pending.">
              <CountUp value={44} suffix="%" duration={1.2} />
            </Stat>
          </div>
          <p className="sources">
            Source: <a href="https://data.austintexas.gov/d/vchz-d9ng" rel="noopener" target="_blank">City of Austin Open Data, Sidewalks (assessment of 2020)</a>, clipped to
            the Anderson Mill and Westwood area; derived share = 2,580 ÷ 5,923.
          </p>
          <Link className="more" to="/how" viewTransition>
            How a sidewalk gets fixed here
          </Link>
        </div>
      </section>

      <section className="band" aria-labelledby="math-title">
        <div className="wrap">
          <h2 id="math-title" className="statement">
            The City priced the fix. Then it did the math on the money.
          </h2>
          <p className="statement-copy">
            Building the planned network once costs about $903 million. Maintaining the 2,800 miles that already exist costs about $30 million a
            year. At today's funding, the plan's own projection finishes the network in more than 90 years. A child born in Austin today will be
            past retirement age when it's done.
          </p>
          <div className="stats">
            <Stat label="years to finish the network at today's funding">
              <CountUp value={90} suffix="+" duration={1.4} />
            </Stat>
            <Stat label="to build the planned network, once">$903M</Stat>
            <Stat label="of America's fall-injury bill covers that entire build-out" title="Derived: $80B / 365 ≈ $219M per day; $903M / $219M ≈ 4.1 days.">
              4 days
            </Stat>
          </div>
          <p className="sources">
            Sources: <a href={PLAN_URL} rel="noopener" target="_blank">City of Austin, Sidewalks, Crossings &amp; Shared Streets Plan (2023)</a> ·{" "}
            <a href={NCOA_URL} rel="noopener" target="_blank">$80B a year in older-adult fall care, NCOA / Injury Prevention (2024)</a>. The
            four-day figure is derived: $80B ÷ 365 ≈ $219M per day; $903M ÷ $219M ≈ 4.1 days.
          </p>
        </div>
      </section>

      <Feature id="missing" media="missing" title="Austin doesn't have a sidewalk network. It has 2,800 miles of fragments.">
        <p>
          Of 4,800 miles of street frontage, 2,800 have a sidewalk. The other 1,500 have nothing: about the drive from Austin to Washington, DC.
          Only about half of Austin properties can reach a school on a sidewalk, a third a transit stop, a fifth a grocery store.
        </p>
        <div className="stats">
          <Stat label="miles of street frontage with no sidewalk">
            <CountUp value={1500} suffix=" mi" duration={1.6} />
          </Stat>
          <Stat label="of properties can reach a grocery store on a sidewalk">
            <CountUp value={20} suffix="%" duration={1.2} />
          </Stat>
          <Stat label="can reach a transit stop">
            <CountUp value={35} suffix="%" duration={1.2} />
          </Stat>
        </div>
        <p className="sources">
          Source: <a href={PLAN_URL} rel="noopener" target="_blank">City of Austin, Sidewalks, Crossings &amp; Shared Streets Plan (2023)</a>
        </p>
        <Link className="more" to="/map" viewTransition>
          Open the live map
        </Link>
      </Feature>

      <Feature id="broken" media="broken" reverse title="Most of what was built is failing the City's own test.">
        <p>
          32% of the existing network rates functionally acceptable. That is an average, and averages don't send a crew anywhere: no list names
          the panels that make up the other 68%. A lifted panel is a half inch of concrete the City can price by the mile and cannot find by the
          address.
        </p>
        <div className="stats">
          <Stat label="of existing sidewalk rates functionally acceptable">
            <CountUp value={32} suffix="%" duration={1.2} />
          </Stat>
          <Stat label="of it has no panel-level record at all">
            <CountUp value={68} suffix="%" duration={1.2} />
          </Stat>
        </div>
        <p className="sources">
          Source: <a href={PLAN_URL} rel="noopener" target="_blank">City of Austin, Sidewalks, Crossings &amp; Shared Streets Plan (2023)</a>
        </p>
        <Link className="more" to="/app" viewTransition>
          Photograph the one on your street
        </Link>
      </Feature>

      <Feature id="falls" media="falls" title="The years are not free. They are paid in falls.">
        <p>
          Streets are engineered so a car never feels a half inch. Bodies got no such engineering: the same lip a tire ignores stops a bike wheel
          and catches a toe. One in four adults 65 and older falls each year, and 73% of outdoor falls are set off by the environment itself,
          "on sidewalks, curbs, and streets."
        </p>
        <div className="stats">
          <Stat label="Americans over 65 killed by falls in 2023">
            <CountUp value={41000} suffix="+" duration={1.6} />
          </Stat>
          <Stat label="Americans of every age killed in traffic that year">
            <CountUp value={40901} duration={1.6} />
          </Stat>
        </div>
        <p className="sources">
          Sources: <a href={CDC_URL} rel="noopener" target="_blank">CDC, Older Adult Falls</a> ·{" "}
          <a href={NCHS_URL} rel="noopener" target="_blank">CDC/NCHS Data Brief 532 (2023)</a> ·{" "}
          <a href={NHTSA_URL} rel="noopener" target="_blank">NHTSA (2023)</a> ·{" "}
          <a href={AJPH_URL} rel="noopener" target="_blank">Li et al., American Journal of Public Health (2006)</a> ·{" "}
          <a href={SBC_URL} rel="noopener" target="_blank">Utriainen et al., Transport Reviews (2022)</a>: 60 to 95% of cyclists treated in
          emergency rooms crashed with no car involved, and surface hazards are a leading factor.
        </p>
      </Feature>

      <Feature id="precedent" media="precedent" reverse title="Cities that don't count their sidewalks eventually get counted by a court.">
        <p>
          Los Angeles agreed to spend $1.4 billion over 30 years on sidewalk repair after residents with mobility disabilities sued under the
          Americans with Disabilities Act. It is the largest disability-access settlement in US history, and it began with people documenting
          panels the city had never listed.
        </p>
        <div className="stats">
          <Stat label="Los Angeles sidewalk settlement, Willits v. City of Los Angeles">
            <CountUp value={1.4} prefix="$" suffix="B" decimals={1} duration={1.4} />
          </Stat>
          <Stat label="years of court-supervised repair">
            <CountUp value={30} duration={1.2} />
          </Stat>
        </div>
        <p className="sources">
          Source: <a href={WILLITS_URL} rel="noopener" target="_blank">Willits v. City of Los Angeles (2015)</a>
        </p>
      </Feature>

      <section className="band band--deep" aria-labelledby="count-title">
        <div className="wrap live">
          <div>
            <h2 id="count-title" className="statement">
              The count starts at zero.
            </h2>
            <p className="statement-copy">
              Every number above is an estimate. Not one points to a panel. No agency can name the slab that breaks the next hip, so no crew gets
              sent to it. That missing dataset doesn't take a bond to build. It takes photographs, and our numbers start at zero on the map, where
              we never round up.
            </p>
            <div className="live-count" aria-live="polite">
              <Stat label="on file">
                <span className="pulse" aria-hidden />
                {fmtInt(live.total)}
              </Stat>
              <Stat label="open">{fmtInt(live.open)}</Stat>
              <Stat label="verified fixed">{fmtInt(live.fixed)}</Stat>
            </div>
            <div className="live-actions">
              <Link to="/map" className="btn btn--dark" viewTransition>
                Open the live map
              </Link>
              <Link to="/data" className="btn btn--ghost-dark" viewTransition>
                Open data
              </Link>
            </div>
          </div>
          <Link to="/map" className="still live-map" aria-label="Open the live map" viewTransition>
            {mapUrl ? <img src={mapUrl} alt="" loading="lazy" decoding="async" /> : <Still id="count" />}
          </Link>
        </div>
      </section>

      <section className="section" aria-labelledby="how-title">
        <div className="wrap">
          <h2 id="how-title" className="h2">
            How a sidewalk gets fixed here
          </h2>
          <div className="steps" style={{ marginTop: "2.5rem" }}>
            <Step n={1} title="Photograph it">
              One clear frame from the app. The GPS fix is taken at the shutter and written into the picture itself. Public right-of-way only;
              no faces, plates, or house numbers, ever.
            </Step>
            <Step n={2} title="We route it">
              Structural defects go to Austin 311 with a tracked ticket number. Vegetation gets a door-hanger for the landowner, who usually clears
              it in days.
            </Step>
            <Step n={3} title="Proof closes it">
              Nothing is marked fixed without a second photo and a named sign-off. Before and after go on the map, and the report stays public.
            </Step>
          </div>
          <div className="btn-row" style={{ marginTop: "2.5rem" }}>
            <Link to="/how" className="btn btn--primary" viewTransition>
              The whole process
            </Link>
            <Link to="/data" className="btn" viewTransition>
              What we publish
            </Link>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="promise-title">
        <div className="wrap">
          <h2 id="promise-title" className="quote">
            No one's grandmother should be injured by a sidewalk a photograph could have fixed.
          </h2>
          <p className="quote-by">
            Ours broke her finger on a root-lifted panel nobody had reported. The panel is on the map now. So is the fix.
          </p>
          <div className="live-actions">
            <Link to="/app" className="btn btn--dark" viewTransition>
              Get the app
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/* ================= building blocks ================= */

function Hero() {
  const reduced = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [posterMissing, setPosterMissing] = useState(false);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (reduced) {
      v.pause();
      setPlaying(false);
    }
  }, [reduced]);

  // Media events can fire before React attaches its listeners (a cached
  // file is "canplay" almost immediately), so also read the state directly.
  useEffect(() => {
    const v = video.current;
    if (!v || ready) return;
    const check = () => {
      if (v.readyState >= 3) setReady(true);
    };
    check();
    const id = window.setInterval(check, 250);
    const stop = window.setTimeout(() => window.clearInterval(id), 30000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [ready]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-media" aria-hidden>
        <img
          src={HERO.poster}
          alt=""
          className={posterMissing ? "is-missing" : undefined}
          fetchPriority="high"
          decoding="async"
          onError={() => setPosterMissing(true)}
        />
        <video
          ref={video}
          className={ready ? "is-ready" : undefined}
          autoPlay={!reduced}
          muted
          loop
          playsInline
          preload="metadata"
          poster={posterMissing ? undefined : HERO.poster}
          onCanPlay={() => setReady(true)}
          onPlaying={() => setReady(true)}
        >
          <source src={HERO.webm} type="video/webm" />
          <source src={HERO.mp4} type="video/mp4" />
        </video>
      </div>
      <div className="hero-scrim" aria-hidden />
      <div className="wrap hero-inner">
        <motion.h1
          id="hero-title"
          className="hero-title"
          initial={reduced ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          Nobody knows Austin's sidewalks by the panel.
        </motion.h1>
        <motion.p
          className="hero-sub"
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        >
          SideQuest ATX photographs every broken, blocked, or missing sidewalk panel in Austin, puts it on a living public map, and tracks it until
          a second photo proves the fix.
        </motion.p>
        <motion.div
          className="hero-actions"
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
        >
          <Link to="/map" className="btn btn--primary btn--lg" viewTransition>
            See the live map
          </Link>
          <Link to="/app" className="btn btn--dark btn--lg" viewTransition>
            Get the app
          </Link>
        </motion.div>
      </div>
      {ready && (
        <button type="button" className="hero-toggle" onClick={toggle} aria-label={playing ? "Pause background video" : "Play background video"}>
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          )}
        </button>
      )}
    </section>
  );
}

function Story({ href, id, title, blurb, lead = false }: { href: string; id: StillId; title: string; blurb: string; lead?: boolean }) {
  return (
    <a className={lead ? "story story--lead" : "story"} href={href}>
      <Still id={id} priority={lead} />
      <div className="story-cap">
        <h3>{title}</h3>
        <p>{blurb}</p>
      </div>
    </a>
  );
}

function Feature({ id, media, title, reverse = false, children }: { id: string; media: StillId; title: string; reverse?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={reverse ? "wrap feature feature--rev" : "wrap feature"} aria-labelledby={`${id}-title`}>
      <div className="feature-media">
        <Still id={media} />
      </div>
      <div className="feature-body">
        <h2 id={`${id}-title`}>{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Stat({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="stat" title={title}>
      <b>{children}</b>
      <span>{label}</span>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="step">
      <div className="step-n" aria-hidden>
        {n}
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
