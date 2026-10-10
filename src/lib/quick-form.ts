/**
 * Pure rules of the «Nuevo movimiento» sheet (src/components/quick-add.tsx).
 *
 * Root cause of the lost-input bug (UX audit 2026-10-10): the sheet reset all
 * its fields in an effect that depended on `accounts`. Any background refresh
 * of the store (hydrate after the session refetch, fijos/outbox flush) swaps
 * the account objects for equal copies, the effect ran again and wiped the
 * amount, the merchant and the caja (back to the default ARS caja) while the
 * user was typing. A US$ 25 typed on «Dólares» then went out as $ 25 on Banco.
 * Now the form resets only when a new sheet session starts.
 */
import type { AccountKind, Currency, PayMethod } from "./types";

export type QuickSession = { open: boolean; editingId: string | null; draft: object };

/** True only when the sheet opens, or opens on another movement or draft. */
export function startsNewSession(prev: QuickSession | null, next: QuickSession): boolean {
  if (!next.open) return false;
  if (!prev || !prev.open) return true;
  return prev.editingId !== next.editingId || prev.draft !== next.draft;
}

/** The currency of a movement is the caja's; the form state is only a fallback. */
export function currencyForCaja(caja: { currency: Currency } | undefined, fallback: Currency): Currency {
  return caja?.currency ?? fallback;
}

/**
 * «Cómo pagaste» only makes sense on a bank caja (débito, transferencia, crédito…).
 * Cash, Mercado Pago, crypto and card cajas already say how you paid.
 */
export function showsPayMethod(kind: AccountKind | undefined): boolean {
  return kind === "bank" || kind === undefined;
}

export const BANK_METHODS: PayMethod[] = ["debito", "transferencia", "credito", "otro"];

export type QuickField = "amount" | "category" | "account" | "to" | "amountTo";
export type QuickProblem = { field: QuickField; message: string } | null;

/** First missing field of a simple gasto/ingreso, with the message shown under it. */
export function firstProblem(input: {
  type: "expense" | "income" | "transfer";
  amount: number | null;
  categoryId: string;
  accountId: string;
  counterpartyId: string;
}): QuickProblem {
  if (input.amount == null || !(input.amount > 0)) return { field: "amount", message: "Falta el monto." };
  if (input.type !== "transfer" && !input.categoryId) return { field: "category", message: "Elegí una categoría." };
  if (input.type === "transfer" && !input.counterpartyId) return { field: "to", message: "Elegí a qué caja va." };
  return null;
}
