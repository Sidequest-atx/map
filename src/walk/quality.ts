/**
 * Render tiers. The GPU name is only a starting hint — it is a notoriously
 * unreliable signal (masked strings, renamed parts, faulted discrete cards
 * silently falling back to an iGPU), so the scene measures real frame times
 * and steps itself down a tier at a time. `?q=high|mid|low` pins a tier and
 * disables that automatic movement.
 */
export type TierName = "high" | "mid" | "low";

export type Tier = {
  name: TierName;
  dpr: number;
  shadowSize: number;
  /** half-extent of the sun's shadow frustum around the camera focus */
  shadowSpan: number;
  shadows: boolean;
  postfx: boolean;
  /** MSAA samples on the composer's buffers (0 = SMAA only) */
  msaa: number;
  /** screen-space ambient occlusion (the single biggest "grounded" upgrade) */
  ao: boolean;
  ambientCars: number;
  pedestrians: number;
};

export const TIER_ORDER: TierName[] = ["high", "mid", "low"];

function gpuName(): string {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || "");
  } catch {
    return "";
  }
}

/** Parts that plausibly hold native DPR + MSAA + AO: discrete cards, and the
    modern integrated ones that genuinely keep up (RDNA3 Radeon 7xx/8xxM,
    Intel Arc, Apple Silicon). Wrong guesses are corrected by measurement. */
function strongGpu(): boolean {
  return /\b(rtx|gtx\s?1[6-9]\d\d|radeon rx|radeon\s?[78]\d{2}m|arc\s|apple m\d)/i.test(gpuName());
}

function pin(): TierName | null {
  const m = typeof location !== "undefined" && /[?&]q=(high|mid|low)\b/.exec(location.search);
  return m ? (m[1] as TierName) : null;
}

/** A pinned tier is the author's or reader's explicit choice — never move it. */
export function tierPinned(): boolean {
  return pin() !== null;
}

export function initialTier(): TierName {
  const p = pin();
  if (p) return p;
  const small = typeof matchMedia !== "undefined" && matchMedia("(max-width: 1023px)").matches;
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  if (small || coarse || mem <= 4) return "low";
  return strongGpu() ? "high" : "mid";
}

export function tier(name: TierName): Tier {
  const q = typeof location !== "undefined" ? location.search : "";
  const noFx = q.includes("nofx");
  const shadows = !q.includes("noshadow");
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const common = { name, shadows, postfx: !noFx };
  if (name === "high") {
    // The reference bar is 4K drone footage. (8x MSAA + full-res AO measured
    // 34fps at 4K on an RTX 5060; this chain holds 60 and looks identical.)
    return { ...common, dpr: Math.min(3, dpr), shadowSize: 4096, shadowSpan: 150, msaa: 4, ao: !noFx, ambientCars: 8, pedestrians: 8 };
  }
  if (name === "mid") {
    return { ...common, dpr: Math.min(1.5, dpr), shadowSize: 1536, shadowSpan: 85, msaa: 0, ao: false, ambientCars: 8, pedestrians: 8 };
  }
  return { ...common, dpr: Math.min(1.3, dpr), shadowSize: 1024, shadowSpan: 85, postfx: false, msaa: 0, ao: false, ambientCars: 5, pedestrians: 5 };
}
