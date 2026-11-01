import type { Collection, SavedTab, Settings } from "@/lib/types";
import type { FlushPayload, WorkspaceBackend } from "./backend";

export type SyncStatus = "idle" | "pending" | "syncing" | "error" | "local";

interface StateSource {
  collections: Record<string, Collection>;
  tabs: Record<string, SavedTab>;
  settings: Settings;
}

const DEBOUNCE_MS = 450;
const RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000];

/**
 * Coalescing write queue.
 *
 * Mutations mark entity ids as dirty rather than queueing full operations, so
 * dragging one tab across ten slots still results in a single row write. The
 * payload is built from the live store at flush time, which means the newest
 * value always wins and the queue can never go stale.
 */
class SyncEngine {
  private backend: WorkspaceBackend | null = null;
  private getState: (() => StateSource) | null = null;

  private dirtyCollections = new Set<string>();
  private deletedCollections = new Set<string>();
  private dirtyTabs = new Set<string>();
  private deletedTabs = new Set<string>();
  private dirtySettings = false;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private inFlight: Promise<void> | null = null;

  private status: SyncStatus = "idle";
  private statusListeners = new Set<(s: SyncStatus) => void>();
  private errorListeners = new Set<(e: unknown) => void>();

  configure(backend: WorkspaceBackend | null, getState: () => StateSource) {
    this.cancelTimers();
    this.clearMarks();
    this.backend = backend;
    this.getState = getState;
    this.retryAttempt = 0;
    this.setStatus(backend?.kind === "local" ? "local" : "idle");
  }

  teardown() {
    this.cancelTimers();
    this.clearMarks();
    this.backend = null;
    this.getState = null;
    this.setStatus("idle");
  }

  // ---- status ----

  getStatus() {
    return this.status;
  }

  onStatus(fn: (s: SyncStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  onError(fn: (e: unknown) => void): () => void {
    this.errorListeners.add(fn);
    return () => {
      this.errorListeners.delete(fn);
    };
  }

  private setStatus(next: SyncStatus) {
    if (this.status === next) return;
    this.status = next;
    for (const fn of this.statusListeners) fn(next);
  }

  // ---- marking ----

  markCollection(id: string) {
    this.deletedCollections.delete(id);
    this.dirtyCollections.add(id);
    this.schedule();
  }

  markCollectionDeleted(id: string) {
    this.dirtyCollections.delete(id);
    this.deletedCollections.add(id);
    this.schedule();
  }

  markTab(id: string) {
    this.deletedTabs.delete(id);
    this.dirtyTabs.add(id);
    this.schedule();
  }

  markTabDeleted(id: string) {
    this.dirtyTabs.delete(id);
    this.deletedTabs.add(id);
    this.schedule();
  }

  markSettings() {
    this.dirtySettings = true;
    this.schedule();
  }

  /** True while a local edit for this id has not reached the server yet. */
  hasPending(id: string): boolean {
    return (
      this.dirtyCollections.has(id) ||
      this.deletedCollections.has(id) ||
      this.dirtyTabs.has(id) ||
      this.deletedTabs.has(id)
    );
  }

  private hasWork() {
    return (
      this.dirtyCollections.size > 0 ||
      this.deletedCollections.size > 0 ||
      this.dirtyTabs.size > 0 ||
      this.deletedTabs.size > 0 ||
      this.dirtySettings
    );
  }

  private clearMarks() {
    this.dirtyCollections.clear();
    this.deletedCollections.clear();
    this.dirtyTabs.clear();
    this.deletedTabs.clear();
    this.dirtySettings = false;
  }

  private cancelTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
  }

  // ---- flushing ----

  private schedule() {
    if (!this.backend) return;
    if (this.status !== "error") this.setStatus("pending");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  /** Force an immediate write. Safe to call when nothing is dirty. */
  async flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.backend || !this.getState || !this.hasWork()) {
      if (this.backend && !this.hasWork()) {
        this.setStatus(this.backend.kind === "local" ? "local" : "idle");
      }
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const backend = this.backend;
    const state = this.getState();

    const collectionUpserts: Collection[] = [];
    for (const id of this.dirtyCollections) {
      const c = state.collections[id];
      if (c) collectionUpserts.push(c);
    }
    const tabUpserts: SavedTab[] = [];
    for (const id of this.dirtyTabs) {
      const t = state.tabs[id];
      if (t) tabUpserts.push(t);
    }

    const payload: FlushPayload = {
      collectionUpserts,
      collectionDeletes: [...this.deletedCollections],
      tabUpserts,
      tabDeletes: [...this.deletedTabs],
      settings: this.dirtySettings ? state.settings : null,
    };

    // Take the marks now; anything the user does during the round trip lands
    // in a fresh set and triggers another flush.
    const taken = {
      collections: new Set(this.dirtyCollections),
      collectionDeletes: new Set(this.deletedCollections),
      tabs: new Set(this.dirtyTabs),
      tabDeletes: new Set(this.deletedTabs),
      settings: this.dirtySettings,
    };
    this.clearMarks();

    this.setStatus("syncing");

    this.inFlight = (async () => {
      try {
        await backend.flush(payload);
        this.retryAttempt = 0;
        this.setStatus(
          backend.kind === "local"
            ? "local"
            : this.hasWork()
              ? "pending"
              : "idle",
        );
        if (this.hasWork()) this.schedule();
      } catch (error) {
        // Put the marks back so the retry writes the newest values.
        for (const id of taken.collections) this.dirtyCollections.add(id);
        for (const id of taken.collectionDeletes) this.deletedCollections.add(id);
        for (const id of taken.tabs) this.dirtyTabs.add(id);
        for (const id of taken.tabDeletes) this.deletedTabs.add(id);
        if (taken.settings) this.dirtySettings = true;

        this.setStatus("error");
        for (const fn of this.errorListeners) fn(error);
        this.scheduleRetry();
      } finally {
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay =
      RETRY_DELAYS[Math.min(this.retryAttempt, RETRY_DELAYS.length - 1)];
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }
}

export const syncEngine = new SyncEngine();

/** Best-effort flush when the tab is hidden or closing. */
export function installSyncLifecycleHooks() {
  if (typeof document === "undefined") return () => {};

  const onVisibility = () => {
    if (document.visibilityState === "hidden") void syncEngine.flush();
  };
  const onPageHide = () => {
    void syncEngine.flush();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}
