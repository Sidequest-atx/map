import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Severity } from "../types";
type PaintProp = Parameters<mapboxgl.Map["setPaintProperty"]>[1];

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
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

/** Apply subtle palette tints to the light basemap. Safe to call repeatedly. */
export function tintMap(map: mapboxgl.Map) {
  const tints: [string, PaintProp, string][] = [
    ["land", "background-color", "#ece6d6"],
    ["water", "fill-color", "#cbd3cf"],
    ["landuse", "fill-color", "#e1dfc8"],
    ["national-park", "fill-color", "#dbe0c4"],
    ["road-primary", "line-color", "#fbf8ef"],
    ["road-secondary-tertiary", "line-color", "#fbf8ef"],
    ["road-street", "line-color", "#f7f3e8"],
    ["building", "fill-color", "#e3ddcb"],
  ];
  for (const [layer, prop, value] of tints) {
    if (map.getLayer(layer)) {
      try {
        map.setPaintProperty(layer, prop, value);
      } catch {
        // layer exists but property differs in this style version
      }
    }
  }
}

/** Static preview image URL for the mission page mini-map. */
export function staticMapUrl(
  points: { lng: number; lat: number; severity: Severity }[],
  width = 1200,
  height = 600,
): string | null {
  if (!MAPBOX_TOKEN) return null;
  const pins = points
    .slice(0, 60)
    .map((p) => `pin-s+${SEVERITY_COLORS[p.severity].slice(1)}(${p.lng.toFixed(4)},${p.lat.toFixed(4)})`)
    .join(",");
  const overlay = pins ? `${pins}/` : "";
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${overlay}${NW_AUSTIN[0]},${NW_AUSTIN[1]},11.6,0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
}

export { mapboxgl };
