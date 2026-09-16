import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";
import { useMotionValueEvent, useReducedMotion } from "motion/react";
import { useReports } from "../data/store";
import { MAP_STYLE, mapboxgl, SEVERITY_COLORS, tintMap } from "../lib/mapbox";

/**
 * The finale's camera, second half of the 3D handoff: the map opens exactly
 * where the risen 3D camera left off — close over the neighborhood, north-up,
 * flat — and pulls BACK to all of Austin as the reader keeps scrolling, so
 * the scale of the problem lands with the dots. Non-interactive (the page
 * scroll owns the gesture); the overlay hands off to /map for the real thing.
 * Under reduced motion the camera just sits at the wide resting view.
 */
const CITY: [number, number] = [-97.743, 30.29]; // Austin, wide — lake, grid, I-35
const CITY_ZOOM = 9.6;
/** The real Texas Capitol: the map opens exactly where the 3D walk ended. */
const CAPITOL_LL: [number, number] = [-97.7404, 30.2747];
const CAPITOL_ZOOM = 13.7;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export default function DiveMap({ progress, onFail }: { progress: MotionValue<number>; onFail: () => void }) {
  const reduced = useReducedMotion();
  const reports = useReports();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const readyRef = useRef(false);
  const frame = useRef<number | null>(null);
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  const applyCamera = (p: number) => {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    // Hold the close, north-up Capitol framing while the 3D canvas fades
    // over the map (p ≲ 0.55), then pull back until all of Austin — the
    // lake, the grid, the highways — sits under the count.
    const t = easeInOut(Math.min(Math.max((p - 0.52) / 0.4, 0), 1));
    m.jumpTo({
      center: [lerp(CAPITOL_LL[0], CITY[0], t), lerp(CAPITOL_LL[1], CITY[1], t)],
      zoom: lerp(CAPITOL_ZOOM, CITY_ZOOM, t),
      pitch: 0,
      bearing: 0,
    });
  };

  useMotionValueEvent(progress, "change", (p) => {
    if (reduced) return;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      applyCamera(p);
    });
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    let disposed = false;
    let map: mapboxgl.Map | null = null;
    // Same StrictMode deferral as the explorer: never create a map in a
    // container that is about to be torn down in the same task.
    const raf = window.setTimeout(() => {
      if (disposed) return;
      try {
        map = new mapboxgl.Map({
          container,
          style: MAP_STYLE,
          center: reduced ? CITY : CAPITOL_LL,
          zoom: reduced ? CITY_ZOOM : CAPITOL_ZOOM,
          bearing: 0,
          interactive: false,
          attributionControl: true,
        });
      } catch {
        onFailRef.current();
        return;
      }
      mapRef.current = map;
      const m = map;
      m.on("error", (e) => {
        const status = (e as unknown as { error?: { status?: number } }).error?.status;
        if (status === 401 || status === 403) onFailRef.current();
      });
      m.on("load", () => {
        if (disposed) return;
        const kick = () => {
          if (disposed) return;
          m.resize();
          m.triggerRepaint();
          m.easeTo({ zoom: m.getZoom() + 0.001, duration: 1 });
        };
        kick();
        requestAnimationFrame(kick);
        m.once("idle", kick);
        tintMap(m);
        m.addSource("dive-reports", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "dive-dots",
          type: "circle",
          source: "dive-reports",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 13, 6],
            "circle-color": ["match", ["get", "severity"], "severe", SEVERITY_COLORS.severe, "moderate", SEVERITY_COLORS.moderate, SEVERITY_COLORS.low],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#f5f2e8",
            "circle-opacity": 0.92,
          },
        });
        readyRef.current = true;
        applyCamera(progress.get());
      });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(raf);
      readyRef.current = false;
      mapRef.current = null;
      if (frame.current != null) cancelAnimationFrame(frame.current);
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    const src = m.getSource("dive-reports") as mapboxgl.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: reports
        .filter((r) => !r.duplicateOf)
        .map((r) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
          properties: { severity: r.severity },
        })),
    });
  }, [reports]);

  // Decorative and non-interactive: inert keeps Mapbox's attribution links
  // out of the tab order while the layer is hidden from screen readers.
  return <div ref={containerRef} className="absolute inset-0" aria-hidden inert />;
}
