"use client";

/**
 * Cross-component "scroll to and highlight this thing" signal.
 * Used by the palette to jump to a collection or saved tab in the workspace.
 */

const COLLECTION_EVENT = "tabs:reveal-collection";
const TAB_EVENT = "tabs:reveal-tab";

export function revealCollection(id: string) {
  window.dispatchEvent(new CustomEvent(COLLECTION_EVENT, { detail: id }));
}

export function revealTab(id: string) {
  window.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: id }));
}

function subscribe(event: string, handler: (id: string) => void) {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<string>).detail;
    if (typeof detail === "string") handler(detail);
  };
  window.addEventListener(event, listener);
  return () => window.removeEventListener(event, listener);
}

export const onRevealCollection = (handler: (id: string) => void) =>
  subscribe(COLLECTION_EVENT, handler);

export const onRevealTab = (handler: (id: string) => void) =>
  subscribe(TAB_EVENT, handler);

/** DOM ids used as scroll anchors. */
export const collectionAnchorId = (id: string) => `collection-${id}`;
export const tabAnchorId = (id: string) => `tab-${id}`;
