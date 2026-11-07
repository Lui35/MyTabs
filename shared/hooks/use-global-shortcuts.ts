"use client";

import * as React from "react";

import { useUI } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/store/workspace-store";

/** Max gap between the two Shift presses, in ms. */
const DOUBLE_SHIFT_WINDOW = 400;

function isMod(e: KeyboardEvent) {
  return e.metaKey || e.ctrlKey;
}

/**
 * Global keyboard entry points.
 *
 * Double-Shift mirrors JetBrains' Search Everywhere: two bare Shift presses in
 * quick succession, cancelled by any other key so that typing a capital letter
 * never opens the palette.
 */
export function useGlobalShortcuts({
  onExport,
}: {
  onExport?: () => void;
} = {}) {
  const openPalette = useUI((s) => s.openPalette);
  const paletteOpen = useUI((s) => s.paletteOpen);
  const openNewCollection = useUI((s) => s.openNewCollection);
  const openAddTab = useUI((s) => s.openAddTab);
  const doubleShiftEnabled = useWorkspace((s) => s.settings.doubleShiftSearch);

  const lastShift = React.useRef(0);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ---- double shift ----
      if (e.key === "Shift") {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) {
          lastShift.current = 0;
          return;
        }
        if (!doubleShiftEnabled || paletteOpen) {
          lastShift.current = 0;
          return;
        }
        const now = performance.now();
        if (now - lastShift.current < DOUBLE_SHIFT_WINDOW) {
          lastShift.current = 0;
          e.preventDefault();
          openPalette("search");
        } else {
          lastShift.current = now;
        }
        return;
      }

      // Any other key breaks the Shift-Shift sequence.
      lastShift.current = 0;

      // ---- explicit shortcuts ----
      if (isMod(e) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette("search");
        return;
      }

      if (isMod(e) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openAddTab(null);
        return;
      }

      if (isMod(e) && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openNewCollection();
        return;
      }

      if (isMod(e) && !e.shiftKey && e.key.toLowerCase() === "e" && onExport) {
        e.preventDefault();
        onExport();
      }
    };

    const onBlur = () => {
      lastShift.current = 0;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    doubleShiftEnabled,
    onExport,
    openAddTab,
    openNewCollection,
    openPalette,
    paletteOpen,
  ]);
}
