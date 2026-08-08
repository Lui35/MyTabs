"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  CheckCheck,
  Puzzle,
  RefreshCcw,
  Search,
  SquareDashed,
  X,
} from "lucide-react";

import { Favicon } from "@/components/favicon";
import { Button } from "@/components/ui/button";
import { Checkbox, Tooltip } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Badge, Spinner } from "@/components/ui/primitives";
import {
  requestOpenTabs,
  useOpenTabs,
} from "@/lib/store/open-tabs-store";
import { useUI } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import { toast } from "@/lib/toast";
import type { OpenTab } from "@/lib/types";
import { getDomain } from "@/lib/url";
import { cn, formatCount } from "@/lib/utils";

export const openTabDragId = (id: string) => `open:${id}`;

export function OpenTabsPanel({ onClose }: { onClose?: () => void }) {
  const status = useOpenTabs((s) => s.status);
  const tabs = useOpenTabs((s) => s.tabs);
  const selected = useUI((s) => s.selectedOpenTabs);
  const setSelected = useUI((s) => s.setSelectedOpenTabs);
  const toggle = useUI((s) => s.toggleOpenTab);
  const clearSelection = useUI((s) => s.clearOpenTabSelection);

  const collectionOrder = useWorkspace((s) => s.collectionOrder);
  const collections = useWorkspace((s) => s.collections);
  const addTabs = useWorkspace((s) => s.addTabs);

  const [query, setQuery] = React.useState("");
  const [chosenTarget, setChosenTarget] = React.useState<string | null>(null);

  // Derived rather than stored, so a deleted collection can't leave the
  // destination pointing at nothing.
  const target =
    chosenTarget && collections[chosenTarget]
      ? chosenTarget
      : (collectionOrder[0] ?? "");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tabs;
    return tabs.filter(
      (t) =>
        t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q),
    );
  }, [query, tabs]);

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((t) => selectedSet.has(t.id));

  const save = (source: OpenTab[]) => {
    if (!target) {
      toast.error("Create a collection first");
      return;
    }
    if (source.length === 0) {
      toast.info("Nothing to save");
      return;
    }
    addTabs(
      target,
      source.map((t) => ({
        url: t.url,
        title: t.title,
        favicon: t.favIconUrl,
        faviconUrl: t.favIconUrl,
      })),
    );
    toast.success(
      `Saved ${formatCount(source.length, "tab")} to ${collections[target]?.name ?? "collection"}`,
    );
    clearSelection();
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <h2 className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-faint-foreground">
          Open tabs
        </h2>
        {status === "connected" ? (
          <Badge tone="neutral">{tabs.length}</Badge>
        ) : null}
        <Tooltip content="Refresh">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => requestOpenTabs()}
            disabled={status !== "connected"}
            aria-label="Refresh open tabs"
          >
            <RefreshCcw />
          </Button>
        </Tooltip>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close open tabs panel"
          >
            <X />
          </Button>
        ) : null}
      </header>

      {status === "checking" ? (
        <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
          <Spinner />
          Looking for the extension…
        </div>
      ) : status === "unavailable" ? (
        <ExtensionMissing />
      ) : (
        <>
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search open tabs"
                aria-label="Search open tabs"
                className="h-8 pl-8 text-[13px]"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 justify-center"
                onClick={() =>
                  allFilteredSelected
                    ? clearSelection()
                    : setSelected(filtered.map((t) => t.id))
                }
                disabled={filtered.length === 0}
              >
                {allFilteredSelected ? <SquareDashed /> : <CheckCheck />}
                {allFilteredSelected ? "Deselect all" : "Select all"}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {tabs.length === 0
                  ? "No open browser tabs to show."
                  : `No open tabs match “${query.trim()}”.`}
              </p>
            ) : (
              filtered.map((tab) => (
                <OpenTabRow
                  key={tab.id}
                  tab={tab}
                  selected={selectedSet.has(tab.id)}
                  selectedCount={selected.length}
                  onToggle={(additive) => toggle(tab.id, additive)}
                />
              ))
            )}
          </div>

          <footer className="space-y-2 border-t border-border p-3">
            <label className="sr-only" htmlFor="open-tabs-target">
              Destination collection
            </label>
            <select
              id="open-tabs-target"
              value={target}
              onChange={(e) => setChosenTarget(e.target.value)}
              disabled={collectionOrder.length === 0}
              className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-foreground outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 disabled:opacity-50"
            >
              {collectionOrder.length === 0 ? (
                <option value="">No collections yet</option>
              ) : null}
              {collectionOrder.map((id) => (
                <option key={id} value={id}>
                  {collections[id]?.name}
                </option>
              ))}
            </select>

            <div className="flex gap-1.5">
              <Button
                variant="primary"
                size="sm"
                className="flex-1 justify-center"
                disabled={selected.length === 0 || !target}
                onClick={() =>
                  save(tabs.filter((t) => selectedSet.has(t.id)))
                }
              >
                Save selected
                {selected.length > 0 ? ` (${selected.length})` : ""}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1 justify-center"
                disabled={tabs.length === 0 || !target}
                onClick={() => save(tabs)}
              >
                Save all
              </Button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

function OpenTabRow({
  tab,
  selected,
  selectedCount,
  onToggle,
}: {
  tab: OpenTab;
  selected: boolean;
  selectedCount: number;
  onToggle: (additive: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: openTabDragId(tab.id),
    data: { type: "open-tab", openTabId: tab.id },
  });

  // Dragging a selected row carries the whole selection.
  const carries = selected && selectedCount > 1 ? selectedCount : 1;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/open flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-hover",
        selected && "bg-accent-soft/60",
        isDragging && "opacity-35",
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggle(true)}
        aria-label={`Select ${tab.title || tab.url}`}
      />

      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => onToggle(e.ctrlKey || e.metaKey || e.shiftKey)}
        title={tab.url}
        className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 text-left outline-none active:cursor-grabbing"
      >
        <Favicon url={tab.url} favicon={tab.favIconUrl} size={16} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-foreground">
            {tab.title || getDomain(tab.url)}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {getDomain(tab.url)}
          </span>
        </span>
        {carries > 1 ? (
          <Badge tone="accent" className="shrink-0">
            {carries}
          </Badge>
        ) : null}
      </button>
    </div>
  );
}

function ExtensionMissing() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Puzzle className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Browser extension not detected
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Install the Tabs extension to see your open browser tabs here and drag
          them straight into a collection.
        </p>
      </div>
      <p className="rounded-md border border-border bg-muted px-2.5 py-1.5 text-left font-mono text-[11px] leading-relaxed text-muted-foreground">
        chrome://extensions → Developer mode →
        <br />
        Load unpacked → <span className="text-foreground">extension/</span>
      </p>
      <Button variant="ghost" size="sm" onClick={() => requestOpenTabs()}>
        <RefreshCcw />
        Check again
      </Button>
    </div>
  );
}
