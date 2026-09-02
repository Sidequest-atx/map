/**
 * Shared domain types. Mirrors ../src/types.ts in the web app so exports from
 * the phone drop straight into the site's store and the Supabase schema.
 */
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

/** walk = phone in hand · drive = passenger-seat Quest Drive · glasses = Glasses Walk */
export type ReportSource = "walk" | "drive" | "glasses";

export type Role = "reporter" | "drive-captain" | "moderator";

export interface AiSuggestion {
  label: HazardType;
  severity: Severity;
  confidence: number;
  model: string;
}

/** Everything we know about where and how a fix was taken. */
export interface CaptureFix {
  /** Horizontal accuracy radius in metres reported by the OS, null if unknown */
  accuracyM: number | null;
  altitudeM: number | null;
  /** Compass heading the phone (camera) faced, degrees true north, null if unknown */
  headingDeg: number | null;
  /** Speed in m/s at capture, null if unknown */
  speedMps: number | null;
  /** Epoch ms of the GPS fix used (not the photo write time) */
  fixAt: number;
  /** How the coordinates were established */
  method: "gps-at-shutter" | "pin-adjusted" | "trail-interpolated" | "photo-exif" | "manual";
}

export interface HazardReport {
  id: string;
  /** Short human id, e.g. SQ-0142. Phone-local refs are SQ-P0001 until synced. */
  ref: string;
  type: HazardType;
  severity: Severity;
  status: ReportStatus;
  source: ReportSource;
  /** WGS84 */
  lng: number;
  lat: number;
  /** Human-readable location, e.g. "1200 block of Mellow Meadow Dr" */
  place: string;
  neighborhood: string;
  description: string;
  /** file:// URI of the full-size JPEG in the app's documents dir (EXIF carries GPS) */
  photoUri?: string;
  /** file:// URI of a ~480px thumbnail for lists */
  thumbUri?: string;
  /** Photos-library asset id once saved to the SideQuest ATX album */
  photoAssetId?: string;
  /** Where the coordinates came from */
  fix?: CaptureFix;
  ai?: AiSuggestion;
  reporter?: string;
  driveId?: string;
  walkId?: string;
  ticket311?: string;
  afterPhotoUri?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  verified?: boolean;
  duplicateOf?: string;
  rank?: number;
  /** Server row id (uuid) once this report reached the shared map */
  remoteId?: string;
  /** ISO time of the last successful push of this row */
  syncedAt?: string;
  /** Field names changed locally since the last push (drives what re-syncs, so a phone push can never clobber columns it did not touch) */
  dirtyFields?: string[];
  /** When the photo was taken (ISO) */
  createdAt: string;
  updatedAt: string;
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

/** A timestamped breadcrumb, used by Glasses Walks to place photos by time. */
export interface TrailPoint {
  lng: number;
  lat: number;
  /** epoch ms */
  t: number;
  accuracyM: number | null;
}

export interface WalkSession {
  id: string;
  walker: string;
  startedAt: string;
  endedAt?: string;
  trail: TrailPoint[];
  photosImported: number;
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

export const HAZARD_ORDER: HazardType[] = ["crack", "lifted", "vegetation", "missing-ramp", "missing-sidewalk", "debris", "other"];

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: "Low",
  moderate: "Moderate",
  severe: "Severe",
};

export const SEVERITY_HINT: Record<Severity, string> = {
  low: "Cosmetic, under half an inch",
  moderate: "Catches a toe or a wheel",
  severe: "Could put someone on the ground",
};

export const SEVERITY_ORDER: Severity[] = ["low", "moderate", "severe"];

export const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  "submitted-311": "Sent to 311",
  scheduled: "Fix scheduled",
  resolved: "Resolved",
};

export const STATUS_FLOW: ReportStatus[] = ["open", "submitted-311", "scheduled", "resolved"];

export const SOURCE_LABELS: Record<ReportSource, string> = {
  walk: "On foot",
  drive: "Quest Drive",
  glasses: "Glasses Walk",
};

export const ROLE_LABELS: Record<Role, string> = {
  reporter: "Reporter",
  "drive-captain": "Drive captain",
  moderator: "Moderator",
};

/** Who fixes it: the city (structural) or the adjacent landowner (vegetation). */
export function fixPath(type: HazardType): "city" | "landowner" {
  return type === "vegetation" ? "landowner" : "city";
}
