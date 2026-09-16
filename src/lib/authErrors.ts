/**
 * Supabase auth and save errors in plain language, each ending in what to do
 * next. Callers still log the original error for debugging. Duck-typed on
 * the error's name/code so it works for anything supabase-js throws.
 */
type ErrLike = { name?: string; code?: string; status?: number; message?: string };

export function isNetworkError(e: unknown): boolean {
  const x = (e ?? {}) as ErrLike;
  if (x.name === "AuthRetryableFetchError") return true;
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : (x.message ?? "");
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg)) return true;
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function friendlyAuthError(e: unknown): string {
  if (isNetworkError(e)) return "Can't reach SideQuest right now. Check your connection and try again.";
  const x = (e ?? {}) as ErrLike;
  if (x.name === "AuthWeakPasswordError") return "Choose a longer password: at least 8 characters.";
  switch (x.code) {
    case "invalid_credentials":
      return "That email and password don't match. Check for typos, or reset your password.";
    case "email_not_confirmed":
      return "Confirm your email first: open the message we sent, then sign in.";
    case "user_already_exists":
    case "email_exists":
      return "That email already has an account. Sign in instead.";
    case "email_address_invalid":
    case "validation_failed":
      return "That email address doesn't look right.";
    case "email_provider_disabled":
    case "signup_disabled":
      return "Sign-in is paused while SideQuest finishes setting up. Please try again later.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many tries. Wait a minute, then try again.";
    case "otp_expired":
      return "That code is wrong or has expired. Request a new one.";
    case "same_password":
      return "Choose a password you haven't used here before.";
    case "weak_password":
      return "Choose a longer password: at least 8 characters.";
    case "user_banned":
      return "This account can't sign in. Contact SideQuest for help.";
  }
  return "Something went wrong. Try again in a moment.";
}

/** A moderation write that didn't save, explained. */
export function friendlySaveError(e: unknown): string {
  if (isNetworkError(e)) return "Not saved: you're offline. Try again once you're connected.";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/no longer exists|lack the role|row-level security|permission/i.test(msg)) {
    return "Not saved: this report changed or you no longer have access. The list was refreshed.";
  }
  if (/upload|bucket|storage|mime|payload/i.test(msg)) return "Not saved: the after-photo didn't upload. Try again.";
  return "Not saved. Try again in a moment.";
}
