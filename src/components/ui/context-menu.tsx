"use client";

import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuSub = ContextMenuPrimitive.Sub;

const contentClass =
  "z-50 min-w-[11rem] overflow-hidden rounded-lg border border-border bg-elevated p-1 shadow-float outline-none";

const itemClass =
  "relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-foreground outline-none transition-colors data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="menu-content"
        className={cn(contentClass, className)}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  destructive?: boolean;
}) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        itemClass,
        destructive &&
          "text-destructive data-[highlighted]:bg-destructive-soft [&_svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={cn(itemClass, "data-[state=open]:bg-muted", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        data-slot="menu-content"
        className={cn(
          contentClass,
          "max-h-[60vh] overflow-y-auto scrollbar-thin",
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn("my-1 h-px bg-border", className)}
      {...props}
    />
  );
}
