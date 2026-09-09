const TZ = "America/Argentina/Buenos_Aires";

export const QUOTE_INTERVAL_MS = 10 * 60 * 1000;
export const QUOTE_TICK_MS = 30 * 1000;

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

export function shouldRefreshQuotes(quotesAt: string | null, at = new Date()): boolean {
  return isArgentineWeekday(at) && quotesAreStale(quotesAt, at.getTime());
}

export function quotesAgeLabel(quotesAt: string | null, at = Date.now()): string {
  if (!quotesAt) return "sin actualizar";
  const ts = new Date(quotesAt).getTime();
  if (!Number.isFinite(ts)) return "sin actualizar";
  const mins = Math.max(0, Math.round((at - ts) / 60_000));
  if (mins < 1) return "ahora";
  if (mins === 1) return "hace 1 min";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return "hace 1 h";
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

export function argentinaDay(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
