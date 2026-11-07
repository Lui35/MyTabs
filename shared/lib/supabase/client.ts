"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "./env";

export type TabsClient = SupabaseClient<Database>;

let cached: TabsClient | null = null;

/**
 * Browser Supabase client. Returns null when the project is not configured,
 * which puts the app into local-only mode instead of crashing.
 */
export function getSupabaseBrowserClient(): TabsClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!cached) {
    cached = createBrowserClient<Database>(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
    );
  }
  return cached;
}
