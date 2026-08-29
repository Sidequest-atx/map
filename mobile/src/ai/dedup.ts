import { haversine, type LngLat } from "../lib/geo";
import type { HazardReport, HazardType } from "../types";

/**
 * Duplicate detection. Same rules as the web app: distance + hazard type,
 * presented as a suggestion the reporter confirms, never an auto-merge.
 */
export interface DuplicateMatch {
  report: HazardReport;
  distanceM: number;
  /** 0–1: closer and same type scores higher */
  score: number;
}

export const DEDUP_RADIUS_M = 15;
const NEAR_RADIUS_M = 40;

export function findDuplicates(
  candidate: { lngLat: LngLat; type: HazardType },
  existing: HazardReport[],
  radiusM = NEAR_RADIUS_M,
): DuplicateMatch[] {
  const out: DuplicateMatch[] = [];
  for (const r of existing) {
    if (r.status === "resolved" || r.duplicateOf) continue;
    const d = haversine(candidate.lngLat, [r.lng, r.lat]);
    if (d > radiusM) continue;
    const sameType = r.type === candidate.type;
    const related =
      sameType ||
      (candidate.type === "crack" && r.type === "lifted") ||
      (candidate.type === "lifted" && r.type === "crack");
    if (!related) continue;
    const proximity = 1 - d / radiusM;
    const score = Math.min(1, proximity * (sameType ? 1 : 0.7) + (d <= DEDUP_RADIUS_M ? 0.2 : 0));
    out.push({ report: r, distanceM: Math.round(d), score: Math.round(score * 100) / 100 });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Strong match: the reporter should be asked before a new pin is created. */
export function likelyDuplicate(matches: DuplicateMatch[]): DuplicateMatch | null {
  const top = matches[0];
  return top && top.distanceM <= DEDUP_RADIUS_M ? top : null;
}

/**
 * Within one batch (a drive or a walk), frames captured seconds apart can show
 * the same defect. Collapse those before the reporter reviews the list.
 */
export function collapseBatch<T extends { lngLat: LngLat; type: HazardType }>(
  frames: T[],
  radiusM = DEDUP_RADIUS_M,
): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const f of frames) {
    const dup = kept.find((k) => k.type === f.type && haversine(k.lngLat, f.lngLat) <= radiusM);
    (dup ? dropped : kept).push(f);
  }
  return { kept, dropped };
}
