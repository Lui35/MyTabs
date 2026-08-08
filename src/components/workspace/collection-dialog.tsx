"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/primitives";
import { useUI } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import { revealCollection } from "@/lib/reveal";
import { toast } from "@/lib/toast";

interface Values {
  name: string;
  description: string;
}

export function CollectionFormDialog({
  open,
  onOpenChange,
  initial,
  title,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Values;
  title: string;
  submitLabel: string;
  onSubmit: (values: Values) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Radix unmounts the content when closed, so the form below starts from
          `initial` every time it opens — no state-resetting effect needed. */}
      <DialogContent className="max-w-md">
        <DialogHeader title={title} />
        <CollectionForm
          initial={initial}
          submitLabel={submitLabel}
          onCancel={() => onOpenChange(false)}
          onSubmit={(values) => {
            onSubmit(values);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CollectionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Values;
  submitLabel: string;
  onSubmit: (values: Values) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(
    initial?.description ?? "",
  );

  const trimmed = name.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        onSubmit({ name: trimmed, description: description.trim() });
      }}
      className="space-y-4"
    >
      <Field label="Name" htmlFor="collection-name">
        <Input
          id="collection-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="UNI, Games, Reading list…"
          maxLength={200}
          autoFocus
          required
        />
      </Field>
      <Field
        label="Description"
        htmlFor="collection-description"
        hint="Optional."
      >
        <Textarea
          id="collection-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What belongs in here?"
          maxLength={2000}
          rows={3}
        />
      </Field>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!trimmed}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The global "+ New Collection" dialog, driven by the UI store. */
export function NewCollectionDialog() {
  const open = useUI((s) => s.newCollectionOpen);
  const closeDialog = useUI((s) => s.closeNewCollection);
  const createCollection = useWorkspace((s) => s.createCollection);

  return (
    <CollectionFormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
      title="New collection"
      submitLabel="Create collection"
      onSubmit={({ name, description }) => {
        const id = createCollection({ name, description });
        toast.success(`Created “${name}”`);
        // Let the card mount before scrolling to it.
        requestAnimationFrame(() => revealCollection(id));
      }}
    />
  );
}
