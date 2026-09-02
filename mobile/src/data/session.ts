import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";
import type { Role } from "../types";
import { JsonDoc } from "./fs";

/**
 * Who is holding the phone — backed by Supabase auth (email + password), with
 * a synchronous mirror in session.json so the app opens signed-in with no
 * network and no async gap. The moderator role comes from the JWT claim
 * app_metadata.sq_role, granted server-side (see /supabase/schema.sql);
 * nothing on the phone can elevate it.
 */
export interface Session {
  name: string;
  role: Role;
  since: string;
  /** Supabase user id — the sync engine stamps it on uploads */
  userId?: string;
  email?: string;
}

const doc = new JsonDoc<Session | null>("session.json", () => null);
const listeners = new Set<() => void>();
let current: Session | null = doc.read();

function emit() {
  listeners.forEach((l) => l());
}

function fromSupabase(s: SupabaseSession | null): Session | null {
  if (!s) return null;
  const meta = (s.user.app_metadata ?? {}) as { sq_role?: string };
  const name =
    (s.user.user_metadata as { display_name?: string } | null)?.display_name?.trim() ||
    s.user.email?.split("@")[0] ||
    "Quester";
  return {
    name,
    role: meta.sq_role === "moderator" ? "moderator" : "reporter",
    since: s.user.created_at,
    userId: s.user.id,
    email: s.user.email ?? undefined,
  };
}

function set(next: Session | null) {
  current = next;
  if (next) doc.write(next);
  else doc.remove();
  emit();
}

// Adopt the persisted Supabase session (AsyncStorage) and follow changes.
// The JsonDoc mirror covers the async gap before this resolves.
void supabase()
  .auth.getSession()
  .then(({ data }) => {
    const s = fromSupabase(data.session);
    // Signed out remotely (or token pruned): drop the stale mirror.
    if (JSON.stringify(s) !== JSON.stringify(current)) set(s);
  })
  .catch(() => undefined);
supabase().auth.onAuthStateChange((_event, s) => {
  const next = fromSupabase(s);
  if (JSON.stringify(next) !== JSON.stringify(current)) set(next);
});

// RN suspends timers in the background; run the token auto-refresh only while
// the app is foregrounded (the pattern Supabase documents for React Native).
supabase().auth.startAutoRefresh();
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase().auth.startAutoRefresh();
  else supabase().auth.stopAutoRefresh();
});

export function getSession(): Session | null {
  return current;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
}

export async function signUpWithPassword(name: string, email: string, password: string): Promise<void> {
  const { data, error } = await supabase().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: name.trim() } },
  });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error("Account created — confirm the email we sent, then sign in.");
}

export function signOut() {
  set(null);
  // Best-effort server-side revoke. If it fails (offline), supabase-js keeps
  // its AsyncStorage session and would silently sign the user back in on the
  // next cold start — so clear that storage ourselves on any failure.
  const wipe = () => void AsyncStorage.removeItem("sidequest-atx-auth").catch(() => undefined);
  supabase()
    .auth.signOut()
    .then(({ error }) => {
      if (error) wipe();
    })
    .catch(wipe);
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

const RANK: Record<Role, number> = { reporter: 1, "drive-captain": 2, moderator: 3 };

export function hasRole(session: Session | null, needed: Role): boolean {
  if (!session) return false;
  if (needed === "moderator") return session.role === "moderator";
  return RANK[session.role] >= RANK[needed];
}

/** App-level preferences (small, synchronous). */
export interface Prefs {
  /** Save every hazard photo to the Photos app album as well as the ledger */
  saveToPhotos: boolean;
  /** Seconds to add to glasses photo timestamps when matching to the trail */
  glassesClockOffsetS: number;
  /** Auto-capture interval for Quest Drives */
  driveIntervalS: 0 | 5 | 10;
}

const DEFAULT_PREFS: Prefs = { saveToPhotos: true, glassesClockOffsetS: 0, driveIntervalS: 5 };
const prefsDoc = new JsonDoc<Prefs>("prefs.json", () => ({ ...DEFAULT_PREFS }));
let prefs: Prefs = { ...DEFAULT_PREFS, ...prefsDoc.read() };
const prefListeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return prefs;
}
export function setPrefs(patch: Partial<Prefs>): void {
  prefs = { ...prefs, ...patch };
  prefsDoc.write(prefs);
  prefListeners.forEach((l) => l());
}
export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      prefListeners.add(l);
      return () => prefListeners.delete(l);
    },
    () => prefs,
    () => prefs,
  );
}
