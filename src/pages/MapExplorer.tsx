import type { Point } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { priorityLabel, rankReport } from "../ai/rank";
import { DemoBadge, Lifecycle, SevBadge, SourceBadge, StatusBadge, TypeBadge } from "../components/Bits";
import { Close, Filter } from "../components/Icons";
import { useSheetDrag } from "../components/useSheetDrag";
import { useReports } from "../data/store";
import { relativeDays, shortDate } from "../lib/format";
import { bboxOf } from "../lib/geo";
import { MAP_STYLE, MAPBOX_TOKEN, mapboxgl, NW_AUSTIN, SEVERITY_COLORS, tintMap } from "../lib/mapbox";
import {
  HAZARD_SHORT,
  SEVERITY_LABELS,
  STATUS_LABELS,
  type HazardReport,
  type HazardType,
  type ReportStatus,
  type Severity,
} from "../types";

const TYPES = Object.keys(HAZARD_SHORT) as HazardType[];
const SEVS = Object.keys(SEVERITY_LABELS) as Severity[];
const STATUSES = Object.keys(STATUS_LABELS) as ReportStatus[];
const SRC = "reports";

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

export default function MapExplorer() {
  const reports = useReports();
  const [params, setParams] = useSearchParams();
  const [types, setTypes] = useState<Set<HazardType>>(new Set());
  const [sevs, setSevs] = useState<Set<Severity>>(new Set());
  const [statuses, setStatuses] = useState<Set<ReportStatus>>(new Set());
  const [driveOnly, setDriveOnly] = useState(() => params.get("src") === "drive");
  const [hideResolved, setHideResolved] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const selectedRef = params.get("r");

  const visible = useMemo(
    () =>
      reports.filter(
        (r) =>
          !r.duplicateOf &&
          (types.size === 0 || types.has(r.type)) &&
          (sevs.size === 0 || sevs.has(r.severity)) &&
          (statuses.size === 0 || statuses.has(r.status)) &&
          (!driveOnly || r.source === "drive") &&
          (!hideResolved || r.status !== "resolved" || statuses.has("resolved")),
      ),
    [reports, types, sevs, statuses, driveOnly, hideResolved],
  );
  const selected = useMemo(() => (selectedRef ? reports.find((r) => r.ref === selectedRef || r.id === selectedRef) ?? null : null), [reports, selectedRef]);
  const anyFilter = types.size || sevs.size || statuses.size || driveOnly || !hideResolved;

  const select = useCallback(
    (r: HazardReport | null) => {
      setParams(
        (p) => {
          if (r) p.set("r", r.ref);
          else p.delete("r");
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clearFilters = () => {
    setTypes(new Set());
    setSevs(new Set());
    setStatuses(new Set());
    setDriveOnly(false);
    setHideResolved(true);
  };

  // Escape closes the detail
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, select]);

  const canMap = Boolean(MAPBOX_TOKEN) && !mapFailed;

  return (
    <div className="explorer ui">
      {canMap ? (
        <MapCanvas reports={visible} selected={selected} onSelect={select} onFail={() => setMapFailed(true)} />
      ) : (
        <MapFallback reports={visible} onSelect={select} tokenMissing={!MAPBOX_TOKEN} />
      )}

      <aside className={`explorer-panel ${panelOpen ? "is-open" : ""}`} aria-label="Map filters">
        <div className="explorer-panel-head">
          <h1>Sidewalk hazards</h1>
          <button className="btn btn--sm filters-toggle" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
            <Filter style={{ width: 16, height: 16 }} /> Filters{anyFilter ? " •" : ""}
          </button>
          <span className="count">
            {visible.length} shown of {reports.filter((r) => !r.duplicateOf).length} <DemoBadge />
          </span>
        </div>
        <div className="explorer-filters">
          <div>
            <h4>Hazard</h4>
            <div className="chips">
              {TYPES.map((t) => (
                <button key={t} className={`chip ${types.has(t) ? "is-on" : ""}`} onClick={() => setTypes(toggle(types, t))} aria-pressed={types.has(t)}>
                  {HAZARD_SHORT[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h4>Severity</h4>
            <div className="chips">
              {SEVS.map((s) => (
                <button key={s} className={`chip ${sevs.has(s) ? "is-on" : ""}`} onClick={() => setSevs(toggle(sevs, s))} aria-pressed={sevs.has(s)}>
                  <i className={`sev-dot sev-dot--${s}`} /> {SEVERITY_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h4>Status</h4>
            <div className="chips">
              {STATUSES.map((s) => (
                <button key={s} className={`chip ${statuses.has(s) ? "is-on" : ""}`} onClick={() => setStatuses(toggle(statuses, s))} aria-pressed={statuses.has(s)}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="chips">
            <button className={`chip ${driveOnly ? "is-on" : ""}`} onClick={() => setDriveOnly((v) => !v)} aria-pressed={driveOnly}>
              Quest Drive captures
            </button>
            <button className={`chip ${!hideResolved ? "is-on" : ""}`} onClick={() => setHideResolved((v) => !v)} aria-pressed={!hideResolved}>
              Show resolved
            </button>
            {anyFilter ? (
              <button className="chip" onClick={clearFilters}>
                Clear all
              </button>
            ) : null}
          </div>
          {visible.length === 0 &&
            (reports.length === 0 ? (
              <div className="empty">
                <h3>The map is waiting for its first photo.</h3>
                <p className="small muted">
                  Reports land here the moment they are captured in the app. <Link to="/app" viewTransition>Get the app</Link> to file the first one.
                </p>
              </div>
            ) : (
              <div className="empty">
                <h3>Nothing matches these filters.</h3>
                <button className="btn btn--sm btn--primary" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ))}
          <div className="legend">
            <span>
              <i className="sev-dot sev-dot--severe" /> Severe
            </span>
            <span>
              <i className="sev-dot sev-dot--moderate" /> Moderate
            </span>
            <span>
              <i className="sev-dot sev-dot--low" /> Low
            </span>
          </div>
        </div>
      </aside>

      {selected && <Detail report={selected} onClose={() => select(null)} />}
    </div>
  );
}

/* ---------------- Map canvas ---------------- */

function MapCanvas({
  reports,
  selected,
  onSelect,
  onFail,
}: {
  reports: HazardReport[];
  selected: HazardReport | null;
  onSelect: (r: HazardReport | null) => void;
  onFail: () => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState<mapboxgl.Map | null>(null);
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  const didFit = useRef(false);

  useEffect(() => {
    const container = node.current;
    if (!container || mapRef.current) return;
    let disposed = false;
    let map: mapboxgl.Map | null = null;
    let ro: ResizeObserver | null = null;
    // Deferred one frame: React StrictMode mounts, unmounts and remounts
    // synchronously, and mapbox-gl v3 stalls if a map is removed and recreated
    // in the same container within one task. Deferring lets the cancelled
    // first pass never create a map at all.
    const raf = window.setTimeout(() => {
    if (disposed) return;
    try {
      map = new mapboxgl.Map({
        container,
        style: MAP_STYLE,
        center: NW_AUSTIN,
        zoom: 12.2,
        attributionControl: true,
        cooperativeGestures: false,
      });
    } catch {
      onFailRef.current();
      return;
    }
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __sqmap?: mapboxgl.Map }).__sqmap = map;
    const m = map;
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new mapboxgl.GeolocateControl({ trackUserLocation: false, showUserHeading: false }), "top-right");
    m.on("error", (e) => {
      const status = (e as unknown as { error?: { status?: number } }).error?.status;
      if (status === 401 || status === 403) onFailRef.current();
    });
    m.on("load", () => {
      if (disposed) return;
      tintMap(m);
      m.addSource(SRC, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 14,
      });
      m.addLayer({
        id: "clusters",
        type: "circle",
        source: SRC,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#5f6f36",
          "circle-opacity": 0.9,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 26],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#f5f2e8",
        },
      });
      m.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: SRC,
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"] },
        paint: { "text-color": "#f5f2e8" },
      });
      m.addLayer({
        id: "points",
        type: "circle",
        source: SRC,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["match", ["get", "severity"], "severe", SEVERITY_COLORS.severe, "moderate", SEVERITY_COLORS.moderate, SEVERITY_COLORS.low],
          "circle-opacity": ["case", ["==", ["get", "status"], "resolved"], 0.45, 0.95],
          "circle-radius": ["case", ["boolean", ["get", "selected"], false], 10, 7],
          "circle-stroke-width": ["case", ["boolean", ["get", "selected"], false], 3, 2],
          "circle-stroke-color": "#f5f2e8",
        },
      });
      m.on("click", "clusters", (e) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const id = f?.properties?.cluster_id as number | undefined;
        if (id === undefined) return;
        const src = m.getSource(SRC) as mapboxgl.GeoJSONSource;
        src.getClusterExpansionZoom(id, (err, zoom) => {
          if (err || zoom == null) return;
          m.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: zoom + 0.4, duration: 420 });
        });
      });
      m.on("click", "points", (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.id as string | undefined;
        const r = reportsRef.current.find((x) => x.id === id);
        if (r) onSelectRef.current(r);
      });
      m.on("click", (e) => {
        const hits = m.queryRenderedFeatures(e.point, { layers: ["points", "clusters"] });
        if (!hits.length) onSelectRef.current(null);
      });
      for (const layer of ["points", "clusters"]) {
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }
      setReady(m);
    });
    ro = new ResizeObserver(() => map?.resize());
    ro.observe(container);
    });
    return () => {
      disposed = true;
      window.clearTimeout(raf);
      ro?.disconnect();
      map?.remove();
      mapRef.current = null;
      setReady(null);
    };
  }, []);

  // Sync data
  useEffect(() => {
    const map = ready;
    if (!map || !map.getStyle()) return;
    const src = map.getSource(SRC) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: reports.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
        properties: { id: r.id, severity: r.severity, status: r.status, selected: selected?.id === r.id },
      })),
    });
    if (!didFit.current && reports.length) {
      const bb = bboxOf(reports.map((r) => [r.lng, r.lat]));
      if (bb) map.fitBounds(bb, { padding: { top: 60, left: window.innerWidth > 860 ? 400 : 40, right: 60, bottom: 60 }, maxZoom: 14, duration: 0 });
      didFit.current = true;
    }
  }, [reports, selected, ready]);

  // Fly to selection
  useEffect(() => {
    const map = ready;
    if (!map || !selected) return;
    const mobile = window.innerWidth <= 860;
    map.easeTo({
      center: [selected.lng, selected.lat],
      zoom: Math.max(map.getZoom(), 15),
      offset: mobile ? [0, -120] : [120, 0],
      duration: 520,
      easing: (t) => 1 - Math.pow(1 - t, 4),
    });
  }, [selected, ready]);

  return <div ref={node} className="explorer-map" role="region" aria-label="Map of sidewalk hazards" />;
}

/* ---------------- Detail panel / sheet ---------------- */

function Detail({ report: r, onClose }: { report: HazardReport; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 860px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useSheetDrag(ref, handleRef, onClose, mobile);
  const rank = rankReport(r);

  return (
    <aside ref={ref} className="detail" aria-label={`Report ${r.ref}`}>
      <div ref={handleRef} className="sheet-handle" aria-hidden>
        <i />
      </div>
      <div className="detail-scroll">
        <div className="detail-photo">
          {r.photo ? <img src={r.photo} alt={`Photo of ${HAZARD_SHORT[r.type].toLowerCase()} at ${r.place}`} /> : <span className="nophoto">No photo on this record</span>}
          <button className="detail-close" onClick={onClose} aria-label="Close">
            <Close style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div className="detail-body">
          <div className="detail-meta">
            <span className="badge mono">{r.ref}</span>
            <TypeBadge t={r.type} />
            <SevBadge s={r.severity} />
            <StatusBadge s={r.status} />
            <SourceBadge r={r} />
          </div>
          <h2>{r.place}</h2>
          <p>{r.description}</p>
          <Lifecycle status={r.status} />
          <dl className="kv">
            <dt>Reported</dt>
            <dd>
              {shortDate(r.createdAt)} · {relativeDays(r.createdAt)}
            </dd>
            <dt>Neighborhood</dt>
            <dd>{r.neighborhood}</dd>
            <dt>Priority</dt>
            <dd>
              {rank.score}/100 · {priorityLabel(rank.score)}
            </dd>
            {r.ticket311 && (
              <>
                <dt>311 ticket</dt>
                <dd className="mono">{r.ticket311}</dd>
              </>
            )}
            {r.ai && (
              <>
                <dt>AI read</dt>
                <dd>
                  {HAZARD_SHORT[r.ai.label]} · {Math.round(r.ai.confidence * 100)}% · <span className="mono">{r.ai.model}</span>
                </dd>
              </>
            )}
            {r.resolvedAt && (
              <>
                <dt>Resolved</dt>
                <dd>
                  {shortDate(r.resolvedAt)} by {r.resolvedBy}
                  {r.verified ? " · verified" : ""}
                </dd>
              </>
            )}
          </dl>
          {r.status === "resolved" && (r.photo || r.afterPhoto) && (
            <div className="before-after">
              <figure>
                {r.photo ? <img src={r.photo} alt="Before" /> : <div className="skeleton" style={{ aspectRatio: "4/3" }} />}
                <figcaption>Before</figcaption>
              </figure>
              <figure>
                {r.afterPhoto ? <img src={r.afterPhoto} alt="After" /> : <div className="skeleton" style={{ aspectRatio: "4/3" }} />}
                <figcaption>After {r.verified ? "· verified" : ""}</figcaption>
              </figure>
            </div>
          )}
          <div className="btn-row">
            <button
              className="btn btn--sm"
              onClick={() => {
                const url = `${location.origin}/map?r=${r.ref}`;
                navigator.clipboard?.writeText(url).then(() => import("../components/Toast").then((m) => m.toast("Link copied", "ok")));
              }}
            >
              Copy link
            </button>
            <a className="btn btn--sm btn--ghost" href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}&travelmode=walking`} rel="noopener">
              Directions
            </a>
          </div>
          <p className="small muted" style={{ marginTop: ".5rem" }}>
            See something wrong on this record?{" "}
            <Link to="/app" viewTransition>
              Report an update from the app.
            </Link>
          </p>
        </div>
      </div>
    </aside>
  );
}

/* ---------------- Fallback ---------------- */

function MapFallback({ reports, onSelect, tokenMissing }: { reports: HazardReport[]; onSelect: (r: HazardReport) => void; tokenMissing: boolean }) {
  return (
    <div className="map-fallback">
      <div className="wrap" style={{ paddingTop: "calc(4.5rem + 30dvh)" }}>
        <div className="notice notice--warn">
          <div>
            <b>The map tiles are unavailable right now.</b>{" "}
            {tokenMissing ? (
              <>
                Add <span className="mono">VITE_MAPBOX_TOKEN</span> to <span className="mono">.env.local</span> and restart.
              </>
            ) : (
              <>Could be the network or the token. The reports are still here as a list.</>
            )}
          </div>
        </div>
        <ul className="map-fallback-list">
          {reports.map((r) => (
            <li key={r.id}>
              <i className={`sev-dot sev-dot--${r.severity}`} />
              <button className="btn btn--ghost btn--sm" style={{ justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left" }} onClick={() => onSelect(r)}>
                <span className="mono">{r.ref}</span>&nbsp;{r.place} · {HAZARD_SHORT[r.type]} · {STATUS_LABELS[r.status]}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
