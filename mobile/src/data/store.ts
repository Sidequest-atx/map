import { useSyncExternalStore } from "react";
import { makeRef } from "../lib/format";
import type { DriveSession, HazardReport, ReportStatus, WalkSession } from "../types";
import { deleteIfExists, JsonDoc } from "./fs";

/**
 * Local-first ledger. Same interface and rules as the web app's ReportStore:
 *  - a report cannot become "resolved" without an after-photo
 *  - status only moves along STATUS_FLOW (or back to open on reopen)
 * No demo seeds on the phone: the map shows only what this device captured.
 * Photos live as files (see fs.ts); the ledger holds URIs, never pixels.
 */
export interface ReportStore {
  list(): HazardReport[];
  get(id: string): HazardReport | undefined;
  drives(): DriveSession[];
  walks(): WalkSession[];
  nextRef(): string;
  add(report: Omit<HazardReport, "ref"> & { ref?: string }): HazardReport;
  addMany(reports: (Omit<HazardReport, "ref"> & { ref?: string })[], session?: { drive?: DriveSession; walk?: WalkSession }): HazardReport[];
  update(id: string, patch: Partial<HazardReport>): void;
  setStatus(
    id: string,
    status: ReportStatus,
    meta?: { ticket311?: string; afterPhotoUri?: string; by?: string; verified?: boolean },
  ): { ok: true } | { ok: false; reason: string };
  remove(id: string): void;
  /** Write sync bookkeeping without touching updatedAt or dirtyFields (so a push never re-dirties the row). */
  applySync(id: string, patch: Partial<HazardReport>): void;
  tombstones(): Tombstone[];
  clearTombstone(clientId: string): void;
  subscribe(listener: () => void): () => void;
}

/** A report the reporter deleted locally; the sync engine deletes it from the shared map too. */
export interface Tombstone {
  /** Server uuid when the delete happened after a successful push */
  remoteId?: string;
  clientId: string;
}

/** Local bookkeeping and media fields that never sync by themselves. */
const SYNC_IRRELEVANT = new Set<string>(["photoUri", "thumbUri", "photoAssetId", "remoteId", "syncedAt", "dirtyFields", "rank", "updatedAt", "fix", "id", "ref", "walkId", "driveId", "createdAt", "source"]);

function markDirty(r: HazardReport, fields: string[]): string[] | undefined {
  const next = new Set(r.dirtyFields ?? []);
  for (const f of fields) if (!SYNC_IRRELEVANT.has(f)) next.add(f);
  return next.size ? [...next] : r.dirtyFields;
}

class LedgerStore implements ReportStore {
  private reportsDoc = new JsonDoc<HazardReport[]>("reports.json", () => []);
  private drivesDoc = new JsonDoc<DriveSession[]>("drives.json", () => []);
  private walksDoc = new JsonDoc<WalkSession[]>("walks.json", () => []);
  private tombstonesDoc = new JsonDoc<Tombstone[]>("sync-removed.json", () => []);
  private reports: HazardReport[];
  private driveSessions: DriveSession[];
  private walkSessions: WalkSession[];
  private listeners = new Set<() => void>();
  private snapshot: HazardReport[] | null = null;
  private driveSnapshot: DriveSession[] | null = null;
  private walkSnapshot: WalkSession[] | null = null;

  constructor() {
    this.reports = this.reportsDoc.read();
    this.driveSessions = this.drivesDoc.read();
    this.walkSessions = this.walksDoc.read();
  }

  private persist() {
    this.snapshot = null;
    this.driveSnapshot = null;
    this.walkSnapshot = null;
    this.reportsDoc.write(this.reports);
    this.drivesDoc.write(this.driveSessions);
    this.walksDoc.write(this.walkSessions);
    this.listeners.forEach((l) => l());
  }

  list(): HazardReport[] {
    if (!this.snapshot) this.snapshot = [...this.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.snapshot;
  }

  get(id: string) {
    return this.reports.find((r) => r.id === id || r.ref === id);
  }

  drives() {
    if (!this.driveSnapshot) this.driveSnapshot = [...this.driveSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return this.driveSnapshot;
  }

  walks() {
    if (!this.walkSnapshot) this.walkSnapshot = [...this.walkSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return this.walkSnapshot;
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

  addMany(reports: (Omit<HazardReport, "ref"> & { ref?: string })[], session?: { drive?: DriveSession; walk?: WalkSession }): HazardReport[] {
    const out: HazardReport[] = [];
    let n = Number(this.nextRef().replace(/\D/g, ""));
    for (const r of reports) {
      const full: HazardReport = { ...r, ref: r.ref ?? makeRef(n++) };
      this.reports.push(full);
      out.push(full);
    }
    if (session?.drive) this.driveSessions.push(session.drive);
    if (session?.walk) this.walkSessions.push(session.walk);
    this.persist();
    return out;
  }

  /**
   * Rows are replaced, never mutated in place: `useReport` compares the object it
   * gets back by identity, so an in-place edit would leave the detail screen showing
   * the old status after a moderator changed it.
   */
  update(id: string, patch: Partial<HazardReport>) {
    const i = this.reports.findIndex((x) => x.id === id);
    if (i < 0) return;
    const prev = this.reports[i];
    this.reports[i] = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
      dirtyFields: markDirty(prev, Object.keys(patch)),
    };
    this.persist();
  }

  setStatus(id: string, status: ReportStatus, meta: { ticket311?: string; afterPhotoUri?: string; by?: string; verified?: boolean } = {}) {
    const i = this.reports.findIndex((x) => x.id === id);
    if (i < 0) return { ok: false as const, reason: "Report not found." };
    const prev = this.reports[i];
    if (status === "resolved" && !(meta.afterPhotoUri || prev.afterPhotoUri)) {
      return { ok: false as const, reason: "An after-photo is required to resolve a report." };
    }
    const now = new Date().toISOString();
    const r: HazardReport = { ...prev, status, updatedAt: now };
    const touched = ["status", "resolvedAt", "resolvedBy", "verified"];
    if (meta.ticket311) {
      r.ticket311 = meta.ticket311;
      touched.push("ticket311");
    }
    if (status === "resolved") {
      r.afterPhotoUri = meta.afterPhotoUri ?? prev.afterPhotoUri;
      touched.push("afterPhotoUri");
      r.resolvedAt = now;
      r.resolvedBy = meta.by ?? prev.resolvedBy ?? "moderator";
      r.verified = meta.verified ?? prev.verified ?? false;
    } else if (prev.resolvedAt) {
      r.resolvedAt = undefined;
      r.verified = false;
    }
    r.dirtyFields = markDirty(prev, touched);
    this.reports[i] = r;
    this.persist();
    return { ok: true as const };
  }

  remove(id: string) {
    const idx = this.reports.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [r] = this.reports.splice(idx, 1);
    // Always tombstone: a delete during the first in-flight upload would
    // otherwise leave a ghost row on the shared map (the sync engine deletes
    // by client_id, a no-op if the row never landed).
    this.tombstonesDoc.write([...this.tombstonesDoc.read(), { remoteId: r.remoteId, clientId: r.id }]);
    deleteIfExists(r.photoUri);
    deleteIfExists(r.thumbUri);
    deleteIfExists(r.afterPhotoUri);
    for (let i = 0; i < this.reports.length; i++) {
      if (this.reports[i].duplicateOf === r.id) this.reports[i] = { ...this.reports[i], duplicateOf: undefined };
    }
    this.persist();
  }

  applySync(id: string, patch: Partial<HazardReport>) {
    const i = this.reports.findIndex((x) => x.id === id);
    if (i < 0) return;
    this.reports[i] = { ...this.reports[i], ...patch };
    this.persist();
  }

  /** Pending remote deletions (consumed by the sync engine on success). */
  tombstones(): Tombstone[] {
    return this.tombstonesDoc.read();
  }

  clearTombstone(clientId: string) {
    this.tombstonesDoc.write(this.tombstonesDoc.read().filter((t) => t.clientId !== clientId));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

let instance: ReportStore | null = null;

export function getStore(): ReportStore {
  if (!instance) instance = new LedgerStore();
  return instance;
}

export function useReports(): HazardReport[] {
  const store = getStore();
  return useSyncExternalStore(store.subscribe.bind(store), () => store.list(), () => store.list());
}

export function useDrives(): DriveSession[] {
  const store = getStore();
  return useSyncExternalStore(store.subscribe.bind(store), () => store.drives(), () => store.drives());
}

export function useWalks(): WalkSession[] {
  const store = getStore();
  return useSyncExternalStore(store.subscribe.bind(store), () => store.walks(), () => store.walks());
}

export function useReport(id: string | undefined): HazardReport | undefined {
  const store = getStore();
  return useSyncExternalStore(
    store.subscribe.bind(store),
    () => (id ? store.get(id) : undefined),
    () => (id ? store.get(id) : undefined),
  );
}
