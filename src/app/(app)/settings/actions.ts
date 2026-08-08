"use server";

import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function deleteAccount(): Promise<{ error: string } | void> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  // delete_own_account() is SECURITY DEFINER and scopes itself to auth.uid().
  const { error } = await supabase.rpc("delete_own_account");
  if (error) return { error: error.message };

  await supabase.auth.signOut();
  redirect("/login");
}
