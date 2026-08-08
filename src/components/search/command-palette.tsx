"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  FolderPlus,
  Globe,
  Layers,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sun,
  Terminal,
  Upload,
} from "lucide-react";

import { Favicon } from "@/components/favicon";
import { Kbd } from "@/components/ui/primitives";
import { getSearchIndex } from "@/lib/search/registry";
import { searchCollections, type SearchHit } from "@/lib/search";
import { useUI, type PaletteMode } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import { useOpenTabs } from "@/lib/store/open-tabs-store";
import { exportWorkspace } from "@/lib/transfer/download";
import { revealCollection } from "@/lib/reveal";
import { toast } from "@/lib/toast";
import type { Collection } from "@/lib/types";
import { getDomain, safeHref } from "@/lib/url";
import { cn, formatCount } from "@/lib/utils";

interface CommandDef {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
  /** Prompt shown when the command needs a destination collection. */
  needsCollection?: string;
  run: (collectionId?: string) => void;
}

type Item =
  | { kind: "tab"; key: string; hit: SearchHit }
  | { kind: "collection"; key: string; collection: Collection }
  | { kind: "command"; key: string; command: CommandDef };

/**
 * Quick search / command palette.
 *
 * The body is a separate component mounted only while the dialog is open, so
 * every invocation starts from a clean, correctly-seeded state without any
 * state-resetting effects.
 */
export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const seed = useUI((s) => s.paletteSeed);
  const mode = useUI((s) => s.paletteMode);
  const closePalette = useUI((s) => s.closePalette);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closePalette();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="overlay"
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          data-slot="palette-content"
          aria-label="Search everywhere"
          className="fixed left-1/2 top-[12vh] z-50 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-elevated shadow-float outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            Search everywhere
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search your saved tabs and collections, or type a greater-than sign
            to run a command.
          </DialogPrimitive.Description>

          <PaletteBody seed={seed} mode={mode} onClose={closePalette} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteBody({
  seed,
  mode,
  onClose,
}: {
  seed: string;
  mode: PaletteMode;
  onClose: () => void;
}) {
  const openNewCollection = useUI((s) => s.openNewCollection);
  const openAddTab = useUI((s) => s.openAddTab);
  const openImport = useUI((s) => s.openImport);
  const openEditTab = useUI((s) => s.openEditTab);
  const selectedOpenTabs = useUI((s) => s.selectedOpenTabs);

  const router = useRouter();
  const { setTheme } = useTheme();

  const [query, setQueryState] = React.useState(
    () => seed || (mode === "command" ? ">" : ""),
  );
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [pending, setPendingState] = React.useState<CommandDef | null>(null);

  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Any change to the query or the step resets the highlight, so this always
  // happens together rather than in a follow-up effect.
  const setQuery = (value: string) => {
    setQueryState(value);
    setActiveIndex(0);
  };
  const setPending = (command: CommandDef | null, nextQuery: string) => {
    setPendingState(command);
    setQueryState(nextQuery);
    setActiveIndex(0);
  };

  const tabsVersion = useWorkspace((s) => s.tabs);
  const collectionsVersion = useWorkspace((s) => s.collections);
  const collectionOrder = useWorkspace((s) => s.collectionOrder);

  const isCommandMode = query.startsWith(">");
  const commandQuery = isCommandMode ? query.slice(1).trim() : "";

  // ---- commands ----

  const commands = React.useMemo<CommandDef[]>(() => {
    const store = useWorkspace.getState();
    const openTabs = useOpenTabs.getState().tabs;

    const saveTabs = (ids: string[] | null, collectionId?: string) => {
      if (!collectionId) return;
      const source = ids ? openTabs.filter((t) => ids.includes(t.id)) : openTabs;
      if (source.length === 0) {
        toast.info("No open tabs to save");
        return;
      }
      store.addTabs(
        collectionId,
        source.map((t) => ({
          url: t.url,
          title: t.title,
          favicon: t.favIconUrl,
          faviconUrl: t.favIconUrl,
        })),
      );
      toast.success(
        `Saved ${formatCount(source.length, "tab")} to ${
          store.collections[collectionId]?.name ?? "collection"
        }`,
      );
    };

    return [
      {
        id: "new-collection",
        label: "Create collection",
        icon: FolderPlus,
        keywords: "new add folder group",
        run: () => openNewCollection(),
      },
      {
        id: "add-website",
        label: "Add website",
        icon: Globe,
        keywords: "new tab url link save manual",
        run: () => openAddTab(null),
      },
      {
        id: "import",
        label: "Import workspace",
        icon: Upload,
        keywords: "json restore load backup",
        run: () => openImport(),
      },
      {
        id: "export",
        label: "Export workspace",
        icon: Download,
        keywords: "json backup save download",
        run: () => {
          const s = useWorkspace.getState();
          const count = exportWorkspace(s);
          toast.success("Workspace exported", {
            description: `${formatCount(count, "website")} written to your downloads.`,
          });
        },
      },
      {
        id: "save-open-tabs",
        label: "Save all open tabs",
        hint: `${openTabs.length} open`,
        icon: Layers,
        keywords: "browser current capture",
        needsCollection: "Save all open tabs to…",
        run: (collectionId) => saveTabs(null, collectionId),
      },
      ...(selectedOpenTabs.length > 0
        ? [
            {
              id: "save-selected-tabs",
              label: "Save selected open tabs",
              hint: `${selectedOpenTabs.length} selected`,
              icon: Layers,
              keywords: "browser current capture selection",
              needsCollection: "Save selected tabs to…",
              run: (collectionId?: string) =>
                saveTabs(selectedOpenTabs, collectionId),
            } satisfies CommandDef,
          ]
        : []),
      {
        id: "collapse-all",
        label: "Collapse all collections",
        icon: ChevronsDownUp,
        keywords: "fold hide close",
        run: () => store.setAllCollapsed(true),
      },
      {
        id: "expand-all",
        label: "Expand all collections",
        icon: ChevronsUpDown,
        keywords: "unfold show open",
        run: () => store.setAllCollapsed(false),
      },
      {
        id: "theme-dark",
        label: "Switch to dark mode",
        icon: Moon,
        keywords: "theme appearance night",
        run: () => {
          store.updateSettings({ theme: "dark" });
          setTheme("dark");
        },
      },
      {
        id: "theme-light",
        label: "Switch to light mode",
        icon: Sun,
        keywords: "theme appearance day",
        run: () => {
          store.updateSettings({ theme: "light" });
          setTheme("light");
        },
      },
      {
        id: "settings",
        label: "Open settings",
        icon: SettingsIcon,
        keywords: "preferences account theme",
        run: () => router.push("/settings"),
      },
    ];
  }, [
    openAddTab,
    openImport,
    openNewCollection,
    router,
    selectedOpenTabs,
    setTheme,
  ]);

  // ---- items ----

  const items = React.useMemo<Item[]>(() => {
    void tabsVersion;
    void collectionsVersion;

    const state = useWorkspace.getState();

    // Step 2 of a command that needs a destination.
    if (pending) {
      const q = query.trim().toLowerCase();
      return collectionOrder
        .map((id) => state.collections[id])
        .filter(Boolean)
        .filter((c) => !q || c.name.toLowerCase().includes(q))
        .map((c) => ({
          kind: "collection" as const,
          key: `pick-${c.id}`,
          collection: c,
        }));
    }

    if (isCommandMode) {
      const q = commandQuery.toLowerCase();
      return commands
        .filter(
          (c) => !q || c.label.toLowerCase().includes(q) || c.keywords.includes(q),
        )
        .map((command) => ({
          kind: "command" as const,
          key: command.id,
          command,
        }));
    }

    const trimmed = query.trim();
    if (!trimmed) {
      // Empty search: offer the commands as a starting point.
      return commands
        .slice(0, 6)
        .map((command) => ({ kind: "command" as const, key: command.id, command }));
    }

    const hits = getSearchIndex().search(trimmed, 30);
    const matchedCollections = searchCollections(
      collectionOrder.map((id) => state.collections[id]).filter(Boolean),
      trimmed,
    );

    return [
      ...hits.map((hit) => ({
        kind: "tab" as const,
        key: `tab-${hit.doc.id}`,
        hit,
      })),
      ...matchedCollections.map((collection) => ({
        kind: "collection" as const,
        key: `collection-${collection.id}`,
        collection,
      })),
    ];
  }, [
    collectionOrder,
    collectionsVersion,
    commandQuery,
    commands,
    isCommandMode,
    pending,
    query,
    tabsVersion,
  ]);

  // Keep the highlighted row in view. Reading layout, not setting state.
  React.useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, items]);

  // ---- actions ----

  const runItem = (
    item: Item,
    modifiers: { newTab?: boolean; alt?: boolean } = {},
  ) => {
    if (item.kind === "command") {
      const command = item.command;
      if (command.needsCollection) {
        if (useWorkspace.getState().collectionOrder.length === 0) {
          toast.info("Create a collection first");
          onClose();
          return;
        }
        setPending(command, "");
        return;
      }
      onClose();
      command.run();
      return;
    }

    if (item.kind === "collection") {
      if (pending) {
        const command = pending;
        setPending(null, "");
        onClose();
        command.run(item.collection.id);
        return;
      }
      onClose();
      revealCollection(item.collection.id);
      return;
    }

    const { doc } = item.hit;
    if (modifiers.alt) {
      onClose();
      openEditTab(doc.id);
      return;
    }

    const href = safeHref(doc.url);
    if (href === "#") {
      toast.error("That URL can't be opened");
      return;
    }

    onClose();
    if (modifiers.newTab) window.open(href, "_blank", "noopener,noreferrer");
    else window.location.assign(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        items.length ? (i - 1 + items.length) % items.length : 0,
      );
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(Math.max(0, items.length - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) {
        runItem(item, { newTab: e.ctrlKey || e.metaKey, alt: e.altKey });
      }
      return;
    }
    if (e.key === "Backspace" && pending && query === "") {
      e.preventDefault();
      setPending(null, ">");
    }
  };

  const placeholder = pending
    ? pending.needsCollection!
    : isCommandMode
      ? "Run a command…"
      : "Search tabs, collections, URLs…  (type > for commands)";

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-4">
        {pending ? (
          <button
            type="button"
            onClick={() => {
              setPending(null, ">");
              inputRef.current?.focus();
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Back to commands"
          >
            <ArrowLeft className="size-4" />
          </button>
        ) : isCommandMode ? (
          <Terminal className="size-4 shrink-0 text-accent" />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" />
        )}

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-controls="palette-results"
          aria-activedescendant={
            items[activeIndex] ? `palette-item-${activeIndex}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          // The palette exists to be typed into; focusing it is the point.
          autoFocus
          className="h-14 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-faint-foreground"
        />
      </div>

      <div
        ref={listRef}
        id="palette-results"
        role="listbox"
        aria-label="Results"
        className="max-h-[min(24rem,55vh)] overflow-y-auto scrollbar-thin p-1.5"
      >
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {query.trim()
              ? `No results for “${isCommandMode ? commandQuery : query.trim()}”`
              : "Start typing to search."}
          </p>
        ) : (
          items.map((item, index) => (
            <PaletteRow
              key={item.key}
              item={item}
              index={index}
              active={index === activeIndex}
              onHover={() => setActiveIndex(index)}
              onSelect={(modifiers) => runItem(item, modifiers)}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 text-[11px] text-faint-foreground">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>↵</Kbd> new tab
          </span>
          <span className="hidden items-center gap-1 md:flex">
            <Kbd>Alt</Kbd>
            <Kbd>↵</Kbd> edit
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Esc</Kbd> close
        </span>
      </div>
    </>
  );
}

function PaletteRow({
  item,
  index,
  active,
  onHover,
  onSelect,
}: {
  item: Item;
  index: number;
  active: boolean;
  onHover: () => void;
  onSelect: (modifiers: { newTab?: boolean; alt?: boolean }) => void;
}) {
  const className = cn(
    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
    active ? "bg-muted" : "hover:bg-muted/60",
  );

  const common = {
    id: `palette-item-${index}`,
    "data-index": index,
    role: "option" as const,
    "aria-selected": active,
    onMouseMove: onHover,
    onClick: (e: React.MouseEvent) =>
      onSelect({ newTab: e.ctrlKey || e.metaKey, alt: e.altKey }),
    className,
  };

  if (item.kind === "command") {
    const Icon = item.command.icon;
    return (
      <button type="button" {...common}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {item.command.label}
        </span>
        {item.command.hint ? (
          <span className="shrink-0 text-xs text-faint-foreground">
            {item.command.hint}
          </span>
        ) : null}
      </button>
    );
  }

  if (item.kind === "collection") {
    return (
      <button type="button" {...common}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Layers className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">
            {item.collection.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            Collection
          </span>
        </span>
      </button>
    );
  }

  const { doc } = item.hit;
  return (
    <button type="button" {...common}>
      <span className="flex size-7 shrink-0 items-center justify-center">
        <Favicon url={doc.url} favicon={doc.favicon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">
          {doc.title || getDomain(doc.url)}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {doc.domain}
          {doc.collectionName ? (
            <>
              <span className="mx-1.5 text-faint-foreground">·</span>
              {doc.collectionName}
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}
