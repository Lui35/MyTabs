export const LOCAL_STATE_PREFIX = "tabs.localState.v1";
export const CONFIG_KEY = "tabs.supabaseConfig.v1";
export const SESSION_KEY = "tabs.supabaseSession.v1";

export const DEFAULT_SETTINGS = {
  theme: "system",
  doubleShiftSearch: true,
  fuzzySearch: true,
  searchDescriptions: true,
  searchTags: true,
  viewMode: "grid",
  sidebarOpen: true,
};

export function emptyState(ownerId = "local") {
  return {
    version: 2,
    ownerId,
    workspace: {
      collections: [],
      tabs: [],
      settings: { ...DEFAULT_SETTINGS },
    },
    pending: {
      collectionUpserts: [],
      collectionDeletes: [],
      tabUpserts: [],
      tabDeletes: [],
      settings: false,
    },
    sync: {
      lastSyncedAt: null,
      lastError: null,
    },
  };
}

function stringArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string"))]
    : [];
}

export function normalizeState(value, expectedOwnerId) {
  const ownerId = expectedOwnerId || value?.ownerId || "local";
  const fallback = emptyState(ownerId);
  if (!value || typeof value !== "object") return fallback;

  const workspace =
    value.workspace && typeof value.workspace === "object"
      ? value.workspace
      : fallback.workspace;
  const pending =
    value.pending && typeof value.pending === "object"
      ? value.pending
      : fallback.pending;
  const sync =
    value.sync && typeof value.sync === "object" ? value.sync : fallback.sync;

  const migratedSettings = workspace.settings ?? {};
  return {
    version: 2,
    ownerId,
    workspace: {
      collections: Array.isArray(workspace.collections)
        ? workspace.collections.filter(Boolean)
        : [],
      tabs: Array.isArray(workspace.tabs) ? workspace.tabs.filter(Boolean) : [],
      settings: { ...DEFAULT_SETTINGS, ...migratedSettings },
    },
    pending: {
      collectionUpserts: stringArray(pending.collectionUpserts),
      collectionDeletes: stringArray(pending.collectionDeletes),
      tabUpserts: stringArray(pending.tabUpserts),
      tabDeletes: stringArray(pending.tabDeletes),
      settings: pending.settings === true,
    },
    sync: {
      lastSyncedAt:
        typeof sync.lastSyncedAt === "number" ? sync.lastSyncedAt : null,
      lastError: typeof sync.lastError === "string" ? sync.lastError : null,
    },
  };
}

export async function loadLocalState() {
  const sessionStored = await chrome.storage.local.get(SESSION_KEY);
  const ownerId = sessionStored[SESSION_KEY]?.user?.id ?? "local";
  const key = `${LOCAL_STATE_PREFIX}:${ownerId}`;
  const stored = await chrome.storage.local.get(key);
  return normalizeState(stored[key], ownerId);
}

export async function saveLocalState(state) {
  const normalized = normalizeState(state, state?.ownerId);
  const key = `${LOCAL_STATE_PREFIX}:${normalized.ownerId}`;
  await chrome.storage.local.set({ [key]: normalized });
  return normalized;
}

export async function removeLocalStateProfile(ownerId) {
  await chrome.storage.local.remove(`${LOCAL_STATE_PREFIX}:${ownerId}`);
}

export async function loadSupabaseConfig() {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  const value = stored[CONFIG_KEY];
  return {
    url: typeof value?.url === "string" ? value.url.replace(/\/$/, "") : "",
    publishableKey:
      typeof value?.publishableKey === "string" ? value.publishableKey : "",
  };
}

export async function saveSupabaseConfig(config) {
  const normalized = {
    url: String(config.url ?? "").trim().replace(/\/$/, ""),
    publishableKey: String(config.publishableKey ?? "").trim(),
  };
  await chrome.storage.local.set({ [CONFIG_KEY]: normalized });
  return normalized;
}

export async function loadSession() {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const value = stored[SESSION_KEY];
  return value && typeof value === "object" ? value : null;
}

export async function saveSession(session) {
  if (session) await chrome.storage.local.set({ [SESSION_KEY]: session });
  else await chrome.storage.local.remove(SESSION_KEY);
}

export function makeId() {
  return crypto.randomUUID();
}

export function normalizeUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.href;
  } catch {
    return "";
  }
}

export function titleFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function markId(list, id) {
  if (!list.includes(id)) list.push(id);
}

function unmarkId(list, id) {
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
}

export function markCollectionUpsert(state, id) {
  markId(state.pending.collectionUpserts, id);
  unmarkId(state.pending.collectionDeletes, id);
}

export function markCollectionDeleted(state, id) {
  unmarkId(state.pending.collectionUpserts, id);
  markId(state.pending.collectionDeletes, id);
}

export function markTabUpsert(state, id) {
  markId(state.pending.tabUpserts, id);
  unmarkId(state.pending.tabDeletes, id);
}

export function markTabDeleted(state, id) {
  unmarkId(state.pending.tabUpserts, id);
  markId(state.pending.tabDeletes, id);
}

export function hasPendingChanges(state) {
  const pending = state.pending;
  return (
    pending.collectionUpserts.length > 0 ||
    pending.collectionDeletes.length > 0 ||
    pending.tabUpserts.length > 0 ||
    pending.tabDeletes.length > 0 ||
    pending.settings
  );
}

export function adoptWorkspaceOwner(state, userId) {
  let changed = false;
  state.ownerId = userId;
  for (const collection of state.workspace.collections) {
    if (collection.userId !== userId) {
      collection.userId = userId;
      markCollectionUpsert(state, collection.id);
      changed = true;
    }
  }
  for (const tab of state.workspace.tabs) {
    if (tab.userId !== userId) {
      tab.userId = userId;
      markTabUpsert(state, tab.id);
      changed = true;
    }
  }
  return changed;
}

export function sortWorkspace(state) {
  state.workspace.collections.sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  state.workspace.tabs.sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  return state;
}

