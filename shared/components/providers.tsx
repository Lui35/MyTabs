"use client";

import * as React from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/controls";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/lib/store/workspace-store";
import { installSyncLifecycleHooks, syncEngine } from "@/lib/store/sync";
import { toast } from "@/lib/toast";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "!bg-elevated !text-foreground !border !border-border !shadow-float !rounded-lg",
          description: "!text-muted-foreground",
          actionButton: "!bg-accent !text-accent-foreground",
          cancelButton: "!bg-muted !text-muted-foreground",
        },
      }}
    />
  );
}

/**
 * Keeps next-themes and the persisted `settings.theme` in agreement.
 * The stored preference is the source of truth once the workspace loads.
 */
function ThemeSync() {
  const { setTheme } = useTheme();
  const preference = useWorkspace((s) => s.settings.theme);
  const status = useWorkspace((s) => s.status);

  React.useEffect(() => {
    if (status !== "ready") return;
    setTheme(preference);
  }, [preference, setTheme, status]);

  return null;
}

/** Boots the workspace store for the signed-in user (or local mode). */
export function WorkspaceBoot({ userId }: { userId: string | null }) {
  const init = useWorkspace((s) => s.init);
  const teardown = useWorkspace((s) => s.teardown);

  React.useEffect(() => {
    const client = getSupabaseBrowserClient();
    void init({ client, userId });
    const removeHooks = installSyncLifecycleHooks();

    let notified = false;
    const offError = syncEngine.onError(() => {
      if (notified) return;
      notified = true;
      toast.error("Couldn't sync your changes", {
        description: "We'll keep retrying. Your edits are safe on this device.",
      });
    });
    const offStatus = syncEngine.onStatus((s) => {
      if (s === "idle" && notified) {
        notified = false;
        toast.success("Back in sync");
      }
    });

    return () => {
      offError();
      offStatus();
      removeHooks();
      teardown();
    };
  }, [init, teardown, userId]);

  return <ThemeSync />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={350} skipDelayDuration={200}>
        {children}
        <ThemedToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
