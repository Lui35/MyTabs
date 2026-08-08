"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        data-slot="overlay"
        className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]"
      />
      <AlertDialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
          "rounded-xl border border-border bg-elevated p-5 shadow-float outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogHeader({
  title,
  description,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <AlertDialogPrimitive.Title className="text-base font-semibold text-foreground">
        {title}
      </AlertDialogPrimitive.Title>
      {description ? (
        <AlertDialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {description}
        </AlertDialogPrimitive.Description>
      ) : null}
    </div>
  );
}

export function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "secondary" }), className)}
      {...props}
    />
  );
}

export function AlertDialogAction({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  destructive?: boolean;
}) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(
        buttonVariants({ variant: destructive ? "destructive" : "primary" }),
        className,
      )}
      {...props}
    />
  );
}
