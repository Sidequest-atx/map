export type Tier = {
  dpr: number;
  shadowSize: number;
  shadows: boolean;
  postfx: boolean;
  ambientCars: number;
  pedestrians: number;
};

export function detectTier(): Tier {
  const small = typeof matchMedia !== "undefined" && matchMedia("(max-width: 1023px)").matches;
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  const q = typeof location !== "undefined" ? location.search : "";
  const noFx = q.includes("nofx");
  const noShadow = q.includes("noshadow");
  if (small || coarse || mem <= 4) {
    return { dpr: Math.min(1.3, devicePixelRatio || 1), shadowSize: 1024, shadows: !noShadow, postfx: false, ambientCars: 5, pedestrians: 5 };
  }
  return { dpr: Math.min(1.5, devicePixelRatio || 1), shadowSize: 1536, shadows: !noShadow, postfx: !noFx, ambientCars: 8, pedestrians: 8 };
}
