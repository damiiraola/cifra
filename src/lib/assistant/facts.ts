/**
 * Every number the assistant may say, computed by Cifra (§2.7). Tools put an
 * id ("f3") where a number goes and register its formatted value here; the
 * model writes the id between braces and Cifra replaces it. Pure, sin IA.
 */
import type { Currency } from "../types.ts";
import { money } from "../format.ts";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2027-12" → "diciembre 2027". */
export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${MONTHS[m - 1]} ${y}`;
}

/** "2026-11-05" → "5 de noviembre" (with the year when it is not `thisYear`). */
export function dayLabel(iso: string, thisYear = "") {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MONTHS[m - 1]}${thisYear && String(y) !== thisYear ? ` de ${y}` : ""}`;
}

export class Facts {
  private values = new Map<string, string>();
  private next = 1;
  private readonly thisYear: string;
  constructor(thisYear = "") {
    this.thisYear = thisYear;
  }

  private put(text: string) {
    const id = `f${this.next++}`;
    this.values.set(id, text);
    return id;
  }
  money(amount: number, currency: Currency = "ARS") {
    return this.put(money(Math.round(amount * 100) / 100, currency));
  }
  ars(amount: number) {
    return this.put(money(Math.round(amount), "ARS"));
  }
  pct(ratio: number) {
    return this.put(`${Math.round(ratio * 100)}%`);
  }
  /** TNA and other rates already in %. */
  rate(pct: number) {
    return this.put(`${Math.round(pct * 10) / 10}%`.replace(".", ","));
  }
  count(n: number, one: string, many: string) {
    const r = Math.round(n);
    return this.put(`${r} ${r === 1 ? one : many}`);
  }
  month(ym: string) {
    return this.put(monthLabel(ym));
  }
  day(iso: string) {
    return this.put(dayLabel(iso, this.thisYear));
  }
  /** Fixed text with a number Cifra decided ("más de 10 años"). */
  label(text: string) {
    return this.put(text);
  }
  /** Every [id, value] registered so far (the validator accepts values written out). */
  entries(): [string, string][] {
    return [...this.values.entries()];
  }
  get(id: string) {
    return this.values.get(id);
  }
  has(id: string) {
    return this.values.has(id);
  }
  /** Values created since `from` (an id number), for one tool's result. */
  since(from: number): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = from; i < this.next; i++) {
      const v = this.values.get(`f${i}`);
      if (v != null) out[`f${i}`] = v;
    }
    return out;
  }
  get cursor() {
    return this.next;
  }
}
