const TZ = "America/Argentina/Buenos_Aires";

export const QUOTE_INTERVAL_MS = 10 * 60 * 1000;

export function isArgentineWeekday(at = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(at);
  return weekday !== "Sat" && weekday !== "Sun";
}

export function quotesAreStale(quotesAt: string | null, at = Date.now()): boolean {
  if (!quotesAt) return true;
  const ts = new Date(quotesAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return at - ts >= QUOTE_INTERVAL_MS;
}

export function argentinaDay(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
