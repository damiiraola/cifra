import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid() {
  return crypto.randomUUID();
}

export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthISO(d = new Date()) {
  return todayISO(d).slice(0, 7);
}

export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthISO(d);
}

export function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthBounds(ym: string) {
  const last = daysInMonth(ym);
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, "0")}`, last };
}

export function prevMonth(ym: string) {
  return shiftMonth(ym, -1);
}
