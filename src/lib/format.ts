import { es } from "date-fns/locale";
import { format, parseISO } from "date-fns";
import type { Currency } from "./types";

/**
 * Short amounts keep one decimal: "$ 1,8 M", not "$ 2 M". With no decimal a
 * caja with $ 1.800.000 read "$ 2 M" and kept reading "$ 2 M" after spending.
 */
const SHORT_DIGITS = { maximumFractionDigits: 1, minimumFractionDigits: 0 };

export function money(amount: number, currency: Currency = "ARS", compact = false) {
  const abs = Math.abs(amount);
  const short = compact && abs >= 100_000;
  if (currency === "USDT") {
    const formatted = new Intl.NumberFormat("es-AR", {
      ...(short ? SHORT_DIGITS : { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
      notation: short ? "compact" : "standard",
      compactDisplay: "short",
    }).format(abs);
    return amount < 0 ? `−USDT ${formatted}` : `USDT ${formatted}`;
  }
  const formatted = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    ...(short
      ? SHORT_DIGITS
      : {
          maximumFractionDigits: currency === "ARS" ? 0 : 2,
          minimumFractionDigits: currency === "ARS" ? 0 : 2,
        }),
    notation: short ? "compact" : "standard",
    compactDisplay: "short",
  }).format(abs);
  return amount < 0 ? `−${formatted}` : formatted;
}

export function moneyARS(amount: number, compact = false) {
  return money(amount, "ARS", compact);
}

export function parseAmount(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/\s/g, "").replace(/\$/g, "");
  if (!s) return null;
  s = s.replace(/mil\b/g, "000").replace(/k\b/g, "000");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2 || (parts[1] && parts[1].length === 3 && parts[0].length > 0)) {
      s = s.replace(/\./g, "");
    }
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function dayLabel(iso: string, pattern = "EEEE d") {
  return format(parseISO(iso), pattern, { locale: es });
}

export function monthLabel(ym: string, pattern = "LLLL yyyy") {
  return format(parseISO(`${ym}-01`), pattern, { locale: es });
}

export function shortDay(iso: string) {
  return format(parseISO(iso), "d MMM", { locale: es });
}

export function weekdayShort(iso: string) {
  return format(parseISO(iso), "EEEEE", { locale: es });
}

/**
 * A number as the user would type it in an amount field (`1.150.000`,
 * `120,5`). Empty for 0 so the placeholder shows. Round-trips through
 * `parseAmount`.
 */
export function amountInput(n: number | null | undefined): string {
  if (!n || !Number.isFinite(n)) return "";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, useGrouping: true }).format(n);
}
