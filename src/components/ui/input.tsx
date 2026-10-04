import * as React from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg bg-elevated px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none transition-[box-shadow] duration-150 placeholder:text-subtle focus-visible:shadow-[0_0_0_1px_rgba(200,204,212,0.55)]",
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
        "min-h-24 w-full rounded-lg bg-elevated px-3 py-2.5 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none transition-[box-shadow] duration-150 placeholder:text-subtle focus-visible:shadow-[0_0_0_1px_rgba(200,204,212,0.55)]",
        className,
      )}
      {...props}
    />
  );
}

/** Password field with a "mostrar / ocultar" button (44px tap target). */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [shown, setShown] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={shown}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
