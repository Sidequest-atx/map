import { useSyncExternalStore } from "react";
import type { Role } from "../types";
import { JsonDoc } from "./fs";

/**
 * Who is holding the phone. Same shape as the web app's mock session so the
 * reporter name lands on each record; swapping in Supabase auth touches this
 * file only.
 */
export interface Session {
  name: string;
  role: Role;
  since: string;
}

const doc = new JsonDoc<Session | null>("session.json", () => null);
const listeners = new Set<() => void>();
let current: Session | null = doc.read();

function emit() {
  listeners.forEach((l) => l());
}

export function getSession(): Session | null {
  return current;
}

export function signIn(name: string, role: Role): Session {
  current = { name: name.trim() || "Quester", role, since: new Date().toISOString() };
  doc.write(current);
  emit();
  return current;
}

export function signOut() {
  current = null;
  doc.remove();
  emit();
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
