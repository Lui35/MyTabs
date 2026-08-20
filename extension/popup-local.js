import {
  loadLocalState,
  loadSession,
  makeId,
  markTabUpsert,
  normalizeUrl,
  saveLocalState,
  titleFromUrl,
} from "./local-store.js";

import { syncWithSupabase } from "./supabase-sync.js";
const collectionSelect = document.getElementById("collection");
const saveCurrentButton = document.getElementById("save-current");
const saveAllButton = document.getElementById("save-all");
const tabCount = document.getElementById("tab-count");
const status = document.getElementById("status");

let state;
let session;
let tabs = [];
let activeTab = null;

function setStatus(message, tone) {
  status.hidden = !message;
  status.textContent = message || "";
  if (tone) status.dataset.tone = tone;
  else delete status.dataset.tone;
}

function nextPosition(collectionId) {
  const positions = state.workspace.tabs
    .filter((tab) => tab.collectionId === collectionId)
    .map((tab) => Number(tab.position) || 0);
  return Math.max(0, ...positions) + 1000;
}

function populateCollections() {
  collectionSelect.replaceChildren();
  for (const collection of state.workspace.collections) {
    const option = document.createElement("option");
    option.value = collection.id;
    option.textContent = collection.name;
    collectionSelect.append(option);
  }
  if (state.workspace.collections.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Create a collection first";
    option.value = "";
    collectionSelect.append(option);
  }
  collectionSelect.disabled = state.workspace.collections.length === 0;
}

async function saveTabs(items) {
  const collectionId = collectionSelect.value;
  if (!collectionId) {
    setStatus("Create a collection in the new-tab workspace first.", "error");
    return;
  }

  let position = nextPosition(collectionId);
  const ownerId = session?.user?.id ?? "local";
  let saved = 0;
  for (const browserTab of items) {
    const url = normalizeUrl(browserTab.url);
    if (!url) continue;
    const now = Date.now();
    const tab = {
      id: makeId(),
      userId: ownerId,
      collectionId,
      title: browserTab.title || titleFromUrl(url),
      url,
      description: "",
      favicon: browserTab.favIconUrl || null,
      faviconUrl: browserTab.favIconUrl || null,
      tags: [],
      position,
      normalizedUrl: url,
      originalCreatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    position += 1000;
    state.workspace.tabs.push(tab);
    markTabUpsert(state, tab.id);
    saved += 1;
  }

  state = await saveLocalState(state);
  setStatus(`Saved ${saved} ${saved === 1 ? "tab" : "tabs"} locally.`, "success");

  if (session) {
    try {
      state = await syncWithSupabase(state);
      state = await saveLocalState(state);
      setStatus(
        `Saved and synced ${saved} ${saved === 1 ? "tab" : "tabs"}.`,
        "success",
      );
    } catch {
      state = await saveLocalState(state);
      setStatus(
        `Saved ${saved} ${saved === 1 ? "tab" : "tabs"} locally. Sync will retry later.`,
        "success",
      );
    }
  }
}

async function init() {
  [state, session] = await Promise.all([loadLocalState(), loadSession()]);
  populateCollections();

  tabs = (await chrome.tabs.query({ currentWindow: true })).filter(
    (tab) => typeof tab.url === "string" && /^https?:\/\//i.test(tab.url),
  );
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.url || !/^https?:\/\//i.test(activeTab.url)) activeTab = null;

  tabCount.textContent = String(tabs.length);
  saveCurrentButton.disabled = !activeTab || collectionSelect.disabled;
  saveAllButton.disabled = tabs.length === 0 || collectionSelect.disabled;

  if (collectionSelect.disabled) {
    setStatus("Create a collection in the new-tab workspace first.");
  }
}

saveCurrentButton.addEventListener("click", () => {
  if (activeTab) void saveTabs([activeTab]);
});
saveAllButton.addEventListener("click", () => void saveTabs(tabs));

document.getElementById("open-workspace").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("workspace.html") });
  window.close();
});

document.getElementById("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = document.getElementById("search").value.trim();
  const url = new URL(chrome.runtime.getURL("workspace.html"));
  if (query) url.searchParams.set("q", query);
  await chrome.tabs.create({ url: url.href });
  window.close();
});

void init();

