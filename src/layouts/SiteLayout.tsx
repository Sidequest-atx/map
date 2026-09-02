import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../components/Bits";
import { Mark } from "../components/Icons";
import { ToastRegion } from "../components/Toast";

const NAV = [
  { to: "/", label: "Mission", end: true },
  { to: "/map", label: "Map" },
  { to: "/how", label: "How it works" },
  { to: "/data", label: "Data" },
];

const TITLES: Record<string, string> = {
  "/": "SideQuest ATX",
  "/map": "Live map · SideQuest ATX",
  "/how": "How it works · SideQuest ATX",
  "/data": "Open data · SideQuest ATX",
  "/app": "Get the app · SideQuest ATX",
};

export function SiteLayout() {
  const { pathname } = useLocation();
  const onDark = pathname === "/";
  const fullBleed = pathname === "/map";

  useEffect(() => {
    document.title = TITLES[pathname] ?? "SideQuest ATX";
    if (!fullBleed) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, fullBleed]);

  return (
    <div className="site">
      <header className={`topbar ${onDark ? "topbar--dark" : ""}`}>
        <div className="wrap topbar-inner">
          <Link to="/" className="brand" viewTransition>
            <Mark />
            <span>
              SideQuest <em>ATX</em>
            </span>
          </Link>
          <nav className="nav" aria-label="Primary">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} viewTransition className={({ isActive }) => (isActive ? "is-active" : "")}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/app" className={`btn btn--sm topbar-cta ${onDark ? "btn--dark" : "btn--primary"}`} viewTransition>
            Get the app
          </Link>
        </div>
      </header>

      <main>
        <ErrorBoundary home="/">
          <Outlet />
        </ErrorBoundary>
      </main>

      {!fullBleed && (
        <footer className="footer">
          <div className="wrap">
            <div className="footer-grid">
              <div>
                <p className="footer-promise">No one's grandmother should be injured by a sidewalk a photograph could have fixed.</p>
              </div>
              <div>
                <h4>Explore</h4>
                <ul>
                  <li>
                    <Link to="/map" viewTransition>Live map</Link>
                  </li>
                  <li>
                    <Link to="/how" viewTransition>How it works</Link>
                  </li>
                  <li>
                    <Link to="/data" viewTransition>Open data and downloads</Link>
                  </li>
                  <li>
                    <Link to="/app" viewTransition>Get the app</Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4>City resources</h4>
                <ul>
                  <li>
                    <a href="https://www.austintexas.gov/department/sidewalks" rel="noopener">Austin Sidewalk Program</a>
                  </li>
                  <li>
                    <a href="https://311.austintexas.gov/" rel="noopener">Austin 311</a>
                  </li>
                  <li>
                    <a href="https://www.cdc.gov/falls/data-research/" rel="noopener">CDC older-adult fall data</a>
                  </li>
                </ul>
              </div>
              <div>
                <h4>Organization</h4>
                <ul>
                  <li>Founded 2026, Northwest Austin</li>
                  <li>Student-led, open data, runs through 2031 and beyond</li>
                  <li>
                    <a href="mailto:hello@sidequestatx.org">hello@sidequestatx.org</a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="footer-bottom">
              <span>© {new Date().getFullYear()} SideQuest ATX. Reports are public data, CC BY 4.0.</span>
              <span>Photos of public sidewalks. No faces, no plates, no addresses published.</span>
            </div>
          </div>
        </footer>
      )}
      <ToastRegion />
    </div>
  );
}
