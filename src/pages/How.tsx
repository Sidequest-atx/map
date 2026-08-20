import { Link } from "react-router-dom";
import { Lifecycle } from "../components/Bits";
import { Motif } from "../components/Motif";

export default function How() {
  return (
    <>
      <section className="section has-motif">
        <Motif kind="crack" opacity={0.12} style={{ color: "var(--olive-800)" }} />
        <div className="wrap split">
          <h1 className="h1">How a sidewalk gets fixed here.</h1>
          <p className="lede">
            Two paths, one map. Structural defects go to the city and are tracked until a second photo proves the repair. Vegetation goes to the
            landowner and is usually cleared in days. Either way the report stays public until it is closed with proof.
          </p>
        </div>
      </section>

      <section className="section--tight">
        <div className="wrap stack stack--lg">
          <h2 className="h2">From photo to closure</h2>
          <ol className="steps-list">
            <li>
              <div>
                <h3>Photograph it from the sidewalk or the passenger seat.</h3>
                <p>
                  The app opens the rear camera. One clear frame is enough. Photos are of public right-of-way only; we never publish faces, plates, or
                  house numbers.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>The model suggests what it is. You confirm.</h3>
                <p>
                  Crack, root heave, vegetation, missing ramp, missing segment, debris. Severity too. The suggestion is shown with its confidence and
                  a reason; you correct it in one tap if it is wrong. The model name is recorded so the data can be re-scored later.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>We check whether it is already on the map.</h3>
                <p>
                  Same hazard type within fifteen metres of an open report? You are asked whether to add your photo to that record instead of creating a
                  duplicate.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>Pin it, add a sentence, submit.</h3>
                <p>The pin starts at your GPS position; drag to the exact panel. The report is public on the map the moment you submit.</p>
              </div>
            </li>
            <li>
              <div>
                <h3>A moderator routes it.</h3>
                <p>
                  Structural defects are submitted to Austin 311 and the service request number is attached. Vegetation gets a printed door-hanger
                  for the adjacent landowner, and a volunteer visit if nothing changes in two weeks.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>It is resolved only with an after-photo.</h3>
                <p>
                  The store refuses to mark a report resolved without a second photo. The model checks that the hazard is gone; a named moderator signs
                  off. Before and after are shown side by side on the map.
                </p>
              </div>
            </li>
          </ol>
          <div style={{ maxWidth: "30rem" }}>
            <p className="small muted" style={{ marginBottom: ".5rem" }}>
              The life cycle every structural report moves through:
            </p>
            <Lifecycle status="scheduled" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="stack">
            <h2 className="h2">The door-hanger.</h2>
            <p className="prose">
              Most blocked sidewalks belong to someone who has not noticed. The hanger is polite, specific, and carries the report number so the
              homeowner can see the photo. It names the Austin ordinance once and offers help first. Print it from any vegetation report in the
              portal.
            </p>
            <button className="btn" onClick={() => window.print()}>
              Print a sample
            </button>
          </div>
          <div className="hanger" aria-label="Sample door-hanger">
            <div className="hanger-hole" aria-hidden />
            <h3>Your hedge is on the sidewalk.</h3>
            <p>
              Hi, neighbor. A walker photographed the sidewalk in front of this address and it is currently blocked by plants. People in wheelchairs,
              with strollers, or with a cane have to step into the street here.
            </p>
            <p>
              Austin code asks the adjacent property owner to keep the walk clear to its full width and to eight feet overhead. Trimming usually
              takes twenty minutes.
            </p>
            <p>
              <b>Need a hand?</b> Reply to this hanger by email and a volunteer crew will bring loppers on the next Saturday.
            </p>
            <p className="ref-line">Report SQ-0002 · sidequestatx.org/map?r=SQ-0002 · hello@sidequestatx.org</p>
          </div>
        </div>
      </section>

      <section className="section section--band has-motif">
        <Motif kind="root" opacity={0.12} style={{ color: "var(--olive-800)" }} />
        <div className="wrap stack stack--lg">
          <div className="split">
            <h2 className="h2">Who does what.</h2>
            <p className="lede">
              Accounts exist for the network, not for vanity. Roles keep the map trustworthy while letting anyone with a phone contribute.
            </p>
          </div>
          <div className="roles">
            <div>
              <h3>Viewer</h3>
              <p>Anyone. Browse the map, filter it, share a report link with a council office, download the data. No account.</p>
            </div>
            <div>
              <h3>Reporter</h3>
              <p>Signs in on the app, photographs hazards, confirms the AI suggestion, pins the spot. The bulk of the map comes from reporters.</p>
            </div>
            <div>
              <h3>Drive captain</h3>
              <p>Runs Quest Drives from the passenger seat: interval capture, GPS trail, batch review. Never the person driving.</p>
            </div>
            <div>
              <h3>Moderator</h3>
              <p>Moves status, attaches 311 tickets, merges duplicates, prints door-hangers, verifies after-photos, signs the close-out.</p>
            </div>
          </div>
          <div className="btn-row">
            <Link to="/app" className="btn btn--primary" viewTransition>
              Open the app
            </Link>
            <Link to="/data" className="btn" viewTransition>
              See the numbers
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <h2 className="h2">What we will not do.</h2>
          <ul className="targets">
            <li>Claim dollars of falls prevented. We publish repairs, cycle times, and miles; not invented savings.</li>
            <li>Let the model decide. Every classification, duplicate, and close-out is confirmed by a person.</li>
            <li>Publish faces, license plates, or house numbers. Photos are cropped to the right-of-way.</li>
            <li>Close a report on the city's word alone. An after-photo or it stays open.</li>
            <li>Wind down in 2031. The map is designed to be handed to the next cohort and to the city.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
