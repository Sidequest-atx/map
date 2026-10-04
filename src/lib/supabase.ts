import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared Supabase project (see supabase/schema.sql for why it is shared and
 * how SideQuest is namespaced inside it). The URL and anon key are the
 * publishable client credentials — they ship inside every client build and
 * RLS is the actual gate — so they live here as defaults; env overrides let a
 * fork or a future dedicated project swap them without a code change.
 */
const URL = import.meta.env.VITE_SUPABASE_URL || "https://ncvglhlmmbnkhbevzelu.supabase.co";
const ANON =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jdmdsaGxtbWJua2hiZXZ6ZWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MjUzMDcsImV4cCI6MjEwMzIwMTMwN30.FC6CksH2vwqe-jLa9sMKByDwWD29iuv3e2-325pR3Cc";

/** `VITE_DEMO=1` runs the old localStorage prototype with seed data instead. */
export const DEMO = import.meta.env.VITE_DEMO === "1";

export const SUPABASE_URL = URL;

let client: SupabaseClient | null = null;

/** After-photo uploads ride a slow uplink; everything else is a small JSON call. */
const TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * No request may hang forever: the sign-in form disables every button while
 * one is pending, so a stalled connection would lock it with no way out. The
 * abort surfaces as a network failure, which every caller already explains.
 */
const timedFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), url.includes("/storage/v1/object/") ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) ctl.abort();
    else outer.addEventListener("abort", () => ctl.abort(), { once: true });
  }
  // Return fetch's own promise: the abort above is what ends a stalled request.
  const request = fetch(input, { ...init, signal: ctl.signal });
  request.then(
    () => clearTimeout(timer),
    () => clearTimeout(timer),
  );
  return request;
};

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(URL, ANON, {
      global: { fetch: timedFetch },
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "sidequest-atx-auth" },
    });
  }
  return client;
}

/** Public URL for an object in the sidequest-photos bucket. */
export function photoUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return `${URL}/storage/v1/object/public/sidequest-photos/${path}`;
}
