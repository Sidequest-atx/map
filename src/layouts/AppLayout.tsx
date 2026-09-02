import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../components/Bits";
import { Mark } from "../components/Icons";
import { ToastRegion } from "../components/Toast";
import { signOut, useSession } from "../data/session";

const TITLES: Record<string, string> = {
  "/app/signin": "Sign in · SideQuest",
  "/portal": "Portal · SideQuest",
};

/** Chrome for the signed-in surfaces: sign-in and the moderator portal. */
export function AppLayout() {
  const { pathname } = useLocation();
  const session = useSession();
  const [offline, setOffline] = useState(!navigator.onLine);
  const isPortal = pathname.startsWith("/portal");

  useEffect(() => {
    document.title = TITLES[pathname] ?? "SideQuest ATX";
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <div className="app ui">
      <header className="app-bar">
        <Link to="/" className="brand" viewTransition>
          <Mark />
          <span>
            SideQuest <em>ATX</em>
          </span>
        </Link>
        <div className="app-bar-right">
          {session && <span className="muted small">{session.name}</span>}
          {session?.role === "moderator" && !isPortal && (
            <Link to="/portal" className="btn btn--sm" viewTransition>
              Portal
            </Link>
          )}
          {session && (
            <button className="btn btn--sm btn--ghost" onClick={signOut}>
              Sign out
            </button>
          )}
          <Link to="/map" className="btn btn--sm btn--ghost" viewTransition>
            Map
          </Link>
        </div>
      </header>

      {offline && (
        <div className="notice notice--warn" role="status" style={{ borderRadius: 0, justifyContent: "center" }}>
          You are offline. Changes will not reach the map until the connection returns.
        </div>
      )}

      <main className={`app-main ${isPortal ? "app-main--wide" : ""}`}>
        <ErrorBoundary home="/">
          <Outlet />
        </ErrorBoundary>
      </main>
      <ToastRegion />
    </div>
  );
}
