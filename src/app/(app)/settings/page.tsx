import type { Metadata } from "next";

import { signOut } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/supabase/server";
import { deleteAccount } from "./actions";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split("@")[0] ??
    null;

  return (
    <SettingsView
      email={user?.email ?? null}
      displayName={displayName}
      onSignOut={signOut}
      onDeleteAccount={deleteAccount}
    />
  );
}
