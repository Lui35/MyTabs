"use client";

import * as React from "react";
import {
  Copy,
  ExternalLink,
  Files,
  FolderInput,
  Pencil,
  RotateCw,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";

import { useUI } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import { toast } from "@/lib/toast";
import type { SavedTab } from "@/lib/types";
import { ensureProtocol, safeHref } from "@/lib/url";

export interface TabAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
}

/**
 * Actions for a saved tab, shared verbatim by the kebab menu and the
 * right-click menu so the two can never drift apart.
 */
export function useTabActions(tab: SavedTab | undefined): {
  actions: TabAction[];
  moveTargets: { id: string; name: string }[];
  moveTo: (collectionId: string) => void;
} {
  const openEditTab = useUI((s) => s.openEditTab);
  const collectionOrder = useWorkspace((s) => s.collectionOrder);
  const collections = useWorkspace((s) => s.collections);
  const deleteTab = useWorkspace((s) => s.deleteTab);
  const restoreTabs = useWorkspace((s) => s.restoreTabs);
  const duplicateTab = useWorkspace((s) => s.duplicateTab);
  const updateTab = useWorkspace((s) => s.updateTab);
  const moveTabs = useWorkspace((s) => s.moveTabs);

  const moveTo = React.useCallback(
    (collectionId: string) => {
      if (!tab || collectionId === tab.collectionId) return;
      const target = useWorkspace.getState().tabOrder[collectionId] ?? [];
      moveTabs([tab.id], collectionId, target.length);
      toast.success(`Moved to ${collections[collectionId]?.name ?? "collection"}`);
    },
    [collections, moveTabs, tab],
  );

  const actions = React.useMemo<TabAction[]>(() => {
    if (!tab) return [];
    const href = safeHref(tab.url);

    return [
      {
        id: "open",
        label: "Open",
        icon: ExternalLink,
        run: () => {
          if (href === "#") {
            toast.error("That URL can't be opened");
            return;
          }
          window.location.assign(href);
        },
      },
      {
        id: "open-new",
        label: "Open in new tab",
        icon: SquareArrowOutUpRight,
        run: () => {
          if (href === "#") {
            toast.error("That URL can't be opened");
            return;
          }
          window.open(href, "_blank", "noopener,noreferrer");
        },
      },
      {
        id: "copy",
        label: "Copy URL",
        icon: Copy,
        separatorBefore: true,
        run: () => {
          void navigator.clipboard
            .writeText(tab.url)
            .then(() => toast.success("URL copied"))
            .catch(() => toast.error("Couldn't copy that URL"));
        },
      },
      {
        id: "edit",
        label: "Edit",
        icon: Pencil,
        run: () => openEditTab(tab.id),
      },
      {
        id: "duplicate",
        label: "Duplicate",
        icon: Files,
        run: () => {
          duplicateTab(tab.id);
          toast.success("Duplicated");
        },
      },
      {
        id: "refresh",
        label: "Refresh metadata",
        icon: RotateCw,
        run: () => {
          void (async () => {
            try {
              const response = await fetch(
                `/api/metadata?url=${encodeURIComponent(ensureProtocol(tab.url))}`,
              );
              const data = (await response.json()) as {
                title?: string | null;
                favicon?: string | null;
                error?: string;
              };
              if (data.error) {
                toast.error("Couldn't refresh", { description: data.error });
                return;
              }
              updateTab(tab.id, {
                ...(data.title ? { title: data.title } : {}),
                ...(data.favicon
                  ? { favicon: data.favicon, faviconUrl: data.favicon }
                  : {}),
              });
              toast.success("Metadata refreshed");
            } catch {
              toast.error("Couldn't reach that page");
            }
          })();
        },
      },
      {
        id: "delete",
        label: "Delete",
        icon: Trash2,
        destructive: true,
        separatorBefore: true,
        run: () => {
          const removed = deleteTab(tab.id);
          if (!removed) return;
          toast.undo(
            "Website deleted",
            removed.title || removed.url,
            () => restoreTabs([removed]),
          );
        },
      },
    ];
  }, [deleteTab, duplicateTab, openEditTab, restoreTabs, tab, updateTab]);

  const moveTargets = React.useMemo(
    () =>
      collectionOrder
        .filter((id) => id !== tab?.collectionId)
        .map((id) => ({ id, name: collections[id]?.name ?? "Untitled" }))
        .filter((c) => Boolean(c.name)),
    [collectionOrder, collections, tab?.collectionId],
  );

  return { actions, moveTargets, moveTo };
}

export const MoveIcon = FolderInput;
