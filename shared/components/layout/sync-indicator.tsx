"use client";

import * as React from "react";
import { Check, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";

import { Tooltip } from "@/components/ui/controls";
import { syncEngine, type SyncStatus } from "@/lib/store/sync";
import { useWorkspace } from "@/lib/store/workspace-store";
import { cn } from "@/lib/utils";

export function SyncIndicator({ className }: { className?: string }) {
  const [status, setStatus] = React.useState<SyncStatus>(() =>
    syncEngine.getStatus(),
  );
  const mode = useWorkspace((s) => s.mode);

  React.useEffect(() => syncEngine.onStatus(setStatus), []);


  const config = React.useMemo(() => {
    if (mode === "local") {
      return {
        icon: CloudOff,
        label: "Saved on this device",
        hint: "Sign in with Supabase configured to sync across computers.",
        tone: "text-muted-foreground",
        spin: false,
      };
    }
    switch (status) {
      case "syncing":
      case "pending":
        return {
          icon: RefreshCw,
          label: "Syncing…",
          hint: "Saving your changes.",
          tone: "text-muted-foreground",
          spin: true,
        };
      case "error":
        return {
          icon: TriangleAlert,
          label: "Sync failed",
          hint: "Retrying automatically. Your changes are safe locally.",
          tone: "text-destructive",
          spin: false,
        };
      default:
        return {
          icon: Check,
          label: "Synced",
          hint: "Everything is saved to your account.",
          tone: "text-success",
          spin: false,
        };
    }
  }, [mode, status]);

  const Icon = config.icon;

  return (
    <Tooltip content={config.hint}>
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
          config.tone,
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <Icon className={cn("size-3.5", config.spin && "animate-spin")} />
        <span className="hidden lg:inline">{config.label}</span>
      </span>
    </Tooltip>
  );
}
