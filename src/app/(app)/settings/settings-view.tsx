"use client";

import * as React from "react";
import {
  Blocks,
  Download,
  Keyboard,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Search,
  Sun,
  Trash2,
  Upload,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import {
  RadioGroup,
  RadioGroupItem,
  Switch,
} from "@/components/ui/controls";
import { Badge, Kbd, Label } from "@/components/ui/primitives";
import { useUI } from "@/lib/store/ui-store";
import { useOpenTabs } from "@/lib/store/open-tabs-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import { exportWorkspace } from "@/lib/transfer/download";
import { toast } from "@/lib/toast";
import type { ThemePreference } from "@/lib/types";
import { cn, formatCount } from "@/lib/utils";

export function SettingsView({
  email,
  displayName,
  onSignOut,
  onDeleteAccount,
}: {
  email: string | null;
  displayName: string | null;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}) {
  const settings = useWorkspace((s) => s.settings);
  const updateSettings = useWorkspace((s) => s.updateSettings);
  const mode = useWorkspace((s) => s.mode);
  const collectionCount = useWorkspace((s) => s.collectionOrder.length);
  const tabCount = useWorkspace((s) => Object.keys(s.tabs).length);
  const openImport = useUI((s) => s.openImport);

  const extensionStatus = useOpenTabs((s) => s.status);
  const extensionVersion = useOpenTabs((s) => s.extensionVersion);
  const openTabCount = useOpenTabs((s) => s.tabs.length);

  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const themeOptions: {
    value: ThemePreference;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { value: "system", label: "System", icon: Monitor },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <main className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <header className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Settings
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {formatCount(collectionCount, "collection")}
            <span className="mx-1.5 text-faint-foreground">·</span>
            {formatCount(tabCount, "saved website")}
          </p>
        </header>

        <div className="space-y-8">
          {/* ---- appearance ---- */}
          <Section icon={Palette} title="Appearance">
            <Label>Theme</Label>
            <RadioGroup
              value={settings.theme}
              onValueChange={(value) =>
                updateSettings({ theme: value as ThemePreference })
              }
              className="mt-2 grid gap-2 sm:grid-cols-3"
            >
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const active = settings.theme === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/50",
                      active && "border-accent bg-accent-soft/30",
                    )}
                  >
                    <RadioGroupItem value={option.value} />
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="text-[13px] font-medium text-foreground">
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          </Section>

          {/* ---- search ---- */}
          <Section icon={Search} title="Search">
            <div className="divide-y divide-border rounded-lg border border-border">
              <Toggle
                label="Double Shift search"
                description="Press Shift twice to open the quick search palette."
                checked={settings.doubleShiftSearch}
                onChange={(v) => updateSettings({ doubleShiftSearch: v })}
              />
              <Toggle
                label="Fuzzy search"
                description="Match loosely, so “eld map” finds “Elden Ring Map”."
                checked={settings.fuzzySearch}
                onChange={(v) => updateSettings({ fuzzySearch: v })}
              />
              <Toggle
                label="Search descriptions"
                description="Include the description field when matching."
                checked={settings.searchDescriptions}
                onChange={(v) => updateSettings({ searchDescriptions: v })}
              />
              <Toggle
                label="Search tags"
                description="Include tags when matching."
                checked={settings.searchTags}
                onChange={(v) => updateSettings({ searchTags: v })}
              />
            </div>
          </Section>

          {/* ---- shortcuts ---- */}
          <Section icon={Keyboard} title="Keyboard shortcuts">
            <dl className="divide-y divide-border rounded-lg border border-border">
              <Shortcut keys={["⇧", "⇧"]} label="Open quick search" />
              <Shortcut keys={["Ctrl", "K"]} label="Open quick search" />
              <Shortcut keys={["Ctrl", "N"]} label="New collection" />
              <Shortcut keys={["Ctrl", "⇧", "N"]} label="Add website" />
              <Shortcut keys={["Ctrl", "E"]} label="Export workspace" />
              <Shortcut keys={["Esc"]} label="Close dialogs and search" />
            </dl>
            <p className="mt-2 text-xs text-faint-foreground">
              Type <span className="font-mono">&gt;</span> in the palette to run
              commands instead of searching.
            </p>
          </Section>

          {/* ---- import / export ---- */}
          <Section icon={Upload} title="Import and export">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={openImport}>
                <Upload />
                Import workspace
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const state = useWorkspace.getState();
                  if (state.collectionOrder.length === 0) {
                    toast.info("Nothing to export yet");
                    return;
                  }
                  const count = exportWorkspace(state);
                  toast.success("Workspace exported", {
                    description: `${formatCount(count, "website")} written to your downloads.`,
                  });
                }}
              >
                <Download />
                Export workspace
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Exports use the version 2.0 JSON format, so they can be read back
              by this app or the original tab manager.
            </p>
          </Section>

          {/* ---- connected browsers ---- */}
          <Section icon={Blocks} title="Connected browsers">
            <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground">
                  Tabs browser extension
                </span>
                <span className="block text-xs text-muted-foreground">
                  {extensionStatus === "connected"
                    ? `Connected${extensionVersion ? ` · v${extensionVersion}` : ""} · ${formatCount(openTabCount, "open tab")}`
                    : extensionStatus === "checking"
                      ? "Looking for the extension…"
                      : "Not detected. Load the extension/ folder as an unpacked extension."}
                </span>
              </span>
              <Badge
                tone={extensionStatus === "connected" ? "success" : "neutral"}
              >
                {extensionStatus === "connected" ? "Connected" : "Offline"}
              </Badge>
            </div>
          </Section>

          {/* ---- account ---- */}
          <Section icon={User} title="Account">
            <div className="rounded-lg border border-border">
              <div className="flex items-center gap-3 px-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground">
                    {displayName || "Local workspace"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {email ?? "Not signed in — data stays on this device."}
                  </span>
                </span>
                <Badge tone={mode === "cloud" ? "accent" : "neutral"}>
                  {mode === "cloud" ? "Cloud sync" : "Local only"}
                </Badge>
              </div>

              {email ? (
                <>
                  <div className="border-t border-border px-3 py-2.5">
                    <Button variant="secondary" size="sm" onClick={onSignOut}>
                      <LogOut />
                      Sign out
                    </Button>
                  </div>
                  <div className="border-t border-border px-3 py-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 />
                      Delete account
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Permanently removes your account and every collection and
                      saved website in it.
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          </Section>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader
            title="Delete your account?"
            description={`This permanently deletes ${formatCount(collectionCount, "collection")} and ${formatCount(tabCount, "saved website")}. This cannot be undone — export a backup first if you might want the data later.`}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction destructive onClick={onDeleteAccount}>
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-faint-foreground">
        <Icon className="size-3.5" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex items-center gap-4 px-3 py-3">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[13px] font-medium text-foreground">
          {label}
        </span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <dt className="text-[13px] text-foreground">{label}</dt>
      <dd className="flex shrink-0 items-center gap-1">
        {keys.map((key, i) => (
          <Kbd key={`${key}-${i}`}>{key}</Kbd>
        ))}
      </dd>
    </div>
  );
}
