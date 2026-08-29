import type { HazardType, Severity } from "../types";

/**
 * Hazard photo classification.
 *
 * The web prototype ships a pixel-statistics mock; the phone does not pretend.
 * With EXPO_PUBLIC_AI_ENDPOINT set (same contract as the site's VITE_AI_ENDPOINT:
 * POST { op: "classify", image: dataUrl } → ClassificationResult), the app asks
 * the model and shows the read as a suggestion the reporter confirms.
 * Without it, classify() resolves to null and the reporter picks the type.
 * Either way the model name is recorded on the report, so the dataset stays
 * auditable as models improve through 2031.
 */
export interface ClassificationResult {
  label: HazardType;
  severity: Severity;
  confidence: number;
  model: string;
  alternatives: { label: HazardType; confidence: number }[];
  reason: string;
}

const ENDPOINT = process.env.EXPO_PUBLIC_AI_ENDPOINT;

export function classifierAvailable(): boolean {
  return Boolean(ENDPOINT);
}

export function classifierName(): string {
  return ENDPOINT ? "remote" : "none on this build";
}

const VALID: HazardType[] = ["crack", "lifted", "vegetation", "missing-ramp", "missing-sidewalk", "debris", "other"];
const SEVS: Severity[] = ["low", "moderate", "severe"];

export async function classifyHazardPhoto(jpegBase64: string, timeoutMs = 12_000): Promise<ClassificationResult | null> {
  if (!ENDPOINT) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "classify", image: `data:image/jpeg;base64,${jpegBase64}` }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Classifier responded ${res.status}`);
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
  } finally {
    clearTimeout(timer);
  }
}
