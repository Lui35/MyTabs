"use client";

import { create } from "zustand";

export type PaletteMode = "search" | "command";

interface UIState {
  paletteOpen: boolean;
  paletteMode: PaletteMode;
  paletteSeed: string;

  newCollectionOpen: boolean;

  addTabOpen: boolean;
  addTabCollectionId: string | null;

  editTabId: string | null;

  importOpen: boolean;
  mobileSidebarOpen: boolean;

  /** Ids selected in the Open Tabs sidebar. */
  selectedOpenTabs: string[];

  openPalette: (mode?: PaletteMode, seed?: string) => void;
  closePalette: () => void;

  openNewCollection: () => void;
  closeNewCollection: () => void;

  openAddTab: (collectionId?: string | null) => void;
  closeAddTab: () => void;

  openEditTab: (tabId: string) => void;
  closeEditTab: () => void;

  openImport: () => void;
  closeImport: () => void;

  setMobileSidebarOpen: (open: boolean) => void;

  setSelectedOpenTabs: (ids: string[]) => void;
  toggleOpenTab: (id: string, additive: boolean) => void;
  clearOpenTabSelection: () => void;
}

export const useUI = create<UIState>((set, get) => ({
  paletteOpen: false,
  paletteMode: "search",
  paletteSeed: "",

  newCollectionOpen: false,

  addTabOpen: false,
  addTabCollectionId: null,

  editTabId: null,

  importOpen: false,
  mobileSidebarOpen: false,

  selectedOpenTabs: [],

  openPalette: (mode = "search", seed = "") =>
    set({ paletteOpen: true, paletteMode: mode, paletteSeed: seed }),
  closePalette: () => set({ paletteOpen: false, paletteSeed: "" }),

  openNewCollection: () => set({ newCollectionOpen: true }),
  closeNewCollection: () => set({ newCollectionOpen: false }),

  openAddTab: (collectionId = null) =>
    set({ addTabOpen: true, addTabCollectionId: collectionId }),
  closeAddTab: () => set({ addTabOpen: false, addTabCollectionId: null }),

  openEditTab: (tabId) => set({ editTabId: tabId }),
  closeEditTab: () => set({ editTabId: null }),

  openImport: () => set({ importOpen: true }),
  closeImport: () => set({ importOpen: false }),

  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  setSelectedOpenTabs: (ids) => set({ selectedOpenTabs: ids }),
  toggleOpenTab: (id, additive) => {
    const current = get().selectedOpenTabs;
    if (!additive) {
      set({ selectedOpenTabs: current.includes(id) && current.length === 1 ? [] : [id] });
      return;
    }
    set({
      selectedOpenTabs: current.includes(id)
        ? current.filter((t) => t !== id)
        : [...current, id],
    });
  },
  clearOpenTabSelection: () => set({ selectedOpenTabs: [] }),
}));
