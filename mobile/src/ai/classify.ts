import { supabase, SUPABASE_URL } from "../lib/supabase";
import type { HazardType, Severity } from "../types";

/**
 * Hazard photo classification.
 *
 * The default classifier is Claude behind the sq-classify Supabase edge
 * function (severity rubric + budget cap documented in
 * supabase/functions/sq-classify/RUBRIC.md); EXPO_PUBLIC_AI_ENDPOINT
 * overrides it with any endpoint speaking the same contract:
 * POST { op: "classify", image: dataUrl } → ClassificationResult.
 * The read is a suggestion the reporter confirms — never a decision — and a
 * null result (offline, signed out, budget spent) simply means the reporter
 * picks the type themselves. The model name is recorded on every report, so
 * the dataset stays auditable as models improve through 2031.
 */
export interface ClassificationResult {
  label: HazardType;
  severity: Severity;
  confidence: number;
  model: string;
  alternatives: { label: HazardType; confidence: number }[];
  reason: string;
}

const ENDPOINT = process.env.EXPO_PUBLIC_AI_ENDPOINT || `${SUPABASE_URL}/functions/v1/sq-classify`;

export function classifierAvailable(): boolean {
  return true;
}

export function classifierName(): string {
  return process.env.EXPO_PUBLIC_AI_ENDPOINT ? "remote" : "Claude (sq-classify)";
}

const VALID: HazardType[] = ["crack", "lifted", "vegetation", "missing-ramp", "missing-sidewalk", "debris", "other"];
const SEVS: Severity[] = ["low", "moderate", "severe"];

export async function classifyHazardPhoto(jpegBase64: string, timeoutMs = 25_000): Promise<ClassificationResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null; // classifier needs a signed-in reporter
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ op: "classify", image: `data:image/jpeg;base64,${jpegBase64}` }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null; // offline, budget spent, or upstream trouble — the reporter picks by hand
    const json = (await res.json()) as Partial<ClassificationResult>;
    const label = VALID.includes(json.label as HazardType) ? (json.label as HazardType) : "other";
    const severity = SEVS.includes(json.severity as Severity) ? (json.severity as Severity) : "moderate";
    return {
      label,
      severity,
      confidence: typeof json.confidence === "number" ? Math.max(0, Math.min(1, json.confidence)) : 0.5,
      model: json.model ?? "remote",
      alternatives: (json.alternatives ?? []).filter((a) => VALID.includes(a.label)),
      reason: json.reason ?? "",
    };
  } catch {
    return null; // never block a report on the classifier
  } finally {
    clearTimeout(timer);
  }
}
