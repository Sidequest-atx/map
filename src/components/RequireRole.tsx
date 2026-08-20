import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { hasRole, signOut, useSession } from "../data/session";
import { ROLE_LABELS, type Role } from "../types";

/**
 * Route gate. Signed-out users are sent to sign-in and returned afterwards.
 * Signed-in users without the role get an explanation + a way out, never a
 * blank page.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/app/signin?next=${next}`} replace />;
  }
  if (!hasRole(session, role)) {
    return (
      <div className="errorpage ui">
        <div>
          <h1 className="h2">This area needs the {ROLE_LABELS[role].toLowerCase()} role.</h1>
          <p className="muted">
            You are signed in as <b>{session.name}</b> ({ROLE_LABELS[session.role].toLowerCase()}). Switch roles to continue, or head back.
          </p>
          <div className="btn-row">
            <button
              className="btn btn--primary"
              onClick={() => {
                signOut();
              }}
            >
              Switch role
            </button>
            <Link className="btn" to="/app">
              Back to the app
            </Link>
            <Link className="btn btn--ghost" to="/map">
              View the map
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
