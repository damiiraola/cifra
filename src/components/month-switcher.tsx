import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel } from "@/lib/format";
import { monthISO, shiftMonth } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function MonthSwitcher({
  value,
  onChange,
  ahead = 0,
  tour,
}: {
  value: string;
  onChange: (ym: string) => void;
  /** Months after the current one you can go to (budgets look ahead at cuotas). */
  ahead?: number;
  tour?: string;
}) {
  const current = shiftMonth(monthISO(), ahead);
  return (
    <div className="flex items-center gap-1" data-tour={tour}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Mes anterior"
        onClick={() => onChange(shiftMonth(value, -1))}
      >
        <ChevronLeft />
      </Button>
      <p className="min-w-28 text-center text-sm font-medium capitalize sm:min-w-36">{monthLabel(value)}</p>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Mes siguiente"
        disabled={value >= current}
        onClick={() => onChange(shiftMonth(value, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
