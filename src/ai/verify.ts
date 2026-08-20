import type { HazardReport } from "../types";
import { classifyHazardPhoto } from "./classify";

/**
 * Close-out verification.
 *
 * A 311 ticket marked "closed" is not the same as a fixed sidewalk. Before a
 * report becomes "resolved" we require an after-photo and ask the model
 * whether the original hazard is still visible. The answer is advisory: a
 * moderator makes the final call and their name goes on the record.
 */
export interface VerificationResult {
  /** true when the after-photo no longer reads as the original hazard */
  looksFixed: boolean;
  confidence: number;
  model: string;
  note: string;
}

export async function verifyRepair(report: HazardReport, afterPhoto: string): Promise<VerificationResult> {
  const endpoint = import.meta.env.VITE_AI_ENDPOINT;
  if (endpoint) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "verify", before: report.photo ?? null, after: afterPhoto, type: report.type }),
    });
    if (!res.ok) throw new Error(`Verifier responded ${res.status}`);
    return (await res.json()) as VerificationResult;
  }
  const after = await classifyHazardPhoto(afterPhoto);
  const stillThere = after.label === report.type && after.severity !== "low";
  const confidence = stillThere ? after.confidence : Math.round((1 - after.confidence * 0.6) * 100) / 100;
  return {
    looksFixed: !stillThere,
    confidence,
    model: after.model,
    note: stillThere
      ? `The after-photo still reads as ${labelOf(report.type)} (${Math.round(after.confidence * 100)}%). Double-check before resolving.`
      : `No ${labelOf(report.type)} detected in the after-photo. Looks fixed.`,
  };
}

function labelOf(type: HazardReport["type"]): string {
  return type.replace("-", " ");
}
