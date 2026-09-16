import AsyncStorage from "@react-native-async-storage/async-storage";
import { isAuthRetryableFetchError, type Session as SupabaseSession } from "@supabase/supabase-js";
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

/**
 * Bumped by every sign-out on this phone. The offline startup read can take
 * ~25 s to settle; if the person signed out meanwhile, that late result must
 * not bring the old session back.
 */
let signOutEpoch = 0;

/**
 * A password reset signs the account in when the emailed code is verified,
 * before the new password is saved. Holding the UI on the reset screen until
 * the update lands means a rejected password (too weak, same as before) can be
 * fixed right there instead of silently keeping the old one.
 */
let resetHold: { session: SupabaseSession | null } | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function fromSupabase(s: SupabaseSession | null): Session | null {
  if (!s) return null;
  const meta = (s.user.app_metadata ?? {}) as { sq_role?: string };
  // This name is printed on public reports, so it never falls back to the email handle.
  const name = (s.user.user_metadata as { display_name?: string } | null)?.display_name?.trim() || "Quester";
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
// The JsonDoc mirror covers the async gap before this resolves, and keeps the
// phone signed in while it is offline.
const startupEpoch = signOutEpoch;
void supabase()
  .auth.getSession()
  .then(({ data, error }) => {
    if (signOutEpoch !== startupEpoch || resetHold) return;
    // Offline with an expired access token: auth-js keeps the refresh token and
    // restores the session (TOKEN_REFRESHED) once the network is back. Keep the mirror.
    if (!data.session && error && isAuthRetryableFetchError(error)) return;
    const s = fromSupabase(data.session);
    // Signed out remotely (or token pruned): drop the stale mirror.
    if (JSON.stringify(s) !== JSON.stringify(current)) set(s);
  })
  .catch(() => undefined);
supabase().auth.onAuthStateChange((event, s) => {
  if (resetHold) {
    if (s) resetHold.session = s;
    return;
  }
  // Only an explicit SIGNED_OUT ends the session: auth-js emits it whenever it
  // really removes one (revoked or expired refresh token, signOut). A null
  // INITIAL_SESSION can just mean "offline, couldn't refresh yet".
  if (!s && event !== "SIGNED_OUT") return;
  // The startup read settling after the person already signed out on this phone.
  if (s && event === "INITIAL_SESSION" && signOutEpoch > 0) return;
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

function rememberEmail(email: string) {
  setPrefs({ lastEmail: email.trim().toLowerCase() });
}

/** Throws the original AuthError so the screen can show a plain-language message for its code. */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  rememberEmail(email);
}

export async function signUpWithPassword(name: string, email: string, password: string): Promise<void> {
  const { data, error } = await supabase().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: name.trim() } },
  });
  if (error) throw error;
  rememberEmail(email);
  if (!data.session) {
    const pending = new Error("Account created. Confirm the email we sent, then sign in.");
    pending.name = "ConfirmEmailPending";
    throw pending;
  }
}

/**
 * Emails a recovery code. No deep link is involved: the Recovery email template
 * must include {{ .Token }}. Supabase answers the same way whether or not the
 * address has an account, so the screen never reveals which emails exist.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}

/** Verifies the emailed code, saves the new password, then signs in. */
export async function confirmPasswordReset(email: string, code: string, password: string): Promise<void> {
  if (!resetHold) resetHold = { session: null };
  try {
    if (!resetHold.session) {
      const { data, error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" });
      if (error) throw error;
      resetHold.session = data.session;
    }
    const { error } = await supabase().auth.updateUser({ password });
    if (error) throw error;
  } catch (e) {
    // The code itself failed: nothing is signed in, nothing to hold.
    if (!resetHold?.session) resetHold = null;
    throw e;
  }
  const { data } = await supabase().auth.getSession();
  const s = data.session ?? resetHold?.session ?? null;
  resetHold = null;
  rememberEmail(email);
  set(fromSupabase(s));
}

/** Leaving the reset screen: a code-verified session that never got its new password is signed out. */
export function cancelPasswordReset(): void {
  const held = resetHold?.session;
  resetHold = null;
  if (held) void supabase().auth.signOut({ scope: "local" }).catch(() => undefined);
}

export function signOut() {
  signOutEpoch += 1;
  set(null);
  // Best-effort server-side revoke. If it fails (offline), supabase-js keeps
  // its AsyncStorage session and would silently sign the user back in on the
  // next cold start — so clear that storage ourselves on any failure.
  const wipe = () => void AsyncStorage.removeItem("sidequest-atx-auth").catch(() => undefined);
  // Local scope: signing out of the phone must not sign the same account out
  // of the website (the default, 'global', revokes every session).
  supabase()
    .auth.signOut({ scope: "local" })
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
  /** Email of the last account that signed in here: the sign-in screen opens on "Sign in" with it filled */
  lastEmail?: string;
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
