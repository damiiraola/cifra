export type TxType = "expense" | "income" | "transfer";
export type Currency = "ARS" | "USD" | "USDT";
export type PayMethod =
  | "efectivo"
  | "debito"
  | "credito"
  | "transferencia"
  | "mercadopago"
  | "crypto"
  | "otro";

export type CategoryKind = "expense" | "income";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  token: string;
  icon: string;
};

export type BookKind = "personal" | "business";
/** `card`: one of the two cajas (ARS, USD) of a credit card. Its balance is
 * negative = what you owe; it does not count as money you have. */
export type AccountKind = "cash" | "mp" | "bank" | "crypto" | "card";

export type Book = {
  id: string;
  name: string;
  kind: BookKind;
};

export type Account = {
  id: string;
  bookId: string;
  name: string;
  kind: AccountKind;
  currency: Currency;
  opening: number;
  archived: boolean;
};

export type Transaction = {
  id: string;
  type: TxType;
  amount: number;
  currency: Currency;
  categoryId: string;
  note: string;
  merchant: string;
  date: string;
  method: PayMethod;
  createdAt: string;
  bookId: string;
  accountId: string;
  counterpartyId: string;
  amountTo: number;
  rateArs: number;
  rateLocked: boolean;
  recurringId: string;
  /** Card statement (YYYY-MM of its closing) for expenses on a card caja; "" otherwise. */
  cardPeriod: string;
  /** Installment of a card purchase (`ledger_card_purchases.id`); "" otherwise. */
  purchaseId: string;
  /** 3 of 12. 0 when it is not an installment. */
  installmentNo: number;
  installmentCount: number;
};

/**
 * A purchase in cuotas as it reads on the ticket. Its installments are
 * derived movements (`cuo_<id>_<k>`), so editing or deleting it redoes them.
 */
/** What the bank printed on a statement (imported from its PDF). Bank numbers, kept apart from Cifra's. */
export type BankStatement = {
  id: string;
  bookId: string;
  cardId: string;
  /** Month of the closing, YYYY-MM. */
  period: string;
  closingDate: string;
  dueDate: string;
  /** "" when the PDF does not say. */
  nextClosingDate: string;
  nextDueDate: string;
  totalArs: number;
  totalUsd: number;
  minimumArs: number;
  /** Bank charges in ARS (taxes, fees, interest), as listed. */
  chargesArs: number;
  importedAt: string;
};

export type CardPurchase = {
  id: string;
  bookId: string;
  cardId: string;
  /** Purchase date, or the date of the first cuota loaded (when it already came with paid ones). */
  date: string;
  merchant: string;
  categoryId: string;
  currency: "ARS" | "USD";
  installments: number;
  /** Interest-free: total / installments. With interest: what the bank charges per cuota. */
  installmentAmount: number;
  /** What you pay in total (interest-free: the price). */
  total: number;
  interestFree: boolean;
  /** Cash price, only to show what the financing costs (0 = unknown). */
  cashPrice: number;
  /** Cuotas already paid before loading it in Cifra ("voy por la 5 de 12" = 4). */
  paidBefore: number;
  note: string;
};

export type CardNetwork = "visa" | "master" | "amex" | "cabal" | "naranja" | "otra";

/** A credit card: one row + two cajas of kind `card` (ARS and USD). */
export type Card = {
  id: string;
  bookId: string;
  name: string;
  bank: string;
  network: CardNetwork;
  /** Only to recognise it. Never the full number. */
  last4: string;
  closingDay: number;
  dueDay: number;
  limitArs: number;
  accountArsId: string;
  accountUsdId: string;
  /** Caja you usually pay it from ("" = none). */
  payAccountId: string;
  /** Perception on USD charges paid in pesos (RG 5617). Editable; default 30. */
  usdPerceptionPct: number;
  /** Nominal yearly rate from the statement (TNA %), only to estimate interest. 0 = unknown. */
  tna: number;
  archived: boolean;
};

export type Recurring = {
  id: string;
  bookId: string;
  type: "expense" | "income";
  name: string;
  amount: number;
  currency: Currency;
  categoryId: string;
  accountId: string;
  method: PayMethod;
  day: number;
  note: string;
  active: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export const CURRENCIES: { id: Currency; label: string }[] = [
  { id: "ARS", label: "ARS" },
  { id: "USD", label: "USD" },
  { id: "USDT", label: "USDT" },
];

export const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "transferencia", label: "Transferencia" },
  { id: "mercadopago", label: "Mercado Pago" },
  { id: "crypto", label: "USDT / crypto" },
  { id: "otro", label: "Otro" },
];

export const CARD_NETWORKS: { id: CardNetwork; label: string }[] = [
  { id: "visa", label: "Visa" },
  { id: "master", label: "Mastercard" },
  { id: "amex", label: "American Express" },
  { id: "cabal", label: "Cabal" },
  { id: "naranja", label: "Naranja X" },
  { id: "otra", label: "Otra" },
];
