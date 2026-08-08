/**
 * Content script bridge.
 *
 * Runs only on the workspace origin (see manifest `content_scripts.matches`)
 * and is the sole link between the page and the extension. It relays a fixed
 * set of message types in each direction and drops everything else, so a
 * compromised page cannot reach arbitrary extension APIs.
 *
 * Content scripts cannot be ES modules, so the protocol constants are inlined.
 */

(() => {
  const APP_SOURCE = "tabs-app";
  const EXTENSION_SOURCE = "tabs-extension";
  const PROTOCOL_VERSION = 1;

  const ORIGIN = window.location.origin;

  /** Messages the page is allowed to send us. */
  const FROM_PAGE = new Set([
    "PING",
    "REQUEST_TABS",
    "FOCUS_TAB",
    "CLOSE_TABS",
    "COLLECTIONS",
    "SAVE_RESULT",
  ]);

  /** Messages we are allowed to push into the page. */
  const TO_PAGE = new Set([
    "READY",
    "TABS",
    "REQUEST_COLLECTIONS",
    "SAVE_TABS",
    "OPEN_SEARCH",
    "ERROR",
  ]);

  function postToPage(payload) {
    if (!payload || !TO_PAGE.has(payload.type)) return;
    window.postMessage(
      { ...payload, source: EXTENSION_SOURCE, version: PROTOCOL_VERSION },
      ORIGIN,
    );
  }

  function announceReady() {
    postToPage({
      type: "READY",
      extensionVersion: chrome.runtime.getManifest().version,
    });
  }

  // ---- page -> extension ----

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== ORIGIN) return;

    const data = event.data;
    if (
      !data ||
      data.source !== APP_SOURCE ||
      data.version !== PROTOCOL_VERSION ||
      !FROM_PAGE.has(data.type)
    ) {
      return;
    }

    switch (data.type) {
      case "PING":
        announceReady();
        chrome.runtime
          .sendMessage({ type: "PAGE_REQUEST_TABS" })
          .then((res) => {
            if (res?.ok) postToPage({ type: "TABS", tabs: res.tabs });
          })
          .catch(() => {});
        break;

      case "REQUEST_TABS":
        chrome.runtime
          .sendMessage({ type: "PAGE_REQUEST_TABS" })
          .then((res) => {
            if (res?.ok) postToPage({ type: "TABS", tabs: res.tabs });
            else postToPage({ type: "ERROR", message: "Couldn't read tabs." });
          })
          .catch(() => {});
        break;

      case "FOCUS_TAB":
        chrome.runtime
          .sendMessage({ type: "PAGE_FOCUS_TAB", tabId: data.tabId })
          .catch(() => {});
        break;

      case "CLOSE_TABS":
        chrome.runtime
          .sendMessage({ type: "PAGE_CLOSE_TABS", tabIds: data.tabIds })
          .catch(() => {});
        break;

      // Replies to something the popup asked for.
      case "COLLECTIONS":
      case "SAVE_RESULT":
        chrome.runtime
          .sendMessage({ type: "APP_REPLY", payload: data })
          .catch(() => {});
        break;
    }
  });

  // ---- extension -> page ----

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.channel === "TO_PAGE") {
      postToPage(message.payload);
      sendResponse({ ok: true });
    }
    return false;
  });

  // The page may boot before or after us; announce both now and on load.
  announceReady();
  window.addEventListener("load", announceReady);
})();
