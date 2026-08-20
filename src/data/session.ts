import { useSyncExternalStore } from "react";
import type { Role } from "../types";

/**
 * Mock session. Shape mirrors what Supabase auth will provide (a user + a role
 * claim) so swapping in real auth touches this file only.
 *
 * public         can view the site and map
 * reporter       can submit reports from the app
 * drive-captain  reporter + Quest Drive batch capture
 * moderator      can change status, attach 311 tickets, verify close-outs
 */
export interface Session {
  name: string;
  role: Role;
  since: string;
}

const KEY = "sidequest-atx:session:v1";
const listeners = new Set<() => void>();
let current: Session | null = load();

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getSession(): Session | null {
  return current;
}

export function signIn(name: string, role: Role): Session {
  current = { name: name.trim() || "Quester", role, since: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(current));
  emit();
  return current;
}

export function signOut() {
  current = null;
  localStorage.removeItem(KEY);
  emit();
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

const RANK: Record<Role, number> = { public: 0, reporter: 1, "drive-captain": 2, moderator: 3 };

/** Moderators can do everything; drive captains can report; reporters can report. */
export function hasRole(session: Session | null, needed: Role): boolean {
  if (!session) return needed === "public";
  if (needed === "moderator") return session.role === "moderator";
  return RANK[session.role] >= RANK[needed];
}
