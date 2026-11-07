"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Ellipsis, GripVertical } from "lucide-react";

import { Favicon } from "@/components/favicon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import { useWorkspace } from "@/lib/store/workspace-store";
import { tabAnchorId } from "@/lib/reveal";
import type { SavedTab, ViewMode } from "@/lib/types";
import { getDomain, safeHref } from "@/lib/url";
import { cn } from "@/lib/utils";
import { MoveIcon, useTabActions } from "./tab-actions";

export function TabRow({
  tabId,
  collectionId,
  viewMode,
  disableSort,
  shift,
}: {
  tabId: string;
  collectionId: string;
  viewMode: ViewMode;
  disableSort?: boolean;
  /** Apply dnd-kit's sibling offsets so rows slide out of the way. */
  shift?: boolean;
}) {
  const tab = useWorkspace((s) => s.tabs[tabId]);

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    transform,
    transition,
  } = useSortable({
    id: tabId,
    disabled: disableSort,
    data: { type: "tab", collectionId },
  });

  if (!tab) return null;

  // Offsets are only meaningful when the dragged tab belongs to this
  // collection's sortable context. For a drag arriving from another collection
  // or from the Open Tabs sidebar there is nothing to shift against, so the
  // parent renders an insertion line instead.
  const style: React.CSSProperties | undefined = shift
    ? { transform: CSS.Translate.toString(transform), transition }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={tabAnchorId(tabId)}
      data-tab-id={tabId}
      className={cn("relative", isDragging && "opacity-35")}
    >
      <TabRowContent
        tab={tab}
        viewMode={viewMode}
        dragHandleProps={{ ...attributes, ...listeners }}
        // Pointer-drag from anywhere on the row; keyboard drag stays on the
        // grip so Space/Enter on the link keeps working.
        onRowPointerDown={
          listeners?.onPointerDown as
            | ((event: React.PointerEvent) => void)
            | undefined
        }
      />
    </div>
  );
}

type HandleProps = Record<string, unknown>;

export function TabRowContent({
  tab,
  viewMode,
  dragHandleProps,
  onRowPointerDown,
  overlay,
}: {
  tab: SavedTab;
  viewMode: ViewMode;
  dragHandleProps?: HandleProps;
  onRowPointerDown?: (event: React.PointerEvent) => void;
  overlay?: boolean;
}) {
  const { actions, moveTargets, moveTo } = useTabActions(tab);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const href = safeHref(tab.url);
  const domain = getDomain(tab.url);
  const title = tab.title || domain || tab.url;

  const isGrid = viewMode === "grid";
  const iconSize = viewMode === "compact" ? 14 : 16;

  const body = (
    <div
      onPointerDown={onRowPointerDown}
      // The description can run to a paragraph, so it lives in the tooltip
      // rather than in the card, which keeps every grid tile the same size.
      title={tab.description || undefined}
      className={cn(
        "group/tab relative flex items-center gap-2.5 rounded-lg border border-transparent bg-transparent transition-colors",
        "hover:border-border hover:bg-surface-hover",
        "focus-within:border-border focus-within:bg-surface-hover",
        viewMode === "compact" ? "px-2 py-1" : "px-2 py-1.5",
        // Fixed height: a long title or description must never make one tile
        // taller than its neighbours.
        isGrid && "h-[70px] flex-col items-stretch gap-0 border-border bg-surface p-3",
        overlay && "border-border bg-elevated shadow-float",
        menuOpen && "border-border bg-surface-hover",
      )}
    >
      {!isGrid ? (
        <button
          type="button"
          {...dragHandleProps}
          aria-label={`Reorder ${title}`}
          className={cn(
            "-ml-1 shrink-0 cursor-grab touch-none rounded p-0.5 text-faint-foreground opacity-0 transition-opacity",
            "group-hover/tab:opacity-100 focus-visible:opacity-100 active:cursor-grabbing",
            overlay && "opacity-100",
          )}
        >
          <GripVertical className="size-3.5" />
        </button>
      ) : null}

      {!isGrid ? (
        <Favicon
          url={tab.url}
          favicon={tab.favicon ?? tab.faviconUrl}
          size={iconSize}
        />
      ) : null}

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // Links are natively draggable, which would race dnd-kit's pointer
        // sensor and start an HTML5 link drag instead of a reorder.
        draggable={false}
        onClick={(e) => {
          if (href === "#") e.preventDefault();
        }}
        className={cn(
          "min-w-0 flex-1 outline-none",
          isGrid && "flex w-full flex-col justify-center gap-1.5",
        )}
      >
        {isGrid ? (
          // Icon sits inline with the title; `pr-5` keeps the hover menu from
          // landing on top of it.
          <span className="flex min-w-0 items-center gap-2 pr-5">
            <Favicon
              url={tab.url}
              favicon={tab.favicon ?? tab.faviconUrl}
              size={16}
            />
            <span
              className="min-w-0 truncate text-sm font-medium text-foreground"
              title={title}
            >
              {title}
            </span>
          </span>
        ) : (
          <span
            className={cn(
              "block truncate font-medium text-foreground",
              viewMode === "compact" ? "text-[13px]" : "text-sm",
            )}
            title={title}
          >
            {title}
          </span>
        )}

        {viewMode !== "compact" ? (
          <span
            className={cn(
              "block truncate text-xs text-muted-foreground",
              !isGrid && "mt-0.5",
            )}
          >
            {domain}
          </span>
        ) : null}
      </a>

      {!isGrid && tab.tags.length > 0 ? (
        <span className="hidden shrink-0 items-center gap-1 lg:flex">
          {tab.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </span>
      ) : null}

      {!overlay ? (
        <Menu open={menuOpen} onOpenChange={setMenuOpen}>
          <MenuTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${title}`}
              className={cn(
                "shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
                "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100",
                menuOpen && "opacity-100",
                isGrid && "absolute right-1.5 top-2.5",
              )}
            >
              <Ellipsis className="size-3.5" />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <TabMenuItems
              actions={actions}
              moveTargets={moveTargets}
              moveTo={moveTo}
              Item={MenuItem}
              Separator={MenuSeparator}
              Sub={MenuSub}
              SubTrigger={MenuSubTrigger}
              SubContent={MenuSubContent}
            />
          </MenuContent>
        </Menu>
      ) : null}
    </div>
  );

  if (overlay) return body;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>
      <ContextMenuContent>
        <TabMenuItems
          actions={actions}
          moveTargets={moveTargets}
          moveTo={moveTo}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
          Sub={ContextMenuSub}
          SubTrigger={ContextMenuSubTrigger}
          SubContent={ContextMenuSubContent}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * One definition of the tab menu, rendered with either the dropdown or the
 * context-menu primitives.
 */
function TabMenuItems({
  actions,
  moveTargets,
  moveTo,
  Item,
  Separator,
  Sub,
  SubTrigger,
  SubContent,
}: {
  actions: ReturnType<typeof useTabActions>["actions"];
  moveTargets: { id: string; name: string }[];
  moveTo: (id: string) => void;
  Item: React.ComponentType<{
    children: React.ReactNode;
    onSelect?: () => void;
    destructive?: boolean;
    disabled?: boolean;
  }>;
  Separator: React.ComponentType;
  Sub: React.ComponentType<{ children: React.ReactNode }>;
  SubTrigger: React.ComponentType<{ children: React.ReactNode }>;
  SubContent: React.ComponentType<{ children: React.ReactNode }>;
}) {
  return (
    <>
      {actions.map((action) => {
        const Icon = action.icon;
        const node = (
          <React.Fragment key={action.id}>
            {action.separatorBefore ? <Separator /> : null}
            <Item onSelect={action.run} destructive={action.destructive}>
              <Icon />
              {action.label}
            </Item>
          </React.Fragment>
        );

        // "Move to collection" slots in right after Edit.
        if (action.id !== "edit") return node;
        return (
          <React.Fragment key={action.id}>
            {node}
            <Sub>
              <SubTrigger>
                <MoveIcon />
                Move to collection
              </SubTrigger>
              <SubContent>
                {moveTargets.length === 0 ? (
                  <Item disabled>No other collections</Item>
                ) : (
                  moveTargets.map((target) => (
                    <Item key={target.id} onSelect={() => moveTo(target.id)}>
                      {target.name}
                    </Item>
                  ))
                )}
              </SubContent>
            </Sub>
          </React.Fragment>
        );
      })}
    </>
  );
}
