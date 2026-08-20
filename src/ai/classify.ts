import { HAZARD_LABELS, type HazardType, type Severity } from "../types";

/**
 * Hazard photo classification.
 *
 * Today: a deterministic on-device mock so the full product flow (photo →
 * AI suggestion → human confirmation) is real and demoable offline.
 *
 * Tomorrow: point VITE_AI_ENDPOINT at any vision backend (an edge function
 * calling a frontier vision model, or a fine-tuned sidewalk model) that accepts
 * `{ op: "classify", image: dataUrl }` and returns `ClassificationResult` JSON.
 * The UI treats AI output as a *suggestion* the reporter confirms, never an
 * automatic verdict. Model name is recorded on every report so the dataset
 * stays auditable as models improve through 2031.
 */
export interface ClassificationResult {
  label: HazardType;
  severity: Severity;
  confidence: number;
  model: string;
  /** Runner-up labels so the reporter can one-tap correct */
  alternatives: { label: HazardType; confidence: number }[];
  /** Plain-language reason shown in the UI */
  reason: string;
}

export const MOCK_MODEL = "sq-vision-mock-2";

export async function classifyHazardPhoto(dataUrl: string): Promise<ClassificationResult> {
  const endpoint = import.meta.env.VITE_AI_ENDPOINT;
  if (endpoint) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "classify", image: dataUrl }),
    });
    if (!res.ok) throw new Error(`Classifier responded ${res.status}`);
    const json = (await res.json()) as Partial<ClassificationResult>;
    return {
      label: json.label ?? "other",
      severity: json.severity ?? "moderate",
      confidence: json.confidence ?? 0.5,
      model: json.model ?? "remote",
      alternatives: json.alternatives ?? [],
      reason: json.reason ?? "",
    };
  }
  return mockClassify(dataUrl);
}

/**
 * Deterministic mock: analyzes real pixel statistics (edge density, greenness,
 * darkness) from the photo so different photos genuinely produce different
 * suggestions, then maps them to hazard heuristics. ~1.2 s simulated latency.
 */
async function mockClassify(dataUrl: string): Promise<ClassificationResult> {
  const stats = await pixelStats(dataUrl);
  await sleep(700 + (stats.hash % 600));

  const scores: Record<HazardType, number> = {
    vegetation: stats.greenRatio * 2.2,
    crack: stats.edgeDensity * 1.6 + stats.darkRatio * 0.6,
    lifted: stats.edgeDensity * 1.2 + stats.shadowBand * 1.5,
    debris: stats.darkRatio * 1.3,
    "missing-ramp": 0.22 + ((stats.hash >> 3) % 10) / 100,
    "missing-sidewalk": 0.18 + ((stats.hash >> 5) % 10) / 100,
    other: 0.12,
  };
  const ordered = (Object.keys(scores) as HazardType[]).sort((a, b) => scores[b] - scores[a]);
  const label = ordered[0];
  const total = ordered.slice(0, 3).reduce((s, k) => s + scores[k], 0) || 1;
  const confidence = clamp(0.55 + (scores[label] / total) * 0.45, 0.55, 0.97);
  const alternatives = ordered.slice(1, 3).map((k) => ({
    label: k,
    confidence: clamp((scores[k] / total) * 0.9, 0.05, 0.6),
  }));

  const sevScore = stats.edgeDensity * 0.55 + stats.darkRatio * 0.3 + stats.shadowBand * 0.4;
  const severity: Severity = sevScore > 0.34 ? "severe" : sevScore > 0.18 ? "moderate" : "low";

  return {
    label,
    severity,
    confidence: Math.round(confidence * 100) / 100,
    model: MOCK_MODEL,
    alternatives,
    reason: reasonFor(label, stats),
  };
}

function reasonFor(label: HazardType, s: PixelStats): string {
  switch (label) {
    case "vegetation":
      return `${Math.round(s.greenRatio * 100)}% of the frame reads as foliage over the walking surface.`;
    case "crack":
      return "High edge density across the panel, consistent with fracture lines.";
    case "lifted":
      return "A horizontal shadow band suggests a vertical lip between panels.";
    case "debris":
      return "Large dark irregular region on the walking surface.";
    default:
      return `Low-confidence read. Please confirm: ${HAZARD_LABELS[label].toLowerCase()}?`;
  }
}

interface PixelStats {
  greenRatio: number;
  darkRatio: number;
  edgeDensity: number;
  /** strength of a dark horizontal band mid-frame (a lip casts one) */
  shadowBand: number;
  hash: number;
}

function pixelStats(dataUrl: string): Promise<PixelStats> {
  return new Promise((resolve) => {
    const fallback = { greenRatio: 0, darkRatio: 0, edgeDensity: 0.2, shadowBand: 0, hash: 7 };
    const img = new Image();
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(fallback);
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      let green = 0;
      let dark = 0;
      let edges = 0;
      let hash = 0;
      const lum = new Float32Array(size * size);
      for (let i = 0; i < size * size; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lum[i] = l;
        // Foliage counts only where pavement should be (lower 60% of the frame);
        // trees on the horizon are not an obstruction.
        if (i >= size * size * 0.4 && g > 90 && g > r * 1.15 && g > b * 1.15) green++;
        if (l < 60) dark++;
        hash = (hash * 31 + r + g + b) >>> 0;
      }
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const i = y * size + x;
          const gx = Math.abs(lum[i + 1] - lum[i - 1]);
          const gy = Math.abs(lum[i + size] - lum[i - size]);
          if (gx + gy > 60) edges++;
        }
      }
      // Row-mean luminance; a lip shows as one row noticeably darker than its neighbours.
      let shadowBand = 0;
      const rowMean = new Float32Array(size);
      for (let y = 0; y < size; y++) {
        let s = 0;
        for (let x = 0; x < size; x++) s += lum[y * size + x];
        rowMean[y] = s / size;
      }
      for (let y = Math.floor(size * 0.45); y < size - 8; y++) {
        const drop = (rowMean[y - 4] + rowMean[y + 4]) / 2 - rowMean[y];
        if (drop > shadowBand) shadowBand = drop;
      }
      const n = size * size;
      resolve({
        greenRatio: green / (n * 0.6),
        darkRatio: dark / n,
        edgeDensity: edges / n,
        shadowBand: Math.min(1, shadowBand / 80),
        hash,
      });
    };
    img.onerror = () => resolve({ ...fallback, hash: 13 });
    img.src = dataUrl;
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
