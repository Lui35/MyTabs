"use client";

import type { Collection, SavedTab, SearchDocument, Settings } from "@/lib/types";
import { getDomain } from "@/lib/url";
import { useWorkspace } from "@/lib/store/workspace-store";
import { SearchIndex, buildDocuments } from "./index";

let index: SearchIndex | null = null;

let prevTabs: Record<string, SavedTab> = {};
let prevCollections: Record<string, Collection> = {};
let prevSettings: Settings | null = null;

function toDocument(
  tab: SavedTab,
  collections: Record<string, Collection>,
): SearchDocument {
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    domain: getDomain(tab.url),
    collectionId: tab.collectionId,
    collectionName: collections[tab.collectionId]?.name ?? "",
    description: tab.description,
    tags: tab.tags,
    favicon: tab.favicon ?? tab.faviconUrl,
  };
}

function searchOptionsChanged(a: Settings | null, b: Settings): boolean {
  if (!a) return true;
  return (
    a.fuzzySearch !== b.fuzzySearch ||
    a.searchTags !== b.searchTags ||
    a.searchDescriptions !== b.searchDescriptions
  );
}

export function getSearchIndex(): SearchIndex {
  if (!index) {
    const state = useWorkspace.getState();
    index = new SearchIndex(
      buildDocuments(state.collections, state.tabs),
      state.settings,
    );
    prevTabs = state.tabs;
    prevCollections = state.collections;
    prevSettings = state.settings;
  }
  return index;
}

/**
 * Keeps the Fuse index in step with the store without rebuilding it.
 *
 * Every mutation replaces only the objects it touched, so a reference walk
 * finds the changed documents in O(n) identity checks — fast enough to run on
 * every keystroke even with 10k saved tabs, and far cheaper than re-tokenizing.
 */
export function installSearchIndexSync(): () => void {
  getSearchIndex();

  return useWorkspace.subscribe((state) => {
    const idx = getSearchIndex();

    // A changed search option changes the tokenizer config — full rebuild.
    if (searchOptionsChanged(prevSettings, state.settings)) {
      idx.rebuild(
        buildDocuments(state.collections, state.tabs),
        state.settings,
      );
      prevTabs = state.tabs;
      prevCollections = state.collections;
      prevSettings = state.settings;
      return;
    }
    prevSettings = state.settings;

    // Renaming a collection changes the denormalized name on all its tabs.
    const renamed = new Set<string>();
    if (state.collections !== prevCollections) {
      for (const [id, collection] of Object.entries(state.collections)) {
        if (prevCollections[id]?.name !== collection.name) renamed.add(id);
      }
      prevCollections = state.collections;
    }

    if (state.tabs !== prevTabs || renamed.size > 0) {
      for (const [id, tab] of Object.entries(state.tabs)) {
        if (prevTabs[id] !== tab || renamed.has(tab.collectionId)) {
          idx.upsert(toDocument(tab, state.collections));
        }
      }
      for (const id of Object.keys(prevTabs)) {
        if (!state.tabs[id]) idx.remove(id);
      }
      prevTabs = state.tabs;
    }
  });
}

export function resetSearchIndex() {
  index = null;
  prevTabs = {};
  prevCollections = {};
  prevSettings = null;
}
