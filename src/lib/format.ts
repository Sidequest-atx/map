const DAY = 86_400_000;

export function daysBetween(aIso: string, bIso: string = new Date().toISOString()): number {
  return Math.max(0, Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / DAY));
}

export function relativeDays(iso: string): string {
  const d = daysBetween(iso);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.round(d / 30)} mo ago`;
  return `${(d / 365).toFixed(1)} yr ago`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtInt(n)} ${n === 1 ? one : many}`;
}

/** Human ref like SQ-0142 from a running counter. */
export function makeRef(n: number): string {
  return `SQ-${String(n).padStart(4, "0")}`;
}
