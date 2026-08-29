import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { nearestNeighborhood, nearestPlace } from "../data/places";
import type { LngLat } from "./geo";

/**
 * Live GPS for capture. The rule that keeps pins honest: the coordinates on a
 * report are the best fix the phone had *at the moment the shutter fired*,
 * never a later or earlier one. `snapshot()` returns exactly that.
 */
export interface LiveFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  altitudeM: number | null;
  speedMps: number | null;
  /** epoch ms of the fix (OS timestamp) */
  at: number;
}

export type FixStatus = "idle" | "requesting" | "denied" | "searching" | "locked";

const RECENT_MS = 12_000;

export interface LiveGps {
  fix: LiveFix | null;
  /** best fix within the last 12 s (lowest accuracy radius) */
  best: LiveFix | null;
  headingDeg: number | null;
  status: FixStatus;
  /** true when the OS is handing us coarse ~1 km fixes (Precise Location off) */
  reducedAccuracy: boolean;
  error: string | null;
  snapshot: () => { fix: LiveFix; headingDeg: number | null } | null;
  retry: () => void;
}

export function useLiveGps(active: boolean): LiveGps {
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [best, setBest] = useState<LiveFix | null>(null);
  const [headingDeg, setHeading] = useState<number | null>(null);
  const [status, setStatus] = useState<FixStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [nonce, setNonce] = useState(0);
  const fixRef = useRef<LiveFix | null>(null);
  const bestRef = useRef<LiveFix | null>(null);
  const headingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let posSub: Location.LocationSubscription | null = null;
    let headSub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      setStatus("requesting");
      setError(null);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!perm.granted) {
        setStatus("denied");
        setError("Location permission is off. Enable it in Settings so pins land on the right panel.");
        return;
      }
      setStatus("searching");
      try {
        posSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: true },
          (loc) => {
            const f: LiveFix = {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              accuracyM: loc.coords.accuracy ?? null,
              altitudeM: loc.coords.altitude ?? null,
              speedMps: loc.coords.speed ?? null,
              at: loc.timestamp,
            };
            fixRef.current = f;
            setFix(f);
            const b = bestRef.current;
            const bStale = !b || f.at - b.at > RECENT_MS;
            if (bStale || (f.accuracyM ?? Infinity) <= (b.accuracyM ?? Infinity)) {
              bestRef.current = f;
              setBest(f);
            }
            setStatus("locked");
            setReduced((f.accuracyM ?? 0) > 500);
          },
          (reason) => {
            setError(String(reason));
          },
        );
        headSub = await Location.watchHeadingAsync((h) => {
          const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          headingRef.current = deg;
          setHeading(deg);
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start GPS.");
        setStatus("denied");
      }
    })();

    return () => {
      cancelled = true;
      posSub?.remove();
      headSub?.remove();
    };
  }, [active, nonce]);

  const snapshot = useCallback(() => {
    const now = Date.now();
    const b = bestRef.current;
    const f = fixRef.current;
    const pick = b && now - b.at <= RECENT_MS ? b : f;
    if (!pick) return null;
    return { fix: pick, headingDeg: headingRef.current };
  }, []);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { fix, best, headingDeg, status, reducedAccuracy: reduced, error, snapshot, retry };
}

/** One-shot fix for flows that do not keep the watcher open (e.g. a picked photo without EXIF). */
export async function getOneFix(timeoutMs = 8000): Promise<LiveFix | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  try {
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!loc) return null;
    return {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracyM: loc.coords.accuracy ?? null,
      altitudeM: loc.coords.altitude ?? null,
      speedMps: loc.coords.speed ?? null,
      at: loc.timestamp,
    };
  } catch {
    return null;
  }
}

export interface PlaceGuess {
  place: string;
  neighborhood: string;
  /** street-level detail, when the geocoder had it */
  street?: string;
}

/**
 * "1200 block of Mellow Meadow Dr" from a reverse geocode; falls back to the
 * nearest anchor in the study area, then to plain coordinates. Never throws.
 */
export async function guessPlace(c: LngLat): Promise<PlaceGuess> {
  const near = nearestPlace(c);
  const fallbackNeighborhood = nearestNeighborhood(c);
  try {
    const res = await Promise.race([
      Location.reverseGeocodeAsync({ latitude: c[1], longitude: c[0] }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    const a = res?.[0];
    if (a) {
      const street = a.street ?? undefined;
      const num = a.streetNumber ? parseInt(a.streetNumber, 10) : NaN;
      let place: string;
      if (street && !isNaN(num)) place = `${Math.floor(num / 100) * 100} block of ${street}`;
      else if (street) place = street;
      else if (near.distanceM < 500) place = `Near ${near.place.name}`;
      else place = a.name ?? `${c[1].toFixed(4)}, ${c[0].toFixed(4)}`;
      if (near.distanceM < 350) place += ` (near ${near.place.name})`;
      const neighborhood = a.district ?? a.subregion ?? (near.distanceM < 3000 ? fallbackNeighborhood : a.city ?? fallbackNeighborhood);
      return { place, neighborhood: neighborhood || fallbackNeighborhood, street };
    }
  } catch {
    /* offline or geocoder busy */
  }
  return {
    place: near.distanceM < 500 ? `Near ${near.place.name}` : `${fallbackNeighborhood}, ${c[1].toFixed(4)}, ${c[0].toFixed(4)}`,
    neighborhood: fallbackNeighborhood,
  };
}
