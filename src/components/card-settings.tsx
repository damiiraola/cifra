import { useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { accountBalance, accountLabel } from "@/lib/books";
import { cardDebt, lastClosedStatement, openStatement, validLast4 } from "@/lib/card-math";
import { amountInput, money, parseAmount } from "@/lib/format";
import { argentinaDay } from "@/lib/market-hours";
import { useBookAccounts, useBookCards, useBookTxs, useLedger, type CardInput } from "@/lib/store";
import { CARD_NETWORKS, type Card, type CardNetwork } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SELECT =
  "mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none";

function dm(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function both(ars: number, usd: number) {
  return usd > 0 ? `${money(ars, "ARS")} + ${money(usd, "USD")}` : money(ars, "ARS");
}

const EMPTY: CardInput = {
  name: "",
  bank: "",
  network: "visa",
  last4: "",
  closingDay: 23,
  dueDay: 5,
  limitArs: 0,
  payAccountId: "",
  usdPerceptionPct: 30,
};

/** Ajustes → Tarjetas: list, create, edit and remove credit cards of the active book. */
export function CardSettings() {
  const cards = useBookCards();
  const [editing, setEditing] = useState<CardInput | null>(null);
  const [confirmId, setConfirmId] = useState("");
  const archiveCard = useLedger((s) => s.archiveCard);

  return (
    <div>
      <p className="text-xs text-subtle">
        Lo que comprás con crédito va a la tarjeta, no al banco, y cuenta en el mes en que comprás. Pagar el
        resumen es un Cambio del banco a la tarjeta (no es un gasto).
      </p>
      <div className="mt-4 grid gap-2">
        {cards.map((c) =>
          editing?.id === c.id ? (
            <CardForm key={c.id} initial={editing} onDone={() => setEditing(null)} />
          ) : (
            <CardRow
              key={c.id}
              card={c}
              confirming={confirmId === c.id}
              onEdit={() => {
                setConfirmId("");
                setEditing({ ...c });
              }}
              onRemove={() => {
                if (confirmId !== c.id) {
                  setConfirmId(c.id);
                  return;
                }
                archiveCard(c.id);
                setConfirmId("");
                toast.success("Quité la tarjeta. Sus movimientos quedan en el libro.");
              }}
            />
          ),
        )}
        {cards.length === 0 && !editing ? (
          <p className="text-sm text-muted">Todavía no cargaste ninguna tarjeta.</p>
        ) : null}
      </div>
      {editing && !editing.id ? (
        <CardForm initial={editing} onDone={() => setEditing(null)} />
      ) : (
        <Button
          variant="secondary"
          className="mt-4 w-full sm:w-auto"
          onClick={() => {
            setConfirmId("");
            setEditing({ ...EMPTY });
          }}
        >
          Agregar tarjeta
        </Button>
      )}
    </div>
  );
}

function CardRow({
  card,
  confirming,
  onEdit,
  onRemove,
}: {
  card: Card;
  confirming: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const txs = useBookTxs();
  const accounts = useBookAccounts();
  const today = argentinaDay();
  const statements = useLedger((s) => s.statements);
  const open = openStatement(card, txs, today, statements);
  const closed = lastClosedStatement(card, txs, today, statements);
  const ars = accounts.find((a) => a.id === card.accountArsId);
  const usd = accounts.find((a) => a.id === card.accountUsdId);
  const owesArs = ars ? cardDebt(ars, accountBalance(ars, txs)) : 0;
  const owesUsd = usd ? cardDebt(usd, accountBalance(usd, txs)) : 0;
  const network = CARD_NETWORKS.find((n) => n.id === card.network)?.label ?? "";
  return (
    <div className="rounded-xl bg-elevated p-3">
      <div className="flex items-start gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
          <CreditCard className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{card.name}</p>
          <p className="text-xs text-muted">
            {[network, card.last4 ? `•••• ${card.last4}` : "", `cierra el ${card.closingDay}, vence el ${card.dueDay}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      <dl className="mt-3 grid gap-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Próximo resumen</dt>
          <dd className="text-right tabular-nums">{both(open.ars, open.usd)}</dd>
        </div>
        <p className="text-xs text-subtle">
          Cierra el {dm(open.closing)} y vence el {dm(open.due)}. Lo que compres después del {dm(open.closing)} va al
          siguiente.
        </p>
        {closed.ars > 0 || closed.usd > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Resumen cerrado (vence {dm(closed.due)})</dt>
            <dd className="text-right tabular-nums">{both(closed.ars, closed.usd)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Debés en total</dt>
          <dd className="text-right tabular-nums">{both(owesArs, owesUsd)}</dd>
        </div>
        {card.limitArs > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Límite de compra</dt>
            <dd className="text-right tabular-nums">{money(card.limitArs, "ARS")}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" className="h-11 flex-1" onClick={onEdit}>
          Editar
        </Button>
        <Button variant={confirming ? "danger" : "ghost"} size="sm" className="h-11 flex-1" onClick={onRemove}>
          {confirming ? "¿Seguro? Quitar" : "Quitar"}
        </Button>
      </div>
    </div>
  );
}

function CardForm({ initial, onDone }: { initial: CardInput; onDone: () => void }) {
  const upsertCard = useLedger((s) => s.upsertCard);
  const accounts = useBookAccounts();
  const payFrom = accounts.filter((a) => a.kind !== "card" && a.currency === "ARS");
  const [name, setName] = useState(initial.name);
  const [bank, setBank] = useState(initial.bank);
  const [network, setNetwork] = useState<CardNetwork>(initial.network);
  const [last4, setLast4] = useState(initial.last4);
  const [closing, setClosing] = useState(String(initial.closingDay));
  const [due, setDue] = useState(String(initial.dueDay));
  const [limit, setLimit] = useState(amountInput(initial.limitArs || undefined));
  const [payAccountId, setPayAccountId] = useState(
    initial.payAccountId || payFrom.find((a) => a.kind === "bank")?.id || "",
  );
  const [pct, setPct] = useState(String(initial.usdPerceptionPct));
  const idp = initial.id ?? "new";

  function save() {
    const closingDay = Number(closing);
    const dueDay = Number(due);
    const perception = Number(pct.replace(",", "."));
    if (name.trim().length < 2) return toast.error("Poné un nombre, por ejemplo Visa Galicia");
    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
      return toast.error("El día de cierre va de 1 a 31");
    }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return toast.error("El día de vencimiento va de 1 a 31");
    if (last4.trim() && !validLast4(last4)) return toast.error("Solo los últimos 4 números, o dejalo vacío");
    if (!Number.isFinite(perception) || perception < 0 || perception > 100) {
      return toast.error("La percepción va de 0 a 100 %");
    }
    const saved = upsertCard({
      id: initial.id,
      name,
      bank,
      network,
      last4: validLast4(last4),
      closingDay,
      dueDay,
      limitArs: parseAmount(limit) ?? 0,
      payAccountId,
      usdPerceptionPct: perception,
    });
    if (!saved) return;
    toast.success(initial.id ? "Tarjeta actualizada" : "Tarjeta lista. Elegila con Crédito en Nuevo.");
    onDone();
  }

  return (
    <form
      className="mt-4 grid gap-3 rounded-xl bg-elevated p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-sm font-medium">{initial.id ? "Editar tarjeta" : "Nueva tarjeta"}</p>
      <div>
        <Label htmlFor={`cn-${idp}`}>Nombre</Label>
        <Input id={`cn-${idp}`} className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Visa Galicia" maxLength={60} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`cr-${idp}`}>Red</Label>
          <select id={`cr-${idp}`} className={SELECT} value={network} onChange={(e) => setNetwork(e.target.value as CardNetwork)}>
            {CARD_NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`c4-${idp}`}>Últimos 4 (opcional)</Label>
          <Input id={`c4-${idp}`} className="mt-1.5" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} placeholder="1234" />
        </div>
      </div>
      <div>
        <Label htmlFor={`cb-${idp}`}>Banco (opcional)</Label>
        <Input id={`cb-${idp}`} className="mt-1.5" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Galicia" maxLength={60} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`cc-${idp}`}>Día de cierre</Label>
          <Input id={`cc-${idp}`} className="mt-1.5" inputMode="numeric" value={closing} onChange={(e) => setClosing(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </div>
        <div>
          <Label htmlFor={`cv-${idp}`}>Día de vencimiento</Label>
          <Input id={`cv-${idp}`} className="mt-1.5" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </div>
      </div>
      <p className="-mt-1 text-xs text-subtle">Están en tu resumen ("cierre actual" y "vencimiento").</p>
      <div>
        <Label htmlFor={`cl-${idp}`}>Límite de compra en ARS (opcional)</Label>
        <Input id={`cl-${idp}`} className="mt-1.5" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0" />
      </div>
      <div>
        <Label htmlFor={`cp-${idp}`}>La pagás desde</Label>
        <select id={`cp-${idp}`} className={SELECT} value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)}>
          <option value="">Sin elegir</option>
          {payFrom.map((a) => (
            <option key={a.id} value={a.id}>
              {accountLabel(a)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`cu-${idp}`}>Percepción en dólares pagando en pesos (%)</Label>
        <Input id={`cu-${idp}`} className="mt-1.5" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        <p className="mt-1 text-xs text-subtle">
          Para cuando pagues el resumen desde Cifra (llega en una próxima versión): si pagás en pesos un consumo en
          dólares, Cifra calcula este porcentaje y lo anota como gasto en Impuestos. Con tus dólares no hay percepción.
          Hoy suele ser 30 %.
        </p>
      </div>
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
