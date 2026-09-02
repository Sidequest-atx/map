import { useMemo } from "react";
import { Link } from "react-router-dom";
import { DemoBadge } from "../components/Bits";
import { Car, Check, Dedup, Rank, Scan, Verify } from "../components/Icons";
import { Motif } from "../components/Motif";
import { useReports } from "../data/store";
import { fmtInt } from "../lib/format";
import { staticMapUrl } from "../lib/mapbox";

const AUSTIN_SIDEWALKS = "https://www.austintexas.gov/department/sidewalks";
const CDC_FALLS = "https://www.cdc.gov/falls/data-research/";

export default function Mission() {
  const reports = useReports();
  const stats = useMemo(() => {
    const open = reports.filter((r) => r.status !== "resolved" && !r.duplicateOf);
    const resolved = reports.filter((r) => r.status === "resolved");
    const verified = resolved.filter((r) => r.verified);
    const veg = resolved.filter((r) => r.type === "vegetation");
    const tickets = reports.filter((r) => r.ticket311);
    return { total: reports.length, open: open.length, verified: verified.length, veg: veg.length, tickets: tickets.length };
  }, [reports]);
  const mapUrl = useMemo(() => staticMapUrl(reports.filter((r) => r.status !== "resolved")), [reports]);

  return (
    <>
      <section className="hero has-motif">
        <Motif kind="crack" opacity={0.14} />
        <Motif kind="panels" opacity={0.09} />
        <div className="wrap">
          <div className="reveal">
            <h1 className="display">
              Every broken sidewalk in Austin, <em>photographed</em>, mapped, and followed until it is fixed.
            </h1>
            <p className="lede">
              SideQuest ATX is a student-run civic project. Neighbors photograph cracks, root heaves, blocked walks and missing ramps; computer vision
              sorts them; the map becomes the city's repair queue; and nothing is marked done until a second photo proves it.
            </p>
            <div className="hero-actions btn-row">
              <Link to="/map" className="btn btn--dark btn--lg" viewTransition>
                See the live map
              </Link>
              <Link to="/app" className="btn btn--ghost-dark btn--lg" viewTransition>
                Get the app
              </Link>
            </div>
          </div>
          <aside className="hero-aside reveal">
            <div className="hero-live">
              <div className="hero-live-head">
                <span className="live">
                  <i aria-hidden /> Live from the map
                </span>
                <DemoBadge />
              </div>
              <dl>
                <div>
                  <dt>Hazards on file</dt>
                  <dd>{fmtInt(stats.total)}</dd>
                </div>
                <div>
                  <dt>Still open</dt>
                  <dd>{fmtInt(stats.open)}</dd>
                </div>
                <div>
                  <dt>Verified fixed</dt>
                  <dd>{fmtInt(stats.verified)}</dd>
                </div>
              </dl>
              <p className="hero-live-foot">
                {stats.veg} vegetation blockages cleared by neighbors at no public cost · {stats.tickets} Austin 311 tickets tracked ·{" "}
                <Link to="/data" viewTransition>
                  all numbers
                </Link>
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="story">
            <h2 className="h2">Why a sidewalk.</h2>
            <blockquote>
              Our grandmother is eighty. On a walk she has taken for years, a live-oak root had lifted a panel by a few inches. She caught her foot,
              fell, and broke her finger. She was in pain for months.
            </blockquote>
            <cite>Nobody had reported the panel. Nobody was counting.</cite>
          </div>
          <div className="prose stack">
            <p>
              Her fall was ordinary, and that is the point. Falls are the leading cause of injury death for Americans over 65, and about one in four
              older adults falls each year. A large share of outdoor falls happen exactly like hers: a foot catching on uneven concrete.
            </p>
            <p>
              Austin knows the scale of the problem. The city's own Sidewalk Program counts roughly 1,500 miles of missing sidewalk and a backlog
              near a billion dollars; at current funding it has said completion would take almost a century. But 214 of the miles it rates as
              deficient are deficient only because of vegetation, and clearing a hedge is the adjacent landowner's job. No bond. No wait.
            </p>
            <p>
              That is the opening. A student cannot pour concrete, but a student with a phone can find the panel, document it, put it in front of
              the right person, and refuse to let it disappear into a closed ticket.
            </p>
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="figures" role="list">
          <div className="figure" role="listitem">
            <b>1,500 mi</b>
            <span>of sidewalk missing from Austin's network, per the City's Sidewalk Program.</span>
            <a href={AUSTIN_SIDEWALKS} rel="noopener">
              Source: City of Austin
            </a>
          </div>
          <div className="figure" role="listitem">
            <b>214 mi</b>
            <span>rated deficient only because of vegetation. Fixable by landowners with loppers, today.</span>
            <a href={AUSTIN_SIDEWALKS} rel="noopener">
              Source: City of Austin condition assessment
            </a>
          </div>
          <div className="figure" role="listitem">
            <b>1 in 4</b>
            <span>adults 65+ falls each year. Falls are the leading cause of injury death in that group.</span>
            <a href={CDC_FALLS} rel="noopener">
              Source: CDC
            </a>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="wrap stack stack--lg">
          <div className="split">
            <h2 className="h2">How we get to a city-scale fix, in four layers.</h2>
            <p className="lede">
              Impact here is not a press release. It is a transaction log: photos in, repairs out, with the cycle time published by neighborhood.
            </p>
          </div>
          <ol className="layers">
            <li className="layer">
              <h3>
                The free win
                <small>Year one · Northwest Austin</small>
              </h3>
              <p>
                Vegetation blockages need no budget. A photo, a door-hanger on the homeowner's door, sometimes a Saturday with loppers, and a
                before-and-after pair. We measure the share of our mapped walks that are clear.
              </p>
              <div className="target">
                <b>Counts when:</b> a verified after-photo closes the report without a city ticket.
              </div>
            </li>
            <li className="layer">
              <h3>
                The ticket machine
                <small>Years one to two</small>
              </h3>
              <p>
                Every structural defect gets a tracked life: open, sent to Austin 311, scheduled, resolved. The portal is the operations log; the
                CSV is the evidence pack. We publish time-to-fix, not awareness.
              </p>
              <div className="target">
                <b>Counts when:</b> hundreds, then thousands, of reports reach verified closure.
              </div>
            </li>
            <li className="layer">
              <h3>
                The city-scale dataset
                <small>Years two to four</small>
              </h3>
              <p>
                Anyone can report from a phone; the website is the living map; dedup and vision keep it clean; Quest Drives cover the arterial
                miles a walking club never will. The goal is close to every sidewalk imperfection in Austin by 2031.
              </p>
              <div className="target">
                <b>Counts when:</b> miles audited against the city's network, and a GeoJSON the Sidewalk Program can ingest.
              </div>
            </li>
            <li className="layer">
              <h3>
                Advocacy with receipts
                <small>Years two to five</small>
              </h3>
              <p>
                Policy is the output of the map, not the product. Vegetation handled as compliance plus volunteers instead of capital. Our ranked
                list fed into the city's prioritization. An annual State of the Sidewalk. Then, with the map in hand, council and the Capitol.
              </p>
              <div className="target">
                <b>Counts when:</b> a city process changes because the data made inaction embarrassing.
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section--band has-motif">
        <Motif kind="branch" opacity={0.1} style={{ color: "var(--olive-800)" }} />
        <div className="wrap stack stack--lg">
          <div className="split">
            <h2 className="h2">Why this needs computer vision, not a chatbot.</h2>
            <p className="lede">
              A chatbot can label one photo. It cannot hold the live inventory of a city, stop the same panel from being filed forty times, track a
              ticket for eight months, or rank forty thousand defects against a budget. The map is the product. Vision is the engine that makes it
              complete.
            </p>
          </div>
          <div className="pipeline">
            <ol className="pipeline-steps">
              <li>
                <Scan />
                <h3>Classify</h3>
                <p>From the photo: crack, root heave, vegetation, missing ramp, missing segment, debris. Plus a severity estimate.</p>
                <span className="now">
                  <b>Now:</b> on-device heuristic model, suggestion only. <b>Next:</b> fine-tuned sidewalk model behind the same interface.
                </span>
              </li>
              <li>
                <Dedup />
                <h3>Deduplicate</h3>
                <p>Distance plus type, then visual similarity. The reporter confirms: add to the existing report, or it is a new one.</p>
                <span className="now">
                  <b>Now:</b> 15 m geometric match within a batch and against the map.
                </span>
              </li>
              <li>
                <Rank />
                <h3>Rank</h3>
                <p>
                  Trip risk, who walks there (schools, transit, senior housing), and how long it has waited. Every factor shown, every score
                  contestable.
                </p>
                <span className="now">
                  <b>Now:</b> transparent 0–100 priority used in the portal and the open data.
                </span>
              </li>
              <li>
                <Verify />
                <h3>Verify</h3>
                <p>
                  A "closed" ticket is not a fixed sidewalk. Resolution requires an after-photo, and the model checks that the hazard is gone before a
                  moderator signs off.
                </p>
                <span className="now">
                  <b>Now:</b> after-photo mandatory; model flags doubtful close-outs.
                </span>
              </li>
            </ol>
            <p className="muted small">
              The model is versioned on every report. As vision models improve through 2031, the same dataset gets re-scored; the human confirmation
              never goes away.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap split split--rev">
          <div className="stack">
            <h2 className="h2">The map is live. It is also public.</h2>
            <p className="prose">
              Every report is visible the moment it is submitted, with its photo, its status, and its 311 ticket number. Filter by hazard, severity,
              status, or neighborhood; share a link with your council member; download everything as CSV or GeoJSON.
            </p>
            <div className="btn-row">
              <Link to="/map" className="btn btn--primary" viewTransition>
                Open the map
              </Link>
              <Link to="/data" className="btn" viewTransition>
                Download the data
              </Link>
            </div>
          </div>
          <Link to="/map" className="minimap" aria-label="Open the live map" viewTransition>
            {mapUrl ? (
              <img src={mapUrl} alt="Northwest Austin with current open hazards pinned" loading="lazy" />
            ) : (
              <div className="minimap-empty">Map preview needs a Mapbox token. The live map route explains how.</div>
            )}
            <span className="minimap-label">
              <i className="sev-dot sev-dot--severe" /> severe <i className="sev-dot sev-dot--moderate" /> moderate{" "}
              <i className="sev-dot sev-dot--low" /> low
            </span>
          </Link>
        </div>
      </section>

      <section className="section section--dark has-motif">
        <Motif kind="root" opacity={0.12} />
        <div className="wrap split">
          <div className="drives-explainer">
            <h2 className="h2">
              Quest Drives: how two people cover <em>miles</em>, not blocks.
            </h2>
            <p className="lede">
              One drives. One sits in the passenger seat with the app in drive mode, capturing a frame every few seconds with the GPS trail. Back
              home, the batch is classified, deduplicated, and reviewed frame by frame before anything reaches the map.
            </p>
          </div>
          <div className="drives-explainer">
            <ul>
              <li>
                <Car />
                <span>A Saturday loop of Northwest Austin becomes hundreds of labeled points. Arterials first, where nobody walks to audit.</span>
              </li>
              <li>
                <Check />
                <span>Nothing posts automatically. The passenger accepts, rejects, or relabels each frame; the driver only drives.</span>
              </li>
              <li>
                <Check />
                <span>Drive-captured reports are marked as such on the map, and walkers confirm on foot before 311 submission when needed.</span>
              </li>
              <li>
                <Check />
                <span>Coverage is measured in audited miles against the city's network, published on the data page by neighborhood.</span>
              </li>
            </ul>
            <div className="btn-row">
              <Link to="/app" className="btn btn--dark" viewTransition>
                Quest Drive is in the app
              </Link>
              <Link to="/how" className="btn btn--ghost-dark" viewTransition>
                How roles work
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div>
            <h2 className="h2">What "large" looks like by March 2031.</h2>
            <p className="lede">Targets, stated as targets. We will publish progress against each one and never round up.</p>
          </div>
          <ul className="targets">
            <li>Tens of thousands of geo-tagged, photo-backed hazards on the map.</li>
            <li>A double-digit share of Austin's walkable network audited, neighborhood by neighborhood.</li>
            <li>Vegetation miles actually cleared, drawn from the city's 214-mile pool, at essentially zero public cost.</li>
            <li>Hundreds to thousands of 311 tickets with verified, photographed close-out.</li>
            <li>A public dataset that other people use: researchers, council offices, the Sidewalk Program.</li>
            <li>At least one concrete city process change: faster vegetation enforcement, school-walk priority, or our data adopted by Transportation.</li>
          </ul>
        </div>
      </section>

      <section className="section section--band promise-band has-motif">
        <Motif kind="lip" opacity={0.14} style={{ color: "var(--olive-800)" }} />
        <div className="wrap stack stack--lg">
          <p>No one's grandmother should be injured by a sidewalk a photograph could have fixed.</p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <Link to="/app" className="btn btn--primary btn--lg" viewTransition>
              Report a hazard
            </Link>
            <Link to="/how" className="btn btn--lg" viewTransition>
              Read how it works
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
