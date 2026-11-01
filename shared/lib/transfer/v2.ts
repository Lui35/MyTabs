/**
 * Version 2.0 workspace interchange format.
 *
 * Shape produced and consumed by the existing tab manager:
 *
 *   { version, exportedAt, collections: [{ id, name, description, collapsed,
 *     tabIds }], tabItems: { [id]: {...} }, sessions, settings }
 *
 * Everything here is defensive: an import file is untrusted input and must
 * never be able to break the app.
 */

import type { Collection, SavedTab } from "@/lib/types";
import { isSafeUrl, normalizeUrl } from "@/lib/url";

export const EXPORT_VERSION = "2.0";

export interface V2TabItem {
  id: string;
  title?: string;
  url: string;
  description?: string;
  favicon?: string;
  faviconUrl?: string;
  tags?: string[];
  createdAt?: number;
}

export interface V2Collection {
  id: string;
  name: string;
  description?: string;
  collapsed?: boolean;
  tabIds: string[];
}

export interface V2Export {
  version: string;
  exportedAt: number;
  collections: V2Collection[];
  tabItems: Record<string, V2TabItem>;
  sessions: unknown[];
  settings: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Parsing / validation
// ---------------------------------------------------------------------------

export type IssueLevel = "error" | "warning";

export interface ImportIssue {
  level: IssueLevel;
  code:
    | "syntax"
    | "unsupported-version"
    | "duplicate-collection-id"
    | "duplicate-tab-id"
    | "missing-tab-reference"
    | "invalid-url"
    | "malformed-record"
    | "empty";
  message: string;
}

/** A collection ready to be previewed and imported. */
export interface ParsedCollection {
  sourceId: string;
  name: string;
  description: string;
  collapsed: boolean;
  tabs: ParsedTab[];
}

export interface ParsedTab {
  sourceId: string;
  title: string;
  url: string;
  description: string;
  favicon: string | null;
  faviconUrl: string | null;
  tags: string[];
  createdAt: number | null;
}

export interface ParseResult {
  ok: boolean;
  version: string | null;
  exportedAt: number | null;
  collections: ParsedCollection[];
  /** tabItems that no collection references. */
  unassigned: ParsedTab[];
  issues: ImportIssue[];
  stats: {
    collections: number;
    assignedTabs: number;
    unassignedTabs: number;
    invalidUrls: number;
    missingReferences: number;
    duplicateIds: number;
    malformedRecords: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function asTimestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // Tolerate seconds-precision exports.
  const ms = value < 1e12 ? value * 1000 : value;
  return ms > 0 && ms < 4e12 ? Math.round(ms) : null;
}

function normalizeTabItem(
  raw: unknown,
  id: string,
): { tab: ParsedTab | null; invalidUrl: boolean; malformed: boolean } {
  if (!isRecord(raw)) return { tab: null, invalidUrl: false, malformed: true };

  const url = asString(raw.url).trim();
  if (!url) return { tab: null, invalidUrl: false, malformed: true };
  if (!isSafeUrl(url)) return { tab: null, invalidUrl: true, malformed: false };

  const favicon = asString(raw.favicon).trim() || null;
  const faviconUrl = asString(raw.faviconUrl).trim() || null;

  return {
    tab: {
      sourceId: id,
      title: asString(raw.title).trim(),
      url,
      description: asString(raw.description).trim(),
      favicon,
      faviconUrl: faviconUrl ?? favicon,
      tags: asTags(raw.tags),
      createdAt: asTimestamp(raw.createdAt),
    },
    invalidUrl: false,
    malformed: false,
  };
}

function emptyResult(issues: ImportIssue[]): ParseResult {
  return {
    ok: false,
    version: null,
    exportedAt: null,
    collections: [],
    unassigned: [],
    issues,
    stats: {
      collections: 0,
      assignedTabs: 0,
      unassignedTabs: 0,
      invalidUrls: 0,
      missingReferences: 0,
      duplicateIds: 0,
      malformedRecords: 0,
    },
  };
}

export function parseWorkspaceFile(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return emptyResult([
      {
        level: "error",
        code: "syntax",
        message:
          error instanceof Error
            ? `That file isn't valid JSON: ${error.message}`
            : "That file isn't valid JSON.",
      },
    ]);
  }

  if (!isRecord(data)) {
    return emptyResult([
      {
        level: "error",
        code: "malformed-record",
        message: "The file must contain a JSON object at the top level.",
      },
    ]);
  }

  const issues: ImportIssue[] = [];
  const version = typeof data.version === "string" ? data.version : null;

  if (!version) {
    issues.push({
      level: "warning",
      code: "unsupported-version",
      message: "No version field found. Reading it as a version 2.0 export.",
    });
  } else if (!version.startsWith("2.")) {
    issues.push({
      level: "warning",
      code: "unsupported-version",
      message: `Version ${version} isn't officially supported. Importing on a best-effort basis.`,
    });
  }

  const rawTabItems = isRecord(data.tabItems) ? data.tabItems : {};
  const rawCollections = Array.isArray(data.collections) ? data.collections : [];

  // ---- tab items ----
  const tabsById = new Map<string, ParsedTab>();
  let invalidUrls = 0;
  let malformedRecords = 0;

  for (const [id, raw] of Object.entries(rawTabItems)) {
    const { tab, invalidUrl, malformed } = normalizeTabItem(raw, id);
    if (invalidUrl) {
      invalidUrls += 1;
      issues.push({
        level: "warning",
        code: "invalid-url",
        message: `Skipped "${id}": its URL is missing or uses an unsupported scheme.`,
      });
      continue;
    }
    if (malformed || !tab) {
      malformedRecords += 1;
      issues.push({
        level: "warning",
        code: "malformed-record",
        message: `Skipped "${id}": the record is malformed.`,
      });
      continue;
    }
    tabsById.set(id, tab);
  }

  // ---- collections ----
  const seenCollectionIds = new Set<string>();
  const assignedTabIds = new Set<string>();
  const collections: ParsedCollection[] = [];
  let duplicateIds = 0;
  let missingReferences = 0;

  rawCollections.forEach((raw, index) => {
    if (!isRecord(raw)) {
      malformedRecords += 1;
      issues.push({
        level: "warning",
        code: "malformed-record",
        message: `Skipped collection #${index + 1}: the record is malformed.`,
      });
      return;
    }

    const sourceId = asString(raw.id).trim() || `collection-${index}`;
    if (seenCollectionIds.has(sourceId)) {
      duplicateIds += 1;
      issues.push({
        level: "warning",
        code: "duplicate-collection-id",
        message: `Collection id "${sourceId}" appears more than once. Importing both as separate collections.`,
      });
    }
    seenCollectionIds.add(sourceId);

    const name = asString(raw.name).trim() || "Untitled collection";
    const tabIds = Array.isArray(raw.tabIds) ? raw.tabIds : [];

    const tabs: ParsedTab[] = [];
    const seenInCollection = new Set<string>();

    for (const rawId of tabIds) {
      const tabId = typeof rawId === "string" ? rawId : "";
      if (!tabId) continue;

      if (seenInCollection.has(tabId)) {
        duplicateIds += 1;
        issues.push({
          level: "warning",
          code: "duplicate-tab-id",
          message: `"${name}" lists "${tabId}" twice. Keeping the first occurrence.`,
        });
        continue;
      }
      seenInCollection.add(tabId);

      const tab = tabsById.get(tabId);
      if (!tab) {
        missingReferences += 1;
        issues.push({
          level: "warning",
          code: "missing-tab-reference",
          message: `"${name}" references "${tabId}", which has no entry in tabItems. Skipping it.`,
        });
        continue;
      }

      assignedTabIds.add(tabId);
      tabs.push(tab);
    }

    collections.push({
      sourceId,
      name,
      description: asString(raw.description).trim(),
      collapsed: raw.collapsed === true,
      tabs,
    });
  });

  // ---- orphans ----
  const unassigned: ParsedTab[] = [];
  for (const [id, tab] of tabsById) {
    if (!assignedTabIds.has(id)) unassigned.push(tab);
  }

  const assignedTabs = collections.reduce((n, c) => n + c.tabs.length, 0);

  if (collections.length === 0 && unassigned.length === 0) {
    issues.push({
      level: "error",
      code: "empty",
      message: "No collections or saved websites were found in that file.",
    });
  }

  return {
    ok: collections.length > 0 || unassigned.length > 0,
    version,
    exportedAt: asTimestamp(data.exportedAt),
    collections,
    unassigned,
    issues,
    stats: {
      collections: collections.length,
      assignedTabs,
      unassignedTabs: unassigned.length,
      invalidUrls,
      missingReferences,
      duplicateIds,
      malformedRecords,
    },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function tabToV2(tab: SavedTab): V2TabItem {
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    description: tab.description,
    favicon: tab.favicon ?? tab.faviconUrl ?? "",
    faviconUrl: tab.faviconUrl ?? tab.favicon ?? "",
    tags: tab.tags,
    createdAt: tab.originalCreatedAt ?? tab.createdAt,
  };
}

/** Builds a v2.0 export for the given collections and their tabs. */
export function buildExport(
  collections: Collection[],
  tabsByCollection: Map<string, SavedTab[]>,
): V2Export {
  const tabItems: Record<string, V2TabItem> = {};
  const exportCollections: V2Collection[] = collections.map((collection) => {
    const tabs = tabsByCollection.get(collection.id) ?? [];
    for (const tab of tabs) tabItems[tab.id] = tabToV2(tab);
    return {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      collapsed: collection.collapsed,
      tabIds: tabs.map((t) => t.id),
    };
  });

  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    collections: exportCollections,
    tabItems,
    sessions: [],
    settings: {},
  };
}

/** Duplicate-detection key. Falls back to the raw URL when unparseable. */
export function dedupeKey(url: string): string {
  return normalizeUrl(url) ?? url.trim().toLowerCase();
}
