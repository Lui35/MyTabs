"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Monitor, Moon, Search, Settings, Sun, User } from "lucide-react";

import { Wordmark } from "@/components/brand";
import { SyncIndicator } from "@/components/layout/sync-indicator";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Kbd } from "@/components/ui/primitives";
import { useUI } from "@/lib/store/ui-store";
import { useWorkspace } from "@/lib/store/workspace-store";
import type { ThemePreference } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AppHeader({
  email,
  displayName,
  onSignOut,
}: {
  email: string | null;
  displayName: string | null;
  onSignOut: () => void;
}) {
  const openPalette = useUI((s) => s.openPalette);
  const theme = useWorkspace((s) => s.settings.theme);
  const updateSettings = useWorkspace((s) => s.updateSettings);
  const pathname = usePathname();

  const initial = (displayName || email || "?").trim()[0]?.toUpperCase() ?? "?";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <Link href="/" className="shrink-0 rounded-md" aria-label="Tabs home">
        <Wordmark />
      </Link>

      <nav className="ml-2 hidden items-center gap-0.5 sm:flex">
        <NavLink href="/" active={pathname === "/"}>
          Workspace
        </NavLink>
        <NavLink href="/settings" active={pathname.startsWith("/settings")}>
          Settings
        </NavLink>
      </nav>

      {/* Search affordance — the real thing is the palette. */}
      <button
        type="button"
        onClick={() => openPalette("search")}
        className={cn(
          "mx-auto flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm text-muted-foreground transition-colors",
          "hover:border-border-strong hover:bg-surface-hover",
        )}
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate">Search tabs, collections, URLs…</span>
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          <Kbd>⇧</Kbd>
          <Kbd>⇧</Kbd>
        </span>
      </button>

      <SyncIndicator className="hidden md:flex" />

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-soft-foreground transition-colors hover:bg-accent-soft/80"
          >
            {initial}
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="min-w-56">
          <div className="px-2 py-1.5">
            <p className="truncate text-[13px] font-medium text-foreground">
              {displayName || "Signed in"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {email ?? "Local workspace"}
            </p>
          </div>
          <MenuSeparator />

          <MenuLabel>Theme</MenuLabel>
          <MenuRadioGroup
            value={theme}
            onValueChange={(value) =>
              updateSettings({ theme: value as ThemePreference })
            }
          >
            <MenuRadioItem value="system">
              <Monitor />
              System
            </MenuRadioItem>
            <MenuRadioItem value="light">
              <Sun />
              Light
            </MenuRadioItem>
            <MenuRadioItem value="dark">
              <Moon />
              Dark
            </MenuRadioItem>
          </MenuRadioGroup>

          <MenuSeparator />
          <MenuItem asChild>
            <Link href="/settings">
              <Settings />
              Settings
            </Link>
          </MenuItem>
          {email ? (
            <MenuItem onSelect={onSignOut}>
              <LogOut />
              Sign out
            </MenuItem>
          ) : (
            <MenuItem asChild>
              <Link href="/login">
                <User />
                Sign in to sync
              </Link>
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn(active && "bg-muted text-foreground")}
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}
