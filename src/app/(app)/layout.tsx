import { signOut } from "@/app/(auth)/actions";
import { AppChrome } from "@/components/layout/app-chrome";
import { AppHeader } from "@/components/layout/app-header";
import { WorkspaceBoot } from "@/components/providers";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split("@")[0] ??
    null;

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <WorkspaceBoot userId={user?.id ?? null} />
      <AppHeader
        email={user?.email ?? null}
        displayName={displayName}
        onSignOut={signOut}
      />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <AppChrome />
    </div>
  );
}
