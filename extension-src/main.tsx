import * as React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

import { AppChrome } from "@/components/layout/app-chrome";
import { AppHeader } from "@/components/layout/app-header";
import { TooltipProvider } from "@/components/ui/controls";
import { WorkspaceScreen } from "@/components/workspace/workspace-screen";
import { useWorkspace } from "@/lib/store/workspace-store";
import { signOutExtension } from "../extension/supabase-sync.js";
import { loadSession } from "../extension/local-store.js";
import { ChromeStorageBackend } from "./chrome-backend";
import { ExtensionSettingsDialog } from "./settings-dialog";
import "./styles.css";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      closeButton
      toastOptions={{
        classNames: {
          toast: "!bg-elevated !text-foreground !border !border-border !shadow-float !rounded-lg",
          description: "!text-muted-foreground",
          actionButton: "!bg-accent !text-accent-foreground",
          cancelButton: "!bg-muted !text-muted-foreground",
        },
      }}
    />
  );
}

function ThemeSync() {
  const { setTheme } = useTheme();
  const preference = useWorkspace((state) => state.settings.theme);
  const ready = useWorkspace((state) => state.status === "ready");
  React.useEffect(() => {
    if (ready) setTheme(preference);
  }, [preference, ready, setTheme]);
  return null;
}

function ExtensionApp() {
  const init = useWorkspace((state) => state.init);
  const teardown = useWorkspace((state) => state.teardown);
  const [email, setEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const backend = new ChromeStorageBackend();
    void loadSession().then(async (session) => {
      if (!active) return;
      setEmail(session?.user?.email ?? null);
      await init({ client: null, userId: session?.user?.id ?? null, backend });
    });
    return () => {
      active = false;
      teardown();
    };
  }, [init, teardown]);

  const signOut = React.useCallback(() => {
    void signOutExtension().then(() => window.location.reload());
  }, []);

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <ThemeSync />
      <AppHeader
        email={email}
        displayName={email?.split("@")[0] ?? null}
        onSignOut={signOut}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspaceScreen />
      </div>
      <AppChrome />
      <ExtensionSettingsDialog />
    </div>
  );
}

function Root() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={350} skipDelayDuration={200}>
        <ExtensionApp />
        <ThemedToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing extension root element.");
createRoot(root).render(<Root />);
