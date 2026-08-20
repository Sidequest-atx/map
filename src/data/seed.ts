import { makeRef } from "../lib/format";
import { pointAlong, type LngLat } from "../lib/geo";
import type { DriveSession, HazardReport, HazardType, ReportStatus, Severity } from "../types";
import { MOCK_MODEL } from "../ai/classify";

/**
 * DEMO DATA. Synthetic reports around Northwest Austin (Westwood / Anderson
 * Mill / Jollyville / Great Hills / Spicewood Springs) so the map, portal and
 * open-data page feel alive on first run. Every seed carries reporter "demo"
 * and the UI shows a "Demo data" badge until a real report exists.
 *
 * Coordinates are approximate public right-of-way points; nothing here is a
 * claim about a real defect.
 */

export const DEMO_REPORTER = "demo";

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

type Row = [
  type: HazardType,
  severity: Severity,
  status: ReportStatus,
  lng: number,
  lat: number,
  place: string,
  neighborhood: string,
  description: string,
  ageDays: number,
  extra?: Partial<HazardReport>,
];

// Hand-written cases: the ones that tell the story.
const HAND: Row[] = [
  ["lifted", "severe", "submitted-311", -97.8016, 30.4553, "Mellow Meadow Dr near Westwood High", "Westwood",
    "Live oak root has lifted two panels almost three inches. An 80-year-old neighbor tripped here and broke her finger. This is the report that started SideQuest.", 62,
    { ticket311: "24-00318842", ai: { label: "lifted", severity: "severe", confidence: 0.93, model: MOCK_MODEL } }],
  ["vegetation", "moderate", "resolved", -97.7871, 30.4381, "Spicewood Springs Rd at Scotland Well Dr", "Spicewood Springs",
    "Ligustrum hedge covered the full sidewalk width for ~20 ft; walkers stepped into the traffic lane. Door-hanger left; homeowner trimmed it within a week.", 48,
    { resolvedAt: days(39), resolvedBy: "demo moderator", verified: true }],
  ["crack", "moderate", "open", -97.8043, 30.4457, "Anderson Mill Rd near Olson Dr", "Anderson Mill",
    "Alligator cracking across three panels; edges beginning to cup. Stroller wheels catch.", 30],
  ["missing-ramp", "severe", "submitted-311", -97.7938, 30.4419, "Pond Springs Rd at Hymeadow Dr", "Jollyville",
    "No curb ramp on the NE corner. A wheelchair user has to roll 60 ft in the street to the next driveway.", 27,
    { ticket311: "24-00321177" }],
  ["missing-sidewalk", "moderate", "open", -97.7775, 30.4432, "Jollyville Rd north of Oak Knoll Dr", "Great Hills",
    "Sidewalk ends for a ~300 ft gap on the east side; the worn dirt path shows people walk it anyway.", 25],
  ["vegetation", "low", "resolved", -97.7992, 30.4612, "Tamayo Dr near Grisham Middle", "Anderson Mill",
    "Crepe myrtle branches at forehead height across the school route. Cleared by the Saturday loppers crew.", 24,
    { resolvedAt: days(17), resolvedBy: "demo moderator", verified: true }],
  ["lifted", "moderate", "scheduled", -97.7812, 30.4265, "Great Hills Trl at Rain Creek Pkwy", "Great Hills",
    "One-inch lip between panels in front of the bus stop. 311 says concrete grinding is on the spring list.", 40,
    { ticket311: "24-00309950" }],
  ["debris", "low", "resolved", -97.8089, 30.4508, "Anderson Mill Rd at Pecan Creek Pkwy", "Anderson Mill",
    "Construction gravel spread over the walk from a driveway job. Contractor swept it after a call.", 20,
    { resolvedAt: days(18), resolvedBy: "demo moderator", verified: true }],
  ["crack", "severe", "open", -97.7901, 30.4340, "Hollow Way near Canyon Vista Middle", "Jollyville",
    "Panel split clean through with a 1.5-inch drop on the school side. Kids hop it every morning.", 11],
  ["vegetation", "moderate", "open", -97.7749, 30.4492, "Oak Knoll Dr at Laurel Mountain Elementary", "Great Hills",
    "Photinia hedge forces the walk down to ~18 inches. Two strollers cannot pass.", 9],
  ["missing-ramp", "moderate", "open", -97.8059, 30.4586, "Anderson Mill Rd at Hunters Chase Dr", "Anderson Mill",
    "Ramp exists on one side of the crossing only. Walker users turn back here.", 8],
  ["lifted", "severe", "open", -97.7853, 30.4403, "Spicewood Springs Rd near senior living", "Spicewood Springs",
    "Root heave directly on the route residents take to the pharmacy. Two-inch lip, shaded, hard to see at dusk.", 6],
  ["vegetation", "moderate", "resolved", -97.8031, 30.4539, "Mellow Meadow Dr at Pommel Ln", "Westwood",
    "Yaupon grown across two-thirds of the walk. Homeowner cleared after the door-hanger.", 33,
    { resolvedAt: days(26), resolvedBy: "demo moderator", verified: true }],
  ["crack", "low", "open", -97.7969, 30.4502, "Lake Creek Pkwy at US-183 frontage", "Anderson Mill",
    "Hairline map cracking, no vertical displacement yet. Logged for trend watching.", 5],
  ["vegetation", "severe", "open", -97.7727, 30.4241, "Great Hills Trl near senior living", "Great Hills",
    "Agave and sotol spines into the walking line at hip height. Needs removal, not trimming.", 4],
  ["missing-sidewalk", "severe", "submitted-311", -97.8196, 30.4705, "Lakeline Blvd approach to Lakeline Station", "Lakeline",
    "Gap of ~500 ft on the station side; commuters walk the shoulder at 45 mph.", 19,
    { ticket311: "24-00325509" }],
  ["lifted", "moderate", "open", -97.7924, 30.4615, "McNeil Dr at Tamayo Dr", "Anderson Mill",
    "Utility box pad sits an inch proud of the walk surface.", 15],
  ["vegetation", "low", "resolved", -97.7958, 30.4477, "Hymeadow Dr at Yaupon Dr", "Jollyville",
    "Low branches over the walk. Cleared by the homeowner the same day we knocked.", 12,
    { resolvedAt: days(12), resolvedBy: "demo moderator", verified: true }],
  ["debris", "moderate", "open", -97.7893, 30.4465, "Pavilion Park & Ride south walkway", "Jollyville",
    "Shopping cart and pallet dumped on the ramp landing.", 2],
  ["crack", "moderate", "open", -97.8002, 30.4568, "Mellow Meadow Dr west of Westwood High", "Westwood",
    "Spalled surface for 40 ft; loose aggregate underfoot.", 3],
  ["vegetation", "moderate", "resolved", -97.7835, 30.4300, "Rain Creek Pkwy at Great Hills Trl", "Great Hills",
    "Oleander overgrowth; cleared after door-hanger.", 28,
    { resolvedAt: days(21), resolvedBy: "demo moderator", verified: true }],
  ["lifted", "low", "open", -97.7791, 30.4358, "Spicewood Springs Rd at Jollyville Rd", "Spicewood Springs",
    "Half-inch lip at the joint; rated low but on a heavy route.", 7],
  ["missing-ramp", "severe", "scheduled", -97.8121, 30.4637, "Anderson Mill Rd at Purple Sage Elementary", "Anderson Mill",
    "No ramp at the school crossing. Scheduled under the ADA transition list after our submission.", 36,
    { ticket311: "24-00312200" }],
  ["vegetation", "moderate", "resolved", -97.8078, 30.4530, "Anderson Mill Elementary frontage", "Anderson Mill",
    "Hedge over the walk at the drop-off loop. Trimmed by the PTA work day.", 16,
    { resolvedAt: days(10), resolvedBy: "demo moderator", verified: true }],
];

// Quest Drive 1: Anderson Mill Rd loop. Quest Drive 2: Spicewood Springs Rd.
export const DRIVE_ROUTES: Record<string, LngLat[]> = {
  "drive-anderson-mill": [
    [-97.8142, 30.4655],
    [-97.8105, 30.4620],
    [-97.8068, 30.4590],
    [-97.8040, 30.4535],
    [-97.8035, 30.4480],
    [-97.8005, 30.4470],
    [-97.7975, 30.4500],
  ],
  "drive-spicewood": [
    [-97.7945, 30.4440],
    [-97.7905, 30.4420],
    [-97.7860, 30.4395],
    [-97.7820, 30.4372],
    [-97.7780, 30.4350],
    [-97.7745, 30.4320],
  ],
};

const DRIVE_TYPES: HazardType[] = ["crack", "vegetation", "lifted", "crack", "vegetation", "missing-ramp", "crack", "debris"];
const DRIVE_SEV: Severity[] = ["low", "moderate", "moderate", "low", "low", "severe", "moderate", "low"];
const DRIVE_DESC: Record<HazardType, string[]> = {
  crack: ["Surface cracking visible from the passenger window.", "Transverse crack across the full panel.", "Corner break at the joint."],
  vegetation: ["Hedge encroaching about a third of the walk width.", "Low canopy over the walk.", "Grass and weeds across the panel seams."],
  lifted: ["Possible lip at the joint; confirm on foot.", "Root heave suspected from shadow line."],
  "missing-ramp": ["Corner without a ramp at the side street."],
  "missing-sidewalk": ["Walk ends at the property line."],
  debris: ["Trash bin left on the walk.", "Yard waste bags blocking the walk."],
  other: ["Flagged by the captain for review."],
};

function driveRows(driveId: string, neighborhood: string, street: string, count: number, ageDays: number): Row[] {
  const route = DRIVE_ROUTES[driveId];
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const [lng, lat] = pointAlong(route, t);
    const type = DRIVE_TYPES[i % DRIVE_TYPES.length];
    const sev = DRIVE_SEV[i % DRIVE_SEV.length];
    const descs = DRIVE_DESC[type];
    rows.push([
      type, sev, "open",
      Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5,
      `${street}, segment ${i + 1}`, neighborhood,
      descs[i % descs.length], ageDays,
      { source: "drive", driveId, ai: { label: type, severity: sev, confidence: 0.7 + ((i * 7) % 20) / 100, model: MOCK_MODEL } },
    ]);
  }
  return rows;
}

const ROWS: Row[] = [
  ...HAND,
  ...driveRows("drive-anderson-mill", "Anderson Mill", "Anderson Mill Rd", 20, 13),
  ...driveRows("drive-spicewood", "Spicewood Springs", "Spicewood Springs Rd", 16, 6),
];

export const SEED_REPORTS: HazardReport[] = ROWS.map((row, i) => {
  const [type, severity, status, lng, lat, place, neighborhood, description, ageDays, extra] = row;
  const createdAt = days(ageDays);
  const base: HazardReport = {
    id: `seed-${i + 1}`,
    ref: makeRef(i + 1),
    type,
    severity,
    status,
    source: "walk",
    lng,
    lat,
    place,
    neighborhood,
    description,
    reporter: DEMO_REPORTER,
    createdAt,
    updatedAt: status === "open" ? createdAt : days(Math.max(0, ageDays - 5)),
    ai: { label: type, severity, confidence: 0.78 + ((i * 13) % 17) / 100, model: MOCK_MODEL },
  };
  return { ...base, ...extra };
});

export const SEED_DRIVES: DriveSession[] = [
  {
    id: "drive-anderson-mill",
    captain: "demo captain",
    startedAt: days(13),
    endedAt: days(13),
    trail: DRIVE_ROUTES["drive-anderson-mill"],
    frames: 84,
    reports: 20,
    miles: 2.1,
  },
  {
    id: "drive-spicewood",
    captain: "demo captain",
    startedAt: days(6),
    endedAt: days(6),
    trail: DRIVE_ROUTES["drive-spicewood"],
    frames: 61,
    reports: 16,
    miles: 1.6,
  },
];

export const SEED_COUNT = SEED_REPORTS.length;
