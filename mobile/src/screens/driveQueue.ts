import { JsonDoc } from "../data/fs";
import type { LngLat } from "../lib/geo";
import type { HazardType, Severity } from "../types";
import type { ClassificationResult } from "../ai/classify";

/** A Quest Drive frame after capture. Photos are on disk; this is the metadata. */
export interface DriveFrame {
  id: string;
  photoUri: string;
  thumbUri: string;
  lngLat: LngLat;
  accuracyM: number | null;
  headingDeg: number | null;
  at: string;
  ai?: ClassificationResult | null;
  type?: HazardType;
  severity?: Severity;
  accepted?: boolean;
  dupOf?: string;
  dupDist?: number;
}

export interface DriveQueue {
  frames: DriveFrame[];
  trail: LngLat[];
  startedAt: string;
  frameCount: number;
}

const doc = new JsonDoc<DriveQueue | null>("drive-queue.json", () => null);

export function loadDriveQueue(): DriveQueue | null {
  const q = doc.read();
  return q && q.frames.length ? q : null;
}
export function saveDriveQueue(q: DriveQueue | null): void {
  doc.write(q);
}
export function hasDriveQueue(): boolean {
  return Boolean(loadDriveQueue());
}
