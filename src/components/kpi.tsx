import { cn } from "@/lib/utils";

export function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "income" | "expense" | "warn";
}) {
  const tones = {
    default: "text-fg",
    income: "text-income",
    expense: "text-expense",
    warn: "text-warn",
  };
  return (
    <div className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className={cn("mt-2 font-display text-3xl tracking-tight tabular-nums", tones[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export function HeroSpend({
  label,
  amount,
  hint,
}: {
  label: string;
  amount: string;
  hint?: string;
}) {
  return (
    <div className="rounded-3xl bg-surface px-5 py-6 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 font-display text-5xl leading-none tracking-tight text-fg tabular-nums sm:text-6xl">
        {amount}
      </p>
      {hint ? <p className="mt-3 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
