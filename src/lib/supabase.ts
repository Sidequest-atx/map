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

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(URL, ANON, {
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
