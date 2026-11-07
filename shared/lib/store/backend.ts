import type { TabsClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/lib/supabase/database.types";
import {
  DEFAULT_SETTINGS,
  type Collection,
  type SavedTab,
  type Settings,
  type ThemePreference,
  type ViewMode,
} from "@/lib/types";
import { normalizeUrl } from "@/lib/url";

export interface WorkspaceSnapshot {
  collections: Collection[];
  tabs: SavedTab[];
  settings: Settings;
}

export interface FlushPayload {
  collectionUpserts: Collection[];
  collectionDeletes: string[];
  tabUpserts: SavedTab[];
  tabDeletes: string[];
  settings: Settings | null;
}

export interface RemoteEvent {
  table: "collections" | "saved_tabs" | "user_settings";
  type: "INSERT" | "UPDATE" | "DELETE";
  collection?: Collection;
  tab?: SavedTab;
  settings?: Settings;
  deletedId?: string;
}

export interface WorkspaceBackend {
  readonly kind: "supabase" | "local";
  load(): Promise<WorkspaceSnapshot>;
  flush(payload: FlushPayload): Promise<void>;
  subscribe?(onEvent: (event: RemoteEvent) => void): () => void;
}

// ---------------------------------------------------------------------------
// Row <-> domain mapping
// ---------------------------------------------------------------------------

function toTagArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is string => typeof t === "string");
}

export function rowToCollection(row: Tables<"collections">): Collection {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? "",
    collapsed: row.collapsed,
    position: row.position,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export function rowToTab(row: Tables<"saved_tabs">): SavedTab {
  return {
    id: row.id,
    collectionId: row.collection_id,
    userId: row.user_id,
    title: row.title,
    url: row.url,
    favicon: row.favicon,
    faviconUrl: row.favicon_url,
    description: row.description ?? "",
    tags: toTagArray(row.tags),
    position: row.position,
    normalizedUrl: row.normalized_url,
    originalCreatedAt: row.original_created_at,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export function rowToSettings(row: Tables<"user_settings">): Settings {
  return {
    theme: (["system", "light", "dark"] as const).includes(
      row.theme as ThemePreference,
    )
      ? (row.theme as ThemePreference)
      : "system",
    doubleShiftSearch: row.double_shift_search,
    fuzzySearch: row.fuzzy_search,
    searchDescriptions: row.search_descriptions,
    searchTags: row.search_tags,
    viewMode: (["list", "grid", "compact"] as const).includes(
      row.view_mode as ViewMode,
    )
      ? (row.view_mode as ViewMode)
      : "list",
    sidebarOpen: row.sidebar_open,
  };
}

function collectionToRow(c: Collection): TablesInsert<"collections"> {
  return {
    id: c.id,
    user_id: c.userId,
    name: c.name,
    description: c.description || null,
    collapsed: c.collapsed,
    position: c.position,
  };
}

function tabToRow(t: SavedTab): TablesInsert<"saved_tabs"> {
  return {
    id: t.id,
    user_id: t.userId,
    collection_id: t.collectionId,
    title: t.title,
    url: t.url,
    description: t.description || null,
    favicon: t.favicon,
    favicon_url: t.faviconUrl,
    tags: t.tags,
    position: t.position,
    normalized_url: t.normalizedUrl ?? normalizeUrl(t.url),
    original_created_at: t.originalCreatedAt,
  };
}

// ---------------------------------------------------------------------------
// Supabase backend
// ---------------------------------------------------------------------------

/** PostgREST refuses very large payloads; chunk big imports. */
const CHUNK = 500;

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Makes each realtime channel topic unique — see `subscribe` below. */
let channelSequence = 0;

export class SupabaseBackend implements WorkspaceBackend {
  readonly kind = "supabase" as const;

  private readonly channelTopic: string;

  constructor(
    private readonly client: TabsClient,
    private readonly userId: string,
  ) {
    // supabase-js returns the *existing* channel for a topic that is already
    // joined, and adding postgres_changes handlers to a joined channel throws.
    // React's development double-effect creates two backends in a row, so the
    // topic has to be unique per instance.
    channelSequence += 1;
    this.channelTopic = `workspace:${userId}:${channelSequence}`;
  }

  async load(): Promise<WorkspaceSnapshot> {
    const [collectionsRes, settingsRes] = await Promise.all([
      this.client
        .from("collections")
        .select("*")
        .order("position", { ascending: true }),
      this.client
        .from("user_settings")
        .select("*")
        .eq("user_id", this.userId)
        .maybeSingle(),
    ]);

    if (collectionsRes.error) throw collectionsRes.error;

    // Tabs are paged: a large workspace can exceed PostgREST's default cap.
    const tabs: SavedTab[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from("saved_tabs")
        .select("*")
        .order("position", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      tabs.push(...(data ?? []).map(rowToTab));
      if (!data || data.length < PAGE) break;
    }

    return {
      collections: (collectionsRes.data ?? []).map(rowToCollection),
      tabs,
      settings: settingsRes.data
        ? rowToSettings(settingsRes.data)
        : DEFAULT_SETTINGS,
    };
  }

  async flush(payload: FlushPayload): Promise<void> {
    // Deletes first: a collection delete cascades to its tabs, so running it
    // before the tab upserts avoids resurrecting rows the user just removed.
    if (payload.collectionDeletes.length) {
      for (const ids of chunked(payload.collectionDeletes)) {
        const { error } = await this.client
          .from("collections")
          .delete()
          .in("id", ids);
        if (error) throw error;
      }
    }

    if (payload.tabDeletes.length) {
      for (const ids of chunked(payload.tabDeletes)) {
        const { error } = await this.client
          .from("saved_tabs")
          .delete()
          .in("id", ids);
        if (error) throw error;
      }
    }

    if (payload.collectionUpserts.length) {
      for (const rows of chunked(payload.collectionUpserts.map(collectionToRow))) {
        const { error } = await this.client.from("collections").upsert(rows);
        if (error) throw error;
      }
    }

    if (payload.tabUpserts.length) {
      for (const rows of chunked(payload.tabUpserts.map(tabToRow))) {
        const { error } = await this.client.from("saved_tabs").upsert(rows);
        if (error) throw error;
      }
    }

    if (payload.settings) {
      const s = payload.settings;
      const { error } = await this.client.from("user_settings").upsert({
        user_id: this.userId,
        theme: s.theme,
        double_shift_search: s.doubleShiftSearch,
        fuzzy_search: s.fuzzySearch,
        search_descriptions: s.searchDescriptions,
        search_tags: s.searchTags,
        view_mode: s.viewMode,
        sidebar_open: s.sidebarOpen,
      });
      if (error) throw error;
    }
  }

  subscribe(onEvent: (event: RemoteEvent) => void): () => void {
    const channel = this.client
      .channel(this.channelTopic)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "collections",
          filter: `user_id=eq.${this.userId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<Tables<"collections">>;
            if (old?.id) {
              onEvent({ table: "collections", type: "DELETE", deletedId: old.id });
            }
            return;
          }
          onEvent({
            table: "collections",
            type: payload.eventType,
            collection: rowToCollection(payload.new as Tables<"collections">),
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "saved_tabs",
          filter: `user_id=eq.${this.userId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<Tables<"saved_tabs">>;
            if (old?.id) {
              onEvent({ table: "saved_tabs", type: "DELETE", deletedId: old.id });
            }
            return;
          }
          onEvent({
            table: "saved_tabs",
            type: payload.eventType,
            tab: rowToTab(payload.new as Tables<"saved_tabs">),
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_settings",
          filter: `user_id=eq.${this.userId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          onEvent({
            table: "user_settings",
            type: payload.eventType,
            settings: rowToSettings(payload.new as Tables<"user_settings">),
          });
        },
      )
      .subscribe();

    return () => {
      void this.client.removeChannel(channel);
    };
  }
}

// ---------------------------------------------------------------------------
// Local backend — used when Supabase is not configured.
// ---------------------------------------------------------------------------

const LOCAL_KEY = "tabs.workspace.v1";

interface LocalShape {
  collections: Collection[];
  tabs: SavedTab[];
  settings: Settings;
}

export class LocalBackend implements WorkspaceBackend {
  readonly kind = "local" as const;

  /** No realtime channel exists for a device-local workspace. */
  readonly subscribe = undefined;

  async load(): Promise<WorkspaceSnapshot> {
    if (typeof window === "undefined") {
      return { collections: [], tabs: [], settings: DEFAULT_SETTINGS };
    }
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      if (!raw) return { collections: [], tabs: [], settings: DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<LocalShape>;
      return {
        collections: Array.isArray(parsed.collections) ? parsed.collections : [],
        tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      };
    } catch {
      return { collections: [], tabs: [], settings: DEFAULT_SETTINGS };
    }
  }

  /**
   * The local backend has no incremental protocol — the store hands it the
   * whole snapshot through `setSnapshotSource`, which it then writes verbatim.
   */
  private snapshotSource: (() => LocalShape) | null = null;

  setSnapshotSource(fn: () => LocalShape) {
    this.snapshotSource = fn;
  }

  async flush(): Promise<void> {
    if (typeof window === "undefined" || !this.snapshotSource) return;
    const snapshot = this.snapshotSource();
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
  }
}
