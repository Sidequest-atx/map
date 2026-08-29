import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { JsonDoc, LineFile } from "../data/fs";
import { haversine } from "../lib/geo";
import type { TrailPoint } from "../types";

/**
 * Glasses Walk trail.
 *
 * Ray-Ban Meta glasses have a camera and a shutter button but no GPS. The
 * phone in your pocket does. While a walk is active the OS wakes this task
 * with location batches (even with the screen off or the app closed) and we
 * append breadcrumbs to a JSONL file. After the walk, each glasses photo is
 * placed on the trail by its timestamp (see match.ts). This is the same idea
 * as Cascade's glasses companion: the phone is the sensor hub, the glasses
 * are eyes and a button.
 */
export const WALK_TASK = "sidequest-walk-trail";

export interface ActiveWalk {
  id: string;
  walker: string;
  startedAt: string;
  /** true when background updates were granted; false = foreground only */
  background: boolean;
}

const activeDoc = new JsonDoc<ActiveWalk | null>("walk-active.json", () => null);
const trailFile = new LineFile("walk-trail.jsonl");

let lastPoint: TrailPoint | null = null;

function shouldKeep(p: TrailPoint): boolean {
  if (!lastPoint) return true;
  const dt = p.t - lastPoint.t;
  const dd = haversine([lastPoint.lng, lastPoint.lat], [p.lng, p.lat]);
  // Keep a point when we moved ≥2 m or 5 s passed; drop jitter while standing still.
  return dd >= 2 || dt >= 5000;
}

export function appendPoint(p: TrailPoint): boolean {
  if (!shouldKeep(p)) return false;
  trailFile.append(JSON.stringify(p));
  lastPoint = p;
  return true;
}

export function appendLocations(locs: Location.LocationObject[]): number {
  let kept = 0;
  for (const loc of locs) {
    const p: TrailPoint = { lng: loc.coords.longitude, lat: loc.coords.latitude, t: loc.timestamp, accuracyM: loc.coords.accuracy ?? null };
    if (appendPoint(p)) kept += 1;
  }
  return kept;
}

// Must be defined at module scope so the task exists when iOS relaunches the app headlessly.
TaskManager.defineTask(WALK_TASK, async ({ data, error }: { data?: { locations?: Location.LocationObject[] }; error?: unknown }) => {
  if (error) {
    console.warn("[walk] task error", error);
    return;
  }
  const locs = data?.locations ?? [];
  if (!locs.length) return;
  if (!activeDoc.read()) return; // a stale registration after a crash: ignore
  appendLocations(locs);
});

export function getActiveWalk(): ActiveWalk | null {
  return activeDoc.read();
}

export function readTrail(): TrailPoint[] {
  const pts: TrailPoint[] = [];
  for (const line of trailFile.readLines()) {
    try {
      const p = JSON.parse(line) as TrailPoint;
      if (typeof p.lng === "number" && typeof p.lat === "number" && typeof p.t === "number") pts.push(p);
    } catch {
      /* skip a torn line */
    }
  }
  pts.sort((a, b) => a.t - b.t);
  return pts;
}

export async function startWalk(walker: string, id: string): Promise<{ ok: true; walk: ActiveWalk } | { ok: false; reason: string }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { ok: false, reason: "Location permission is required to record the trail." };
  let background = false;
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    background = bg.granted;
  } catch {
    background = false;
  }
  trailFile.clear();
  lastPoint = null;
  const walk: ActiveWalk = { id, walker, startedAt: new Date().toISOString(), background };
  activeDoc.write(walk);
  if (background) {
    try {
      const already = await Location.hasStartedLocationUpdatesAsync(WALK_TASK);
      if (already) await Location.stopLocationUpdatesAsync(WALK_TASK);
      await Location.startLocationUpdatesAsync(WALK_TASK, {
        accuracy: Location.Accuracy.Highest,
        distanceInterval: 3,
        timeInterval: 2000,
        deferredUpdatesInterval: 0,
        deferredUpdatesDistance: 0,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Fitness,
        foregroundService: {
          notificationTitle: "Glasses Walk in progress",
          notificationBody: "SideQuest is recording your GPS trail so glasses photos can be placed on the map.",
          notificationColor: "#37412a",
        },
      });
    } catch (e) {
      console.warn("[walk] background start failed, falling back to foreground", e);
      walk.background = false;
      activeDoc.write(walk);
    }
  }
  return { ok: true, walk };
}

export async function stopWalk(): Promise<{ walk: ActiveWalk | null; trail: TrailPoint[] }> {
  const walk = activeDoc.read();
  try {
    if (await Location.hasStartedLocationUpdatesAsync(WALK_TASK)) await Location.stopLocationUpdatesAsync(WALK_TASK);
  } catch {
    /* not running */
  }
  const trail = readTrail();
  return { walk, trail };
}

/** Called after the walk's photos are imported (or the walk is discarded). */
export function clearWalk(): void {
  activeDoc.write(null);
  trailFile.clear();
  lastPoint = null;
}

/** If the app was killed mid-walk, make sure a zombie task is not left running. */
export async function reconcileOnLaunch(): Promise<void> {
  const walk = activeDoc.read();
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(WALK_TASK);
    if (running && !walk) await Location.stopLocationUpdatesAsync(WALK_TASK);
  } catch {
    /* ignore */
  }
}
