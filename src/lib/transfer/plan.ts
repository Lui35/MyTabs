import { POSITION_STEP } from "@/lib/position";
import type { Collection, SavedTab } from "@/lib/types";
import { guessFaviconUrl, normalizeUrl, titleFromUrl } from "@/lib/url";
import { uuid } from "@/lib/utils";
import { dedupeKey, type ParsedCollection, type ParsedTab } from "./v2";

export type DuplicateStrategy =
  | "skip"
  | "replace"
  | "keep-both"
  | "merge-by-name";

export const DUPLICATE_STRATEGIES: {
  value: DuplicateStrategy;
  label: string;
  description: string;
}[] = [
  {
    value: "skip",
    label: "Skip duplicates",
    description:
      "Import into new collections, but leave out any website already saved somewhere in your workspace.",
  },
  {
    value: "merge-by-name",
    label: "Merge collections with the same name",
    description:
      "Add to your existing collections when the names match, skipping websites already in them.",
  },
  {
    value: "replace",
    label: "Replace existing items",
    description:
      "Update the title, description, tags and icon of websites you already saved, in place.",
  },
  {
    value: "keep-both",
    label: "Import duplicates anyway",
    description: "Import everything as new collections and new websites.",
  },
];

export interface ImportOptions {
  /** Source ids of the collections the user chose to import. */
  selected: Set<string>;
  includeUnassigned: boolean;
  unassignedCollectionName: string;
  strategy: DuplicateStrategy;
}

export interface ImportPlan {
  collections: Collection[];
  tabs: SavedTab[];
  summary: {
    collectionsCreated: number;
    collectionsMerged: number;
    tabsAdded: number;
    tabsUpdated: number;
    tabsSkipped: number;
  };
}

interface WorkspaceView {
  userId: string;
  collections: Record<string, Collection>;
  tabs: Record<string, SavedTab>;
  tabOrder: Record<string, string[]>;
}

function toSavedTab(
  parsed: ParsedTab,
  collectionId: string,
  userId: string,
  position: number,
  now: number,
): SavedTab {
  const title = parsed.title || titleFromUrl(parsed.url);
  return {
    id: uuid(),
    collectionId,
    userId,
    title,
    url: parsed.url,
    favicon: parsed.favicon,
    faviconUrl: parsed.faviconUrl ?? guessFaviconUrl(parsed.url),
    description: parsed.description,
    tags: parsed.tags,
    position,
    normalizedUrl: normalizeUrl(parsed.url),
    originalCreatedAt: parsed.createdAt,
    createdAt: parsed.createdAt ?? now,
    updatedAt: now,
  };
}

/**
 * Turns a parsed file plus the user's duplicate strategy into the exact set of
 * rows to upsert. Source ids from the file are never reused — the database uses
 * UUID primary keys, so matching against the existing workspace is done by
 * collection name and normalized URL instead.
 */
export function planImport(
  parsedCollections: ParsedCollection[],
  unassigned: ParsedTab[],
  options: ImportOptions,
  state: WorkspaceView,
): ImportPlan {
  const now = Date.now();
  const { userId } = state;
  const { strategy } = options;

  const outCollections: Collection[] = [];
  const outTabs: SavedTab[] = [];
  const summary = {
    collectionsCreated: 0,
    collectionsMerged: 0,
    tabsAdded: 0,
    tabsUpdated: 0,
    tabsSkipped: 0,
  };

  // ---- lookups over the current workspace ----

  const existingByName = new Map<string, Collection>();
  for (const collection of Object.values(state.collections)) {
    existingByName.set(collection.name.trim().toLowerCase(), collection);
  }

  /** Every saved tab keyed by normalized URL, for workspace-wide matching. */
  const existingByUrl = new Map<string, SavedTab>();
  /** Per-collection URL sets, for merge-by-name. */
  const urlsInCollection = new Map<string, Set<string>>();

  for (const tab of Object.values(state.tabs)) {
    const key = dedupeKey(tab.url);
    if (!existingByUrl.has(key)) existingByUrl.set(key, tab);
    let set = urlsInCollection.get(tab.collectionId);
    if (!set) {
      set = new Set();
      urlsInCollection.set(tab.collectionId, set);
    }
    set.add(key);
  }

  const collectionPositions = Object.values(state.collections).map(
    (c) => c.position,
  );
  let nextCollectionPosition =
    (collectionPositions.length ? Math.max(...collectionPositions) : 0) +
    POSITION_STEP;

  /** Next append position inside a collection, existing or freshly created. */
  const nextTabPosition = new Map<string, number>();
  const tabPositionFor = (collectionId: string): number => {
    if (!nextTabPosition.has(collectionId)) {
      const ids = state.tabOrder[collectionId] ?? [];
      const positions = ids
        .map((id) => state.tabs[id]?.position)
        .filter((p): p is number => typeof p === "number");
      nextTabPosition.set(
        collectionId,
        (positions.length ? Math.max(...positions) : 0) + POSITION_STEP,
      );
    }
    const position = nextTabPosition.get(collectionId)!;
    nextTabPosition.set(collectionId, position + POSITION_STEP);
    return position;
  };

  /** Tabs added during this import, so the file can't duplicate against itself. */
  const addedUrls = new Set<string>();
  const replacedIds = new Set<string>();

  const importInto = (collectionId: string, tabs: ParsedTab[], merged: boolean) => {
    for (const parsed of tabs) {
      const key = dedupeKey(parsed.url);

      if (strategy === "skip") {
        if (existingByUrl.has(key) || addedUrls.has(key)) {
          summary.tabsSkipped += 1;
          continue;
        }
      } else if (strategy === "merge-by-name") {
        const inTarget = urlsInCollection.get(collectionId);
        if ((merged && inTarget?.has(key)) || addedUrls.has(key)) {
          summary.tabsSkipped += 1;
          continue;
        }
      } else if (strategy === "replace") {
        const existing = existingByUrl.get(key);
        if (existing && !replacedIds.has(existing.id)) {
          replacedIds.add(existing.id);
          outTabs.push({
            ...existing,
            title: parsed.title || existing.title,
            description: parsed.description || existing.description,
            tags: parsed.tags.length ? parsed.tags : existing.tags,
            favicon: parsed.favicon ?? existing.favicon,
            faviconUrl:
              parsed.faviconUrl ?? existing.faviconUrl ?? guessFaviconUrl(existing.url),
            originalCreatedAt: parsed.createdAt ?? existing.originalCreatedAt,
            updatedAt: now,
          });
          summary.tabsUpdated += 1;
          continue;
        }
        if (addedUrls.has(key)) {
          summary.tabsSkipped += 1;
          continue;
        }
      }

      outTabs.push(
        toSavedTab(parsed, collectionId, userId, tabPositionFor(collectionId), now),
      );
      addedUrls.add(key);
      summary.tabsAdded += 1;
    }
  };

  const createCollection = (
    name: string,
    description: string,
    collapsed: boolean,
  ): Collection => {
    const collection: Collection = {
      id: uuid(),
      userId,
      name,
      description,
      collapsed,
      position: nextCollectionPosition,
      createdAt: now,
      updatedAt: now,
    };
    nextCollectionPosition += POSITION_STEP;
    outCollections.push(collection);
    summary.collectionsCreated += 1;
    return collection;
  };

  // ---- collections chosen by the user ----

  /** Collections created during this run, so two same-named entries merge. */
  const createdByName = new Map<string, Collection>();

  for (const parsed of parsedCollections) {
    if (!options.selected.has(parsed.sourceId)) continue;

    let targetId: string;
    let merged = false;

    if (strategy === "merge-by-name") {
      const key = parsed.name.trim().toLowerCase();
      const existing = existingByName.get(key);
      const alreadyCreated = createdByName.get(key);

      if (existing) {
        targetId = existing.id;
        merged = true;
        summary.collectionsMerged += 1;
        // Carry over a description the existing collection is missing.
        if (parsed.description && !existing.description) {
          outCollections.push({
            ...existing,
            description: parsed.description,
            updatedAt: now,
          });
        }
      } else if (alreadyCreated) {
        targetId = alreadyCreated.id;
        merged = true;
      } else {
        const created = createCollection(
          parsed.name,
          parsed.description,
          parsed.collapsed,
        );
        createdByName.set(key, created);
        targetId = created.id;
      }
    } else {
      targetId = createCollection(
        parsed.name,
        parsed.description,
        parsed.collapsed,
      ).id;
    }

    importInto(targetId, parsed.tabs, merged);
  }

  // ---- orphaned tabItems ----

  if (options.includeUnassigned && unassigned.length > 0) {
    const name = options.unassignedCollectionName.trim() || "Unassigned Tabs";
    const key = name.toLowerCase();
    let targetId: string;
    let merged = false;

    const existing =
      strategy === "merge-by-name" ? existingByName.get(key) : undefined;
    const alreadyCreated = createdByName.get(key);

    if (existing) {
      targetId = existing.id;
      merged = true;
      summary.collectionsMerged += 1;
    } else if (alreadyCreated) {
      targetId = alreadyCreated.id;
      merged = true;
    } else {
      const created = createCollection(
        name,
        "Websites that weren't in any collection in the imported file.",
        false,
      );
      createdByName.set(key, created);
      targetId = created.id;
    }

    importInto(targetId, unassigned, merged);
  }

  // A collection that ended up with nothing (everything was a duplicate) is
  // noise — drop it rather than leaving an empty card behind.
  const usedCollectionIds = new Set(outTabs.map((t) => t.collectionId));
  const keptCollections = outCollections.filter(
    (c) =>
      usedCollectionIds.has(c.id) ||
      Boolean(state.collections[c.id]) ||
      // Keep deliberately-empty imports from the file.
      parsedCollections.some(
        (p) => options.selected.has(p.sourceId) && p.name === c.name && p.tabs.length === 0,
      ),
  );
  summary.collectionsCreated = keptCollections.filter(
    (c) => !state.collections[c.id],
  ).length;

  return { collections: keptCollections, tabs: outTabs, summary };
}
