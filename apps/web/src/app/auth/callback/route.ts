import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

/** OAuth / email-confirmation landing point: swaps the code for a session. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const description = searchParams.get("error_description");
  const target = new URL("/auth/auth-code-error", origin);
  if (description) target.searchParams.set("message", description);
  return NextResponse.redirect(target);
}
