import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { allDemo, useReports } from "../data/store";
import { DEMO } from "../lib/supabase";
import { HAZARD_SHORT, SEVERITY_LABELS, STATUS_LABELS, type HazardReport, type HazardType, type ReportStatus, type Severity } from "../types";

/** Shown wherever seed data is on screen (VITE_DEMO=1 only), until a real report exists. */
export function DemoBadge({ className = "" }: { className?: string }) {
  const reports = useReports();
  if (!DEMO || !allDemo(reports)) return null;
  return (
    <span className={`badge badge--demo demo-badge ${className}`} title="Synthetic Northwest Austin data for the prototype. Cleared the moment real reports arrive.">
      Demo data
    </span>
  );
}

export function SevBadge({ s }: { s: Severity }) {
  return (
    <span className={`badge badge--${s}`}>
      <i className={`sev-dot sev-dot--${s}`} aria-hidden />
      {SEVERITY_LABELS[s]}
    </span>
  );
}
export function StatusBadge({ s }: { s: ReportStatus }) {
  return <span className={`badge badge--${s}`}>{STATUS_LABELS[s]}</span>;
}
export function TypeBadge({ t }: { t: HazardType }) {
  return <span className="badge">{HAZARD_SHORT[t]}</span>;
}
export function SourceBadge({ r }: { r: HazardReport }) {
  return r.source === "drive" ? <span className="badge badge--drive">Quest Drive</span> : null;
}

export function Lifecycle({ status }: { status: ReportStatus }) {
  const order: ReportStatus[] = ["open", "submitted-311", "scheduled", "resolved"];
  const idx = order.indexOf(status);
  return (
    <div className="lifecycle" aria-label={`Status: ${STATUS_LABELS[status]}`}>
      {order.map((s, i) => (
        <span key={s} className={i <= idx ? "is-done" : ""}>
          <i />
          {STATUS_LABELS[s]}
        </span>
      ))}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

export function NotFound() {
  const { pathname } = useLocation();
  const inApp = pathname.startsWith("/app");
  // Unknown paths still answer 200 from the SPA host, so tell crawlers not to
  // index this page as if it were real content.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  return (
    <div className="errorpage ui">
      <div>
        <h1 className="h2">That page does not exist.</h1>
        <p className="muted">
          <span className="mono">{pathname}</span> is not a route we know. Nothing is lost.
        </p>
        <div className="btn-row">
          <Link className="btn btn--primary" to={inApp ? "/app" : "/"}>
            {inApp ? "Back to the app" : "Back to the mission"}
          </Link>
          <Link className="btn" to="/map">
            Open the map
          </Link>
        </div>
      </div>
    </div>
  );
}

/** A page's code chunk failed to load: almost always a deploy happened while this tab was open. */
function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Expected a JavaScript/i.test(error?.message ?? "");
}

const RELOAD_KEY = "sq-chunk-reload-at";

interface EBProps {
  children: ReactNode;
  home?: string;
  /** Changing this (the route path) clears the error, so navigation recovers. */
  resetKey?: string;
}
interface EBState {
  error: Error | null;
  offline: boolean;
}
export class ErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null, offline: false };
  static getDerivedStateFromError(error: Error): Partial<EBState> {
    return { error, offline: isChunkLoadError(error) && navigator.onLine === false };
  }
  // A page whose code never reached this device can't load offline, and
  // reloading then would only swap this message for a blank screen. Wait for
  // the connection and reload once it is back.
  private onOnline = () => {
    if (this.state.error && isChunkLoadError(this.state.error)) location.reload();
  };
  componentDidMount() {
    window.addEventListener("online", this.onOnline);
  }
  componentWillUnmount() {
    window.removeEventListener("online", this.onOnline);
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[SideQuest] render error", error, info.componentStack);
    // React caches a failed lazy import, so re-rendering can't fix it; a new
    // deploy needs a fresh page. Reload once, at most once a minute.
    if (isChunkLoadError(error) && navigator.onLine !== false) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last > 60_000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          location.reload();
        }
      } catch {
        /* storage blocked: fall back to the Try again button */
      }
    }
  }
  componentDidUpdate(prev: EBProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, offline: false });
  }
  render() {
    const { error, offline } = this.state;
    if (!error) return this.props.children;
    const home = this.props.home ?? "/";
    const chunk = isChunkLoadError(error);
    const title = offline ? "You're offline." : chunk ? "This page couldn't load." : "Something broke on this screen.";
    const body = offline
      ? "This page hasn't been saved on this device yet. It opens by itself when you're back online."
      : chunk
        ? "The connection may have dropped, or SideQuest was just updated. Reload to try again."
        : "Try again, or go back to the start.";
    return (
      <div className="errorpage ui">
        <div>
          <h1 className="h2">{title}</h1>
          <p className="muted">{body}</p>
          {!chunk && <p className="mono small muted">{error.message}</p>}
          <div className="btn-row">
            <button className="btn btn--primary" onClick={() => (chunk ? location.reload() : this.setState({ error: null, offline: false }))}>
              {chunk ? "Reload" : "Try again"}
            </button>
            <a className="btn" href={home}>
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
