"use client";

import * as React from "react";
import { CircleAlert, FileText, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Checkbox,
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/controls";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge, Label, Separator } from "@/components/ui/primitives";
import { useUI } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import {
  DUPLICATE_STRATEGIES,
  planImport,
  type DuplicateStrategy,
} from "@/lib/transfer/plan";
import { parseWorkspaceFile, type ParseResult } from "@/lib/transfer/v2";
import { toast } from "@/lib/toast";
import { cn, formatCount } from "@/lib/utils";

const MAX_FILE_BYTES = 32 * 1024 * 1024;

export function ImportDialog() {
  const open = useUI((s) => s.importOpen);
  const close = useUI((s) => s.closeImport);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      {/* Closing unmounts the content, which discards the parsed file, so the
          next import always starts from a clean slate. */}
      <DialogContent className="max-w-2xl">
        <ImportBody onClose={close} />
      </DialogContent>
    </Dialog>
  );
}

function ImportBody({ onClose }: { onClose: () => void }) {
  const mergeImport = useWorkspace((s) => s.mergeImport);

  const [parsed, setParsed] = React.useState<ParseResult | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [includeUnassigned, setIncludeUnassigned] = React.useState(true);
  const [unassignedName, setUnassignedName] = React.useState("Unassigned Tabs");
  const [strategy, setStrategy] = React.useState<DuplicateStrategy>("skip");
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);

  const readFile = React.useCallback(async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is too large", {
        description: "Workspace exports should be well under 32 MB.",
      });
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const result = parseWorkspaceFile(text);
      setParsed(result);
      setFileName(file.name);
      setSelected(new Set(result.collections.map((c) => c.sourceId)));
      setIncludeUnassigned(result.unassigned.length > 0);
    } catch {
      toast.error("Couldn't read that file");
    } finally {
      setBusy(false);
    }
  }, []);

  // Whole-dialog drop zone.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  const errors = parsed?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = parsed?.issues.filter((i) => i.level === "warning") ?? [];

  const selectedTabCount = React.useMemo(() => {
    if (!parsed) return 0;
    return parsed.collections
      .filter((c) => selected.has(c.sourceId))
      .reduce((n, c) => n + c.tabs.length, 0);
  }, [parsed, selected]);

  const canImport =
    Boolean(parsed?.ok) &&
    errors.length === 0 &&
    (selected.size > 0 || (includeUnassigned && (parsed?.unassigned.length ?? 0) > 0));

  const runImport = () => {
    if (!parsed) return;
    const state = useWorkspace.getState();

    const plan = planImport(
      parsed.collections,
      parsed.unassigned,
      {
        selected,
        includeUnassigned,
        unassignedCollectionName: unassignedName,
        strategy,
      },
      {
        userId: state.userId ?? "local",
        collections: state.collections,
        tabs: state.tabs,
        tabOrder: state.tabOrder,
      },
    );

    mergeImport(plan.collections, plan.tabs);

    const parts = [
      plan.summary.tabsAdded > 0
        ? `${formatCount(plan.summary.tabsAdded, "tab")} imported`
        : null,
      plan.summary.tabsUpdated > 0
        ? `${plan.summary.tabsUpdated} updated`
        : null,
      plan.summary.tabsSkipped > 0
        ? `${plan.summary.tabsSkipped} skipped as duplicates`
        : null,
    ].filter(Boolean);

    toast.success(
      plan.summary.tabsAdded > 0
        ? `${formatCount(plan.summary.tabsAdded, "tab")} imported`
        : "Import finished",
      { description: parts.join(" · ") || undefined },
    );
    onClose();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <DialogHeader
          title="Import workspace"
          description="Read a version 2.0 export back into your collections."
        />

        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = "";
          }}
        />

        {!parsed ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-12 text-center transition-colors",
              "hover:border-border-strong hover:bg-muted/50",
              dragging && "border-accent bg-accent-soft/40",
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Upload className="size-5" />
            </span>
            <span className="text-sm font-medium text-foreground">
              {busy ? "Reading file…" : "Drop a JSON export here"}
            </span>
            <span className="text-xs text-muted-foreground">
              or click to choose a file
            </span>
          </button>
        ) : (
          <div className="space-y-5">
            {/* ---- file + stats ---- */}
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                  {fileName}
                </span>
                <Badge tone="neutral">v{parsed.version ?? "?"}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                >
                  Change
                </Button>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-3">
                <Stat label="Collections" value={parsed.stats.collections} />
                <Stat label="Assigned tabs" value={parsed.stats.assignedTabs} />
                <Stat
                  label="Unassigned tabs"
                  value={parsed.stats.unassignedTabs}
                />
                <Stat
                  label="Invalid URLs"
                  value={parsed.stats.invalidUrls}
                  warn
                />
                <Stat
                  label="Missing references"
                  value={parsed.stats.missingReferences}
                  warn
                />
                <Stat
                  label="Malformed records"
                  value={parsed.stats.malformedRecords}
                  warn
                />
              </dl>
            </div>

            {/* ---- issues ---- */}
            {errors.length > 0 ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive-soft p-3">
                {errors.map((issue, i) => (
                  <p
                    key={i}
                    className="flex items-start gap-2 text-[13px] text-destructive"
                  >
                    <CircleAlert className="mt-px size-3.5 shrink-0" />
                    {issue.message}
                  </p>
                ))}
              </div>
            ) : null}

            {warnings.length > 0 ? (
              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-[13px] text-muted-foreground">
                  {formatCount(warnings.length, "warning")} — these entries will
                  be skipped
                </summary>
                <ul className="max-h-36 space-y-1 overflow-y-auto scrollbar-thin border-t border-border px-3 py-2">
                  {warnings.slice(0, 100).map((issue, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {/* ---- collection selection ---- */}
            {parsed.collections.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Collections to import</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelected(
                        selected.size === parsed.collections.length
                          ? new Set()
                          : new Set(parsed.collections.map((c) => c.sourceId)),
                      )
                    }
                  >
                    {selected.size === parsed.collections.length
                      ? "Deselect all"
                      : "Select all"}
                  </Button>
                </div>

                <ul className="max-h-48 divide-y divide-border overflow-y-auto scrollbar-thin rounded-lg border border-border">
                  {parsed.collections.map((collection) => (
                    <li key={collection.sourceId}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/60">
                        <Checkbox
                          checked={selected.has(collection.sourceId)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selected);
                            if (checked) next.add(collection.sourceId);
                            else next.delete(collection.sourceId);
                            setSelected(next);
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-foreground">
                            {collection.name}
                          </span>
                          {collection.description ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {collection.description}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatCount(collection.tabs.length, "tab")}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* ---- unassigned ---- */}
            {parsed.unassigned.length > 0 ? (
              <section className="space-y-2 rounded-lg border border-border p-3">
                <label className="flex items-start gap-2.5">
                  <Checkbox
                    checked={includeUnassigned}
                    onCheckedChange={(checked) =>
                      setIncludeUnassigned(checked === true)
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-foreground">
                      Import {formatCount(parsed.unassigned.length, "unassigned tab")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      These exist in the file but aren&apos;t in any collection.
                    </span>
                  </span>
                </label>
                {includeUnassigned ? (
                  <Input
                    value={unassignedName}
                    onChange={(e) => setUnassignedName(e.target.value)}
                    aria-label="Collection name for unassigned tabs"
                    className="h-8 text-[13px]"
                  />
                ) : null}
              </section>
            ) : null}

            <Separator />

            {/* ---- duplicates ---- */}
            <section className="space-y-2">
              <Label>When something is already saved</Label>
              <RadioGroup
                value={strategy}
                onValueChange={(v) => setStrategy(v as DuplicateStrategy)}
                className="space-y-1.5"
              >
                {DUPLICATE_STRATEGIES.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/50 has-[button[data-state=checked]]:border-accent has-[button[data-state=checked]]:bg-accent-soft/30"
                  >
                    <RadioGroupItem value={option.value} className="mt-0.5" />
                    <span>
                      <span className="block text-[13px] font-medium text-foreground">
                        {option.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
              <p className="text-xs text-faint-foreground">
                Websites are matched on a normalized URL, so
                <span className="mx-1 font-mono">youtube.com</span>and
                <span className="mx-1 font-mono">https://www.youtube.com/</span>
                count as the same site.
              </p>
            </section>
          </div>
        )}

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!canImport} onClick={runImport}>
          Import
          {parsed
            ? ` ${selectedTabCount + (includeUnassigned ? parsed.unassigned.length : 0)} tabs`
            : ""}
        </Button>
      </DialogFooter>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-semibold tabular-nums",
          warn && value > 0 ? "text-warning" : "text-foreground",
        )}
      >
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
