import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { rankReport } from "../ai/rank";
import type { HazardReport } from "../types";

const stamp = () => new Date().toISOString().slice(0, 10);

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Same columns as the web app's public CSV, plus the capture-quality fields the phone knows. */
export function toCsv(reports: HazardReport[]): string {
  const cols = [
    "ref", "type", "severity", "status", "source", "priority", "lng", "lat", "accuracy_m", "heading_deg", "fix_method",
    "place", "neighborhood", "description", "ticket_311", "ai_label", "ai_confidence", "ai_model", "verified",
    "photo_file", "created_at", "updated_at", "resolved_at",
  ];
  const lines = [cols.join(",")];
  for (const r of reports) {
    lines.push(
      [
        r.ref, r.type, r.severity, r.status, r.source, rankReport(r).score, r.lng, r.lat,
        r.fix?.accuracyM ?? "", r.fix?.headingDeg ?? "", r.fix?.method ?? "",
        r.place, r.neighborhood, r.description, r.ticket311 ?? "", r.ai?.label ?? "", r.ai?.confidence ?? "", r.ai?.model ?? "",
        r.verified ? "true" : "false", r.photoUri ? `${r.id}.jpg` : "", r.createdAt, r.updatedAt, r.resolvedAt ?? "",
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function toGeoJSON(reports: HazardReport[]): object {
  return {
    type: "FeatureCollection",
    features: reports.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        ref: r.ref,
        type: r.type,
        severity: r.severity,
        status: r.status,
        source: r.source,
        priority: rankReport(r).score,
        accuracy_m: r.fix?.accuracyM ?? null,
        heading_deg: r.fix?.headingDeg ?? null,
        fix_method: r.fix?.method ?? null,
        place: r.place,
        neighborhood: r.neighborhood,
        description: r.description,
        ticket_311: r.ticket311 ?? null,
        ai_label: r.ai?.label ?? null,
        ai_confidence: r.ai?.confidence ?? null,
        ai_model: r.ai?.model ?? null,
        verified: Boolean(r.verified),
        duplicate_of: r.duplicateOf ?? null,
        photo_file: r.photoUri ? `${r.id}.jpg` : null,
        photo_asset_id: r.photoAssetId ?? null,
        reporter: r.reporter ?? null,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        resolved_at: r.resolvedAt ?? null,
      },
    })),
  };
}

async function shareText(name: string, content: string, mimeType: string): Promise<void> {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(content);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
  await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: name, UTI: mimeType === "text/csv" ? "public.comma-separated-values-text" : "public.json" });
}

export async function shareCsv(reports: HazardReport[]): Promise<void> {
  await shareText(`sidequest-atx-reports-${stamp()}.csv`, toCsv(reports), "text/csv");
}

export async function shareGeoJSON(reports: HazardReport[]): Promise<void> {
  await shareText(`sidequest-atx-reports-${stamp()}.geojson`, JSON.stringify(toGeoJSON(reports), null, 2), "application/geo+json");
}

export async function sharePhoto(uri: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
  await Sharing.shareAsync(uri, { mimeType: "image/jpeg", dialogTitle: title, UTI: "public.jpeg" });
}
