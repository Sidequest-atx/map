import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * Plain-language text for the errors people actually see. Supabase messages
 * ("Invalid login credentials", "Network request failed") are written for
 * developers; these say what happened and what to do next. Callers still log
 * the original error, so nothing is lost for debugging.
 */

export type AuthContext = "signup" | "signin" | "reset-request" | "reset-confirm";

const OFFLINE = /network request failed|failed to fetch|network error|internet connection|timed out|load failed|abort/i;

/** Proxies and rate limiters answer in plain text, so there is a status and no
    code; supabase-js keeps that response as the error's originalError. */
function statusOf(e: unknown): number {
  if (!e || typeof e !== "object") return 0;
  const x = e as { status?: unknown; originalError?: { status?: unknown } };
  const s = typeof x.status === "number" ? x.status : x.originalError?.status;
  return typeof s === "number" ? s : 0;
}

function codeOf(e: unknown): string {
  if (e && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : "";
  }
  return "";
}

function messageOf(e: unknown): string {
  if (typeof e === "string") return e;
  // PostgREST and storage errors are plain objects with a message, not Error instances.
  if (e && typeof e === "object" && "message" in e) return String((e as { message?: unknown }).message ?? "");
  return "";
}

export function isOfflineError(e: unknown): boolean {
  return isAuthRetryableFetchError(e) || OFFLINE.test(messageOf(e));
}

export function friendlyAuthError(e: unknown, context: AuthContext = "signin"): string {
  // A 5xx arrives as a "retryable fetch" error too, but the phone is online.
  if (statusOf(e) >= 500) return "SideQuest's server is having trouble. Try again in a few minutes.";
  if (isOfflineError(e)) return "No connection. Check your signal and try again.";
  // Our own sign-up outcome when email confirmation is switched on: already plain.
  if (e instanceof Error && e.name === "ConfirmEmailPending") return e.message;
  switch (codeOf(e)) {
    case "invalid_credentials":
      return "That email and password don't match. Check for typos, or reset your password.";
    case "user_already_exists":
    case "email_exists":
      return "This email already has an account. Sign in instead.";
    case "email_address_invalid":
    case "validation_failed":
      return "That email address doesn't look right.";
    case "email_not_confirmed":
      return "Confirm your email first. The link is in the email we sent when you signed up.";
    case "email_provider_disabled":
    case "signup_disabled":
      return context === "signup"
        ? "New accounts are paused while SideQuest finishes setup. Try again soon."
        : "Signing in is paused while SideQuest finishes setup. Your photos stay safe on this phone.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many tries. Wait a minute, then try again.";
    case "weak_password":
      return "That password is too short or too common. Use at least 8 characters.";
    case "same_password":
      return "That's your current password. Choose a new one.";
    case "otp_expired":
      return "That code didn't work. It may have expired. Check it, or ask for a new one.";
    case "otp_disabled":
      return "Password reset isn't available right now. Try again later.";
  }
  if (statusOf(e) === 429) return "Too many tries. Wait a minute, then try again.";
  if (context === "reset-confirm" && isAuthError(e)) return "That code didn't work. Check it, or ask for a new one.";
  return "Something went wrong. Try again in a moment.";
}

/** Settings' "last upload attempt" line. The raw text stays available under Details. */
export function friendlySyncError(raw: string): string {
  if (OFFLINE.test(raw)) return "No connection. Reports upload when you're back online.";
  if (/bucket not found|PGRST205|schema cache|does not exist/i.test(raw)) {
    return "The shared map isn't set up yet. Your reports are safe on this phone and upload once it is.";
  }
  if (/jwt|not authenticated|refresh token|unauthori|\b401\b/i.test(raw)) return "Your sign-in expired. Sign out and back in to keep uploading.";
  if (/row-level security|violates|permission denied|42501|\b403\b/i.test(raw)) {
    return "The shared map refused one upload. Sign out and back in, then tap Sync now.";
  }
  if (/too large|EntityTooLarge|\b413\b/i.test(raw)) return "A photo was too large to upload.";
  return "Some reports couldn't upload yet. The app keeps trying.";
}
