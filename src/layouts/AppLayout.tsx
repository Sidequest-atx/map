import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../components/Bits";
import { Camera, Car, Home, Mark } from "../components/Icons";
import { ToastRegion } from "../components/Toast";
import { useSession } from "../data/session";

const TABS = [
  { to: "/app", label: "Home", Icon: Home, end: true },
  { to: "/app/report", label: "Report", Icon: Camera },
  { to: "/app/drive", label: "Drive", Icon: Car },
];

const TITLES: Record<string, string> = {
  "/app": "SideQuest app",
  "/app/report": "Report a hazard · SideQuest",
  "/app/drive": "Quest Drive · SideQuest",
  "/app/signin": "Sign in · SideQuest",
  "/portal": "Portal · SideQuest",
};

export function AppLayout() {
  const { pathname } = useLocation();
  const session = useSession();
  const [offline, setOffline] = useState(!navigator.onLine);
  const isPortal = pathname.startsWith("/portal");

  useEffect(() => {
    document.title = TITLES[pathname] ?? "SideQuest app";
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
        <Link to="/app" className="brand" viewTransition>
          <Mark />
          <span>
            SideQuest <em>ATX</em>
          </span>
        </Link>
        <div className="app-bar-right">
          {session && !isPortal && <span className="muted small">{session.name}</span>}
          {session?.role === "moderator" && !isPortal && (
            <Link to="/portal" className="btn btn--sm" viewTransition>
              Portal
            </Link>
          )}
          {isPortal && (
            <Link to="/app" className="btn btn--sm" viewTransition>
              App
            </Link>
          )}
          <Link to="/map" className="btn btn--sm btn--ghost" viewTransition>
            Map
          </Link>
        </div>
      </header>

      {offline && (
        <div className="notice notice--warn" role="status" style={{ borderRadius: 0, justifyContent: "center" }}>
          You are offline. Reports you submit are kept on this device and stay on your local map.
        </div>
      )}

      {!isPortal && (
        <nav className="tabbar" aria-label="App sections">
          {TABS.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} viewTransition className={({ isActive }) => (isActive ? "is-active" : "")}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}

      <main className={`app-main ${isPortal ? "app-main--wide" : ""}`}>
        <ErrorBoundary home="/app">
          <Outlet />
        </ErrorBoundary>
      </main>
      <ToastRegion />
    </div>
  );
}
