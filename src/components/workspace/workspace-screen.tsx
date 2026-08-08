"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowDownWideNarrow,
  Download,
  FolderPlus,
  Layers,
  LayoutGrid,
  List,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Rows3,
  Search,
  Upload,
} from "lucide-react";

import { Favicon } from "@/components/favicon";
import { OpenTabsPanel, openTabDragId } from "@/components/sidebar/open-tabs-panel";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Select, Tooltip } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/primitives";
import { useUI } from "@/lib/store/ui-store";
import { useOpenTabs } from "@/lib/store/open-tabs-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import { collectionAnchorId, onRevealCollection, onRevealTab, tabAnchorId } from "@/lib/reveal";
import { exportCollection, exportWorkspace } from "@/lib/transfer/download";
import { toast } from "@/lib/toast";
import type { SortMode, ViewMode } from "@/lib/types";
import { cn, formatCount } from "@/lib/utils";
import {
  CollectionCard,
  collectionDropId,
  type DropTarget,
} from "./collection-card";
import { CollectionFormDialog } from "./collection-dialog";
import { TabRowContent } from "./tab-row";

type ActiveDrag =
  | { type: "collection"; id: string }
  | { type: "tab"; ids: string[] }
  | { type: "open-tab"; ids: string[] };

/**
 * Pointer-first collision detection: while dragging a tab we care about what is
 * literally under the cursor, falling back to rect intersection near the edges
 * of a collection so drops just outside a row still land somewhere sensible.
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : rectIntersection(args);
};

export function WorkspaceScreen() {
  const status = useWorkspace((s) => s.status);
  const error = useWorkspace((s) => s.error);
  const collectionOrder = useWorkspace((s) => s.collectionOrder);
  const collections = useWorkspace((s) => s.collections);
  const tabOrder = useWorkspace((s) => s.tabOrder);
  const tabs = useWorkspace((s) => s.tabs);
  const viewMode = useWorkspace((s) => s.settings.viewMode);
  const sidebarOpen = useWorkspace((s) => s.settings.sidebarOpen);
  const updateSettings = useWorkspace((s) => s.updateSettings);
  const moveCollection = useWorkspace((s) => s.moveCollection);
  const moveTabs = useWorkspace((s) => s.moveTabs);
  const addTabs = useWorkspace((s) => s.addTabs);
  const deleteCollection = useWorkspace((s) => s.deleteCollection);
  const restoreCollection = useWorkspace((s) => s.restoreCollection);
  const setCollectionMeta = useWorkspace((s) => s.renameCollection);
  const setCollectionDescription = useWorkspace(
    (s) => s.setCollectionDescription,
  );

  const openTabs = useOpenTabs((s) => s.tabs);
  const selectedOpenTabs = useUI((s) => s.selectedOpenTabs);
  const clearOpenTabSelection = useUI((s) => s.clearOpenTabSelection);
  const openNewCollection = useUI((s) => s.openNewCollection);
  const openImport = useUI((s) => s.openImport);
  const openPalette = useUI((s) => s.openPalette);
  const mobileSidebarOpen = useUI((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useUI((s) => s.setMobileSidebarOpen);

  const [sortMode, setSortMode] = React.useState<SortMode>("manual");
  const [activeDrag, setActiveDrag] = React.useState<ActiveDrag | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);
  const [collectionDropIndex, setCollectionDropIndex] = React.useState<
    number | null
  >(null);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ---- reveal from the command palette ----

  React.useEffect(() => {
    const scrollTo = (elementId: string) => {
      const node = document.getElementById(elementId);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.animate(
        [
          { boxShadow: "0 0 0 0 var(--color-accent)" },
          { boxShadow: "0 0 0 4px color-mix(in oklch, var(--color-accent) 35%, transparent)" },
          { boxShadow: "0 0 0 0 var(--color-accent)" },
        ],
        { duration: 1200, easing: "ease-out" },
      );
    };

    const offCollection = onRevealCollection((id) => {
      useWorkspace.getState().setCollectionCollapsed(id, false);
      requestAnimationFrame(() => scrollTo(collectionAnchorId(id)));
    });
    const offTab = onRevealTab((id) => {
      const tab = useWorkspace.getState().tabs[id];
      if (tab) useWorkspace.getState().setCollectionCollapsed(tab.collectionId, false);
      requestAnimationFrame(() => scrollTo(tabAnchorId(id)));
    });

    return () => {
      offCollection();
      offTab();
    };
  }, []);

  // ---- drag handling ----

  const movingIds = React.useMemo(() => {
    if (!activeDrag) return new Set<string>();
    if (activeDrag.type === "collection") return new Set<string>();
    return new Set(activeDrag.ids);
  }, [activeDrag]);

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as
      | { type?: string; collectionId?: string; openTabId?: string }
      | undefined;

    if (data?.type === "collection") {
      setActiveDrag({ type: "collection", id: String(event.active.id) });
      return;
    }

    if (data?.type === "open-tab" && data.openTabId) {
      // Dragging a row that is part of the selection carries the whole set.
      const ids = selectedOpenTabs.includes(data.openTabId)
        ? selectedOpenTabs
        : [data.openTabId];
      setActiveDrag({ type: "open-tab", ids });
      return;
    }

    if (data?.type === "tab") {
      setActiveDrag({ type: "tab", ids: [String(event.active.id)] });
    }
  };

  const resolveTarget = React.useCallback(
    (active: Active, over: Over | null): DropTarget | null => {
      if (!over) return null;
      const overData = over.data.current as
        | { type?: string; collectionId?: string }
        | undefined;

      if (overData?.type === "collection-body" && overData.collectionId) {
        return {
          collectionId: overData.collectionId,
          index: (tabOrder[overData.collectionId] ?? []).length,
        };
      }

      if (overData?.type === "tab" && overData.collectionId) {
        const list = tabOrder[overData.collectionId] ?? [];
        const overIndex = list.indexOf(String(over.id));
        if (overIndex === -1) return null;

        // Insert after the hovered row once the pointer passes its midpoint.
        const activeRect = active.rect.current.translated;
        const activeCenter = activeRect
          ? activeRect.top + activeRect.height / 2
          : 0;
        const overCenter = over.rect.top + over.rect.height / 2;
        const after = activeRect ? activeCenter > overCenter : false;

        return {
          collectionId: overData.collectionId,
          index: overIndex + (after ? 1 : 0),
        };
      }

      if (overData?.type === "collection") {
        const collectionId = String(over.id);
        return {
          collectionId,
          index: (tabOrder[collectionId] ?? []).length,
        };
      }

      return null;
    },
    [tabOrder],
  );

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const activeData = active.data.current as { type?: string } | undefined;

    if (activeData?.type === "collection") {
      const overData = over?.data.current as { type?: string } | undefined;
      if (over && overData?.type === "collection") {
        setCollectionDropIndex(collectionOrder.indexOf(String(over.id)));
      }
      return;
    }

    setDropTarget(resolveTarget(active, over));
  };

  const reset = () => {
    setActiveDrag(null);
    setDropTarget(null);
    setCollectionDropIndex(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = active.data.current as
      | { type?: string; openTabId?: string }
      | undefined;

    if (activeData?.type === "collection") {
      const overData = over?.data.current as { type?: string } | undefined;
      if (over && overData?.type === "collection" && over.id !== active.id) {
        const to = collectionOrder.indexOf(String(over.id));
        if (to >= 0) moveCollection(String(active.id), to);
      }
      reset();
      return;
    }

    const target = resolveTarget(active, over) ?? dropTarget;
    if (!target) {
      reset();
      return;
    }

    // The indicator index counts the rendered list, which still contains the
    // rows being moved. Convert it to an index in the list without them.
    const fullIds = tabOrder[target.collectionId] ?? [];
    const skipped = fullIds
      .slice(0, target.index)
      .filter((id) => movingIds.has(id)).length;
    const insertionIndex = Math.max(0, target.index - skipped);

    if (activeData?.type === "open-tab") {
      const ids =
        activeDrag?.type === "open-tab" ? activeDrag.ids : [];
      const source = openTabs.filter((t) => ids.includes(t.id));
      if (source.length > 0) {
        addTabs(
          target.collectionId,
          source.map((t) => ({
            url: t.url,
            title: t.title,
            favicon: t.favIconUrl,
            faviconUrl: t.favIconUrl,
          })),
          insertionIndex,
        );
        toast.success(
          `Saved ${formatCount(source.length, "tab")} to ${
            collections[target.collectionId]?.name ?? "collection"
          }`,
        );
        clearOpenTabSelection();
      }
      reset();
      return;
    }

    if (activeData?.type === "tab") {
      moveTabs([String(active.id)], target.collectionId, insertionIndex);
    }
    reset();
  };

  // ---- derived ----

  const totalTabs = React.useMemo(() => Object.keys(tabs).length, [tabs]);
  const editingCollection = editingId ? collections[editingId] : null;
  const deletingCollection = deletingId ? collections[deletingId] : null;
  const deletingCount = deletingId ? (tabOrder[deletingId] ?? []).length : 0;

  const handleExportWorkspace = React.useCallback(() => {
    const state = useWorkspace.getState();
    if (state.collectionOrder.length === 0) {
      toast.info("Nothing to export yet");
      return;
    }
    const count = exportWorkspace(state);
    toast.success("Workspace exported", {
      description: `${formatCount(count, "website")} written to your downloads.`,
    });
  }, []);

  const sidebar = <OpenTabsPanel onClose={() => setMobileSidebarOpen(false)} />;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
      modifiers={[restrictToWindowEdges]}
    >
      <div className="flex min-h-0 flex-1">
        {/* ---------------- main column ---------------- */}
        <main className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto w-full max-w-4xl px-5 py-6">
            <WorkspaceToolbar
              collectionCount={collectionOrder.length}
              tabCount={totalTabs}
              viewMode={viewMode}
              sortMode={sortMode}
              sidebarOpen={sidebarOpen}
              onViewMode={(mode) => updateSettings({ viewMode: mode })}
              onSortMode={setSortMode}
              onToggleSidebar={() =>
                updateSettings({ sidebarOpen: !sidebarOpen })
              }
              onNewCollection={openNewCollection}
              onImport={openImport}
              onExport={handleExportWorkspace}
              onSearch={() => openPalette("search")}
              onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            />

            {status === "loading" ? (
              <LoadingState />
            ) : status === "error" ? (
              <ErrorState message={error} />
            ) : collectionOrder.length === 0 ? (
              <FirstRunState onCreate={openNewCollection} onImport={openImport} />
            ) : (
              <SortableContext
                items={collectionOrder}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {collectionOrder.map((id, index) => (
                    <React.Fragment key={id}>
                      {activeDrag?.type === "collection" &&
                      collectionDropIndex === index &&
                      activeDrag.id !== id ? (
                        <div
                          aria-hidden
                          className="mx-1 h-0.5 rounded-full bg-accent"
                        />
                      ) : null}
                      <CollectionCard
                        collectionId={id}
                        viewMode={viewMode}
                        sortMode={sortMode}
                        dropTarget={
                          dropTarget?.collectionId === id ? dropTarget : null
                        }
                        isDropCandidate={dropTarget?.collectionId === id}
                        onRequestEdit={setEditingId}
                        onRequestDelete={setDeletingId}
                        onRequestExport={(collectionId) => {
                          const count = exportCollection(
                            useWorkspace.getState(),
                            collectionId,
                          );
                          toast.success(
                            `Exported “${collections[collectionId]?.name}”`,
                            {
                              description: `${formatCount(count, "website")} written to your downloads.`,
                            },
                          );
                        }}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </SortableContext>
            )}
          </div>
        </main>

        {/* ---------------- open tabs sidebar ---------------- */}
        {sidebarOpen ? (
          <aside className="hidden w-80 shrink-0 border-l border-border xl:block">
            {sidebar}
          </aside>
        ) : null}
      </div>

      {/* Drawer for narrow screens. */}
      <Dialog open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <DialogContent
          showClose={false}
          className="left-auto right-0 top-0 h-svh w-80 max-w-none translate-x-0 translate-y-0 rounded-none border-l p-0"
        >
          {sidebar}
        </DialogContent>
      </Dialog>

      {/* ---------------- drag preview ---------------- */}
      <DragOverlay dropAnimation={null}>
        {activeDrag ? <DragPreview drag={activeDrag} viewMode={viewMode} /> : null}
      </DragOverlay>

      {/* ---------------- dialogs ---------------- */}
      {editingCollection ? (
        <CollectionFormDialog
          open
          onOpenChange={(next) => {
            if (!next) setEditingId(null);
          }}
          title={`Edit “${editingCollection.name}”`}
          submitLabel="Save changes"
          initial={{
            name: editingCollection.name,
            description: editingCollection.description,
          }}
          onSubmit={({ name, description }) => {
            setCollectionMeta(editingCollection.id, name);
            setCollectionDescription(editingCollection.id, description);
            toast.success("Collection updated");
          }}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deletingCollection)}
        onOpenChange={(next) => {
          if (!next) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader
            title={`Delete “${deletingCollection?.name}”?`}
            description={
              deletingCount > 0
                ? `This collection contains ${formatCount(deletingCount, "saved tab")}. They will be deleted too.`
                : "This collection is empty."
            }
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                if (!deletingId) return;
                const snapshot = deleteCollection(deletingId);
                setDeletingId(null);
                if (!snapshot) return;
                toast.undo(
                  "Collection deleted",
                  `“${snapshot.collection.name}” and ${formatCount(snapshot.tabs.length, "tab")}`,
                  () => restoreCollection(snapshot),
                );
              }}
            >
              Delete collection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------

function WorkspaceToolbar({
  collectionCount,
  tabCount,
  viewMode,
  sortMode,
  sidebarOpen,
  onViewMode,
  onSortMode,
  onToggleSidebar,
  onNewCollection,
  onImport,
  onExport,
  onSearch,
  onOpenMobileSidebar,
}: {
  collectionCount: number;
  tabCount: number;
  viewMode: ViewMode;
  sortMode: SortMode;
  sidebarOpen: boolean;
  onViewMode: (mode: ViewMode) => void;
  onSortMode: (mode: SortMode) => void;
  onToggleSidebar: () => void;
  onNewCollection: () => void;
  onImport: () => void;
  onExport: () => void;
  onSearch: () => void;
  onOpenMobileSidebar: () => void;
}) {
  const viewIcons: Record<ViewMode, React.ComponentType<{ className?: string }>> =
    { list: List, grid: LayoutGrid, compact: Rows3 };

  return (
    <div className="mb-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            My Collections
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {formatCount(collectionCount, "collection")}
            <span className="mx-1.5 text-faint-foreground">·</span>
            {formatCount(tabCount, "saved website")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onSearch}>
            <Search />
            Search
            <Kbd className="ml-1 hidden sm:inline-flex">⇧⇧</Kbd>
          </Button>
          <Button variant="ghost" size="sm" onClick={onImport}>
            <Upload />
            Import
          </Button>
          <Button variant="ghost" size="sm" onClick={onExport}>
            <Download />
            Export
          </Button>
          <Button variant="primary" size="sm" onClick={onNewCollection}>
            <Plus />
            New collection
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <div
          role="group"
          aria-label="View mode"
          className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
        >
          {(Object.keys(viewIcons) as ViewMode[]).map((mode) => {
            const Icon = viewIcons[mode];
            return (
              <Tooltip key={mode} content={`${mode} view`}>
                <button
                  type="button"
                  onClick={() => onViewMode(mode)}
                  aria-pressed={viewMode === mode}
                  aria-label={`${mode} view`}
                  className={cn(
                    "rounded-md p-1.5 transition-colors",
                    viewMode === mode
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              </Tooltip>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <ArrowDownWideNarrow
            aria-hidden
            className="size-3.5 text-muted-foreground"
          />
          <label htmlFor="sort-mode" className="sr-only">
            Sort tabs
          </label>
          <Select
            id="sort-mode"
            value={sortMode}
            onChange={(e) => onSortMode(e.target.value as SortMode)}
            className="h-8 w-36 text-[13px]"
          >
            <option value="manual">Manual order</option>
            <option value="name">Name</option>
            <option value="created">Date added</option>
            <option value="domain">Domain</option>
          </Select>
        </div>

        {sortMode !== "manual" ? (
          <span className="text-xs text-muted-foreground">
            Viewing sorted — your manual order is kept.
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenMobileSidebar}
            className="xl:hidden"
          >
            <Layers />
            Open tabs
          </Button>
          <Tooltip content={sidebarOpen ? "Hide open tabs" : "Show open tabs"}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleSidebar}
              aria-label={sidebarOpen ? "Hide open tabs" : "Show open tabs"}
              className="hidden xl:inline-flex"
            >
              {sidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function DragPreview({
  drag,
  viewMode,
}: {
  drag: ActiveDrag;
  viewMode: ViewMode;
}) {
  const collections = useWorkspace((s) => s.collections);
  const tabOrder = useWorkspace((s) => s.tabOrder);
  const tabs = useWorkspace((s) => s.tabs);
  const openTabs = useOpenTabs((s) => s.tabs);

  if (drag.type === "collection") {
    const collection = collections[drag.id];
    if (!collection) return null;
    return (
      <div className="w-72 rounded-xl border border-border bg-elevated px-3 py-2.5 shadow-float">
        <p className="truncate text-[15px] font-semibold text-foreground">
          {collection.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatCount((tabOrder[drag.id] ?? []).length, "tab")}
        </p>
      </div>
    );
  }

  if (drag.type === "tab") {
    const tab = tabs[drag.ids[0]];
    if (!tab) return null;
    return (
      <div className="w-80">
        <TabRowContent tab={tab} viewMode={viewMode} overlay />
      </div>
    );
  }

  const dragged = openTabs.filter((t) => drag.ids.includes(t.id));
  const first = dragged[0];
  if (!first) return null;

  return (
    <div className="relative w-72">
      {dragged.length > 1 ? (
        <>
          <div className="absolute inset-x-2 -bottom-1.5 h-full rounded-lg border border-border bg-surface" />
          <div className="absolute inset-x-1 -bottom-0.5 h-full rounded-lg border border-border bg-surface" />
        </>
      ) : null}
      <div className="relative flex items-center gap-2 rounded-lg border border-accent bg-elevated px-2.5 py-2 shadow-float">
        <Favicon url={first.url} favicon={first.favIconUrl} size={16} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
          {first.title || first.url}
        </span>
        {dragged.length > 1 ? (
          <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
            {dragged.length}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-border bg-surface p-4"
        >
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="mt-3 space-y-2">
            <div className="h-8 rounded bg-muted" />
            <div className="h-8 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string | null }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive-soft p-6 text-center">
      <p className="text-sm font-medium text-destructive">
        Couldn&apos;t load your workspace
      </p>
      <p className="mt-1 text-xs text-destructive/80">
        {message ?? "Something went wrong."}
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-4"
        onClick={() => window.location.reload()}
      >
        Try again
      </Button>
    </div>
  );
}

function FirstRunState({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
        <FolderPlus className="size-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">
        Create your first collection
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Organize websites, browser tabs and resources into collections you can
        search, reorder and reach from any computer.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={onCreate}>
          <Plus />
          Create collection
        </Button>
        <Button variant="secondary" onClick={onImport}>
          <Upload />
          Import a backup
        </Button>
      </div>
    </div>
  );
}

export { openTabDragId, collectionDropId };
