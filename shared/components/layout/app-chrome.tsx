"use client";

import * as React from "react";

import { CommandPalette } from "@/components/search/command-palette";
import { ImportDialog } from "@/components/transfer/import-dialog";
import { NewCollectionDialog } from "@/components/workspace/collection-dialog";
import { TabDialog } from "@/components/workspace/tab-dialog";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import { installExtensionBridge } from "@/lib/store/open-tabs-store";
import { installSearchIndexSync, resetSearchIndex } from "@/lib/search/registry";
import { useUI } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import { exportWorkspace } from "@/lib/transfer/download";
import { toast } from "@/lib/toast";
import { formatCount } from "@/lib/utils";

/**
 * Everything that lives above the page: the palette, the shared dialogs, the
 * search index and the extension bridge.
 */
export function AppChrome() {
  const status = useWorkspace((s) => s.status);

  // The index is built from the loaded workspace, so wait for it.
  React.useEffect(() => {
    if (status !== "ready") return;
    resetSearchIndex();
    const stop = installSearchIndexSync();
    return () => {
      stop();
      resetSearchIndex();
    };
  }, [status]);

  const openPalette = useUI((s) => s.openPalette);

  // The extension never writes to Supabase itself — it asks the signed-in app
  // to do it, so there is exactly one authenticated write path.
  React.useEffect(
    () =>
      installExtensionBridge({
        listCollections: () => {
          const state = useWorkspace.getState();
          return state.collectionOrder.map((id) => ({
            id,
            name: state.collections[id]?.name ?? "Untitled",
            count: (state.tabOrder[id] ?? []).length,
          }));
        },
        saveTabs: (collectionId, tabs) => {
          const state = useWorkspace.getState();
          const collection = state.collections[collectionId];
          if (!collection) return { saved: 0, collectionName: "" };

          const created = state.addTabs(
            collectionId,
            tabs.map((t) => ({
              url: t.url,
              title: t.title,
              favicon: t.favIconUrl,
              faviconUrl: t.favIconUrl,
            })),
          );
          if (created.length > 0) {
            toast.success(
              `Saved ${formatCount(created.length, "tab")} to ${collection.name}`,
            );
          }
          return { saved: created.length, collectionName: collection.name };
        },
        openSearch: (query) => openPalette("search", query),
      }),
    [openPalette],
  );

  useGlobalShortcuts({
    onExport: React.useCallback(() => {
      const state = useWorkspace.getState();
      if (state.collectionOrder.length === 0) {
        toast.info("Nothing to export yet");
        return;
      }
      const count = exportWorkspace(state);
      toast.success("Workspace exported", {
        description: `${formatCount(count, "website")} written to your downloads.`,
      });
    }, []),
  });

  return (
    <>
      <CommandPalette />
      <NewCollectionDialog />
      <TabDialog />
      <ImportDialog />
    </>
  );
}
