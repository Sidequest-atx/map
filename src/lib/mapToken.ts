// Everything map-related that does NOT need mapbox-gl itself: the token, the
// palette constants and the static-image URL. Kept apart from ./mapbox so the
// landing page can use these without pulling the ~490KB (gzipped) GL library
// into its first load; the live map components import ./mapbox instead.
import { useSyncExternalStore } from "react";
import type { Severity } from "../types";
import { supabase } from "./supabase";

/**
 * The Mapbox public token resolves at runtime: VITE_MAPBOX_TOKEN when a build
 * carries one (local dev), else the sq_config row — the same source the
 * iPhone app uses — so a hosted deploy needs no build-time secret and a token
 * rotation reaches every surface without a redeploy.
 */
/* Strip BOM + whitespace: an env var pasted through PowerShell 5.1 can carry
   a leading U+FEFF, which URL-encodes into the token (%EF%BB%BF...) and makes
   Mapbox reject every request. Sanitize here so no entry path can leak it. */
const cleanToken = (t: string | null | undefined): string | null => {
  const v = (t ?? "").replace(/^﻿/, "").trim();
  return v || null;
};

export const MAPBOX_TOKEN = cleanToken(import.meta.env.VITE_MAPBOX_TOKEN);

let token: string | null = MAPBOX_TOKEN;
/** True only once sq_config answered and genuinely has no token row. */
let tokenMissing = false;
let fetchStarted = false;
const tokenListeners = new Set<() => void>();

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
      } else if (cleanToken(data?.value)) {
        token = cleanToken(data?.value);
        tokenMissing = false;
      } else {
        tokenMissing = true;
      }
      tokenSnapshot = { token, missing: tokenMissing };
      tokenListeners.forEach((l) => l());
    });
}

let tokenSnapshot = { token, missing: tokenMissing };

/** The token as resolved so far (null until env or sq_config supplies one). */
export function getMapboxToken(): string | null {
  return token;
}

/** Subscribe to token resolution; returns the unsubscribe. */
export function onMapboxToken(l: () => void): () => void {
  tokenListeners.add(l);
  return () => tokenListeners.delete(l);
}

/** Resolved token + whether the config table said there is none. */
export function useMapboxToken(): { token: string | null; missing: boolean } {
  fetchTokenOnce();
  return useSyncExternalStore(
    onMapboxToken,
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
