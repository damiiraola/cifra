import { useState } from "react";
import { toast } from "sonner";
import { financingCost, installmentAmounts } from "@/lib/card-math";
import { amountInput, money, parseAmount } from "@/lib/format";
import { useLedger, useVisibleCategories, type PurchaseInput } from "@/lib/store";
import type { Card, CardPurchase } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SELECT =
  "mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none";

/** New or edit a purchase in cuotas (used in /tarjetas). The app does the math, not the IA. */
export function PurchaseForm({
  card,
  initial,
  onDone,
}: {
  card: Card;
  initial?: CardPurchase;
  onDone: () => void;
}) {
  const savePurchase = useLedger((s) => s.savePurchase);
  const cats = useVisibleCategories("expense");
  const idp = initial?.id ?? "new";
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "compras");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [currency, setCurrency] = useState<"ARS" | "USD">(initial?.currency ?? "ARS");
  const [cuotas, setCuotas] = useState(String(initial?.installments ?? 12));
  const [interestFree, setInterestFree] = useState(initial?.interestFree ?? true);
  const [amount, setAmount] = useState(
    amountInput(initial ? (initial.interestFree ? initial.total : initial.installmentAmount) : undefined),
  );
  const [cashPrice, setCashPrice] = useState(amountInput(initial?.cashPrice || undefined));
  const [running, setRunning] = useState((initial?.paidBefore ?? 0) > 0);
  const [currentNo, setCurrentNo] = useState(String((initial?.paidBefore ?? 1) + 1));
  const [note, setNote] = useState(initial?.note ?? "");

  const n = Math.max(1, Math.min(72, Math.round(Number(cuotas) || 1)));
  const value = parseAmount(amount);
  const cash = parseAmount(cashPrice) ?? 0;
  const preview = value ? installmentAmounts({ installments: n, installmentAmount: value, total: value, interestFree }) : [];
  const cost = !interestFree && value && cash > 0 ? financingCost(cash, value, n) : null;

  function save() {
    if (!value || value <= 0) return toast.error("Ingresá un monto válido");
    if (n < 2) return toast.error("Para una compra en cuotas poné 2 o más");
    const paidBefore = running ? Math.max(0, Math.round(Number(currentNo) || 1) - 1) : 0;
    if (paidBefore >= n) return toast.error(`La cuota actual va de 1 a ${n}`);
    const input: PurchaseInput = {
      id: initial?.id,
      cardId: card.id,
      date,
      merchant: merchant.trim(),
      categoryId,
      currency,
      installments: n,
      installmentAmount: interestFree ? Math.round((value / n) * 100) / 100 : value,
      total: interestFree ? value : Math.round(value * n * 100) / 100,
      interestFree,
      cashPrice: interestFree ? 0 : cash,
      paidBefore,
      note: note.trim(),
    };
    if (!savePurchase(input)) return;
    toast.success(initial ? "Compra actualizada. Rehíce sus cuotas." : `Cargué la compra en ${n} cuotas`);
    onDone();
  }

  return (
    <form
      className="mt-3 grid gap-3 rounded-xl bg-elevated p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-sm font-medium">{initial ? "Editar compra en cuotas" : `Compra en cuotas con ${card.name}`}</p>
      <div>
        <Label htmlFor={`pm-${idp}`}>Qué compraste</Label>
        <Input id={`pm-${idp}`} className="mt-1.5" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Heladera, Frávega…" maxLength={120} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`pc-${idp}`}>Categoría</Label>
          <select id={`pc-${idp}`} className={SELECT} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`pu-${idp}`}>Moneda</Label>
          <select id={`pu-${idp}`} className={SELECT} value={currency} onChange={(e) => setCurrency(e.target.value === "USD" ? "USD" : "ARS")}>
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`pn-${idp}`}>Cuotas</Label>
          <Input id={`pn-${idp}`} className="mt-1.5" inputMode="numeric" value={cuotas} onChange={(e) => setCuotas(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </div>
        <div>
          <Label htmlFor={`pd-${idp}`}>{running ? "Fecha de esta cuota" : "Fecha de compra"}</Label>
          <Input id={`pd-${idp}`} type="date" className="mt-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
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
              interestFree === o.on ? "bg-surface text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.16)]" : "bg-surface text-muted",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div>
        <Label htmlFor={`pa-${idp}`}>{interestFree ? "Total de la compra" : "Valor de cada cuota"}</Label>
        <Input id={`pa-${idp}`} className="mt-1.5" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </div>
      {!interestFree ? (
        <div>
          <Label htmlFor={`pk-${idp}`}>Precio de contado (opcional)</Label>
          <Input id={`pk-${idp}`} className="mt-1.5" inputMode="decimal" value={cashPrice} onChange={(e) => setCashPrice(e.target.value)} placeholder="Para ver cuánto te cuesta financiar" />
        </div>
      ) : null}
      <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
        <input type="checkbox" className="size-4" checked={running} onChange={(e) => setRunning(e.target.checked)} />
        Ya la venía pagando
      </label>
      {running ? (
        <div>
          <Label htmlFor={`pr-${idp}`}>¿Por qué cuota vas este mes?</Label>
          <Input id={`pr-${idp}`} className="mt-1.5" inputMode="numeric" value={currentNo} onChange={(e) => setCurrentNo(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          <p className="mt-1 text-xs text-subtle">Cifra carga desde esa cuota hasta la última.</p>
        </div>
      ) : null}
      <div>
        <Label htmlFor={`po-${idp}`}>Nota (opcional)</Label>
        <Input id={`po-${idp}`} className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </div>
      {preview.length && n > 1 ? (
        <p className="text-xs tabular-nums text-subtle">
          {n} cuotas de {money(preview[0]!, currency)}
          {!interestFree ? ` · total ${money(value! * n, currency)}` : ""}.
          {cost && cost.extra > 0
            ? ` Pagás ${money(cost.extra, currency)} más que de contado (TEA aprox. ${Math.round(cost.tea * 100)} %).`
            : ""}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1">
          Guardar
        </Button>
      </div>
    </form>
  );
}
