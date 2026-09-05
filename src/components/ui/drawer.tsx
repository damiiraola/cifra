import * as React from "react";
import { Drawer as Vaul } from "vaul";
import { cn } from "@/lib/utils";

export const Drawer = Vaul.Root;
export const DrawerTrigger = Vaul.Trigger;
export const DrawerClose = Vaul.Close;
export const DrawerPortal = Vaul.Portal;

export function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof Vaul.Overlay>) {
  return <Vaul.Overlay className={cn("fixed inset-0 z-50 bg-bg/70", className)} {...props} />;
}

export function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Vaul.Content>) {
  return (
    <Vaul.Portal>
      <DrawerOverlay />
      <Vaul.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[92dvh] flex-col rounded-t-3xl bg-surface shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border-strong" />
        {children}
      </Vaul.Content>
    </Vaul.Portal>
  );
}

export function DrawerTitle({ className, ...props }: React.ComponentProps<typeof Vaul.Title>) {
  return (
    <Vaul.Title className={cn("font-display text-2xl tracking-tight text-fg", className)} {...props} />
  );
}

export function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof Vaul.Description>) {
  return <Vaul.Description className={cn("text-sm text-muted", className)} {...props} />;
}
