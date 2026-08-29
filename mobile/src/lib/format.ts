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

export function shortTime(msOrIso: number | string): string {
  return new Date(msOrIso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function shortDateTime(msOrIso: number | string): string {
  const d = new Date(msOrIso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${shortTime(msOrIso)}`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtInt(n)} ${n === 1 ? one : many}`;
}

/** Human ref like SQ-P0142 (P = captured on a phone, not yet merged with the shared counter). */
export function makeRef(n: number): string {
  return `SQ-P${String(n).padStart(4, "0")}`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

let counter = 0;
/** UUID v4 with a monotonic fallback for environments without crypto.randomUUID. */
export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  counter += 1;
  const t = Date.now().toString(16);
  const r = Math.random().toString(16).slice(2, 10);
  return `${t}-${r}-${counter.toString(16)}`;
}
