import { useSyncExternalStore } from "react";
import { makeRef } from "../lib/format";
import { DEMO } from "../lib/supabase";
import type { DriveSession, HazardReport, ReportStatus } from "../types";
import { SupabaseStore } from "./remote";
import { DEMO_REPORTER, SEED_DRIVES, SEED_REPORTS } from "./seed";

/**
 * Storage abstraction. The live store is Supabase (src/data/remote.ts,
 * schema in /supabase/schema.sql); VITE_DEMO=1 swaps in the original
 * localStorage prototype with seeded NW Austin data.
 *
 * Rules the store enforces regardless of backend:
 *  - a report cannot become "resolved" without an after-photo
 *  - status only moves along STATUS_FLOW (or back to open on reopen)
 */
export interface ReportStore {
  list(): HazardReport[];
  get(id: string): HazardReport | undefined;
  drives(): DriveSession[];
  nextRef(): string;
  add(report: Omit<HazardReport, "ref"> & { ref?: string }): HazardReport;
  addMany(reports: (Omit<HazardReport, "ref"> & { ref?: string })[], drive?: DriveSession): HazardReport[];
  update(id: string, patch: Partial<HazardReport>): void;
  setStatus(id: string, status: ReportStatus, meta?: { ticket311?: string; afterPhoto?: string; by?: string; verified?: boolean }): { ok: true } | { ok: false; reason: string };
  resetDemo(): void;
  subscribe(listener: () => void): () => void;
}

const KEY = "sidequest-atx:reports:v2";
const DRIVES_KEY = "sidequest-atx:drives:v1";

class LocalStorageStore implements ReportStore {
  private reports: HazardReport[];
  private driveSessions: DriveSession[];
  private listeners = new Set<() => void>();
  private snapshot: HazardReport[] | null = null;

  constructor() {
    this.reports = this.load(KEY, SEED_REPORTS);
    this.driveSessions = this.load(DRIVES_KEY, SEED_DRIVES);
  }

  private load<T>(key: string, seed: T[]): T[] {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {
      // corrupted local data: fall through to seeds
    }
    return seed.map((s) => ({ ...s }));
  }

  private persist() {
    this.snapshot = null;
    this.driveSnapshot = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.reports));
    } catch {
      // Quota exceeded (photos are large): drop oldest photos, keep records.
      const slim = this.reports.map((r, i) =>
        i < this.reports.length - 20 ? { ...r, photo: undefined, afterPhoto: undefined } : r,
      );
      try {
        localStorage.setItem(KEY, JSON.stringify(slim));
        this.reports = slim;
      } catch {
        // in-memory only for this session
      }
    }
    try {
      localStorage.setItem(DRIVES_KEY, JSON.stringify(this.driveSessions));
    } catch {
      // ignore
    }
    this.listeners.forEach((l) => l());
  }

  list(): HazardReport[] {
    if (!this.snapshot) {
      this.snapshot = [...this.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return this.snapshot;
  }

  get(id: string) {
    return this.reports.find((r) => r.id === id || r.ref === id);
  }

  private driveSnapshot: DriveSession[] | null = null;
  drives() {
    if (!this.driveSnapshot) {
      this.driveSnapshot = [...this.driveSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    }
    return this.driveSnapshot;
  }

  nextRef(): string {
    let max = 0;
    for (const r of this.reports) {
      const n = Number(r.ref?.replace(/\D/g, "") ?? 0);
      if (n > max) max = n;
    }
    return makeRef(max + 1);
  }

  add(report: Omit<HazardReport, "ref"> & { ref?: string }): HazardReport {
    const full: HazardReport = { ...report, ref: report.ref ?? this.nextRef() };
    this.reports.push(full);
    this.persist();
    return full;
  }

  addMany(reports: (Omit<HazardReport, "ref"> & { ref?: string })[], drive?: DriveSession): HazardReport[] {
    const out: HazardReport[] = [];
    let n = Number(this.nextRef().replace(/\D/g, ""));
    for (const r of reports) {
      const full: HazardReport = { ...r, ref: r.ref ?? makeRef(n++) };
      this.reports.push(full);
      out.push(full);
    }
    if (drive) this.driveSessions.push(drive);
    this.persist();
    return out;
  }

  update(id: string, patch: Partial<HazardReport>) {
    const r = this.reports.find((x) => x.id === id);
    if (!r) return;
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    this.persist();
  }

  setStatus(id: string, status: ReportStatus, meta: { ticket311?: string; afterPhoto?: string; by?: string; verified?: boolean } = {}) {
    const r = this.reports.find((x) => x.id === id);
    if (!r) return { ok: false as const, reason: "Report not found." };
    if (status === "resolved" && !(meta.afterPhoto || r.afterPhoto)) {
      return { ok: false as const, reason: "An after-photo is required to resolve a report." };
    }
    const now = new Date().toISOString();
    r.status = status;
    r.updatedAt = now;
    if (meta.ticket311) r.ticket311 = meta.ticket311;
    if (status === "resolved") {
      r.afterPhoto = meta.afterPhoto ?? r.afterPhoto;
      r.resolvedAt = now;
      r.resolvedBy = meta.by ?? r.resolvedBy ?? "moderator";
      r.verified = meta.verified ?? r.verified ?? false;
    } else if (r.resolvedAt) {
      // reopened
      r.resolvedAt = undefined;
      r.verified = false;
    }
    this.persist();
    return { ok: true as const };
  }

  resetDemo() {
    this.reports = SEED_REPORTS.map((s) => ({ ...s }));
    this.driveSessions = SEED_DRIVES.map((s) => ({ ...s }));
    this.persist();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

let instance: ReportStore | null = null;

export function getStore(): ReportStore {
  if (!instance) instance = DEMO ? new LocalStorageStore() : new SupabaseStore();
  return instance;
}

export function useReports(): HazardReport[] {
  const store = getStore();
  return useSyncExternalStore(store.subscribe.bind(store), () => store.list(), () => store.list());
}

export function useDrives(): DriveSession[] {
  const store = getStore();
  const subscribe = store.subscribe.bind(store);
  return useSyncExternalStore(subscribe, () => store.drives(), () => store.drives());
}

export function isDemo(r: HazardReport): boolean {
  return r.reporter === DEMO_REPORTER || r.id.startsWith("seed-");
}

/** True while every report on file is seed data. */
export function allDemo(reports: HazardReport[]): boolean {
  return reports.every(isDemo);
}
