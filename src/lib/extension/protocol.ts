/**
 * Message protocol between the web app and the Tabs browser extension.
 *
 *   popup ──runtime──▶ service worker ──tabs.sendMessage──▶ content script
 *                                                                │
 *                                                       window.postMessage
 *                                                                ▼
 *                                                             web app
 *
 * The content script is the only party that talks to both sides. It forwards
 * nothing it does not recognise, and the page ignores any message whose
 * `source` is not exactly the extension's.
 *
 * Design note: the extension deliberately holds no Supabase session of its own.
 * Every write is performed by the already-authenticated web app, so there is
 * only one place where credentials live and only one code path that touches the
 * database.
 *
 * This file is imported by both the Next app and the extension bundle, so it
 * must stay dependency-free.
 */

export const APP_SOURCE = "tabs-app" as const;
export const EXTENSION_SOURCE = "tabs-extension" as const;

/** Bumped when the message shapes change incompatibly. */
export const PROTOCOL_VERSION = 1;

export interface BridgeOpenTab {
  id: string;
  title: string;
  url: string;
  favIconUrl: string | null;
  windowId: number | null;
  active: boolean;
  index: number;
}

export interface BridgeCollection {
  id: string;
  name: string;
  count: number;
}

interface Base {
  version: number;
  /** Correlates a reply with its request. */
  requestId?: string;
}

/** page → extension */
export type AppMessage = Base &
  { source: typeof APP_SOURCE } & (
    | { type: "PING" }
    | { type: "REQUEST_TABS" }
    | { type: "FOCUS_TAB"; tabId: string }
    | { type: "CLOSE_TABS"; tabIds: string[] }
    | { type: "COLLECTIONS"; collections: BridgeCollection[] }
    | { type: "SAVE_RESULT"; saved: number; collectionName: string }
  );

/** extension → page */
export type ExtensionMessage = Base &
  { source: typeof EXTENSION_SOURCE } & (
    | { type: "READY"; extensionVersion: string }
    | { type: "TABS"; tabs: BridgeOpenTab[] }
    | { type: "REQUEST_COLLECTIONS" }
    | { type: "SAVE_TABS"; collectionId: string; tabs: BridgeOpenTab[] }
    | { type: "OPEN_SEARCH"; query: string }
    | { type: "ERROR"; message: string }
  );

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.source === EXTENSION_SOURCE &&
    typeof msg.type === "string" &&
    msg.version === PROTOCOL_VERSION
  );
}

export function isAppMessage(value: unknown): value is AppMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.source === APP_SOURCE &&
    typeof msg.type === "string" &&
    msg.version === PROTOCOL_VERSION
  );
}
