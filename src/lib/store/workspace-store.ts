"use client";

import { create } from "zustand";

import type { TabsClient } from "@/lib/supabase/client";
import {
  byPosition,
  needsNormalization,
  normalizedPositions,
  positionAtEnd,
  positionForIndex,
  spreadBetween,
} from "@/lib/position";
import {
  DEFAULT_SETTINGS,
  type Collection,
  type SavedTab,
  type Settings,
} from "@/lib/types";
import { ensureProtocol, guessFaviconUrl, normalizeUrl, titleFromUrl } from "@/lib/url";
import { uuid } from "@/lib/utils";
import {
  LocalBackend,
  SupabaseBackend,
  type RemoteEvent,
  type WorkspaceBackend,
} from "./backend";
import { syncEngine } from "./sync";

export interface NewTabInput {
  id?: string;
  url: string;
  title?: string;
  description?: string;
  favicon?: string | null;
  faviconUrl?: string | null;
  tags?: string[];
  originalCreatedAt?: number | null;
  createdAt?: number;
}

export interface DeletedCollectionSnapshot {
  collection: Collection;
  tabs: SavedTab[];
}

type Status = "idle" | "loading" | "ready" | "error";

interface WorkspaceState {
  status: Status;
  error: string | null;
  userId: string | null;
  mode: "cloud" | "local";

  collections: Record<string, Collection>;
  tabs: Record<string, SavedTab>;
  /** Collection ids, sorted by position. */
  collectionOrder: string[];
  /** collectionId -> tab ids, sorted by position. */
  tabOrder: Record<string, string[]>;
  settings: Settings;

  // lifecycle
  init: (args: { client: TabsClient | null; userId: string | null; backend?: WorkspaceBackend }) => Promise<void>;
  teardown: () => void;
  applyRemote: (event: RemoteEvent) => void;

  // collections
  createCollection: (input: { name: string; description?: string }) => string;
  renameCollection: (id: string, name: string) => void;
  setCollectionDescription: (id: string, description: string) => void;
  setCollectionCollapsed: (id: string, collapsed: boolean) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  deleteCollection: (id: string) => DeletedCollectionSnapshot | null;
  restoreCollection: (snapshot: DeletedCollectionSnapshot) => void;
  moveCollection: (id: string, targetIndex: number) => void;

  // tabs
  addTab: (collectionId: string, input: NewTabInput, index?: number) => string | null;
  addTabs: (collectionId: string, inputs: NewTabInput[], index?: number) => string[];
  updateTab: (
    id: string,
    patch: Partial<
      Pick<
        SavedTab,
        "title" | "url" | "description" | "tags" | "favicon" | "faviconUrl"
      >
    >,
  ) => void;
  deleteTab: (id: string) => SavedTab | null;
  deleteTabs: (ids: string[]) => SavedTab[];
  restoreTabs: (tabs: SavedTab[]) => void;
  duplicateTab: (id: string) => string | null;
  moveTabs: (ids: string[], toCollectionId: string, targetIndex: number) => void;

  // import
  mergeImport: (collections: Collection[], tabs: SavedTab[]) => void;

  // settings
  updateSettings: (patch: Partial<Settings>) => void;
}

// ---------------------------------------------------------------------------
// order helpers
// ---------------------------------------------------------------------------

function sortCollectionIds(collections: Record<string, Collection>): string[] {
  return Object.values(collections).sort(byPosition).map((c) => c.id);
}

function sortTabIds(
  tabs: Record<string, SavedTab>,
  collectionId: string,
): string[] {
  return Object.values(tabs)
    .filter((t) => t.collectionId === collectionId)
    .sort(byPosition)
    .map((t) => t.id);
}

function buildTabOrder(
  tabs: Record<string, SavedTab>,
  collectionIds: string[],
): Record<string, string[]> {
  const buckets: Record<string, SavedTab[]> = {};
  for (const id of collectionIds) buckets[id] = [];
  for (const tab of Object.values(tabs)) {
    (buckets[tab.collectionId] ??= []).push(tab);
  }
  const out: Record<string, string[]> = {};
  for (const [cid, list] of Object.entries(buckets)) {
    out[cid] = list.sort(byPosition).map((t) => t.id);
  }
  return out;
}

const now = () => Date.now();

// ---------------------------------------------------------------------------

let unsubscribeRemote: (() => void) | null = null;
/** Guards against a slow, superseded init overwriting a newer one. */
let initToken = 0;

export const useWorkspace = create<WorkspaceState>((set, get) => {
  /** Mark a collection dirty and persist. */
  const touchCollection = (id: string) => syncEngine.markCollection(id);
  const touchTab = (id: string) => syncEngine.markTab(id);

  /**
   * If a collection's tab positions have collapsed into an unusable gap,
   * renumber the whole list. Rare, but keeps fractional indexing honest.
   */
  const normalizeIfNeeded = (collectionId: string) => {
    const state = get();
    const ids = state.tabOrder[collectionId] ?? [];
    const list = ids.map((id) => state.tabs[id]).filter(Boolean);
    if (!needsNormalization(list)) return;

    const positions = normalizedPositions(list);
    const tabs = { ...state.tabs };
    for (const [id, position] of positions) {
      tabs[id] = { ...tabs[id], position, updatedAt: now() };
      touchTab(id);
    }
    set({ tabs });
  };

  const normalizeCollectionsIfNeeded = () => {
    const state = get();
    const list = state.collectionOrder
      .map((id) => state.collections[id])
      .filter(Boolean);
    if (!needsNormalization(list)) return;

    const positions = normalizedPositions(list);
    const collections = { ...state.collections };
    for (const [id, position] of positions) {
      collections[id] = { ...collections[id], position, updatedAt: now() };
      touchCollection(id);
    }
    set({ collections });
  };

  return {
    status: "idle",
    error: null,
    userId: null,
    mode: "local",

    collections: {},
    tabs: {},
    collectionOrder: [],
    tabOrder: {},
    settings: DEFAULT_SETTINGS,

    // ---------------- lifecycle ----------------

    init: async ({ client, userId, backend }) => {
      const token = ++initToken;
      unsubscribeRemote?.();
      unsubscribeRemote = null;

      const cloud = backend ? backend.kind === "supabase" : Boolean(client && userId);
      const active: WorkspaceBackend = backend ?? (cloud
        ? new SupabaseBackend(client!, userId!)
        : new LocalBackend());

      const effectiveUserId = userId ?? "local";

      set({
        status: "loading",
        error: null,
        userId: effectiveUserId,
        mode: cloud ? "cloud" : "local",
      });

      syncEngine.configure(active, () => {
        const s = get();
        return { collections: s.collections, tabs: s.tabs, settings: s.settings };
      });

      if (active instanceof LocalBackend) {
        active.setSnapshotSource(() => {
          const s = get();
          return {
            collections: Object.values(s.collections),
            tabs: Object.values(s.tabs),
            settings: s.settings,
          };
        });
      }

      try {
        const snapshot = await active.load();
        if (token !== initToken) return; // superseded by a newer init

        const collections: Record<string, Collection> = {};
        for (const c of snapshot.collections) collections[c.id] = c;
        const tabs: Record<string, SavedTab> = {};
        for (const t of snapshot.tabs) tabs[t.id] = t;

        const collectionOrder = sortCollectionIds(collections);
        set({
          collections,
          tabs,
          collectionOrder,
          tabOrder: buildTabOrder(tabs, collectionOrder),
          settings: snapshot.settings,
          status: "ready",
        });

        // A realtime failure must not take the workspace down with it — the
        // app still works, it just stops seeing other devices' edits.
        try {
          unsubscribeRemote =
            active.subscribe?.((event: RemoteEvent) =>
              get().applyRemote(event),
            ) ?? null;
        } catch (error) {
          console.warn("Realtime subscription unavailable", error);
        }
      } catch (error) {
        if (token !== initToken) return;
        set({
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Could not load your workspace.",
        });
      }
    },

    teardown: () => {
      unsubscribeRemote?.();
      unsubscribeRemote = null;
      syncEngine.teardown();
      set({
        status: "idle",
        userId: null,
        collections: {},
        tabs: {},
        collectionOrder: [],
        tabOrder: {},
        settings: DEFAULT_SETTINGS,
      });
    },

    applyRemote: (event) => {
      const state = get();

      if (event.table === "user_settings" && event.settings) {
        set({ settings: event.settings });
        return;
      }

      if (event.table === "collections") {
        const id = event.collection?.id ?? event.deletedId;
        // A local edit is still in flight for this row — ours is newer.
        if (!id || syncEngine.hasPending(id)) return;

        if (event.type === "DELETE") {
          if (!state.collections[id]) return;
          const collections = { ...state.collections };
          delete collections[id];
          const tabs = { ...state.tabs };
          for (const tid of state.tabOrder[id] ?? []) delete tabs[tid];
          const tabOrder = { ...state.tabOrder };
          delete tabOrder[id];
          set({
            collections,
            tabs,
            tabOrder,
            collectionOrder: state.collectionOrder.filter((c) => c !== id),
          });
          return;
        }

        const incoming = event.collection!;
        const existing = state.collections[id];
        if (existing && existing.updatedAt > incoming.updatedAt) return;

        const collections = { ...state.collections, [id]: incoming };
        set({
          collections,
          collectionOrder: sortCollectionIds(collections),
          tabOrder: state.tabOrder[id]
            ? state.tabOrder
            : { ...state.tabOrder, [id]: [] },
        });
        return;
      }

      // saved_tabs
      const id = event.tab?.id ?? event.deletedId;
      if (!id || syncEngine.hasPending(id)) return;

      if (event.type === "DELETE") {
        const existing = state.tabs[id];
        if (!existing) return;
        const tabs = { ...state.tabs };
        delete tabs[id];
        set({
          tabs,
          tabOrder: {
            ...state.tabOrder,
            [existing.collectionId]: (
              state.tabOrder[existing.collectionId] ?? []
            ).filter((t) => t !== id),
          },
        });
        return;
      }

      const incoming = event.tab!;
      const existing = state.tabs[id];
      if (existing && existing.updatedAt > incoming.updatedAt) return;

      const tabs = { ...state.tabs, [id]: incoming };
      const tabOrder = { ...state.tabOrder };
      tabOrder[incoming.collectionId] = sortTabIds(tabs, incoming.collectionId);
      if (existing && existing.collectionId !== incoming.collectionId) {
        tabOrder[existing.collectionId] = sortTabIds(
          tabs,
          existing.collectionId,
        );
      }
      set({ tabs, tabOrder });
    },

    // ---------------- collections ----------------

    createCollection: ({ name, description }) => {
      const state = get();
      const id = uuid();
      const ts = now();
      const list = state.collectionOrder
        .map((cid) => state.collections[cid])
        .filter(Boolean);

      const collection: Collection = {
        id,
        userId: state.userId ?? "local",
        name: name.trim() || "Untitled collection",
        description: description?.trim() ?? "",
        collapsed: false,
        position: positionAtEnd(list),
        createdAt: ts,
        updatedAt: ts,
      };

      set({
        collections: { ...state.collections, [id]: collection },
        collectionOrder: [...state.collectionOrder, id],
        tabOrder: { ...state.tabOrder, [id]: [] },
      });
      touchCollection(id);
      return id;
    },

    renameCollection: (id, name) => {
      const state = get();
      const existing = state.collections[id];
      const trimmed = name.trim();
      if (!existing || !trimmed || existing.name === trimmed) return;
      set({
        collections: {
          ...state.collections,
          [id]: { ...existing, name: trimmed, updatedAt: now() },
        },
      });
      touchCollection(id);
    },

    setCollectionDescription: (id, description) => {
      const state = get();
      const existing = state.collections[id];
      if (!existing) return;
      const next = description.trim();
      if (existing.description === next) return;
      set({
        collections: {
          ...state.collections,
          [id]: { ...existing, description: next, updatedAt: now() },
        },
      });
      touchCollection(id);
    },

    setCollectionCollapsed: (id, collapsed) => {
      const state = get();
      const existing = state.collections[id];
      if (!existing || existing.collapsed === collapsed) return;
      set({
        collections: {
          ...state.collections,
          [id]: { ...existing, collapsed, updatedAt: now() },
        },
      });
      touchCollection(id);
    },

    setAllCollapsed: (collapsed) => {
      const state = get();
      const collections = { ...state.collections };
      let changed = false;
      for (const id of state.collectionOrder) {
        const c = collections[id];
        if (!c || c.collapsed === collapsed) continue;
        collections[id] = { ...c, collapsed, updatedAt: now() };
        touchCollection(id);
        changed = true;
      }
      if (changed) set({ collections });
    },

    deleteCollection: (id) => {
      const state = get();
      const collection = state.collections[id];
      if (!collection) return null;

      const tabIds = state.tabOrder[id] ?? [];
      const removedTabs = tabIds
        .map((tid) => state.tabs[tid])
        .filter(Boolean) as SavedTab[];

      const collections = { ...state.collections };
      delete collections[id];
      const tabs = { ...state.tabs };
      for (const tid of tabIds) delete tabs[tid];
      const tabOrder = { ...state.tabOrder };
      delete tabOrder[id];

      set({
        collections,
        tabs,
        tabOrder,
        collectionOrder: state.collectionOrder.filter((c) => c !== id),
      });

      // The DB cascades tabs, so only the collection delete needs queueing.
      syncEngine.markCollectionDeleted(id);
      return { collection, tabs: removedTabs };
    },

    restoreCollection: ({ collection, tabs: restoredTabs }) => {
      const state = get();
      const collections = { ...state.collections, [collection.id]: collection };
      const tabs = { ...state.tabs };
      for (const t of restoredTabs) tabs[t.id] = t;

      const collectionOrder = sortCollectionIds(collections);
      set({
        collections,
        tabs,
        collectionOrder,
        tabOrder: {
          ...state.tabOrder,
          [collection.id]: sortTabIds(tabs, collection.id),
        },
      });

      touchCollection(collection.id);
      for (const t of restoredTabs) touchTab(t.id);
    },

    moveCollection: (id, targetIndex) => {
      const state = get();
      if (!state.collections[id]) return;

      const without = state.collectionOrder.filter((c) => c !== id);
      const clamped = Math.max(0, Math.min(targetIndex, without.length));
      const siblings = without
        .map((cid) => state.collections[cid])
        .filter(Boolean);
      const position = positionForIndex(siblings, clamped);

      const collections = {
        ...state.collections,
        [id]: { ...state.collections[id], position, updatedAt: now() },
      };
      const nextOrder = [...without];
      nextOrder.splice(clamped, 0, id);

      set({ collections, collectionOrder: nextOrder });
      touchCollection(id);
      normalizeCollectionsIfNeeded();
    },

    // ---------------- tabs ----------------

    addTab: (collectionId, input, index) => {
      const ids = get().addTabs(collectionId, [input], index);
      return ids[0] ?? null;
    },

    addTabs: (collectionId, inputs, index) => {
      const state = get();
      if (!state.collections[collectionId] || inputs.length === 0) return [];

      const currentIds = state.tabOrder[collectionId] ?? [];
      const siblings = currentIds.map((id) => state.tabs[id]).filter(Boolean);
      const at = index == null ? siblings.length : Math.max(0, Math.min(index, siblings.length));
      const before = at > 0 ? siblings[at - 1].position : null;
      const after = at < siblings.length ? siblings[at].position : null;
      const positions = spreadBetween(before, after, inputs.length);

      const tabs = { ...state.tabs };
      const created: string[] = [];
      const ts = now();

      inputs.forEach((input, i) => {
        const url = ensureProtocol(input.url);
        const id = input.id ?? uuid();
        const tab: SavedTab = {
          id,
          collectionId,
          userId: state.userId ?? "local",
          title: (input.title ?? "").trim() || titleFromUrl(url),
          url,
          favicon: input.favicon ?? null,
          faviconUrl: input.faviconUrl ?? input.favicon ?? guessFaviconUrl(url),
          description: input.description?.trim() ?? "",
          tags: input.tags ?? [],
          position: positions[i],
          normalizedUrl: normalizeUrl(url),
          originalCreatedAt: input.originalCreatedAt ?? null,
          createdAt: input.createdAt ?? ts,
          updatedAt: ts,
        };
        tabs[id] = tab;
        created.push(id);
        touchTab(id);
      });

      const nextIds = [...currentIds];
      nextIds.splice(at, 0, ...created);

      set({ tabs, tabOrder: { ...state.tabOrder, [collectionId]: nextIds } });
      normalizeIfNeeded(collectionId);
      return created;
    },

    updateTab: (id, patch) => {
      const state = get();
      const existing = state.tabs[id];
      if (!existing) return;

      const next: SavedTab = { ...existing, ...patch, updatedAt: now() };
      if (patch.url !== undefined) {
        next.url = ensureProtocol(patch.url);
        next.normalizedUrl = normalizeUrl(next.url);
        if (!patch.faviconUrl && !existing.favicon) {
          next.faviconUrl = guessFaviconUrl(next.url);
        }
      }
      if (patch.title !== undefined) {
        next.title = patch.title.trim() || titleFromUrl(next.url);
      }

      set({ tabs: { ...state.tabs, [id]: next } });
      touchTab(id);
    },

    deleteTab: (id) => {
      const removed = get().deleteTabs([id]);
      return removed[0] ?? null;
    },

    deleteTabs: (ids) => {
      const state = get();
      const removed: SavedTab[] = [];
      const tabs = { ...state.tabs };
      const affected = new Set<string>();

      for (const id of ids) {
        const tab = tabs[id];
        if (!tab) continue;
        removed.push(tab);
        delete tabs[id];
        affected.add(tab.collectionId);
        syncEngine.markTabDeleted(id);
      }
      if (removed.length === 0) return [];

      const tabOrder = { ...state.tabOrder };
      const removedIds = new Set(removed.map((t) => t.id));
      for (const cid of affected) {
        tabOrder[cid] = (tabOrder[cid] ?? []).filter((t) => !removedIds.has(t));
      }

      set({ tabs, tabOrder });
      return removed;
    },

    restoreTabs: (restored) => {
      const state = get();
      const tabs = { ...state.tabs };
      const affected = new Set<string>();

      for (const tab of restored) {
        // The collection may have been deleted since; skip orphans.
        if (!state.collections[tab.collectionId]) continue;
        tabs[tab.id] = tab;
        affected.add(tab.collectionId);
        touchTab(tab.id);
      }

      const tabOrder = { ...state.tabOrder };
      for (const cid of affected) tabOrder[cid] = sortTabIds(tabs, cid);
      set({ tabs, tabOrder });
    },

    duplicateTab: (id) => {
      const state = get();
      const source = state.tabs[id];
      if (!source) return null;
      const index = (state.tabOrder[source.collectionId] ?? []).indexOf(id);
      const ids = get().addTabs(
        source.collectionId,
        [
          {
            url: source.url,
            title: source.title,
            description: source.description,
            favicon: source.favicon,
            faviconUrl: source.faviconUrl,
            tags: [...source.tags],
          },
        ],
        index >= 0 ? index + 1 : undefined,
      );
      return ids[0] ?? null;
    },

    moveTabs: (ids, toCollectionId, targetIndex) => {
      const state = get();
      if (!state.collections[toCollectionId] || ids.length === 0) return;

      const moving = ids.map((id) => state.tabs[id]).filter(Boolean) as SavedTab[];
      if (moving.length === 0) return;
      const movingIds = new Set(moving.map((t) => t.id));

      // Target order with the moved tabs removed, so the drop index refers to
      // the list the user is actually looking at mid-drag.
      const targetIds = (state.tabOrder[toCollectionId] ?? []).filter(
        (id) => !movingIds.has(id),
      );
      const siblings = targetIds.map((id) => state.tabs[id]).filter(Boolean);
      const at = Math.max(0, Math.min(targetIndex, siblings.length));
      const before = at > 0 ? siblings[at - 1].position : null;
      const after = at < siblings.length ? siblings[at].position : null;
      const positions = spreadBetween(before, after, moving.length);

      const tabs = { ...state.tabs };
      const sourceCollections = new Set<string>();
      const ts = now();

      moving.forEach((tab, i) => {
        sourceCollections.add(tab.collectionId);
        tabs[tab.id] = {
          ...tab,
          collectionId: toCollectionId,
          position: positions[i],
          updatedAt: ts,
        };
        touchTab(tab.id);
      });

      const tabOrder = { ...state.tabOrder };
      const nextTarget = [...targetIds];
      nextTarget.splice(at, 0, ...moving.map((t) => t.id));
      tabOrder[toCollectionId] = nextTarget;

      for (const cid of sourceCollections) {
        if (cid === toCollectionId) continue;
        tabOrder[cid] = (tabOrder[cid] ?? []).filter((id) => !movingIds.has(id));
      }

      set({ tabs, tabOrder });
      normalizeIfNeeded(toCollectionId);
    },

    // ---------------- import ----------------

    mergeImport: (incomingCollections, incomingTabs) => {
      const state = get();
      const collections = { ...state.collections };
      const tabs = { ...state.tabs };

      for (const c of incomingCollections) {
        collections[c.id] = c;
        touchCollection(c.id);
      }
      for (const t of incomingTabs) {
        tabs[t.id] = t;
        touchTab(t.id);
      }

      const collectionOrder = sortCollectionIds(collections);
      set({
        collections,
        tabs,
        collectionOrder,
        tabOrder: buildTabOrder(tabs, collectionOrder),
      });
    },

    // ---------------- settings ----------------

    updateSettings: (patch) => {
      const state = get();
      const settings = { ...state.settings, ...patch };
      set({ settings });
      syncEngine.markSettings();
    },
  };
});

// ---------------------------------------------------------------------------
// selectors
// ---------------------------------------------------------------------------

export const selectCollectionOrder = (s: WorkspaceState) => s.collectionOrder;
export const selectSettings = (s: WorkspaceState) => s.settings;
export const selectStatus = (s: WorkspaceState) => s.status;

export function useCollection(id: string) {
  return useWorkspace((s) => s.collections[id]);
}

export function useTabIds(collectionId: string) {
  return useWorkspace((s) => s.tabOrder[collectionId]);
}

export function useTab(id: string) {
  return useWorkspace((s) => s.tabs[id]);
}

export function useWorkspaceStats() {
  const collectionCount = useWorkspace((s) => s.collectionOrder.length);
  const tabCount = useWorkspace((s) => Object.keys(s.tabs).length);
  return { collectionCount, tabCount };
}
