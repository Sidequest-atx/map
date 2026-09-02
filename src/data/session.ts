import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { DEMO, supabase } from "../lib/supabase";
import type { Role } from "../types";

/**
 * Session backed by Supabase auth (email + password). The exported shape is
 * unchanged from the mock era, so pages only ever see { name, role, since }.
 *
 * public         can view the site and map (no account)
 * reporter       submits photos — from the iPhone app only
 * moderator      routes reports to 311, verifies close-outs (the Portal here)
 *
 * Moderator comes from the JWT claim app_metadata.sq_role, granted server-side
 * (see supabase/schema.sql); nothing a client sends can elevate it.
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
  const name =
    (s.user.user_metadata as { display_name?: string } | null)?.display_name?.trim() ||
    s.user.email?.split("@")[0] ||
    "Quester";
  return {
    name,
    role: meta.sq_role === "moderator" ? "moderator" : "reporter",
    since: s.user.created_at,
  };
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

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signUpWithPassword(name: string, email: string, password: string): Promise<void> {
  const { data, error } = await supabase().auth.signUp({
    email,
    password,
    options: { data: { display_name: name.trim() } },
  });
  if (error) throw new Error(error.message);
  // With email confirmation off this returns a session; if confirmation is on,
  // tell the person what to do instead of silently doing nothing.
  if (!data.session) throw new Error("Account created — confirm the email we sent, then sign in.");
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
  // onAuthStateChange clears `current` on success; a failed (offline) revoke
  // still signs this browser out locally.
  supabase()
    .auth.signOut()
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
