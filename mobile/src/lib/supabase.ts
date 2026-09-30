import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared Supabase project — see /supabase/schema.sql for the sq_ namespace
 * story. URL and anon key are publishable client credentials (RLS is the
 * gate); they are baked in so the unsigned CI build needs no secrets, and
 * EXPO_PUBLIC_* overrides let a future dedicated project swap them at build
 * time without touching code.
 */
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://ncvglhlmmbnkhbevzelu.supabase.co";
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jdmdsaGxtbWJua2hiZXZ6ZWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MjUzMDcsImV4cCI6MjEwMzIwMTMwN30.FC6CksH2vwqe-jLa9sMKByDwWD29iuv3e2-325pR3Cc";

export const SUPABASE_URL = URL;

let client: SupabaseClient | null = null;

/** Photo uploads ride a slow uplink; everything else is a small JSON call. */
const TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * No request may hang forever: a stalled connection otherwise leaves the
 * sign-in button, the sync pass and the map token waiting with no way out.
 * The abort surfaces as a network failure, which every caller already handles.
 */
export const timedFetch: typeof fetch = (input, init) => {
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
      auth: {
        storage: AsyncStorage,
        storageKey: "sidequest-atx-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Public URL for an object in the sidequest-photos bucket. */
export function photoUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return `${URL}/storage/v1/object/public/sidequest-photos/${path}`;
}
