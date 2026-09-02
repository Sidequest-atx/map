import { Link } from "react-router-dom";
import { Motif } from "../components/Motif";

export default function GetApp() {
  return (
    <>
      <section className="section has-motif">
        <Motif kind="crack" opacity={0.12} style={{ color: "var(--olive-800)" }} />
        <div className="wrap split">
          <h1 className="h1">The camera lives in the iPhone app.</h1>
          <p className="lede">
            Every report starts as a photo with the GPS fix taken at the shutter, written into the picture itself. That needs a real camera and a
            real GPS, so capture happens only in the SideQuest ATX app. This website is the public map those photos land on.
          </p>
        </div>
      </section>

      <section className="section--tight">
        <div className="wrap stack stack--lg">
          <h2 className="h2">Getting the app</h2>
          <ol className="steps-list">
            <li>
              <div>
                <h3>Ask for a build.</h3>
                <p>
                  SideQuest ATX is family-and-volunteers software, installed directly rather than through the App Store. Write to{" "}
                  <a href="mailto:hello@sidequestatx.org">hello@sidequestatx.org</a> and we will get the current build onto your phone.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>Create your account in the app.</h3>
                <p>Email and password, first name shown on your reports. Accounts keep the map trustworthy: every photo is signed by a person.</p>
              </div>
            </li>
            <li>
              <div>
                <h3>Photograph the first broken panel you pass.</h3>
                <p>
                  The report is on <Link to="/map" viewTransition>the public map</Link> the moment it uploads, and it stays there until the fix is
                  proven with a second photo.
                </p>
              </div>
            </li>
          </ol>
          <p className="small muted">
            Moderators sign in <Link to="/app/signin" viewTransition>here on the website</Link> to route reports to 311 and verify close-outs. Looking
            is free for everyone: <Link to="/map" viewTransition>the map needs no account</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
