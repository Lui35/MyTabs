/** Domain model shared by the store, UI, import/export and the extension bridge. */

export interface Collection {
  id: string;
  userId: string;
  name: string;
  description: string;
  collapsed: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface SavedTab {
  id: string;
  collectionId: string;
  userId: string;

  title: string;
  url: string;

  favicon: string | null;
  faviconUrl: string | null;
  description: string;

  tags: string[];

  position: number;

  /** Normalized form of `url`, used for duplicate detection. */
  normalizedUrl: string | null;
  /** Millisecond epoch preserved from an imported export, if any. */
  originalCreatedAt: number | null;

  createdAt: number;
  updatedAt: number;
}

/** A live browser tab reported by the extension. */
export interface OpenTab {
  id: string;
  title: string;
  url: string;
  favIconUrl: string | null;
  windowId: number | null;
  active: boolean;
  index: number;
}

export type ThemePreference = "system" | "light" | "dark";
export type ViewMode = "list" | "grid" | "compact";
export type SortMode = "manual" | "name" | "created" | "domain";

export interface Settings {
  theme: ThemePreference;
  doubleShiftSearch: boolean;
  fuzzySearch: boolean;
  searchDescriptions: boolean;
  searchTags: boolean;
  viewMode: ViewMode;
  sidebarOpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  doubleShiftSearch: true,
  fuzzySearch: true,
  searchDescriptions: true,
  searchTags: true,
  viewMode: "list",
  sidebarOpen: true,
};

/** Flattened row fed to the search index. */
export interface SearchDocument {
  id: string;
  title: string;
  url: string;
  domain: string;
  collectionId: string;
  collectionName: string;
  description: string;
  tags: string[];
  /** Carried on the document so results render without a store lookup. */
  favicon: string | null;
}
