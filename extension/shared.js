/**
 * Constants shared by the service worker, content script and popup.
 * Mirrors src/lib/extension/protocol.ts — keep the two in step.
 */

export const APP_SOURCE = "tabs-app";
export const EXTENSION_SOURCE = "tabs-extension";
export const PROTOCOL_VERSION = 1;

/**
 * Origins the workspace is served from. The content script is registered for
 * these in the manifest; add your production origin to both places.
 */
export const APP_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

export const DEFAULT_APP_URL = `${APP_ORIGINS[0]}/`;

export function isAppUrl(url) {
  if (typeof url !== "string") return false;
  return APP_ORIGINS.some((origin) => url.startsWith(`${origin}/`));
}

/** chrome.tabs.Tab -> the shape the app expects. */
export function toBridgeTab(tab) {
  return {
    id: String(tab.id),
    title: tab.title ?? "",
    url: tab.url ?? "",
    favIconUrl: tab.favIconUrl ?? null,
    windowId: typeof tab.windowId === "number" ? tab.windowId : null,
    active: tab.active === true,
    index: typeof tab.index === "number" ? tab.index : 0,
  };
}

/** Tabs worth showing: real web pages only. */
export function isSavableUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}
