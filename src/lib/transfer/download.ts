"use client";

import type { Collection, SavedTab } from "@/lib/types";
import { isoDate } from "@/lib/utils";
import { buildExport } from "./v2";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "collection"
  );
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface ExportSource {
  collections: Record<string, Collection>;
  tabs: Record<string, SavedTab>;
  collectionOrder: string[];
  tabOrder: Record<string, string[]>;
}

function tabsFor(source: ExportSource, collectionId: string): SavedTab[] {
  return (source.tabOrder[collectionId] ?? [])
    .map((id) => source.tabs[id])
    .filter(Boolean);
}

export function exportWorkspace(source: ExportSource): number {
  const collections = source.collectionOrder
    .map((id) => source.collections[id])
    .filter(Boolean);

  const map = new Map<string, SavedTab[]>();
  for (const collection of collections) {
    map.set(collection.id, tabsFor(source, collection.id));
  }

  const payload = buildExport(collections, map);
  downloadJson(`my-tabs-backup-${isoDate()}.json`, payload);
  return Object.keys(payload.tabItems).length;
}

export function exportCollection(
  source: ExportSource,
  collectionId: string,
): number {
  const collection = source.collections[collectionId];
  if (!collection) return 0;

  const tabs = tabsFor(source, collectionId);
  const payload = buildExport([collection], new Map([[collectionId, tabs]]));
  downloadJson(`${slugify(collection.name)}-${isoDate()}.json`, payload);
  return tabs.length;
}
