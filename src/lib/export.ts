import type { FeatureCollection } from "geojson";
import { rankReport } from "../ai/rank";
import type { HazardReport } from "../types";

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** Public CSV: no photos, no reporter names. */
export function exportCsv(reports: HazardReport[]) {
  const cols = [
    "ref",
    "type",
    "severity",
    "status",
    "source",
    "priority",
    "lng",
    "lat",
    "place",
    "neighborhood",
    "description",
    "ticket_311",
    "ai_label",
    "ai_confidence",
    "ai_model",
    "verified",
    "created_at",
    "updated_at",
    "resolved_at",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of reports) {
    lines.push(
      [
        r.ref,
        r.type,
        r.severity,
        r.status,
        r.source,
        rankReport(r).score,
        r.lng,
        r.lat,
        r.place,
        r.neighborhood,
        r.description,
        r.ticket311 ?? "",
        r.ai?.label ?? "",
        r.ai?.confidence ?? "",
        r.ai?.model ?? "",
        r.verified ? "true" : "false",
        r.createdAt,
        r.updatedAt,
        r.resolvedAt ?? "",
      ]
        .map(esc)
        .join(","),
    );
  }
  download(`sidequest-atx-reports-${stamp()}.csv`, new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
}

export function toGeoJSON(reports: HazardReport[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: reports.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: {
        ref: r.ref,
        type: r.type,
        severity: r.severity,
        status: r.status,
        source: r.source,
        priority: rankReport(r).score,
        place: r.place,
        neighborhood: r.neighborhood,
        description: r.description,
        ticket_311: r.ticket311 ?? null,
        ai_label: r.ai?.label ?? null,
        ai_confidence: r.ai?.confidence ?? null,
        ai_model: r.ai?.model ?? null,
        verified: Boolean(r.verified),
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        resolved_at: r.resolvedAt ?? null,
      },
    })),
  };
}

export function exportGeoJSON(reports: HazardReport[]) {
  download(`sidequest-atx-reports-${stamp()}.geojson`, new Blob([JSON.stringify(toGeoJSON(reports), null, 2)], { type: "application/geo+json" }));
}
