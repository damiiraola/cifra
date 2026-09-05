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
export type AccountKind = "cash" | "mp" | "bank" | "crypto";

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
