"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  Download,
  Ellipsis,
  FileText,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { useUI } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import { collectionAnchorId } from "@/lib/reveal";
import { byPosition } from "@/lib/position";
import type { SortMode, ViewMode } from "@/lib/types";
import { getDomain } from "@/lib/url";
import { cn, formatCount } from "@/lib/utils";
import { TabRow } from "./tab-row";

export const collectionDropId = (collectionId: string) => `drop:${collectionId}`;

export interface DropTarget {
  collectionId: string;
  index: number;
}

function DropLine({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none relative mx-1 transition-all duration-150",
        visible ? "my-1 h-0.5 opacity-100" : "my-0 h-0 opacity-0",
      )}
    >
      <div className="h-0.5 w-full rounded-full bg-accent" />
      <div className="absolute -left-1 -top-[3px] size-2 rounded-full bg-accent" />
    </div>
  );
}

export function CollectionCard({
  collectionId,
  viewMode,
  sortMode,
  shiftTabs,
  shiftCollections,
  dropTarget,
  isDropCandidate,
  onRequestEdit,
  onRequestDelete,
  onRequestExport,
}: {
  collectionId: string;
  viewMode: ViewMode;
  sortMode: SortMode;
  /** Let dnd-kit slide the tabs in this collection apart. */
  shiftTabs: boolean;
  /** A collection is being reordered, so cards should slide apart. */
  shiftCollections: boolean;
  dropTarget: DropTarget | null;
  isDropCandidate: boolean;
  onRequestEdit: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onRequestExport: (id: string) => void;
}) {
  const collection = useWorkspace((s) => s.collections[collectionId]);
  const tabIds = useWorkspace((s) => s.tabOrder[collectionId]);
  const tabsRecord = useWorkspace((s) => s.tabs);
  const setCollapsed = useWorkspace((s) => s.setCollectionCollapsed);
  const openAddTab = useUI((s) => s.openAddTab);

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    transform,
    transition,
  } = useSortable({
    id: collectionId,
    data: { type: "collection" },
  });

  // Only trust dnd-kit's offsets while a collection is actually being
  // reordered; during a tab drag this card isn't the active sortable and the
  // computed transform is meaningless.
  const style: React.CSSProperties | undefined = shiftCollections
    ? { transform: CSS.Translate.toString(transform), transition }
    : undefined;

  const { setNodeRef: setDropRef } = useDroppable({
    id: collectionDropId(collectionId),
    data: { type: "collection-body", collectionId },
  });

  const orderedIds = React.useMemo(() => {
    const ids = tabIds ?? [];
    if (sortMode === "manual") return ids;

    const tabs = ids.map((id) => tabsRecord[id]).filter(Boolean);
    const sorted = [...tabs];
    switch (sortMode) {
      case "name":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "created":
        sorted.sort(
          (a, b) =>
            (b.originalCreatedAt ?? b.createdAt) -
            (a.originalCreatedAt ?? a.createdAt),
        );
        break;
      case "domain":
        sorted.sort((a, b) => {
          const cmp = getDomain(a.url).localeCompare(getDomain(b.url));
          return cmp !== 0 ? cmp : byPosition(a, b);
        });
        break;
    }
    return sorted.map((t) => t.id);
  }, [sortMode, tabIds, tabsRecord]);

  if (!collection) return null;

  const count = orderedIds.length;
  const collapsed = collection.collapsed;
  const sortingLocked = sortMode !== "manual";

  return (
    <section
      ref={setNodeRef}
      style={style}
      id={collectionAnchorId(collectionId)}
      aria-label={collection.name}
      className={cn(
        "rounded-xl border border-border bg-surface shadow-panel",
        // `transition` from dnd-kit drives transform; keep the rest separate so
        // the two never fight over the same property.
        "transition-[border-color,box-shadow,opacity]",
        isDragging && "opacity-40",
        isDropCandidate && "border-accent ring-2 ring-accent/25",
      )}
    >
      {/* ---- header ---- */}
      <header className="group/header flex items-start gap-1.5 px-3 py-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${collection.name}`}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-faint-foreground opacity-0 transition-opacity group-hover/header:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => setCollapsed(collectionId, !collapsed)}
          aria-expanded={!collapsed}
          aria-controls={`${collectionAnchorId(collectionId)}-body`}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform duration-150",
              !collapsed && "rotate-90",
            )}
          />
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setCollapsed(collectionId, !collapsed)}
            className="block w-full truncate text-left text-[15px] font-semibold tracking-tight text-foreground"
            title={collection.name}
          >
            {collection.name}
          </button>
          <p className="truncate text-xs text-muted-foreground">
            {formatCount(count, "tab")}
            {collection.description ? (
              <>
                <span className="mx-1.5 text-faint-foreground">·</span>
                {collection.description}
              </>
            ) : null}
          </p>
        </div>

        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${collection.name}`}
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Ellipsis className="size-4" />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => onRequestEdit(collectionId)}>
              <Pencil />
              Rename
            </MenuItem>
            <MenuItem onSelect={() => onRequestEdit(collectionId)}>
              <FileText />
              Edit description
            </MenuItem>
            <MenuItem onSelect={() => openAddTab(collectionId)}>
              <Plus />
              Add website
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => onRequestExport(collectionId)}>
              <Download />
              Export collection
            </MenuItem>
            <MenuItem onSelect={() => setCollapsed(collectionId, !collapsed)}>
              <ChevronRight className={cn(!collapsed && "rotate-90")} />
              {collapsed ? "Expand" : "Collapse"}
            </MenuItem>
            <MenuSeparator />
            <MenuItem destructive onSelect={() => onRequestDelete(collectionId)}>
              <Trash2 />
              Delete collection
            </MenuItem>
          </MenuContent>
        </Menu>
      </header>

      {/* ---- body ---- */}
      {!collapsed ? (
        <div
          id={`${collectionAnchorId(collectionId)}-body`}
          ref={setDropRef}
          className={cn("px-2 pb-2", viewMode === "grid" && "px-3")}
        >
          <SortableContext
            items={orderedIds}
            strategy={verticalListSortingStrategy}
          >
            {count === 0 ? (
              <EmptyCollection
                highlighted={Boolean(dropTarget)}
                onAdd={() => openAddTab(collectionId)}
              />
            ) : (
              <div
                className={cn(
                  // Uniform tracks + fixed-height cards, so every tile in the
                  // grid is exactly the same size regardless of its content.
                  viewMode === "grid" &&
                    "grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2",
                )}
              >
                {orderedIds.map((tabId, index) => (
                  <React.Fragment key={tabId}>
                    {viewMode !== "grid" ? (
                      <DropLine visible={dropTarget?.index === index} />
                    ) : null}
                    <TabRow
                      tabId={tabId}
                      collectionId={collectionId}
                      viewMode={viewMode}
                      disableSort={sortingLocked}
                      shift={shiftTabs}
                    />
                  </React.Fragment>
                ))}
                {viewMode !== "grid" ? (
                  <DropLine visible={dropTarget?.index === count} />
                ) : null}
              </div>
            )}
          </SortableContext>

          {count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openAddTab(collectionId)}
              className="mt-1 w-full justify-center text-muted-foreground"
            >
              <Plus />
              Add tab
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EmptyCollection({
  highlighted,
  onAdd,
}: {
  highlighted: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-7 text-center transition-colors",
        highlighted && "border-accent bg-accent-soft/40",
      )}
    >
      <p className="text-sm font-medium text-foreground">No saved tabs</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Drag an open browser tab here, or add a website manually.
      </p>
      <Button variant="secondary" size="sm" onClick={onAdd} className="mt-1">
        <Plus />
        Add website
      </Button>
    </div>
  );
}
