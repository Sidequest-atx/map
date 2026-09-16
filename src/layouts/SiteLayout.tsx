import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../components/Bits";
import { Mark } from "../components/Icons";
import { ToastRegion } from "../components/Toast";
import { CONTACT_EMAIL } from "../lib/site";

/** `short` is what phones show so the header fits one row; the full label
    stays the link's accessible name. */
const NAV = [
  { to: "/map", label: "Live map", short: "Map" },
  { to: "/how", label: "How it works", short: "How" },
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
  const fullBleed = pathname === "/map";

  useEffect(() => {
    document.title = TITLES[pathname] ?? "SideQuest ATX";
    if (!fullBleed) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, fullBleed]);

  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="utilbar">
        <div className="wrap utilbar-inner">
          <span className="utilbar-tag">A living public map of Austin's sidewalks · Student-run, Northwest Austin</span>
          <nav className="utilbar-links" aria-label="Utility">
            <Link to="/app/signin">Moderator sign-in</Link>
            <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
          </nav>
        </div>
      </div>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link to="/" className="brand" aria-label="SideQuest ATX, home" viewTransition>
            <Mark />
            <span className="brand-word" aria-hidden>
              SideQuest <em>ATX</em>
            </span>
          </Link>
          <nav className="nav" aria-label="Primary">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} viewTransition aria-label={n.short ? n.label : undefined} className={({ isActive }) => (isActive ? "is-active" : "")}>
                {n.short ? (
                  <>
                    <span className="nav-long">{n.label}</span>
                    <span className="nav-short">{n.short}</span>
                  </>
                ) : (
                  n.label
                )}
              </NavLink>
            ))}
          </nav>
          <Link to="/app" aria-label="Get the app" className="btn btn--sm btn--primary topbar-cta" viewTransition>
            <span className="nav-long">Get the app</span>
            <span className="nav-short">Get app</span>
          </Link>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <ErrorBoundary home="/" resetKey={pathname}>
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
                <h2 className="footer-h">Explore</h2>
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
                  <li>
                    <Link to="/app/signin" viewTransition>Moderator sign-in</Link>
                  </li>
                </ul>
              </div>
              <div>
                <h2 className="footer-h">City resources</h2>
                <ul>
                  <li>
                    <a href="https://www.austintexas.gov/sidewalks" rel="noopener">Austin Sidewalk Program</a>
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
                <h2 className="footer-h">Organization</h2>
                <ul>
                  <li>Founded 2026, Northwest Austin</li>
                  <li>Student-led, open data, built to outlive its founders</li>
                  <li>
                    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="footer-bottom">
              <span>© {new Date().getFullYear()} SideQuest ATX. Reports are public data, CC BY 4.0.</span>
              <span>Photos of public sidewalks. No faces, no plates, no addresses published.</span>
            </div>
            <div className="footer-bottom" style={{ marginTop: "0.4rem" }}>
              <span>
                Street scenes are rendered from the project's own street model. Vehicle models:{" "}
                <a href="https://poly.pizza/m/4qjS9tFhsJg" rel="noopener" target="_blank">Mitsubishi L200</a> and{" "}
                <a href="https://poly.pizza/m/fWGNi96ckzn" rel="noopener" target="_blank">Terrano</a> by Muhammad Reyhan,{" "}
                <a href="https://poly.pizza/m/fFCCghvRImG" rel="noopener" target="_blank">Montreal Bus</a> by Nick Ladd,{" "}
                <a href="https://poly.pizza/m/Jpar3f32mt" rel="noopener" target="_blank">Cybertruck</a> by Mobolaji (all CC BY 3.0, via Poly
                Pizza); sedan and SUV by Quaternius (CC0); scanned materials and props from Poly Haven and ambientCG (CC0).
              </span>
            </div>
          </div>
        </footer>
      )}
      <ToastRegion />
    </div>
  );
}
