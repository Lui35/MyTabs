import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "./env";

/**
 * Server-side Supabase client bound to the request cookie jar.
 * `cookies()` is async in Next 16.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient<Database> | null> {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts already refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/** The signed-in user, or null. Verified against the auth server. */
export async function getCurrentUser() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
