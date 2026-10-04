import { toast } from "../components/Toast";
import { friendlySaveError } from "../lib/authErrors";
import { photoUrl, supabase } from "../lib/supabase";
import { STATUS_LABELS, type DriveSession, type HazardReport, type HazardType, type ReportStatus, type Severity } from "../types";
import type { LoadState, ReportStore } from "./store";

/**
 * ReportStore backed by the shared Supabase project (tables sq_reports /
 * sq_drives, bucket sidequest-photos). Reads are public; the moderator Portal
 * writes through the signed-in session and RLS has the final say.
 *
 * The interface is synchronous, so this store keeps an in-memory cache:
 * mutations apply optimistically and push async. A refused or failed write
 * is rolled back at once (it does not wait for a refetch, which also fails
 * offline), and "saved" is only announced after the server confirms.
 */

interface Row {
  id: string;
  client_id: string | null;
  ref: string | null;
  user_id: string | null;
  reporter: string;
  type: HazardType;
  severity: Severity;
  status: ReportStatus;
  source: HazardReport["source"];
  lng: number;
  lat: number;
  accuracy_m: number | null;
  heading_deg: number | null;
  fix_method: string | null;
  taken_at: string | null;
  place: string;
  neighborhood: string;
  description: string;
  photo_path: string | null;
  thumb_path: string | null;
  after_photo_path: string | null;
  ai_label: string | null;
  ai_severity: string | null;
  ai_confidence: number | null;
  ai_model: string | null;
  drive_id: string | null;
  walk_id: string | null;
  ticket_311: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  verified: boolean;
  duplicate_of: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: Row): HazardReport {
  return {
    id: row.id,
    ref: row.ref ?? "SQ-????",
    type: row.type,
    severity: row.severity,
    status: row.status,
    source: row.source,
    lng: row.lng,
    lat: row.lat,
    place: row.place,
    neighborhood: row.neighborhood,
    description: row.description,
    photo: photoUrl(row.photo_path),
    ai:
      row.ai_label && row.ai_severity && row.ai_confidence != null
        ? { label: row.ai_label as HazardType, severity: row.ai_severity as Severity, confidence: row.ai_confidence, model: row.ai_model ?? "unknown" }
        : undefined,
    reporter: row.reporter || undefined,
    driveId: row.drive_id ?? undefined,
    ticket311: row.ticket_311 ?? undefined,
    afterPhoto: photoUrl(row.after_photo_path),
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    verified: row.verified || undefined,
    duplicateOf: row.duplicate_of ?? undefined,
    createdAt: row.taken_at ?? row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The subset of HazardReport fields the web UI ever patches, as columns. */
function patchToRow(patch: Partial<HazardReport>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.type !== undefined) out.type = patch.type;
  if (patch.severity !== undefined) out.severity = patch.severity;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.place !== undefined) out.place = patch.place;
  if (patch.neighborhood !== undefined) out.neighborhood = patch.neighborhood;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.ticket311 !== undefined) out.ticket_311 = patch.ticket311;
  if (patch.resolvedAt !== undefined) out.resolved_at = patch.resolvedAt ?? null;
  if (patch.resolvedBy !== undefined) out.resolved_by = patch.resolvedBy ?? null;
  if (patch.verified !== undefined) out.verified = patch.verified ?? false;
  if (patch.duplicateOf !== undefined) out.duplicate_of = patch.duplicateOf ?? null;
  return out;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

const NOT_SAVED = "the report no longer exists, or you lack the role";

export class SupabaseStore implements ReportStore {
  private reports: HazardReport[] = [];
  private driveSessions: DriveSession[] = [];
  private listeners = new Set<() => void>();
  private snapshot: HazardReport[] | null = null;
  private driveSnapshot: DriveSession[] | null = null;
  private started = false;
  private state: LoadState = { loaded: false, error: null };

  private emit() {
    this.snapshot = null;
    this.driveSnapshot = null;
    this.listeners.forEach((l) => l());
  }

  private setState(next: LoadState) {
    if (next.loaded === this.state.loaded && next.error === this.state.error) return;
    this.state = next;
  }

  private start() {
    if (this.started) return;
    this.started = true;
    void this.refresh();
    supabase()
      .channel("sq-reports-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sq_reports" }, () => void this.refresh())
      .subscribe();
    // Realtime can drop silently on laptops that sleep; refetch when the tab returns.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void this.refresh();
      });
    }
    // A load that failed while offline would otherwise sit on its error until
    // someone pressed Try again. Nothing is refetched if the last load worked.
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        if (!this.state.loaded || this.state.error) void this.refresh();
      });
    }
  }

  async refresh(): Promise<void> {
    const sb = supabase();
    try {
      const [reports, drives] = await Promise.all([
        sb.from("sq_reports").select("*").order("created_at", { ascending: false }).limit(5000),
        sb.from("sq_drives").select("*").order("started_at", { ascending: false }).limit(500),
      ]);
      if (reports.error) {
        console.warn("sq_reports fetch failed:", reports.error.message);
        this.setState({ loaded: this.state.loaded, error: reports.error.message });
        this.emit();
        return;
      }
      this.reports = (reports.data as Row[]).map(fromRow);
      if (!drives.error && drives.data) {
        this.driveSessions = drives.data.map((d) => ({
          id: d.id as string,
          captain: (d.captain as string) || "",
          startedAt: d.started_at as string,
          endedAt: (d.ended_at as string) ?? undefined,
          trail: (d.trail as [number, number][]) ?? [],
          frames: (d.frames as number) ?? 0,
          reports: (d.reports as number) ?? 0,
          miles: (d.miles as number) ?? 0,
        }));
      }
      this.setState({ loaded: true, error: null });
      this.emit();
    } catch (e) {
      console.warn("sq_reports fetch failed:", e);
      this.setState({ loaded: this.state.loaded, error: e instanceof Error ? e.message : String(e) });
      this.emit();
    }
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

  drives() {
    if (!this.driveSnapshot) {
      this.driveSnapshot = [...this.driveSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    }
    return this.driveSnapshot;
  }

  loadState(): LoadState {
    return this.state;
  }

  reload() {
    void this.refresh();
  }

  nextRef(): string {
    // The server assigns refs; the web surface no longer creates reports.
    return "SQ-????";
  }

  add(): HazardReport {
    throw new Error("Photos are captured in the iPhone app; the website is the map.");
  }

  addMany(): HazardReport[] {
    throw new Error("Photos are captured in the iPhone app; the website is the map.");
  }

  /** Put a report back the way it was before a write the server refused. */
  private restore(prev: HazardReport) {
    const i = this.reports.findIndex((x) => x.id === prev.id);
    if (i < 0) return;
    this.reports[i] = prev;
    this.emit();
  }

  private failed(prev: HazardReport, e: unknown) {
    console.warn("[SideQuest] write failed:", e);
    this.restore(prev);
    toast(friendlySaveError(e), "danger");
    void this.refresh();
  }

  update(id: string, patch: Partial<HazardReport>, opts?: { successToast?: string }) {
    const i = this.reports.findIndex((x) => x.id === id);
    if (i < 0) return;
    const prev = this.reports[i];
    this.reports[i] = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    this.emit();
    const row = patchToRow(patch);
    if (Object.keys(row).length === 0) return;
    // .select() so an RLS mismatch or a since-deleted row (0 rows updated,
    // which PostgREST reports as success) is caught, not silently kept.
    void supabase()
      .from("sq_reports")
      .update(row)
      .eq("id", id)
      .select("id")
      .then(
        ({ data, error }) => {
          if (error || !data?.length) this.failed(prev, error ?? new Error(NOT_SAVED));
          else if (opts?.successToast) toast(opts.successToast, "ok");
        },
        (e: unknown) => this.failed(prev, e),
      );
  }

  setStatus(id: string, status: ReportStatus, meta: { ticket311?: string; afterPhoto?: string; by?: string; verified?: boolean } = {}) {
    const i = this.reports.findIndex((x) => x.id === id);
    if (i < 0) return { ok: false as const, reason: "Report not found." };
    const prev = this.reports[i];
    if (status === "resolved" && !(meta.afterPhoto || prev.afterPhoto)) {
      return { ok: false as const, reason: "An after-photo is required to resolve a report." };
    }
    const now = new Date().toISOString();
    const reopening = prev.status === "resolved" && status !== "resolved";
    const next: HazardReport = { ...prev, status, updatedAt: now };
    if (meta.ticket311) next.ticket311 = meta.ticket311;
    if (status === "resolved") {
      next.afterPhoto = meta.afterPhoto ?? prev.afterPhoto;
      next.resolvedAt = now;
      next.resolvedBy = meta.by ?? prev.resolvedBy ?? "moderator";
      next.verified = meta.verified ?? prev.verified ?? false;
    } else if (reopening || prev.resolvedAt) {
      // Reopened: the old close-out no longer applies, so a new after-photo is needed.
      next.resolvedAt = undefined;
      next.resolvedBy = undefined;
      next.afterPhoto = undefined;
      next.verified = false;
    }
    this.reports[i] = next;
    this.emit();
    void this.pushStatus(prev, next, meta, reopening);
    return { ok: true as const };
  }

  private async pushStatus(prev: HazardReport, next: HazardReport, meta: { afterPhoto?: string }, reopening: boolean) {
    const sb = supabase();
    try {
      const row: Record<string, unknown> = {
        status: next.status,
        ticket_311: next.ticket311 ?? null,
        resolved_at: next.resolvedAt ?? null,
        resolved_by: next.resolvedBy ?? null,
        verified: next.verified ?? false,
      };
      if (reopening) row.after_photo_path = null;
      // A new after-photo arrives as a data URL from the Portal's file input;
      // it becomes an object under the signed-in moderator's folder.
      if (meta.afterPhoto?.startsWith("data:")) {
        const { data: auth } = await sb.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) throw new Error("Sign in to attach an after-photo.");
        const path = `${uid}/${prev.id}.after.jpg`;
        const up = await sb.storage.from("sidequest-photos").upload(path, await dataUrlToBlob(meta.afterPhoto), {
          contentType: "image/jpeg",
          upsert: true,
        });
        if (up.error) throw new Error(`upload: ${up.error.message}`);
        row.after_photo_path = path;
      }
      const { data, error } = await sb.from("sq_reports").update(row).eq("id", prev.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error(NOT_SAVED);
      toast(`${prev.ref} → ${STATUS_LABELS[next.status]}`, "ok");
    } catch (e) {
      this.failed(prev, e);
    }
  }

  resetDemo() {
    // Live data has no demo reset; the Portal hides the button.
  }

  subscribe(listener: () => void): () => void {
    this.start();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
