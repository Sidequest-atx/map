// mapbox-gl's stylesheet is imported in styles/index.css (layer "vendor"),
// so the site's overrides keep beating it under cascade layers.
// The GL half of the map code. Token, palette and static-image URL live in
// ./mapToken (no mapbox-gl import) and are re-exported here, so pages that
// draw a live map keep one import site.
import mapboxgl from "mapbox-gl";
import { getMapboxToken, onMapboxToken } from "./mapToken";
type PaintProp = Parameters<mapboxgl.Map["setPaintProperty"]>[1];

export * from "./mapToken";

// Hand the token to mapbox-gl now if it's known, and whenever sq_config answers.
const applyToken = () => {
  const t = getMapboxToken();
  if (t) mapboxgl.accessToken = t;
};
applyToken();
onMapboxToken(applyToken);

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

export { mapboxgl };
