/** Days with movimientos the previous month needs before a «% vs mes previo» means anything. */
export const MIN_PREV_MONTH_DAYS = 7;

/**
 * The «% vs mes previo» to show, or null when the previous month is too thin to
 * compare against (few days with movimientos, e.g. only what a PDF import brought,
 * or nothing spent in the same stretch): a +1622 % on a tiny base only scares.
 */
export function monthDeltaPct(
  spent: number,
  prevMtdSpent: number,
  prevByDay: { count: number }[],
  minDays = MIN_PREV_MONTH_DAYS,
): number | null {
  const daysWithMoves = prevByDay.filter((d) => d.count > 0).length;
  if (daysWithMoves < minDays || prevMtdSpent <= 0) return null;
  return ((spent - prevMtdSpent) / prevMtdSpent) * 100;
}
