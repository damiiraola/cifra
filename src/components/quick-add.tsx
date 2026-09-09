import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { money, parseAmount } from "@/lib/format";
import { toARS } from "@/lib/analytics";
import { inferAccount, stampRate } from "@/lib/books";
import { CatIcon } from "@/lib/icons";
import { PAY_METHODS, type Currency, type PayMethod, type TxType } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";
import { useBookAccounts, useLedger, useVisibleCategories } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const KINDS: { id: TxType; label: string }[] = [
  { id: "expense", label: "Gasto" },
  { id: "income", label: "Ingreso" },
  { id: "transfer", label: "Cambio" },
];

export function QuickAdd() {
  const {
    quickOpen,
    closeQuick,
    draft,
    editingId,
    addTx,
    updateTx,
    deleteTx,
    transactions,
    usdRate,
    usdtRate,
    activeBookId,
  } = useLedger();
  const accounts = useBookAccounts();
  const visible = useVisibleCategories();
  const editing = editingId ? transactions.find((t) => t.id === editingId) : null;

  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [amountTo, setAmountTo] = useState("");
  const [categoryId, setCategoryId] = useState("alimentos");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PayMethod>("debito");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [accountId, setAccountId] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [rate, setRate] = useState("");

  useEffect(() => {
    if (!quickOpen) return;
    const src = editing ?? draft;
    const nextType = src.type ?? "expense";
    const nextCurrency = src.currency ?? "ARS";
    const nextMethod = src.method ?? (nextCurrency === "USDT" ? "crypto" : "debito");
    setType(nextType);
    setAmount(src.amount != null ? String(src.amount) : "");
    setAmountTo(src.amountTo ? String(src.amountTo) : "");
    setCategoryId(src.categoryId ?? (nextType === "income" ? "sueldo" : nextType === "transfer" ? "transferencias" : "alimentos"));
    setMerchant(src.merchant ?? "");
    setNote(src.note ?? "");
    setDate(src.date ?? todayISO());
    setMethod(nextMethod);
    setCurrency(nextCurrency);
    setAccountId(src.accountId || inferAccount(accounts, activeBookId, nextMethod, nextCurrency));
    setCounterpartyId(src.counterpartyId ?? "");
    setRate(src.rateLocked && src.rateArs ? String(src.rateArs) : "");
  }, [quickOpen, editing, draft, accounts, activeBookId]);

  const fx = { usd: usdRate, usdt: usdtRate };
  const parsed = parseAmount(amount);
  const customRate = parseAmount(rate);
  const fromAcc = accounts.find((a) => a.id === accountId);
  const toAcc = accounts.find((a) => a.id === counterpartyId);
  const liveRate = stampRate(currency, usdRate, usdtRate, customRate ?? undefined);

  const cats = useMemo(
    () => (type === "transfer" ? [] : visible.filter((c) => c.kind === (type === "income" ? "income" : "expense"))),
    [type, visible],
  );

  function setKind(next: TxType) {
    setType(next);
    if (next === "income") setCategoryId("sueldo");
    else if (next === "transfer") {
      setCategoryId("transferencias");
      setMethod("transferencia");
    } else setCategoryId("alimentos");
  }

  function submit() {
    const n = parseAmount(amount);
    if (n == null || n <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (type === "transfer" && !counterpartyId) {
      toast.error("Elegí a qué caja va");
      return;
    }
    const dest = accounts.find((a) => a.id === counterpartyId);
    const src = accounts.find((a) => a.id === accountId);
    let to = parseAmount(amountTo) ?? 0;
    if (type === "transfer" && src && dest && src.currency !== dest.currency && to <= 0) {
      if (dest.currency === "ARS") to = n * liveRate;
      else toast.error("Ingresá cuánto llega en la otra moneda");
      if (to <= 0) return;
    }
    const payload = {
      type,
      amount: n,
      currency: src?.currency ?? currency,
      categoryId: type === "transfer" ? "transferencias" : categoryId,
      merchant: merchant.trim(),
      note: note.trim(),
      date,
      method: type === "transfer" ? (src?.kind === "crypto" ? "crypto" as const : "transferencia" as const) : method,
      bookId: activeBookId,
      accountId: accountId || inferAccount(accounts, activeBookId, method, currency),
      counterpartyId: type === "transfer" ? counterpartyId : "",
      amountTo: type === "transfer" ? to : 0,
      rateArs: liveRate,
      rateLocked: Boolean(customRate),
      recurringId: editing?.recurringId ?? "",
    };
    if (editing) {
      updateTx(editing.id, payload);
      toast.success("Movimiento actualizado");
    } else {
      addTx(payload);
      toast.success(type === "expense" ? "Gasto registrado" : type === "income" ? "Ingreso registrado" : "Cambio registrado");
    }
    closeQuick();
  }

  return (
    <Drawer open={quickOpen} onOpenChange={(o) => (!o ? closeQuick() : null)} shouldScaleBackground={false}>
      <DrawerContent>
        <div className="overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <DrawerTitle>{editing ? "Editar" : "Nuevo movimiento"}</DrawerTitle>
          <DrawerDescription className="mt-1">
            {type === "transfer" ? "Mover entre cajas no cuenta como gasto." : "Cargá un gasto o ingreso en segundos."}
          </DrawerDescription>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {KINDS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setKind(t.id)}
                className={cn(
                  "h-11 rounded-lg text-sm font-medium transition-colors duration-150",
                  type === t.id
                    ? t.id === "income"
                      ? "bg-income/20 text-income"
                      : "bg-elevated text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.16)]"
                    : "bg-elevated text-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <Label htmlFor="amount">{type === "transfer" ? "Sale" : "Monto"}</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="grid h-14 min-w-16 place-items-center rounded-lg bg-elevated px-3 text-sm font-medium text-muted shadow-[0_0_0_1px_rgba(244,244,240,0.08)]">
                {fromAcc?.currency ?? currency}
              </span>
              <input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-14 min-w-0 flex-1 rounded-lg bg-elevated px-3 font-display text-3xl tracking-tight text-fg outline-none shadow-[0_0_0_1px_rgba(244,244,240,0.08)] placeholder:text-subtle"
              />
            </div>
            {parsed && (fromAcc?.currency ?? currency) !== "ARS" ? (
              <p className="mt-1 text-xs text-subtle tabular-nums">
                ≈ {money(toARS({
                  id: "",
                  type: "expense",
                  amount: parsed,
                  currency: fromAcc?.currency ?? currency,
                  categoryId,
                  note: "",
                  merchant: "",
                  date,
                  method,
                  createdAt: "",
                  bookId: activeBookId,
                  accountId,
                  counterpartyId: "",
                  amountTo: 0,
                  rateArs: liveRate,
                  rateLocked: Boolean(customRate),
                  recurringId: "",
                }, fx), "ARS")}
              </p>
            ) : null}
          </div>

          {(currency === "USDT" || fromAcc?.currency === "USDT" || fromAcc?.currency === "USD") && type !== "income" ? (
            <div className="mt-4">
              <Label htmlFor="rate">Cotización ARS {fromAcc?.currency === "USD" ? "(blue)" : "(cripto / P2P)"}</Label>
              <Input
                id="rate"
                className="mt-1.5"
                inputMode="decimal"
                placeholder={String(Math.round(liveRate))}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          ) : null}

          <div className="mt-5">
            <Label htmlFor="account">{type === "transfer" ? "Desde" : "Caja"}</Label>
            <select
              id="account"
              value={accountId}
              onChange={(e) => {
                const id = e.target.value;
                setAccountId(id);
                const acc = accounts.find((a) => a.id === id);
                if (acc) setCurrency(acc.currency);
              }}
              className="mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          </div>

          {type === "transfer" ? (
            <div className="mt-4">
              <Label htmlFor="to">Hacia</Label>
              <select
                id="to"
                value={counterpartyId}
                onChange={(e) => setCounterpartyId(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none"
              >
                <option value="">Elegí caja</option>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
              </select>
              {toAcc && fromAcc && toAcc.currency !== fromAcc.currency ? (
                <div className="mt-3">
                  <Label htmlFor="amountTo">Llega en {toAcc.currency}</Label>
                  <Input
                    id="amountTo"
                    className="mt-1.5"
                    inputMode="decimal"
                    placeholder={parsed && toAcc.currency === "ARS" ? String(Math.round(parsed * liveRate)) : "0"}
                    value={amountTo}
                    onChange={(e) => setAmountTo(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="mt-5">
                <Label>Categoría</Label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cats.map((c) => {
                    const on = categoryId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategoryId(c.id)}
                        className={cn(
                          "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-150",
                          on ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                        )}
                      >
                        <CatIcon name={c.icon} className="size-3.5" />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <div>
                  <Label htmlFor="merchant">Comercio / origen</Label>
                  <Input
                    id="merchant"
                    className="mt-1.5"
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    placeholder="Coto, Uber, sueldo…"
                  />
                </div>
                <div>
                  <Label htmlFor="note">Nota</Label>
                  <Input
                    id="note"
                    className="mt-1.5"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Opcional. También podés pegar un WhatsApp."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="date">Fecha</Label>
                    <Input
                      id="date"
                      type="date"
                      className="mt-1.5"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="method">Medio</Label>
                    <select
                      id="method"
                      value={method}
                      onChange={(e) => {
                        const m = e.target.value as PayMethod;
                        setMethod(m);
                        const inferred = inferAccount(accounts, activeBookId, m, currency);
                        if (inferred) setAccountId(inferred);
                      }}
                      className="mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none"
                    >
                      {PAY_METHODS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="mt-6 flex gap-2">
            {editing ? (
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  deleteTx(editing.id);
                  toast.success("Movimiento eliminado");
                  closeQuick();
                }}
              >
                Eliminar
              </Button>
            ) : null}
            <Button className="flex-1" onClick={submit}>
              {editing ? "Guardar" : "Registrar"}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
