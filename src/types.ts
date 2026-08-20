export type HazardType =
  | "crack"
  | "lifted"
  | "vegetation"
  | "missing-ramp"
  | "missing-sidewalk"
  | "debris"
  | "other";

export type Severity = "low" | "moderate" | "severe";

export type ReportStatus = "open" | "submitted-311" | "scheduled" | "resolved";

export type ReportSource = "walk" | "drive";

export type Role = "public" | "reporter" | "drive-captain" | "moderator";

export interface AiSuggestion {
  label: HazardType;
  severity: Severity;
  confidence: number;
  model: string;
}

export interface HazardReport {
  id: string;
  /** Short human id, e.g. SQ-0142 */
  ref: string;
  type: HazardType;
  severity: Severity;
  status: ReportStatus;
  source: ReportSource;
  /** WGS84 */
  lng: number;
  lat: number;
  /** Human-readable location, e.g. "Mellow Meadow Dr near Westwood High" */
  place: string;
  neighborhood: string;
  description: string;
  /** Downscaled JPEG data URL captured in the report flow (optional for seeds) */
  photo?: string;
  /** AI classification metadata, when the classifier ran */
  ai?: AiSuggestion;
  reporter?: string;
  /** Quest Drive session this report was captured in */
  driveId?: string;
  /** Austin 311 service request number once submitted */
  ticket311?: string;
  /** Close-out proof */
  afterPhoto?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  /** "Verified" means the after-photo was checked (AI + human) */
  verified?: boolean;
  /** Set when this report was judged a duplicate of an earlier one */
  duplicateOf?: string;
  /** Priority score 0–100 from ai/rank.ts */
  rank?: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface DriveSession {
  id: string;
  captain: string;
  startedAt: string;
  endedAt?: string;
  /** Breadcrumb trail [lng, lat][] */
  trail: [number, number][];
  frames: number;
  reports: number;
  miles: number;
}

export const HAZARD_LABELS: Record<HazardType, string> = {
  crack: "Cracked panel",
  lifted: "Root heave / lifted panel",
  vegetation: "Vegetation obstruction",
  "missing-ramp": "Missing curb ramp",
  "missing-sidewalk": "Missing sidewalk",
  debris: "Debris / blockage",
  other: "Other hazard",
};

export const HAZARD_SHORT: Record<HazardType, string> = {
  crack: "Crack",
  lifted: "Root heave",
  vegetation: "Vegetation",
  "missing-ramp": "No ramp",
  "missing-sidewalk": "No sidewalk",
  debris: "Debris",
  other: "Other",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: "Low",
  moderate: "Moderate",
  severe: "Severe",
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  "submitted-311": "Sent to 311",
  scheduled: "Fix scheduled",
  resolved: "Resolved",
};

export const STATUS_FLOW: ReportStatus[] = ["open", "submitted-311", "scheduled", "resolved"];

export const ROLE_LABELS: Record<Role, string> = {
  public: "Viewer",
  reporter: "Reporter",
  "drive-captain": "Drive captain",
  moderator: "Moderator",
};

/** Who fixes it: the city (structural) or the adjacent landowner (vegetation). */
export function fixPath(type: HazardType): "city" | "landowner" {
  return type === "vegetation" ? "landowner" : "city";
}
