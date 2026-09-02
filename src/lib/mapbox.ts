// mapbox-gl's stylesheet is imported in styles/index.css (layer "vendor"),
// so the site's overrides keep beating it under cascade layers.
import mapboxgl from "mapbox-gl";
import { useSyncExternalStore } from "react";
import type { Severity } from "../types";
import { supabase } from "./supabase";
type PaintProp = Parameters<mapboxgl.Map["setPaintProperty"]>[1];

/**
 * The Mapbox public token resolves at runtime: VITE_MAPBOX_TOKEN when a build
 * carries one (local dev), else the sq_config row — the same source the
 * iPhone app uses — so a hosted deploy needs no build-time secret and a token
 * rotation reaches every surface without a redeploy.
 */
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

let token: string | null = MAPBOX_TOKEN || null;
/** True only once sq_config answered and genuinely has no token row. */
let tokenMissing = false;
let fetchStarted = false;
const tokenListeners = new Set<() => void>();

if (token) mapboxgl.accessToken = token;

function fetchTokenOnce() {
  if (fetchStarted || token) return;
  fetchStarted = true;
  void supabase()
    .from("sq_config")
    .select("value")
    .eq("key", "mapbox_public_token")
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        // Offline, or sq_config not bootstrapped yet: show the fallback (its
        // message names the sq_config row) but allow a retry on a later visit.
        fetchStarted = false;
        tokenMissing = true;
      } else if (data?.value) {
        token = data.value;
        tokenMissing = false;
        mapboxgl.accessToken = token;
      } else {
        tokenMissing = true;
      }
      tokenSnapshot = { token, missing: tokenMissing };
      tokenListeners.forEach((l) => l());
    });
}

let tokenSnapshot = { token, missing: tokenMissing };

/** Resolved token + whether the config table said there is none. */
export function useMapboxToken(): { token: string | null; missing: boolean } {
  fetchTokenOnce();
  return useSyncExternalStore(
    (l) => {
      tokenListeners.add(l);
      return () => tokenListeners.delete(l);
    },
    () => tokenSnapshot,
    () => tokenSnapshot,
  );
}

/** Northwest Austin (Westwood High area). */
export const NW_AUSTIN: [number, number] = [-97.792, 30.446];

/** Light basemap; tinted at runtime to sit inside the olive/beige palette. */
export const MAP_STYLE = "mapbox://styles/mapbox/light-v11";

/**
 * Marker colours are sRGB fallbacks for the oklch tokens in tokens.css
 * (Mapbox paint expressions need hex). Keep in sync with --sev-*.
 */
export const SEVERITY_COLORS: Record<Severity, string> = {
  low: "#6b7d3c",
  moderate: "#c28a2d",
  severe: "#a8452a",
};

export const OLIVE_HEX = "#5f6f36";
export const OLIVE_DEEP_HEX = "#37412a";

/**
 * Apply the olive/beige palette to the light basemap. Safe to call repeatedly.
 * Colours are keyed by intent; the paint property is chosen from each layer's
 * actual type, so this survives Mapbox renaming/retyping style layers (the
 * light-v11 roads consolidated into `road-simple`, for example).
 */
const TINTS: [string, string][] = [
  ["land", "#ece6d6"],
  ["water", "#cbd3cf"],
  ["landuse", "#e1dfc8"],
  ["national-park", "#dbe0c4"],
  ["building", "#e3ddcb"],
  ["road-simple", "#fbf8ef"],
  // legacy names, harmless if absent
  ["road-primary", "#fbf8ef"],
  ["road-secondary-tertiary", "#fbf8ef"],
  ["road-street", "#f7f3e8"],
];

const COLOR_PROP: Record<string, PaintProp> = {
  background: "background-color",
  fill: "fill-color",
  line: "line-color",
  "fill-extrusion": "fill-extrusion-color",
};

export function tintMap(map: mapboxgl.Map) {
  for (const [id, value] of TINTS) {
    const layer = map.getLayer(id);
    if (!layer) continue;
    const prop = COLOR_PROP[(layer as { type?: string }).type ?? ""];
    if (!prop) continue;
    try {
      map.setPaintProperty(id, prop, value);
    } catch {
      // style version differs; leave the default
    }
  }
}

/** Static preview image URL for the mission page mini-map. */
export function staticMapUrl(
  points: { lng: number; lat: number; severity: Severity }[],
  width = 1200,
  height = 600,
): string | null {
  if (!token) return null;
  const pins = points
    .slice(0, 60)
    .map((p) => `pin-s+${SEVERITY_COLORS[p.severity].slice(1)}(${p.lng.toFixed(4)},${p.lat.toFixed(4)})`)
    .join(",");
  const overlay = pins ? `${pins}/` : "";
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${overlay}${NW_AUSTIN[0]},${NW_AUSTIN[1]},11.6,0/${width}x${height}@2x?access_token=${token}&attribution=false&logo=false`;
}

export { mapboxgl };
