/**
 * SideQuest ATX design tokens for the app surface.
 * Hex approximations of ../src/styles/tokens.css (OKLCH): committed olive on a
 * visibly tinted beige field. Light only (Texas sun). System UI type.
 */
export const C = {
  field: "#ECE6D6",
  field2: "#E3DCC8",
  field3: "#D8D0B8",
  surface: "#F8F6F0",
  line: "#C9C2AE",
  lineStrong: "#A6A08A",

  olive50: "#E1E8CC",
  olive100: "#CFDCB0",
  olive200: "#B7C98F",
  olive400: "#7D9455",
  olive500: "#667A44",
  olive600: "#55683A",
  olive800: "#37412A",
  olive900: "#2A3220",

  ink: "#26281C",
  inkSoft: "#5A5D4A",
  inkMute: "#7C7F68",
  inkOnDark: "#F2EEE2",
  inkOnDarkSoft: "#CFCBB8",

  sevLow: "#667A44",
  sevModerate: "#C28A2D",
  sevSevere: "#B0432A",
  sevLowBg: "#E1E8CC",
  sevModerateBg: "#F0E2C4",
  sevSevereBg: "#F0D2C8",
  ok: "#2F7A4A",
  okBg: "#D9E8DC",
  info: "#3F6A8A",
  infoBg: "#D8E2EA",
  danger: "#B0432A",
  dangerBg: "#F0D2C8",

  white: "#FFFFFF",
  black: "#000000",
  scrim: "rgba(38,40,28,0.55)",
} as const;

export const R = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const T = {
  display: { fontSize: 30, lineHeight: 34, fontWeight: "700" as const, letterSpacing: -0.6, color: C.ink },
  h1: { fontSize: 24, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.4, color: C.ink },
  h2: { fontSize: 18, lineHeight: 23, fontWeight: "600" as const, letterSpacing: -0.2, color: C.ink },
  body: { fontSize: 16, lineHeight: 23, color: C.ink },
  bodySoft: { fontSize: 16, lineHeight: 23, color: C.inkSoft },
  small: { fontSize: 13, lineHeight: 18, color: C.inkSoft },
  micro: { fontSize: 11.5, lineHeight: 15, color: C.inkMute, letterSpacing: 0.2 },
  mono: { fontSize: 13, lineHeight: 18, fontFamily: "Menlo", color: C.inkSoft },
  label: { fontSize: 12.5, lineHeight: 16, fontWeight: "600" as const, color: C.inkSoft, letterSpacing: 0.3, textTransform: "uppercase" as const },
} as const;

export const SEV_COLOR = { low: C.sevLow, moderate: C.sevModerate, severe: C.sevSevere } as const;
export const SEV_BG = { low: C.sevLowBg, moderate: C.sevModerateBg, severe: C.sevSevereBg } as const;

export const shadow1 = {
  shadowColor: "#2A3220",
  shadowOpacity: 0.1,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

export const shadow2 = {
  shadowColor: "#2A3220",
  shadowOpacity: 0.14,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const;

/** GPS accuracy thresholds (metres) that drive the HUD colour. */
export const ACC_GOOD_M = 8;
export const ACC_OK_M = 20;

export function accuracyTone(m: number | null | undefined): "good" | "ok" | "poor" | "none" {
  if (m == null || !isFinite(m)) return "none";
  if (m <= ACC_GOOD_M) return "good";
  if (m <= ACC_OK_M) return "ok";
  return "poor";
}

export const TONE_COLOR = { good: C.ok, ok: C.sevModerate, poor: C.sevSevere, none: C.inkMute } as const;
