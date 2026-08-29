import { haversine, type LngLat } from "../lib/geo";

/**
 * Priority anchors used by ai/rank.ts. Hazards near these get a higher
 * priority score, mirroring the City of Austin Sidewalk Program's own
 * prioritization inputs (schools, transit, senior and disability services).
 * Coordinates are approximate and only used for a proximity weight.
 * Keep in sync with ../src/data/places.ts in the web app.
 */
export type PlaceKind = "school" | "transit" | "senior" | "clinic";

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  lngLat: LngLat;
  neighborhood: string;
}

export const PLACES: Place[] = [
  { id: "westwood-hs", name: "Westwood High School", kind: "school", lngLat: [-97.8007, 30.4556], neighborhood: "Westwood" },
  { id: "canyon-vista-ms", name: "Canyon Vista Middle School", kind: "school", lngLat: [-97.7893, 30.4337], neighborhood: "Jollyville" },
  { id: "grisham-ms", name: "Grisham Middle School", kind: "school", lngLat: [-97.7932, 30.4609], neighborhood: "Anderson Mill" },
  { id: "anderson-mill-es", name: "Anderson Mill Elementary", kind: "school", lngLat: [-97.8065, 30.4523], neighborhood: "Anderson Mill" },
  { id: "spicewood-es", name: "Spicewood Elementary", kind: "school", lngLat: [-97.7912, 30.4421], neighborhood: "Jollyville" },
  { id: "laurel-mountain-es", name: "Laurel Mountain Elementary", kind: "school", lngLat: [-97.7777, 30.4478], neighborhood: "Great Hills" },
  { id: "purple-sage-es", name: "Purple Sage Elementary", kind: "school", lngLat: [-97.8110, 30.4640], neighborhood: "Anderson Mill" },
  { id: "pavilion-pnr", name: "Pavilion Park & Ride", kind: "transit", lngLat: [-97.7868, 30.4456], neighborhood: "Jollyville" },
  { id: "lakeline-station", name: "Lakeline Station", kind: "transit", lngLat: [-97.8227, 30.4748], neighborhood: "Lakeline" },
  { id: "anderson-mill-183", name: "Anderson Mill Rd / US-183 stops", kind: "transit", lngLat: [-97.7995, 30.4498], neighborhood: "Anderson Mill" },
  { id: "spicewood-springs-senior", name: "Senior living, Spicewood Springs Rd", kind: "senior", lngLat: [-97.7840, 30.4395], neighborhood: "Jollyville" },
  { id: "great-hills-senior", name: "Senior living, Great Hills Trl", kind: "senior", lngLat: [-97.7710, 30.4235], neighborhood: "Great Hills" },
  { id: "anderson-mill-clinic", name: "Clinic, Anderson Mill Rd", kind: "clinic", lngLat: [-97.8039, 30.4471], neighborhood: "Anderson Mill" },
];

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  school: "School",
  transit: "Transit",
  senior: "Senior living",
  clinic: "Clinic",
};

/** Default map centre: NW Austin study area. */
export const NW_AUSTIN: LngLat = [-97.7985, 30.4505];

export function nearestPlace(c: LngLat): { place: Place; distanceM: number } {
  let best = PLACES[0];
  let bd = Infinity;
  for (const p of PLACES) {
    const d = haversine(c, p.lngLat);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return { place: best, distanceM: bd };
}

/** Nearest anchor's neighborhood when we are inside the study area; otherwise "Austin". */
export function nearestNeighborhood(c: LngLat): string {
  const { place, distanceM } = nearestPlace(c);
  return distanceM < 3000 ? place.neighborhood : "Austin";
}
