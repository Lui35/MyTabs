/**
 * Popup.
 *
 * Deliberately thin: it reads tabs from the service worker and delegates every
 * write to the signed-in workspace tab, so the extension never needs a session.
 */

const $ = (id) => document.getElementById(id);

const collectionSelect = $("collection");
const saveCurrentButton = $("save-current");
const saveAllButton = $("save-all");
const tabCountEl = $("tab-count");
const statusEl = $("status");

let openTabs = [];
let activeTab = null;

function setStatus(message, tone) {
  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
  if (tone) statusEl.dataset.tone = tone;
  else delete statusEl.dataset.tone;
}

function send(message) {
  return chrome.runtime.sendMessage(message);
}

async function loadState() {
  const state = await send({ type: "POPUP_GET_STATE" });
  if (!state?.ok) {
    setStatus("Couldn't read your browser tabs.", "error");
    return;
  }

  openTabs = state.tabs ?? [];
  activeTab = state.activeTab ?? null;
  tabCountEl.textContent = String(openTabs.length);

  saveCurrentButton.disabled = !activeTab;
  if (!activeTab) {
    saveCurrentButton.title = "This page can't be saved.";
  }

  await loadCollections(state.workspaceOpen);
}

async function loadCollections(workspaceOpen) {
  if (!workspaceOpen) {
    collectionSelect.innerHTML =
      '<option value="">Workspace not open</option>';
    collectionSelect.disabled = true;
    saveCurrentButton.disabled = true;
    saveAllButton.disabled = true;
    setStatus(
      "Open the Tabs workspace to load your collections. Saving happens there, so you stay signed in in one place.",
    );
    return;
  }

  try {
    const result = await send({ type: "POPUP_GET_COLLECTIONS" });
    if (!result?.ok) throw new Error(result?.error ?? "No response");

    const collections = result.collections ?? [];
    if (collections.length === 0) {
      collectionSelect.innerHTML =
        '<option value="">No collections yet</option>';
      collectionSelect.disabled = true;
      saveCurrentButton.disabled = true;
      saveAllButton.disabled = true;
      setStatus("Create a collection in the workspace first.");
      return;
    }

    const stored = await chrome.storage.local.get("lastCollectionId");
    collectionSelect.disabled = false;
    collectionSelect.innerHTML = collections
      .map(
        (c) =>
          `<option value="${c.id}">${escapeHtml(c.name)} (${c.count})</option>`,
      )
      .join("");

    if (
      stored.lastCollectionId &&
      collections.some((c) => c.id === stored.lastCollectionId)
    ) {
      collectionSelect.value = stored.lastCollectionId;
    }

    saveCurrentButton.disabled = !activeTab;
    saveAllButton.disabled = openTabs.length === 0;
    setStatus(null);
  } catch (error) {
    collectionSelect.innerHTML = '<option value="">Unavailable</option>';
    collectionSelect.disabled = true;
    setStatus(String(error.message ?? error), "error");
  }
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch],
  );
}

async function saveTabs(tabs) {
  const collectionId = collectionSelect.value;
  if (!collectionId) {
    setStatus("Pick a collection first.", "error");
    return;
  }
  if (tabs.length === 0) {
    setStatus("Nothing to save.", "error");
    return;
  }

  saveCurrentButton.disabled = true;
  saveAllButton.disabled = true;
  setStatus("Saving…");

  try {
    const result = await send({ type: "POPUP_SAVE_TABS", collectionId, tabs });
    if (!result?.ok) throw new Error(result?.error ?? "No response");

    await chrome.storage.local.set({ lastCollectionId: collectionId });
    setStatus(
      `Saved ${result.saved} ${result.saved === 1 ? "tab" : "tabs"} to ${result.collectionName}.`,
      "success",
    );
  } catch (error) {
    setStatus(String(error.message ?? error), "error");
  } finally {
    saveCurrentButton.disabled = !activeTab;
    saveAllButton.disabled = openTabs.length === 0;
  }
}

saveCurrentButton.addEventListener("click", () => {
  if (activeTab) void saveTabs([activeTab]);
});

saveAllButton.addEventListener("click", () => {
  void saveTabs(openTabs);
});

$("open-workspace").addEventListener("click", async () => {
  await send({ type: "POPUP_OPEN_WORKSPACE" });
  window.close();
});

$("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await send({ type: "POPUP_SEARCH", query: $("search").value });
  window.close();
});

void loadState();
