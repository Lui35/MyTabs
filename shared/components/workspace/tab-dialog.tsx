"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import { Favicon } from "@/components/favicon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/controls";
import { Input, Textarea } from "@/components/ui/input";
import { Field, Spinner } from "@/components/ui/primitives";
import { useUI } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import { toast } from "@/lib/toast";
import type { SavedTab } from "@/lib/types";
import { ensureProtocol, getDomain, isSafeUrl } from "@/lib/url";

function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
}

/**
 * Add/edit dialog for a saved website.
 *
 * The form lives in a child component so Radix unmounting the closed dialog
 * resets it; the fields are seeded from `editing` on mount.
 */
export function TabDialog() {
  const addOpen = useUI((s) => s.addTabOpen);
  const addCollectionId = useUI((s) => s.addTabCollectionId);
  const closeAdd = useUI((s) => s.closeAddTab);
  const editTabId = useUI((s) => s.editTabId);
  const closeEdit = useUI((s) => s.closeEditTab);

  const editing = useWorkspace((s) => (editTabId ? s.tabs[editTabId] : null));
  const collectionOrder = useWorkspace((s) => s.collectionOrder);

  const isEdit = Boolean(editTabId);
  const open = addOpen || isEdit;

  const close = React.useCallback(() => {
    if (isEdit) closeEdit();
    else closeAdd();
  }, [closeAdd, closeEdit, isEdit]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader
          title={isEdit ? "Edit website" : "Add website"}
          description={
            isEdit
              ? undefined
              : "Save a site without needing it open in your browser."
          }
        />
        <TabForm
          editing={editing ?? null}
          defaultCollectionId={addCollectionId ?? collectionOrder[0] ?? ""}
          onClose={close}
        />
      </DialogContent>
    </Dialog>
  );
}

function TabForm({
  editing,
  defaultCollectionId,
  onClose,
}: {
  editing: SavedTab | null;
  defaultCollectionId: string;
  onClose: () => void;
}) {
  const collectionOrder = useWorkspace((s) => s.collectionOrder);
  const collections = useWorkspace((s) => s.collections);
  const addTab = useWorkspace((s) => s.addTab);
  const updateTab = useWorkspace((s) => s.updateTab);
  const moveTabs = useWorkspace((s) => s.moveTabs);

  const [url, setUrl] = React.useState(editing?.url ?? "");
  const [title, setTitle] = React.useState(editing?.title ?? "");
  const [description, setDescription] = React.useState(
    editing?.description ?? "",
  );
  const [tags, setTags] = React.useState(editing?.tags.join(", ") ?? "");
  const [collectionId, setCollectionId] = React.useState(
    editing?.collectionId ?? defaultCollectionId,
  );
  const [favicon, setFavicon] = React.useState<string | null>(
    editing?.favicon ?? editing?.faviconUrl ?? null,
  );
  const [touchedTitle, setTouchedTitle] = React.useState(Boolean(editing));
  const [fetching, setFetching] = React.useState(false);

  const urlValid = url.trim().length > 0 && isSafeUrl(url);
  const noCollections = collectionOrder.length === 0;

  const fetchMetadata = React.useCallback(async () => {
    if (!urlValid) return;
    setFetching(true);
    try {
      const response = await fetch(
        `/api/metadata?url=${encodeURIComponent(ensureProtocol(url))}`,
      );
      const data = (await response.json()) as {
        title?: string | null;
        favicon?: string | null;
        error?: string;
      };
      if (data.error) {
        toast.error("Couldn't read that page", { description: data.error });
        return;
      }
      if (data.favicon) setFavicon(data.favicon);
      if (data.title && !touchedTitle) setTitle(data.title);
      if (!data.title && !data.favicon) {
        toast.info("No metadata found for that page");
      }
    } catch {
      toast.error("Couldn't reach that page");
    } finally {
      setFetching(false);
    }
  }, [touchedTitle, url, urlValid]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlValid) {
      toast.error("Enter a valid http or https URL");
      return;
    }

    const parsedTags = parseTags(tags);

    if (editing) {
      updateTab(editing.id, {
        url,
        title,
        description,
        tags: parsedTags,
        favicon,
        faviconUrl: favicon,
      });
      if (collectionId && collectionId !== editing.collectionId) {
        const target = useWorkspace.getState().tabOrder[collectionId] ?? [];
        moveTabs([editing.id], collectionId, target.length);
      }
      toast.success("Website updated");
      onClose();
      return;
    }

    if (!collectionId) {
      toast.error("Choose a collection first");
      return;
    }

    addTab(collectionId, {
      url,
      title,
      description,
      tags: parsedTags,
      favicon,
      faviconUrl: favicon,
    });
    toast.success(`Added to ${collections[collectionId]?.name ?? "collection"}`);
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="URL" htmlFor="tab-url">
        <div className="flex gap-2">
          <Input
            id="tab-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              if (url.trim() && !touchedTitle) void fetchMetadata();
            }}
            placeholder="https://example.com"
            inputMode="url"
            autoFocus={!editing}
            required
            aria-invalid={url.trim().length > 0 && !urlValid}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => void fetchMetadata()}
            disabled={!urlValid || fetching}
            title="Look up the page title and icon"
          >
            {fetching ? <Spinner /> : <Sparkles />}
            <span className="hidden sm:inline">Fetch</span>
          </Button>
        </div>
        {url.trim() && !urlValid ? (
          <p className="text-xs text-destructive">
            Only http and https addresses can be saved.
          </p>
        ) : null}
      </Field>

      <Field
        label="Title"
        htmlFor="tab-title"
        hint="Optional — we'll use the domain if you leave it blank."
      >
        <div className="flex items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
            <Favicon url={url || "https://example.com"} favicon={favicon} size={16} />
          </span>
          <Input
            id="tab-title"
            value={title}
            onChange={(e) => {
              setTouchedTitle(true);
              setTitle(e.target.value);
            }}
            placeholder={url ? getDomain(url) || "Example" : "Example"}
          />
        </div>
      </Field>

      <Field label="Description" htmlFor="tab-description" hint="Optional.">
        <Textarea
          id="tab-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={2000}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tags" htmlFor="tab-tags" hint="Comma separated.">
          <Input
            id="tab-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="reference, wiki"
          />
        </Field>

        <Field label="Collection" htmlFor="tab-collection">
          <Select
            id="tab-collection"
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            disabled={noCollections}
          >
            {noCollections ? <option value="">No collections yet</option> : null}
            {collectionOrder.map((id) => (
              <option key={id} value={id}>
                {collections[id]?.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!urlValid || noCollections}
        >
          {editing ? "Save changes" : "Add website"}
        </Button>
      </DialogFooter>
    </form>
  );
}
