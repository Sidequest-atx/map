import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Motif } from "./Motif";
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
  return (
    <div className="errorpage ui has-motif">
      <Motif kind="crack" opacity={0.12} style={{ color: "var(--olive-800)" }} />
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

interface EBProps {
  children: ReactNode;
  home?: string;
}
interface EBState {
  error: Error | null;
}
export class ErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[SideQuest] render error", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const home = this.props.home ?? "/";
    return (
      <div className="errorpage ui">
        <div>
          <h1 className="h2">Something broke on this screen.</h1>
          <p className="muted">Your reports are saved on this device. Try again, or go back to safe ground.</p>
          <p className="mono small muted">{this.state.error.message}</p>
          <div className="btn-row">
            <button className="btn btn--primary" onClick={() => this.setState({ error: null })}>
              Try again
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
