import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DemoBadge, SevBadge, StatusBadge } from "../../components/Bits";
import { Arrow, Camera, Car, Layers } from "../../components/Icons";
import { signOut, useSession } from "../../data/session";
import { useReports } from "../../data/store";
import { relativeDays } from "../../lib/format";
import { HAZARD_SHORT, ROLE_LABELS } from "../../types";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
}

export default function AppHome() {
  const session = useSession();
  const reports = useReports();
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;

  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);

  const mine = useMemo(() => (session ? reports.filter((r) => r.reporter === session.name).slice(0, 6) : []), [reports, session]);
  const open = reports.filter((r) => r.status !== "resolved" && !r.duplicateOf).length;

  if (!session) {
    return (
      <div className="app-home">
        <div>
          <h1>Report a sidewalk hazard.</h1>
          <p className="muted">Photograph it. The model sorts it. The city sees it. Nothing closes without proof.</p>
        </div>
        <div className="quest-actions">
          <Link to="/app/signin?next=/app/report" className="quest-action" viewTransition>
            <Camera />
            <span>
              <b>Start a walk report</b>
              <small>One photo, forty seconds</small>
            </span>
            <Arrow className="arrow" />
          </Link>
          <Link to="/app/signin?next=/app/drive" className="quest-action quest-action--secondary" viewTransition>
            <Car />
            <span>
              <b>Start a Quest Drive</b>
              <small>Passenger-seat batch capture</small>
            </span>
            <Arrow className="arrow" />
          </Link>
        </div>
        <p className="small muted">
          {open} hazards are open on the map right now. <DemoBadge />{" "}
          <Link to="/map" viewTransition>
            Look first
          </Link>
          .
        </p>
        {!standalone && <InstallHint evt={installEvt} />}
      </div>
    );
  }

  return (
    <div className="app-home">
      <div className="role-card">
        <span className="avatar" aria-hidden>
          {session.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="grow">
          <b>{session.name}</b>
          <br />
          <span className="muted">{ROLE_LABELS[session.role]}</span>
        </span>
        <Link to="/app/signin" className="btn btn--sm btn--ghost" viewTransition>
          Switch
        </Link>
        <button className="btn btn--sm btn--ghost" onClick={signOut}>
          Sign out
        </button>
      </div>

      <div>
        <h1>What are we fixing today?</h1>
      </div>

      <div className="quest-actions">
        <Link to="/app/report" className="quest-action" viewTransition>
          <Camera />
          <span>
            <b>Report a hazard</b>
            <small>Photo, AI suggestion, pin, submit</small>
          </span>
          <Arrow className="arrow" />
        </Link>
        <Link to="/app/drive" className="quest-action quest-action--secondary" viewTransition>
          <Car />
          <span>
            <b>Quest Drive</b>
            <small>{session.role === "reporter" ? "Needs the drive-captain role" : "Interval capture with GPS trail"}</small>
          </span>
          <Arrow className="arrow" />
        </Link>
        {session.role === "moderator" && (
          <Link to="/portal" className="quest-action quest-action--secondary" viewTransition>
            <Layers />
            <span>
              <b>Moderator portal</b>
              <small>Route, verify, export</small>
            </span>
            <Arrow className="arrow" />
          </Link>
        )}
      </div>

      <div className="stack" style={{ gap: ".6rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ fontSize: "1rem" }}>Your recent reports</h2>
          <Link to="/map" className="small" viewTransition>
            Full map
          </Link>
        </div>
        {mine.length ? (
          <ul className="recent-list">
            {mine.map((r) => (
              <li key={r.id}>
                <i className={`sev-dot sev-dot--${r.severity}`} />
                <span>
                  <span className="place">{r.place}</span>
                  <br />
                  <span className="when">
                    {r.ref} · {HAZARD_SHORT[r.type]} · {relativeDays(r.createdAt)}
                  </span>
                </span>
                <span style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                  <StatusBadge s={r.status} />
                  <SevBadge s={r.severity} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <h3>No reports from you yet.</h3>
            <p>Your first one takes under a minute.</p>
            <Link to="/app/report" className="btn btn--primary btn--sm" viewTransition>
              Report a hazard
            </Link>
          </div>
        )}
      </div>

      {!standalone && <InstallHint evt={installEvt} />}
    </div>
  );
}

function InstallHint({ evt }: { evt: BIPEvent | null }) {
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  return (
    <div className="notice">
      <div>
        <b>Add SideQuest to your home screen</b> so the camera opens in one tap.{" "}
        {evt ? (
          <button className="btn btn--sm" style={{ marginLeft: 6 }} onClick={() => evt.prompt()}>
            Install
          </button>
        ) : ios ? (
          <span className="muted">Share → Add to Home Screen.</span>
        ) : (
          <span className="muted">Use your browser's Install option.</span>
        )}
      </div>
    </div>
  );
}
