/**
 * Service worker.
 *
 * Owns the chrome.tabs API and routes messages between the popup and the
 * workspace tab's content script. It never stores credentials and never talks
 * to Supabase — the web app performs every write.
 */

import {
  DEFAULT_APP_URL,
  PROTOCOL_VERSION,
  isAppUrl,
  isSavableUrl,
  toBridgeTab,
} from "./shared.js";

// requestId -> { resolve, timer }
const pending = new Map();
const REQUEST_TIMEOUT = 8000;

function newRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function queryOpenTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((tab) => isSavableUrl(tab.url)).map(toBridgeTab);
}

async function findAppTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => isAppUrl(tab.url)) ?? null;
}

/** Opens the workspace if it isn't already open, and focuses it. */
async function ensureAppTab() {
  const existing = await findAppTab();
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return existing;
  }
  return chrome.tabs.create({ url: DEFAULT_APP_URL, active: true });
}

/**
 * Sends a message into the workspace page and waits for its reply, which
 * arrives back through the content script as APP_REPLY.
 */
async function askApp(message, { openIfClosed = true } = {}) {
  let appTab = await findAppTab();
  if (!appTab && openIfClosed) {
    appTab = await ensureAppTab();
    // Give the page a moment to boot its bridge listener.
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  if (!appTab) throw new Error("The Tabs workspace isn't open.");

  const requestId = newRequestId();
  const payload = { ...message, version: PROTOCOL_VERSION, requestId };

  const reply = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("The workspace didn't respond."));
    }, REQUEST_TIMEOUT);
    pending.set(requestId, { resolve, timer });
  });

  await chrome.tabs.sendMessage(appTab.id, {
    channel: "TO_PAGE",
    payload,
  });

  return reply;
}

/** Pushes the current tab list into every open workspace tab. */
async function broadcastTabs() {
  const [tabs, appTabs] = await Promise.all([
    queryOpenTabs(),
    chrome.tabs.query({}).then((all) => all.filter((t) => isAppUrl(t.url))),
  ]);

  for (const appTab of appTabs) {
    chrome.tabs
      .sendMessage(appTab.id, {
        channel: "TO_PAGE",
        payload: { type: "TABS", tabs, version: PROTOCOL_VERSION },
      })
      .catch(() => {
        // The content script may not be injected yet; the page will ask again.
      });
  }
}

let broadcastTimer = null;
function scheduleBroadcast() {
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    void broadcastTabs();
  }, 200);
}

chrome.tabs.onCreated.addListener(scheduleBroadcast);
chrome.tabs.onRemoved.addListener(scheduleBroadcast);
chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.title || changeInfo.url) {
    scheduleBroadcast();
  }
});
chrome.tabs.onMoved.addListener(scheduleBroadcast);
chrome.tabs.onActivated.addListener(scheduleBroadcast);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      switch (message?.type) {
        // ---- from the content script ----
        case "PAGE_REQUEST_TABS": {
          sendResponse({ ok: true, tabs: await queryOpenTabs() });
          return;
        }
        case "PAGE_FOCUS_TAB": {
          const tabId = Number(message.tabId);
          if (Number.isFinite(tabId)) {
            const tab = await chrome.tabs.get(tabId).catch(() => null);
            if (tab) {
              await chrome.tabs.update(tabId, { active: true });
              await chrome.windows.update(tab.windowId, { focused: true });
            }
          }
          sendResponse({ ok: true });
          return;
        }
        case "PAGE_CLOSE_TABS": {
          const ids = (message.tabIds ?? [])
            .map(Number)
            .filter((n) => Number.isFinite(n));
          if (ids.length) await chrome.tabs.remove(ids);
          sendResponse({ ok: true });
          return;
        }
        case "APP_REPLY": {
          const entry = pending.get(message.payload?.requestId);
          if (entry) {
            clearTimeout(entry.timer);
            pending.delete(message.payload.requestId);
            entry.resolve(message.payload);
          }
          sendResponse({ ok: true });
          return;
        }

        // ---- from the popup ----
        case "POPUP_GET_STATE": {
          const [tabs, appTab] = await Promise.all([
            queryOpenTabs(),
            findAppTab(),
          ]);
          const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          sendResponse({
            ok: true,
            tabs,
            workspaceOpen: Boolean(appTab),
            activeTab:
              activeTab && isSavableUrl(activeTab.url)
                ? toBridgeTab(activeTab)
                : null,
          });
          return;
        }
        case "POPUP_GET_COLLECTIONS": {
          const reply = await askApp({ type: "REQUEST_COLLECTIONS" });
          sendResponse({ ok: true, collections: reply.collections ?? [] });
          return;
        }
        case "POPUP_SAVE_TABS": {
          const reply = await askApp({
            type: "SAVE_TABS",
            collectionId: message.collectionId,
            tabs: message.tabs,
          });
          sendResponse({
            ok: true,
            saved: reply.saved ?? 0,
            collectionName: reply.collectionName ?? "",
          });
          return;
        }
        case "POPUP_OPEN_WORKSPACE": {
          await ensureAppTab();
          sendResponse({ ok: true });
          return;
        }
        case "POPUP_SEARCH": {
          await ensureAppTab();
          const appTab = await findAppTab();
          if (appTab) {
            await chrome.tabs
              .sendMessage(appTab.id, {
                channel: "TO_PAGE",
                payload: {
                  type: "OPEN_SEARCH",
                  query: message.query ?? "",
                  version: PROTOCOL_VERSION,
                },
              })
              .catch(() => {});
          }
          sendResponse({ ok: true });
          return;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message ?? error) });
    }
  })();

  // Keep the message channel open for the async response.
  return true;
});
