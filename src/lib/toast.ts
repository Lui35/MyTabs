import { toast as sonner } from "sonner";

/**
 * Thin wrapper so notification policy lives in one place.
 *
 * Drag-and-drop fires constantly, so reorder feedback is intentionally silent —
 * the animation already confirms the move. Only state the user can't see
 * (saved, deleted, imported, sync failures) gets a toast.
 */
export const toast = {
  success: sonner.success,
  error: sonner.error,
  info: sonner,
  message: sonner.message,
  dismiss: sonner.dismiss,

  /** Destructive action with an inline undo affordance. */
  undo(message: string, description: string | undefined, onUndo: () => void) {
    return sonner(message, {
      description,
      duration: 8000,
      action: { label: "Undo", onClick: onUndo },
    });
  },
};
