import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  ...props
}: React.ComponentProps<"span"> & { tone?: "muted" | "income" | "expense" | "accent" | "warn" }) {
  const tones = {
    muted: "bg-elevated text-muted",
    income: "bg-income/15 text-income",
    expense: "bg-expense/15 text-expense",
    accent: "bg-accent/15 text-accent",
    warn: "bg-warn/15 text-warn",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
