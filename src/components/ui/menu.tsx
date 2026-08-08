"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export const Menu = DropdownMenuPrimitive.Root;
export const MenuTrigger = DropdownMenuPrimitive.Trigger;
export const MenuGroup = DropdownMenuPrimitive.Group;
export const MenuSub = DropdownMenuPrimitive.Sub;
export const MenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const contentClass =
  "z-50 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-elevated p-1 shadow-float outline-none";

export function MenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="menu-content"
        sideOffset={sideOffset}
        className={cn(contentClass, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function MenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(itemClass, "data-[state=open]:bg-muted", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function MenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        data-slot="menu-content"
        className={cn(
          contentClass,
          "max-h-[60vh] overflow-y-auto scrollbar-thin",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

const itemClass =
  "relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-foreground outline-none transition-colors data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export function MenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  destructive?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Item
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

export function MenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={cn(itemClass, "pr-7", className)}
      {...props}
    >
      {children}
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-3.5" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(itemClass, "pr-7", className)}
      {...props}
    >
      {children}
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-3.5" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function MenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        "px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export function MenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "ml-auto pl-4 text-[11px] tracking-wide text-faint-foreground",
        className,
      )}
      {...props}
    />
  );
}
