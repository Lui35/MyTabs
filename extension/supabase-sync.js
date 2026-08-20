import {
  adoptWorkspaceOwner,
  hasPendingChanges,
  loadSession,
  loadSupabaseConfig,
  saveSession,
  sortWorkspace,
} from "./local-store.js";

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;

function chunks(items, size = CHUNK_SIZE) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function requireConfig(config) {
  if (!config.url || !config.publishableKey) {
    throw new Error("Add your Supabase URL and publishable key in Settings.");
  }
}

async function authRequest(config, path, body) {
  requireConfig(config);
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.msg || "Authentication failed.");
  }
  return payload;
}

function sessionFromPayload(payload) {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + (payload.expires_in ?? 3600),
    user: payload.user,
  };
}

export async function signInWithPassword(email, password) {
  const config = await loadSupabaseConfig();
  const payload = await authRequest(config, "token?grant_type=password", {
    email,
    password,
  });
  const session = sessionFromPayload(payload);
  await saveSession(session);
  return session;
}

export async function signOutExtension() {
  const config = await loadSupabaseConfig();
  const session = await loadSession();
  if (config.url && config.publishableKey && session?.accessToken) {
    await fetch(`${config.url}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${session.accessToken}`,
      },
    }).catch(() => {});
  }
  await saveSession(null);
}

async function validSession(config) {
  let session = await loadSession();
  if (!session?.refreshToken) return null;

  const now = Math.floor(Date.now() / 1000);
  if (session.accessToken && (session.expiresAt ?? 0) > now + 60) return session;

  const payload = await authRequest(config, "token?grant_type=refresh_token", {
    refresh_token: session.refreshToken,
  });
  session = sessionFromPayload(payload);
  await saveSession(session);
  return session;
}

async function restRequest(config, session, table, options = {}) {
  const query = options.query ? `?${options.query}` : "";
  const headers = {
    apikey: config.publishableKey,
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
  if (options.prefer) headers.Prefer = options.prefer;

  const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.hint || `Supabase ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function collectionToRow(collection, userId) {
  return {
    id: collection.id,
    user_id: userId,
    name: collection.name,
    description: collection.description || null,
    collapsed: collection.collapsed === true,
    position: collection.position ?? 1000,
  };
}

function tabToRow(tab, userId) {
  return {
    id: tab.id,
    user_id: userId,
    collection_id: tab.collectionId,
    title: tab.title,
    url: tab.url,
    description: tab.description || null,
    favicon: tab.favicon || null,
    favicon_url: tab.faviconUrl || null,
    tags: Array.isArray(tab.tags) ? tab.tags : [],
    position: tab.position ?? 1000,
    normalized_url: tab.normalizedUrl || tab.url,
    original_created_at: tab.originalCreatedAt ?? null,
  };
}

function collectionFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? "",
    collapsed: row.collapsed === true,
    position: Number(row.position ?? 0),
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
  };
}

function tabFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    collectionId: row.collection_id,
    title: row.title,
    url: row.url,
    description: row.description ?? "",
    favicon: row.favicon ?? null,
    faviconUrl: row.favicon_url ?? row.favicon ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    position: Number(row.position ?? 0),
    normalizedUrl: row.normalized_url ?? row.url,
    originalCreatedAt: row.original_created_at ?? null,
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
  };
}

async function deleteIds(config, session, table, ids) {
  for (const group of chunks(ids)) {
    const filter = `id=in.(${group.join(",")})`;
    await restRequest(config, session, table, {
      method: "DELETE",
      query: filter,
      prefer: "return=minimal",
    });
  }
}

async function upsertRows(config, session, table, rows) {
  for (const group of chunks(rows)) {
    await restRequest(config, session, table, {
      method: "POST",
      body: group,
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
}

async function pushPending(config, session, state) {
  const userId = session.user.id;
  adoptWorkspaceOwner(state, userId);

  await deleteIds(
    config,
    session,
    "collections",
    state.pending.collectionDeletes,
  );
  await deleteIds(config, session, "saved_tabs", state.pending.tabDeletes);

  const collectionIds = new Set(state.pending.collectionUpserts);
  const collections = state.workspace.collections
    .filter((item) => collectionIds.has(item.id))
    .map((item) => collectionToRow(item, userId));
  await upsertRows(config, session, "collections", collections);

  const tabIds = new Set(state.pending.tabUpserts);
  const tabs = state.workspace.tabs
    .filter((item) => tabIds.has(item.id))
    .map((item) => tabToRow(item, userId));
  await upsertRows(config, session, "saved_tabs", tabs);

  if (state.pending.settings) {
    const settings = state.workspace.settings;
    await upsertRows(config, session, "user_settings", [
      {
        user_id: userId,
        theme: settings.theme,
        double_shift_search: settings.doubleShiftSearch,
        fuzzy_search: settings.fuzzySearch,
        search_descriptions: settings.searchDescriptions,
        search_tags: settings.searchTags,
        view_mode: settings.viewMode,
        sidebar_open: settings.sidebarOpen,
      },
    ]);
  }

  state.pending = {
    collectionUpserts: [],
    collectionDeletes: [],
    tabUpserts: [],
    tabDeletes: [],
    settings: false,
  };
}

async function pullTable(config, session, table, order = "position.asc") {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await restRequest(config, session, table, {
      query: `select=*&order=${order}&offset=${offset}&limit=${PAGE_SIZE}`,
    });
    rows.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function pullWorkspace(config, session, state) {
  const [collectionRows, tabRows, settingsRows] = await Promise.all([
    pullTable(config, session, "collections"),
    pullTable(config, session, "saved_tabs"),
    restRequest(config, session, "user_settings", {
      query: `select=*&user_id=eq.${session.user.id}&limit=1`,
    }),
  ]);

  state.workspace.collections = collectionRows.map(collectionFromRow);
  state.workspace.tabs = tabRows.map(tabFromRow);
  if (settingsRows?.[0]) {
    const row = settingsRows[0];
    state.workspace.settings = {
      theme: row.theme,
      doubleShiftSearch: row.double_shift_search,
      fuzzySearch: row.fuzzy_search,
      searchDescriptions: row.search_descriptions,
      searchTags: row.search_tags,
      viewMode: row.view_mode,
      sidebarOpen: row.sidebar_open,
    };
  }
  sortWorkspace(state);
}

export async function syncWithSupabase(state, onStatus = () => {}) {
  const config = await loadSupabaseConfig();
  requireConfig(config);
  const session = await validSession(config);
  if (!session?.user?.id) throw new Error("Sign in to sync with Supabase.");

  onStatus("syncing");
  try {
    if (hasPendingChanges(state)) await pushPending(config, session, state);
    await pullWorkspace(config, session, state);
    state.sync.lastSyncedAt = Date.now();
    state.sync.lastError = null;
    onStatus("synced");
    return state;
  } catch (error) {
    state.sync.lastError = String(error?.message ?? error);
    onStatus("error");
    throw error;
  }
}

