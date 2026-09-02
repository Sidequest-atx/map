import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { photoUrl, supabase } from "../lib/supabase";
import type { HazardReport } from "../types";
import { fileExists, JsonDoc, readBase64 } from "./fs";
import { getSession } from "./session";
import { getStore } from "./store";

/**
 * Local-first sync. The ledger on this phone stays the source of truth for
 * its own captures; this engine pushes them to the shared map (sq_reports +
 * the sidequest-photos bucket) and pulls back the server ref and any
 * moderation that happened elsewhere.
 *
 * - A row with no remoteId has never left the phone → photo upload + full upsert.
 * - After that, only the fields edited on this phone (dirtyFields) are pushed,
 *   so a phone push can never clobber web moderation of columns it didn't touch.
 * - Deletions are tombstoned by the store → server delete by client_id (a
 *   no-op if the row never landed, so deleting mid-upload leaves no ghost).
 * - Pull rewrites moderation fields from the server; pixels never leave/return.
 * - One failing row is recorded and skipped, never allowed to wedge the rest.
 *
 * Everything is idempotent (client_id is unique server-side), so a retry
 * after a dropped connection can never duplicate a report.
 */

export interface SyncStatus {
  running: boolean;
  /** Rows waiting to reach the shared map (plus pending deletions) */
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

let status: SyncStatus = { running: false, pending: 0, lastSyncAt: null, lastError: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
}

function isDirty(r: HazardReport): boolean {
  if (!r.remoteId) return true;
  return (r.dirtyFields?.length ?? 0) > 0;
}

function pendingCount(): number {
  const store = getStore();
  return store.list().filter(isDirty).length + store.tombstones().length;
}

/* ---------------- base64 ---------------- */

// Lookup-table decoder: String.indexOf per character stalls Hermes for
// seconds on a multi-MB photo; charCodeAt against a table does not.
const B64_LUT = new Int8Array(256).fill(-1);
for (let i = 0; i < 64; i++) {
  B64_LUT["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charCodeAt(i)] = i;
}

function base64ToBytes(b64: string): Uint8Array {
  // First pass: count real base64 chars so the buffer is exact.
  let chars = 0;
  for (let i = 0; i < b64.length; i++) if (B64_LUT[b64.charCodeAt(i)] >= 0) chars++;
  const len = Math.floor((chars * 3) / 4);
  const out = new Uint8Array(len);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < b64.length; i++) {
    const v = B64_LUT[b64.charCodeAt(i)];
    if (v < 0) continue; // padding, whitespace
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (o < len) out[o++] = (acc >> bits) & 255;
    }
  }
  return out;
}

/* ---------------- push ---------------- */

async function uploadPhoto(uid: string, uri: string, name: string): Promise<string> {
  const bytes = base64ToBytes(await readBase64(uri));
  const path = `${uid}/${name}`;
  const { error } = await supabase()
    .storage.from("sidequest-photos")
    .upload(path, bytes.buffer as ArrayBuffer, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`photo upload: ${error.message}`);
  return path;
}

/** local field name → how it lands in the row payload */
const FIELD_TO_COLUMNS: Record<string, (r: HazardReport, row: Record<string, unknown>) => void> = {
  type: (r, row) => (row.type = r.type),
  severity: (r, row) => (row.severity = r.severity),
  status: (r, row) => (row.status = r.status),
  place: (r, row) => (row.place = r.place),
  neighborhood: (r, row) => (row.neighborhood = r.neighborhood),
  description: (r, row) => (row.description = r.description),
  ticket311: (r, row) => (row.ticket_311 = r.ticket311 ?? null),
  resolvedAt: (r, row) => (row.resolved_at = r.resolvedAt ?? null),
  resolvedBy: (r, row) => (row.resolved_by = r.resolvedBy ?? null),
  verified: (r, row) => (row.verified = r.verified ?? false),
  duplicateOf: () => undefined, // mapped separately (needs the remote id)
  afterPhotoUri: () => undefined, // handled by the upload branch
  ai: (r, row) => {
    row.ai_label = r.ai?.label ?? null;
    row.ai_severity = r.ai?.severity ?? null;
    row.ai_confidence = r.ai?.confidence ?? null;
    row.ai_model = r.ai?.model ?? null;
  },
  reporter: (r, row) => (row.reporter = r.reporter ?? ""),
  lng: (r, row) => (row.lng = r.lng),
  lat: (r, row) => (row.lat = r.lat),
};

async function pushOne(r: HazardReport, uid: string, name: string, remoteIdByLocal: Map<string, string>): Promise<void> {
  const sb = supabase();
  const store = getStore();
  const firstPush = !r.remoteId;
  const pushedFields = r.dirtyFields ?? [];

  const row: Record<string, unknown> = { client_id: r.id };

  if (firstPush) {
    Object.assign(row, {
      user_id: uid,
      reporter: r.reporter || name,
      type: r.type,
      severity: r.severity,
      status: r.status,
      source: r.source,
      lng: r.lng,
      lat: r.lat,
      accuracy_m: r.fix?.accuracyM ?? null,
      heading_deg: r.fix?.headingDeg ?? null,
      fix_method: r.fix?.method ?? null,
      taken_at: r.createdAt,
      place: r.place,
      neighborhood: r.neighborhood,
      description: r.description,
      ai_label: r.ai?.label ?? null,
      ai_severity: r.ai?.severity ?? null,
      ai_confidence: r.ai?.confidence ?? null,
      ai_model: r.ai?.model ?? null,
      drive_id: r.driveId ?? null,
      walk_id: r.walkId ?? null,
      ticket_311: r.ticket311 ?? null,
      resolved_at: r.resolvedAt ?? null,
      resolved_by: r.resolvedBy ?? null,
      verified: r.verified ?? false,
    });
  } else {
    // Only what this phone actually changed — web moderation of other
    // columns survives a phone push untouched.
    for (const f of pushedFields) FIELD_TO_COLUMNS[f]?.(r, row);
  }

  if ((firstPush || pushedFields.includes("duplicateOf")) && r.duplicateOf !== undefined) {
    row.duplicate_of = r.duplicateOf ? (remoteIdByLocal.get(r.duplicateOf) ?? null) : null;
  }

  // Pixels travel only on the first push; they never change afterwards.
  if (firstPush && r.photoUri && fileExists(r.photoUri)) {
    row.photo_path = await uploadPhoto(uid, r.photoUri, `${r.id}.jpg`);
    if (r.thumbUri && fileExists(r.thumbUri)) {
      row.thumb_path = await uploadPhoto(uid, r.thumbUri, `${r.id}.t.jpg`);
    }
  }
  // A locally attached after-photo (file://) uploads with its push; a pulled
  // after-photo is already an https URL and stays server-side.
  if ((firstPush || pushedFields.includes("afterPhotoUri")) && r.afterPhotoUri?.startsWith("file") && fileExists(r.afterPhotoUri)) {
    row.after_photo_path = await uploadPhoto(uid, r.afterPhotoUri, `${r.id}.after.jpg`);
  }

  const syncedAt = new Date().toISOString();
  const { data, error } = await sb.from("sq_reports").upsert(row, { onConflict: "client_id" }).select("id, ref").single();
  if (error) throw new Error(error.message);

  // Fields edited while this push was in flight stay dirty for the next pass.
  const fresh = store.get(r.id);
  const remaining = (fresh?.dirtyFields ?? []).filter((f) => !pushedFields.includes(f));
  store.applySync(r.id, {
    remoteId: data.id as string,
    ref: (data.ref as string) ?? r.ref,
    syncedAt,
    dirtyFields: remaining.length ? remaining : undefined,
  });
  remoteIdByLocal.set(r.id, data.id as string);
}

/* ---------------- drives ---------------- */

// Finished Quest Drives feed the site's audited-miles number. They are
// immutable once ended, so each is inserted exactly once (client_id unique,
// duplicates ignored) and remembered here.
const syncedDrivesDoc = new JsonDoc<string[]>("sync-drives.json", () => []);

async function pushDrives(uid: string, name: string): Promise<void> {
  const done = new Set(syncedDrivesDoc.read());
  const drives = getStore()
    .drives()
    .filter((d) => d.endedAt && !done.has(d.id));
  for (const d of drives) {
    const { error } = await supabase()
      .from("sq_drives")
      .upsert(
        {
          client_id: d.id,
          user_id: uid,
          captain: d.captain || name,
          started_at: d.startedAt,
          ended_at: d.endedAt,
          trail: d.trail,
          frames: d.frames,
          reports: d.reports,
          miles: d.miles,
        },
        { onConflict: "client_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(`drive upload: ${error.message}`);
    done.add(d.id);
    syncedDrivesDoc.write([...done]);
  }
}

/* ---------------- pull ---------------- */

interface PullRow {
  id: string;
  client_id: string | null;
  ref: string | null;
  status: HazardReport["status"];
  ticket_311: string | null;
  after_photo_path: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  verified: boolean;
  duplicate_of: string | null;
  updated_at: string;
}

async function pull(uid: string): Promise<void> {
  const store = getStore();
  const { data, error } = await supabase()
    .from("sq_reports")
    .select("id, client_id, ref, status, ticket_311, after_photo_path, resolved_at, resolved_by, verified, duplicate_of, updated_at")
    .eq("user_id", uid);
  if (error) throw new Error(error.message);

  const byRemote = new Map<string, HazardReport>();
  for (const r of store.list()) if (r.remoteId) byRemote.set(r.remoteId, r);

  for (const row of data as PullRow[]) {
    const local = byRemote.get(row.id) ?? (row.client_id ? store.get(row.client_id) : undefined);
    if (!local) continue; // captured on another device signed into the same account
    if (isDirty(local)) continue; // local edits win until they are pushed
    const patch: Partial<HazardReport> = {};
    if (local.status !== row.status) patch.status = row.status;
    if ((local.ticket311 ?? null) !== row.ticket_311) patch.ticket311 = row.ticket_311 ?? undefined;
    if ((local.resolvedAt ?? null) !== row.resolved_at) patch.resolvedAt = row.resolved_at ?? undefined;
    if ((local.resolvedBy ?? null) !== row.resolved_by) patch.resolvedBy = row.resolved_by ?? undefined;
    if ((local.verified ?? false) !== row.verified) patch.verified = row.verified;
    if (row.ref && local.ref !== row.ref) patch.ref = row.ref;
    if (row.after_photo_path && !local.afterPhotoUri) patch.afterPhotoUri = photoUrl(row.after_photo_path);
    const remoteDup = row.duplicate_of ? byRemote.get(row.duplicate_of)?.id : undefined;
    if (remoteDup && local.duplicateOf !== remoteDup) patch.duplicateOf = remoteDup;
    if (Object.keys(patch).length) {
      store.applySync(local.id, { ...patch, updatedAt: row.updated_at, syncedAt: row.updated_at });
    }
  }
}

/* ---------------- engine ---------------- */

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

export async function syncNow(): Promise<void> {
  const session = getSession();
  const store = getStore();
  if (!session?.userId) {
    setStatus({ pending: pendingCount(), lastError: null });
    return;
  }
  if (status.running) return;
  setStatus({ running: true, lastError: null, pending: pendingCount() });
  const uid = session.userId;
  let firstError: string | null = null;
  const fail = (what: string, e: unknown) => {
    if (!firstError) firstError = `${what}: ${e instanceof Error ? e.message : String(e)}`;
  };

  // Deletions first, so a deleted-then-recaptured spot cannot bounce back in.
  // Each item is tried on its own: one poison row must never wedge the rest.
  for (const t of store.tombstones()) {
    try {
      const del = t.remoteId
        ? await supabase().from("sq_reports").delete().eq("id", t.remoteId)
        : await supabase().from("sq_reports").delete().eq("client_id", t.clientId);
      if (del.error) throw new Error(del.error.message);
      await supabase()
        .storage.from("sidequest-photos")
        .remove([`${uid}/${t.clientId}.jpg`, `${uid}/${t.clientId}.t.jpg`, `${uid}/${t.clientId}.after.jpg`])
        .catch(() => undefined);
      store.clearTombstone(t.clientId);
    } catch (e) {
      fail(`delete ${t.clientId.slice(0, 8)}`, e);
    }
  }

  // Oldest first so duplicate_of parents exist before their children.
  const remoteIdByLocal = new Map<string, string>();
  for (const r of store.list()) if (r.remoteId) remoteIdByLocal.set(r.id, r.remoteId);
  const dirty = store
    .list()
    .filter(isDirty)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const r of dirty) {
    try {
      await pushOne(r, uid, session.name, remoteIdByLocal);
    } catch (e) {
      fail(r.ref, e);
    }
    setStatus({ pending: pendingCount() });
  }

  try {
    await pushDrives(uid, session.name);
  } catch (e) {
    fail("drives", e);
  }
  try {
    await pull(uid);
  } catch (e) {
    fail("pull", e);
  }

  setStatus({
    running: false,
    pending: pendingCount(),
    lastSyncAt: firstError ? status.lastSyncAt : new Date().toISOString(),
    lastError: firstError,
  });
  // A capture that landed while this pass ran was debounce-dropped; catch it.
  if (pendingCount() > 0 && !firstError) kick(2000);
}

function kick(delayMs = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delayMs);
}

/** Call once at app start. Safe to call again (no-op). */
export function startSync(): void {
  if (started) return;
  started = true;
  setStatus({ pending: pendingCount() });
  getStore().subscribe(() => {
    setStatus({ pending: pendingCount() });
    if (pendingCount() > 0) kick();
  });
  AppState.addEventListener("change", (s) => {
    if (s === "active") kick(300);
  });
  // Captures queued while signed out go up the moment a session appears.
  supabase().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") kick(1000);
  });
  // Belt-and-braces retry while something is stuck (e.g. captured offline).
  setInterval(() => {
    if (pendingCount() > 0 && !status.running) void syncNow();
  }, 60_000);
  kick(300);
}
