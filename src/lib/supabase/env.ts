/**
 * Supabase environment access.
 *
 * The app is usable without Supabase configured — it falls back to a purely
 * local workspace — so these helpers never throw at import time.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_PUBLISHABLE_KEY.length > 0;
}

export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}
