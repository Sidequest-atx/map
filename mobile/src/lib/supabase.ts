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

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(URL, ANON, {
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
