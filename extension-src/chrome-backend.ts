import type { Collection, SavedTab, Settings } from "@/lib/types";
import type { FlushPayload, RemoteEvent, WorkspaceBackend, WorkspaceSnapshot } from "@/lib/store/backend";
import { markCollectionDeleted, markCollectionUpsert, markTabDeleted, markTabUpsert, loadLocalState, saveLocalState } from "../extension/local-store.js";
import { syncWithSupabase } from "../extension/supabase-sync.js";

export class ChromeStorageBackend implements WorkspaceBackend {
  readonly kind = "local" as const;
  private listener: ((event: RemoteEvent) => void) | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncing = false;

  async load(): Promise<WorkspaceSnapshot> {
    const state = await loadLocalState();
    this.scheduleCloudSync();
    return state.workspace as WorkspaceSnapshot;
  }

  async flush(payload: FlushPayload): Promise<void> {
    const state = await loadLocalState();
    const collections = new Map<string, Collection>(
      (state.workspace.collections as Collection[]).map((item) => [item.id, item]),
    );
    const tabs = new Map<string, SavedTab>(
      (state.workspace.tabs as SavedTab[]).map((item) => [item.id, item]),
    );

    for (const id of payload.collectionDeletes) {
      collections.delete(id);
      for (const [tabId, tab] of tabs) if (tab.collectionId === id) tabs.delete(tabId);
      markCollectionDeleted(state, id);
    }
    for (const id of payload.tabDeletes) {
      tabs.delete(id);
      markTabDeleted(state, id);
    }
    for (const collection of payload.collectionUpserts) {
      collections.set(collection.id, collection);
      markCollectionUpsert(state, collection.id);
    }
    for (const tab of payload.tabUpserts) {
      tabs.set(tab.id, tab);
      markTabUpsert(state, tab.id);
    }

    state.workspace.collections = [...collections.values()];
    state.workspace.tabs = [...tabs.values()];
    if (payload.settings) {
      state.workspace.settings = payload.settings as Settings;
      state.pending.settings = true;
    }
    await saveLocalState(state);
    this.scheduleCloudSync();
  }

  subscribe(listener: (event: RemoteEvent) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
      if (this.syncTimer) clearTimeout(this.syncTimer);
    };
  }

  private scheduleCloudSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.syncCloud();
    }, 700);
  }

  private async syncCloud() {
    if (this.syncing) return;
    this.syncing = true;
    let state = await loadLocalState();
    const previousCollections = new Set((state.workspace.collections as Collection[]).map((item) => item.id));
    const previousTabs = new Set((state.workspace.tabs as SavedTab[]).map((item) => item.id));
    try {
      state = await syncWithSupabase(state);
      await saveLocalState(state);
      if (!this.listener) return;
      const collections = state.workspace.collections as Collection[];
      const tabs = state.workspace.tabs as SavedTab[];
      const nextCollections = new Set(collections.map((item) => item.id));
      const nextTabs = new Set(tabs.map((item) => item.id));
      for (const id of previousCollections) if (!nextCollections.has(id)) this.listener({ table: "collections", type: "DELETE", deletedId: id });
      for (const id of previousTabs) if (!nextTabs.has(id)) this.listener({ table: "saved_tabs", type: "DELETE", deletedId: id });
      for (const collection of collections) this.listener({ table: "collections", type: "UPDATE", collection });
      for (const tab of tabs) this.listener({ table: "saved_tabs", type: "UPDATE", tab });
      this.listener({ table: "user_settings", type: "UPDATE", settings: state.workspace.settings as Settings });
    } catch {
      await saveLocalState(state);
    } finally {
      this.syncing = false;
    }
  }
}
