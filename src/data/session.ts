import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { DEMO, supabase } from "../lib/supabase";
import type { Role } from "../types";

/**
 * Session backed by Supabase auth (email + password). The exported shape is
 * unchanged from the mock era, so pages only ever see { name, role, since }.
 *
 * public         can view the site and map (no account)
 * reporter       submits photos, from the iPhone app only (accounts are made there)
 * moderator      routes reports to 311, verifies close-outs (the Portal here)
 *
 * Moderator comes from the JWT claim app_metadata.sq_role, granted by hand in
 * the database (see supabase/SETUP.md); nothing a client sends can elevate it.
 *
 * With VITE_DEMO=1 the old localStorage mock session returns, matching the
 * seeded demo store.
 */
export interface Session {
  name: string;
  role: Role;
  since: string;
}

const listeners = new Set<() => void>();
let current: Session | null = null;
let ready = DEMO; // demo mode has no async auth to wait for

function emit() {
  listeners.forEach((l) => l());
}

/* ---------------- Supabase-backed (the real thing) ---------------- */

function fromSupabase(s: SupabaseSession | null): Session | null {
  if (!s) return null;
  const meta = (s.user.app_metadata ?? {}) as { sq_role?: string };
  const role: Role = meta.sq_role === "moderator" ? "moderator" : "reporter";
  // Never fall back to the email handle: this name is written into public
  // fields such as a report's "resolved by".
  const name = (s.user.user_metadata as { display_name?: string } | null)?.display_name?.trim() || (role === "moderator" ? "Moderator" : "Quester");
  return { name, role, since: s.user.created_at };
}

if (!DEMO) {
  const sb = supabase();
  void sb.auth
    .getSession()
    .then(({ data }) => {
      current = fromSupabase(data.session);
    })
    .catch(() => undefined)
    .finally(() => {
      // Whatever happened, stop gating routes on the startup read.
      ready = true;
      emit();
    });
  sb.auth.onAuthStateChange((_event, s) => {
    current = fromSupabase(s);
    ready = true;
    emit();
  });
}

/** Signs in and returns the session (role included) so the caller can route by role. */
export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  const s = fromSupabase(data.session);
  if (!s) throw new Error("Sign-in returned no session.");
  current = s;
  emit();
  return s;
}

/** Emails a one-time code for choosing a new password (Supabase recovery OTP). */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}

/** Checks the emailed code, sets the new password, and signs the person in. */
export async function resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<Session> {
  const { data, error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.replace(/\s+/g, ""), type: "recovery" });
  if (error) throw error;
  const { error: updateError } = await supabase().auth.updateUser({ password: newPassword });
  if (updateError) throw updateError;
  const s = fromSupabase(data.session);
  if (!s) throw new Error("Reset returned no session.");
  current = s;
  emit();
  return s;
}

/* ---------------- Demo mock (VITE_DEMO=1) ---------------- */

const MOCK_KEY = "sidequest-atx:session:v1";

if (DEMO) {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    current = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    current = null;
  }
}

export function signInDemo(name: string, role: Role): Session {
  current = { name: name.trim() || "Quester", role, since: new Date().toISOString() };
  localStorage.setItem(MOCK_KEY, JSON.stringify(current));
  emit();
  return current;
}

/* ---------------- Shared surface ---------------- */

export function getSession(): Session | null {
  return current;
}

export function signOut() {
  if (DEMO) {
    current = null;
    localStorage.removeItem(MOCK_KEY);
    emit();
    return;
  }
  // Local scope: signing out of the website must not also sign the same
  // account out of the phone app (the default scope is "global").
  // onAuthStateChange clears `current` on success; a failed (offline) revoke
  // still signs this browser out locally.
  supabase()
    .auth.signOut({ scope: "local" })
    .then(({ error }) => {
      if (error) {
        current = null;
        localStorage.removeItem("sidequest-atx-auth");
        emit();
      }
    })
    .catch(() => {
      current = null;
      localStorage.removeItem("sidequest-atx-auth");
      emit();
    });
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}

/** False only during the brief startup read of the persisted auth session. */
export function useAuthReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready,
    () => ready,
  );
}

const RANK: Record<Role, number> = { public: 0, reporter: 1, "drive-captain": 2, moderator: 3 };

/** Moderators can do everything; drive captains can report; reporters can report. */
export function hasRole(session: Session | null, needed: Role): boolean {
  if (!session) return needed === "public";
  if (needed === "moderator") return session.role === "moderator";
  return RANK[session.role] >= RANK[needed];
}
