import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg bg-elevated px-3 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none transition-[box-shadow] duration-150 placeholder:text-subtle focus-visible:shadow-[0_0_0_1px_rgba(200,204,212,0.55)]",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-lg bg-elevated px-3 py-2.5 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none transition-[box-shadow] duration-150 placeholder:text-subtle focus-visible:shadow-[0_0_0_1px_rgba(200,204,212,0.55)]",
        className,
      )}
      {...props}
    />
  );
}
