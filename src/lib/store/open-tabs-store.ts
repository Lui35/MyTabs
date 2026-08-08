"use client";

import { create } from "zustand";

import {
  APP_SOURCE,
  PROTOCOL_VERSION,
  isExtensionMessage,
  type AppMessage,
  type BridgeOpenTab,
} from "@/lib/extension/protocol";
import { isSafeUrl } from "@/lib/url";
import type { OpenTab } from "@/lib/types";

export type BridgeStatus = "checking" | "connected" | "unavailable";

interface OpenTabsState {
  status: BridgeStatus;
  extensionVersion: string | null;
  tabs: OpenTab[];
  setStatus: (status: BridgeStatus, extensionVersion?: string | null) => void;
  setTabs: (tabs: OpenTab[]) => void;
}

export const useOpenTabs = create<OpenTabsState>((set) => ({
  status: "checking",
  extensionVersion: null,
  tabs: [],
  setStatus: (status, extensionVersion = null) =>
    set((s) => ({
      status,
      extensionVersion: extensionVersion ?? s.extensionVersion,
    })),
  setTabs: (tabs) => set({ tabs }),
}));

function send(message: AppMessage) {
  if (typeof window === "undefined") return;
  window.postMessage(message, window.location.origin);
}

export function requestOpenTabs() {
  send({ source: APP_SOURCE, type: "REQUEST_TABS", version: PROTOCOL_VERSION });
}

export function focusBrowserTab(tabId: string) {
  send({ source: APP_SOURCE, type: "FOCUS_TAB", version: PROTOCOL_VERSION, tabId });
}

export function closeBrowserTabs(tabIds: string[]) {
  send({
    source: APP_SOURCE,
    type: "CLOSE_TABS",
    version: PROTOCOL_VERSION,
    tabIds,
  });
}

/** Only http(s) tabs are worth saving; drop chrome:// and extension pages. */
function sanitize(tabs: BridgeOpenTab[]): OpenTab[] {
  if (!Array.isArray(tabs)) return [];
  return tabs
    .filter((tab) => typeof tab?.url === "string" && isSafeUrl(tab.url))
    .map((tab) => ({
      id: String(tab.id),
      title: typeof tab.title === "string" ? tab.title : "",
      url: tab.url,
      favIconUrl:
        typeof tab.favIconUrl === "string" && tab.favIconUrl ? tab.favIconUrl : null,
      windowId: typeof tab.windowId === "number" ? tab.windowId : null,
      active: tab.active === true,
      index: typeof tab.index === "number" ? tab.index : 0,
    }));
}

const HANDSHAKE_TIMEOUT = 1200;

export interface BridgeHandlers {
  /** Popup asked what collections exist. */
  listCollections: () => { id: string; name: string; count: number }[];
  /** Popup asked to save tabs into a collection. Returns how many landed. */
  saveTabs: (
    collectionId: string,
    tabs: BridgeOpenTab[],
  ) => { saved: number; collectionName: string };
  /** Popup asked to open quick search with a query. */
  openSearch: (query: string) => void;
}

/**
 * Listens for the extension bridge. Resolves to "unavailable" quickly when no
 * extension answers, so the sidebar can show its install prompt without a
 * noticeable delay.
 */
export function installExtensionBridge(handlers: BridgeHandlers): () => void {
  if (typeof window === "undefined") return () => {};

  const { setStatus, setTabs } = useOpenTabs.getState();

  const onMessage = (event: MessageEvent) => {
    // Only trust messages this window received from its own origin.
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (!isExtensionMessage(event.data)) return;

    const message = event.data;

    switch (message.type) {
      case "READY":
        clearTimeout(timeout);
        setStatus("connected", message.extensionVersion);
        requestOpenTabs();
        break;

      case "TABS":
        clearTimeout(timeout);
        setStatus("connected");
        setTabs(sanitize(message.tabs));
        break;

      case "REQUEST_COLLECTIONS":
        send({
          source: APP_SOURCE,
          type: "COLLECTIONS",
          version: PROTOCOL_VERSION,
          requestId: message.requestId,
          collections: handlers.listCollections(),
        });
        break;

      case "SAVE_TABS": {
        const result = handlers.saveTabs(
          message.collectionId,
          sanitize(message.tabs) as unknown as BridgeOpenTab[],
        );
        send({
          source: APP_SOURCE,
          type: "SAVE_RESULT",
          version: PROTOCOL_VERSION,
          requestId: message.requestId,
          saved: result.saved,
          collectionName: result.collectionName,
        });
        break;
      }

      case "OPEN_SEARCH":
        handlers.openSearch(message.query);
        break;

      case "ERROR":
        break;
    }
  };

  window.addEventListener("message", onMessage);

  const timeout = setTimeout(() => {
    if (useOpenTabs.getState().status === "checking") setStatus("unavailable");
  }, HANDSHAKE_TIMEOUT);

  send({ source: APP_SOURCE, type: "PING", version: PROTOCOL_VERSION });

  // Re-check when the user comes back — they may have just installed it.
  const onFocus = () => {
    if (useOpenTabs.getState().status === "connected") requestOpenTabs();
    else send({ source: APP_SOURCE, type: "PING", version: PROTOCOL_VERSION });
  };
  window.addEventListener("focus", onFocus);

  return () => {
    clearTimeout(timeout);
    window.removeEventListener("message", onMessage);
    window.removeEventListener("focus", onFocus);
  };
}
