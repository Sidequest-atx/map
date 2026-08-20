import { PLACES, type Place } from "../data/places";
import { daysBetween } from "../lib/format";
import { haversine } from "../lib/geo";
import type { HazardReport, HazardType, Severity } from "../types";

/**
 * Priority ranking.
 *
 * Austin's Sidewalk Program cannot fix 40,000 defects at once. Ranking tells
 * them which 2% are most likely to put someone in the ER. The score is
 * deliberately transparent (every factor is shown in the portal) so a city
 * staffer can disagree with it. It is a suggestion, never the verdict.
 *
 *   score = trip risk (type × severity)        up to 55
 *         + who walks here (nearby anchors)     up to 30
 *         + how long it has waited              up to 15
 */
export interface RankBreakdown {
  score: number; // 0–100
  risk: number;
  exposure: number;
  age: number;
  anchors: { place: Place; distanceM: number }[];
}

const TYPE_WEIGHT: Record<HazardType, number> = {
  lifted: 1.0, // the grandmother class: a lip you catch a toe on
  "missing-ramp": 0.95, // exclusion for wheelchairs and walkers
  "missing-sidewalk": 0.8,
  crack: 0.65,
  debris: 0.5,
  vegetation: 0.45, // usually a detour into the road; cheap to fix
  other: 0.4,
};

const SEV_WEIGHT: Record<Severity, number> = { low: 0.4, moderate: 0.7, severe: 1.0 };
const KIND_WEIGHT = { senior: 1.0, school: 0.85, clinic: 0.8, transit: 0.7 } as const;
const ANCHOR_RADIUS_M = 600;

export function rankReport(r: Pick<HazardReport, "type" | "severity" | "lng" | "lat" | "createdAt" | "status">): RankBreakdown {
  const risk = 55 * TYPE_WEIGHT[r.type] * SEV_WEIGHT[r.severity];

  const anchors = PLACES.map((place) => ({ place, distanceM: Math.round(haversine([r.lng, r.lat], place.lngLat)) }))
    .filter((a) => a.distanceM <= ANCHOR_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 3);
  let exposure = 0;
  for (const a of anchors) {
    const falloff = 1 - a.distanceM / ANCHOR_RADIUS_M;
    exposure += 30 * KIND_WEIGHT[a.place.kind] * falloff;
  }
  exposure = Math.min(30, exposure);

  const days = r.status === "resolved" ? 0 : daysBetween(r.createdAt);
  const age = Math.min(15, (days / 90) * 15);

  const score = Math.round(Math.min(100, risk + exposure + age));
  return { score, risk: Math.round(risk), exposure: Math.round(exposure), age: Math.round(age), anchors };
}

export function rankAll(reports: HazardReport[]): HazardReport[] {
  return reports.map((r) => ({ ...r, rank: rankReport(r).score }));
}

export function priorityLabel(score: number): "Urgent" | "High" | "Standard" | "Low" {
  if (score >= 75) return "Urgent";
  if (score >= 55) return "High";
  if (score >= 35) return "Standard";
  return "Low";
}
