import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { money, parseAmount, amountInput } from "@/lib/format";
import { toARS } from "@/lib/analytics";
import { Link } from "@tanstack/react-router";
import { accountLabel, inferAccount, stampRate } from "@/lib/books";
import {
  cardForAccount,
  closingOf,
  dueOf,
  financingCost,
  installmentAmounts,
  periodForCard,
} from "@/lib/card-math";
import { CatIcon } from "@/lib/icons";
import { PAY_METHODS, type Currency, type PayMethod, type TxType } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";
import type { Account } from "@/lib/types";
import { useBookAccounts, useBookCards, useLedger, useVisibleCategories } from "@/lib/store";
import { defaultCategory, lastCategory, methodForAccount, rememberCategory } from "@/lib/quick-defaults";
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
    savePurchase,
    removePurchase,
    purchases,
    transactions,
    usdRate,
    usdtRate,
    activeBookId,
    books,
  } = useLedger();
  const accounts = useBookAccounts();
  const cards = useBookCards();
  const statements = useLedger((s) => s.statements);
  const visible = useVisibleCategories();
  const editing = editingId ? transactions.find((t) => t.id === editingId) : null;

  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [amountTo, setAmountTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PayMethod>("debito");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [accountId, setAccountId] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [rate, setRate] = useState("");
  const [cuotas, setCuotas] = useState("1");
  const [interestFree, setInterestFree] = useState(true);
  const [cashPrice, setCashPrice] = useState("");
  const [running, setRunning] = useState(false);
  const [currentNo, setCurrentNo] = useState("2");
  const [confirmDrop, setConfirmDrop] = useState(false);

  const bookKind = books.find((b) => b.id === activeBookId)?.kind;
  const startCategory = (t: TxType) =>
    defaultCategory(
      t,
      bookKind,
      lastCategory(activeBookId, t),
      new Set(visible.filter((c) => c.kind === (t === "income" ? "income" : "expense")).map((c) => c.id)),
    );

  useEffect(() => {
    if (!quickOpen) return;
    const src = editing ?? draft;
    const nextType = src.type ?? "expense";
    const nextCurrency = src.currency ?? "ARS";
    const nextMethod = src.method ?? (nextCurrency === "USDT" ? "crypto" : "debito");
    setType(nextType);
    setAmount(amountInput(src.amount));
    setAmountTo(amountInput(src.amountTo));
    setCategoryId(src.categoryId ?? startCategory(nextType));
    setMerchant(src.merchant ?? "");
    setNote(src.note ?? "");
    setDate(src.date ?? todayISO());
    const nextAccount = src.accountId || inferAccount(accounts, activeBookId, nextMethod, nextCurrency);
    const acc = accounts.find((a) => a.id === nextAccount);
    // No method given (new movement, shortcut with caja=usdt…): follow the caja.
    setMethod(src.method ?? methodForAccount(acc?.kind, nextMethod));
    setCurrency(nextCurrency);
    setAccountId(nextAccount);
    setCounterpartyId(src.counterpartyId ?? "");
    setRate(src.rateLocked && src.rateArs ? amountInput(src.rateArs) : "");
    setCuotas("1");
    setInterestFree(true);
    setCashPrice("");
    setRunning(false);
    setCurrentNo("2");
    setConfirmDrop(false);
    // startCategory reads the latest categories; only re-run when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickOpen, editing, draft, accounts, activeBookId]);

  const fx = { usd: usdRate, usdt: usdtRate };
  const parsed = parseAmount(amount);
  const customRate = parseAmount(rate);
  const fromAcc = accounts.find((a) => a.id === accountId);
  const toAcc = accounts.find((a) => a.id === counterpartyId);
  const liveRate = stampRate(currency, usdRate, usdtRate, customRate ?? undefined);
  const card = type !== "transfer" ? cardForAccount(cards, accountId) : undefined;
  const cardPeriod = card && date ? periodForCard(date, card, statements) : "";
  // Crédito with a card in the book: the caja picker only shows cards.
  const creditOnly = Boolean(card) && method === "credito";
  const moneyCajas = accounts.filter((a) => a.kind !== "card");
  // Cuotas: only for a new expense on a card.
  const showCuotas = !editing && type === "expense" && Boolean(card);
  const nCuotas = showCuotas ? Math.max(1, Math.min(72, Math.round(Number(cuotas) || 1))) : 1;
  const inCuotas = showCuotas && nCuotas > 1;
  const perCuota = inCuotas && !interestFree;
  const cuotaPreview =
    inCuotas && parsed
      ? installmentAmounts({ installments: nCuotas, installmentAmount: parsed, total: parsed, interestFree })
      : [];
  const cash = parseAmount(cashPrice) ?? 0;
  const cost = perCuota && parsed && cash > 0 ? financingCost(cash, parsed, nCuotas) : null;
  const editingCuota = editing?.purchaseId ? purchases.find((p) => p.id === editing.purchaseId) : undefined;
  const cardCajas = accounts.filter((a) => a.kind === "card");

  const cats = useMemo(
    () => (type === "transfer" ? [] : visible.filter((c) => c.kind === (type === "income" ? "income" : "expense"))),
    [type, visible],
  );

  function setKind(next: TxType) {
    setType(next);
    setCategoryId(startCategory(next));
    if (next === "transfer") setMethod("transferencia");
  }

  function submit() {
    const n = parseAmount(amount);
    if (n == null || n <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (inCuotas && card) {
      if (!categoryId) {
        toast.error("Elegí una categoría");
        return;
      }
      const paidBefore = running && nCuotas > 1 ? Math.max(0, Math.round(Number(currentNo) || 1) - 1) : 0;
      if (paidBefore >= nCuotas) {
        toast.error(`La cuota actual va de 1 a ${nCuotas}`);
        return;
      }
      const cur = fromAcc?.currency === "USD" ? "USD" : "ARS";
      const saved = savePurchase({
        cardId: card.id,
        date,
        merchant: merchant.trim(),
        categoryId,
        currency: cur,
        installments: nCuotas,
        installmentAmount: interestFree ? Math.round((n / nCuotas) * 100) / 100 : n,
        total: interestFree ? n : Math.round(n * nCuotas * 100) / 100,
        interestFree,
        cashPrice: perCuota ? cash : 0,
        paidBefore,
        note: note.trim(),
      });
      if (!saved) return;
      rememberCategory(activeBookId, type, categoryId);
      const left = nCuotas - paidBefore;
      toast.success(
        `Compra en ${nCuotas} cuotas de ${money(saved.installmentAmount, cur)}` +
          (paidBefore ? `. Cargué las ${left} que faltan.` : ". Cada mes cuenta su cuota."),
      );
      closeQuick();
      return;
    }
    if (type === "transfer" && !counterpartyId) {
      toast.error("Elegí a qué caja va");
      return;
    }
    if (type !== "transfer" && !categoryId) {
      toast.error("Elegí una categoría");
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
      rememberCategory(activeBookId, type, payload.categoryId);
      toast.success(type === "expense" ? "Gasto registrado" : type === "income" ? "Ingreso registrado" : "Cambio registrado");
    }
    closeQuick();
  }

  if (editing && editingCuota) {
    return (
      <Drawer open={quickOpen} onOpenChange={(o) => (!o ? closeQuick() : null)} shouldScaleBackground={false}>
        <DrawerContent>
          <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <DrawerTitle>
              Cuota {editing.installmentNo} de {editing.installmentCount}
            </DrawerTitle>
            <DrawerDescription className="mt-1">
              {editingCuota.merchant || "Compra en cuotas"} · {money(editingCuota.total, editingCuota.currency)} en{" "}
              {editingCuota.installments} cuotas. Las cuotas se editan desde la compra, así quedan todas iguales.
            </DrawerDescription>
            <p className="mt-4 font-display text-3xl tabular-nums">{money(editing.amount, editing.currency)}</p>
            <div className="mt-6 grid gap-2">
              <Button asChild>
                <Link to="/tarjetas" hash={`compra-${editingCuota.id}`} onClick={() => closeQuick()}>
                  Editar la compra
                </Link>
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!confirmDrop) {
                    setConfirmDrop(true);
                    return;
                  }
                  removePurchase(editingCuota.id);
                  closeQuick();
                  toast.success("Borré la compra y todas sus cuotas");
                }}
              >
                {confirmDrop ? "¿Seguro? Borrar las " + editingCuota.installments + " cuotas" : "Borrar la compra entera"}
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
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
            <Label htmlFor="amount">
              {type === "transfer" ? "Sale" : perCuota ? "Valor de cada cuota" : inCuotas ? "Total de la compra" : "Monto"}
            </Label>
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
                  cardPeriod: "",
                  purchaseId: "",
                  installmentNo: 0,
                  installmentCount: 0,
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
            <Label htmlFor="account">{type === "transfer" ? "Desde" : creditOnly ? "Tarjeta" : "Caja"}</Label>
            <select
              id="account"
              value={accountId}
              onChange={(e) => {
                const id = e.target.value;
                setAccountId(id);
                const acc = accounts.find((a) => a.id === id);
                if (acc) {
                  setCurrency(acc.currency);
                  if (type !== "transfer") setMethod(methodForAccount(acc.kind, method));
                }
              }}
              className="mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none"
            >
              <CajaOptions cajas={creditOnly ? [] : moneyCajas} cards={cardCajas} />
            </select>
            {card ? (
              <p className="mt-1 text-xs text-subtle">
                Va al resumen que cierra el {dm(closingOf(card, cardPeriod, statements))} y vence el{" "}
                {dm(dueOf(card, cardPeriod, statements))}. No baja tu banco hoy.
              </p>
            ) : type !== "transfer" && method === "credito" && cards.length === 0 ? (
              <p className="mt-1 text-xs text-subtle">
                Cargá tu tarjeta en{" "}
                <Link to="/ajustes" hash="tarjetas" onClick={() => closeQuick()} className="underline">
                  Ajustes → Tarjetas
                </Link>{" "}
                y el gasto con crédito deja de bajar el banco.
              </p>
            ) : null}
          </div>

          {showCuotas ? (
            <div className="mt-4">
              <Label>Cuotas</Label>
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Cuotas">
                {["1", "3", "6", "12", "18"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={cuotas === c}
                    onClick={() => setCuotas(c)}
                    className={cn(
                      "h-11 min-w-11 rounded-full px-3.5 text-sm font-medium",
                      cuotas === c ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                    )}
                  >
                    {c}
                  </button>
                ))}
                <Input
                  aria-label="Otra cantidad de cuotas"
                  inputMode="numeric"
                  className="h-11 w-20"
                  placeholder="Otra"
                  value={["1", "3", "6", "12", "18"].includes(cuotas) ? "" : cuotas}
                  onChange={(e) => setCuotas(e.target.value.replace(/\D/g, "").slice(0, 2) || "1")}
                />
              </div>
              {nCuotas > 1 ? (
                <div className="mt-3 grid gap-3">
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Interés">
                    {[
                      { on: true, label: "Sin interés" },
                      { on: false, label: "Con interés" },
                    ].map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        aria-pressed={interestFree === o.on}
                        onClick={() => setInterestFree(o.on)}
                        className={cn(
                          "h-11 rounded-lg text-sm font-medium",
                          interestFree === o.on ? "bg-elevated text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.16)]" : "bg-elevated text-muted",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {perCuota ? (
                    <div>
                      <Label htmlFor="cash">Precio de contado (opcional)</Label>
                      <Input id="cash" className="mt-1.5" inputMode="decimal" value={cashPrice} onChange={(e) => setCashPrice(e.target.value)} placeholder="Para ver cuánto te cuesta financiar" />
                    </div>
                  ) : null}
                  <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
                    <input type="checkbox" className="size-4" checked={running} onChange={(e) => setRunning(e.target.checked)} />
                    Es una compra que ya venía pagando
                  </label>
                  {running ? (
                    <div>
                      <Label htmlFor="curno">¿Por qué cuota vas este mes?</Label>
                      <Input id="curno" className="mt-1.5" inputMode="numeric" value={currentNo} onChange={(e) => setCurrentNo(e.target.value.replace(/\D/g, "").slice(0, 2))} />
                      <p className="mt-1 text-xs text-subtle">Cifra carga desde esa cuota hasta la última. La fecha es la de esta cuota.</p>
                    </div>
                  ) : null}
                  {cuotaPreview.length ? (
                    <p className="text-xs tabular-nums text-subtle">
                      {nCuotas} cuotas de {money(cuotaPreview[0]!, fromAcc?.currency ?? "ARS")}
                      {perCuota ? ` · total ${money(parsed! * nCuotas, fromAcc?.currency ?? "ARS")}` : ""}. Cada mes cuenta su
                      cuota en el presupuesto, desde el mes de {running ? "esta cuota" : "la compra"}.
                      {cost && cost.extra > 0
                        ? ` Pagás ${money(cost.extra, fromAcc?.currency ?? "ARS")} más que de contado (TEA aprox. ${Math.round(cost.tea * 100)} %).`
                        : ""}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {type === "transfer" ? (
            <div className="mt-4">
              <Label htmlFor="to">Hacia</Label>
              <select
                id="to"
                value={counterpartyId}
                onChange={(e) => setCounterpartyId(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none"
              >
                <option value="">Elegí caja</option>
                <CajaOptions
                  cajas={moneyCajas.filter((a) => a.id !== accountId)}
                  cards={cardCajas.filter((a) => a.id !== accountId)}
                />
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
              <div className="mt-3">
                <Label htmlFor="date">Fecha</Label>
                <Input id="date" type="date" className="mt-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
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
                          "inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors duration-150",
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
                        let inferred = inferAccount(accounts, activeBookId, m, currency);
                        const firstCard = cardCajas[0];
                        if (m === "credito" && firstCard && !cardCajas.some((a) => a.id === inferred)) {
                          inferred = firstCard.id;
                          setCurrency(firstCard.currency);
                        }
                        if (inferred) setAccountId(inferred);
                      }}
                      className="mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none"
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
                  const row = editing;
                  deleteTx(row.id);
                  closeQuick();
                  toast.success("Movimiento eliminado", {
                    duration: 8000,
                    action: { label: "Deshacer", onClick: () => addTx(row) },
                  });
                }}
              >
                Eliminar
              </Button>
            ) : null}
            <Button className="flex-1" onClick={submit}>
              {editing ? "Guardar" : inCuotas ? `Registrar ${nCuotas} cuotas` : "Registrar"}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function dm(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Money cajas first, then card cajas grouped under "Tarjetas". */
function CajaOptions({ cajas, cards }: { cajas: Account[]; cards: Account[] }) {
  return (
    <>
      {cajas.map((a) => (
        <option key={a.id} value={a.id}>
          {accountLabel(a)}
        </option>
      ))}
      {cards.length ? (
        <optgroup label="Tarjetas">
          {cards.map((a) => (
            <option key={a.id} value={a.id}>
              {accountLabel(a)}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}
