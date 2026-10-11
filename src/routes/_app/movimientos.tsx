import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { dayLabel, money, monthLabel } from "@/lib/format";
import {
  useAllCategories,
  useBookAccounts,
  useBookCards,
  useBookTxs,
  useLedger,
} from "@/lib/store";
import {
  canDelete,
  downloadCsv,
  filterTxs,
  txCsv,
  txMonths,
  txTotals,
  type TxFilter,
} from "@/lib/tx-filter";
import { TxRow } from "@/components/tx-row";
import { Input } from "@/components/ui/input";
import { cn, todayISO } from "@/lib/utils";
import type { Currency, Transaction } from "@/lib/types";

export const Route = createFileRoute("/_app/movimientos")({
  component: Movimientos,
});

const SELECT =
  "h-10 min-w-0 rounded-lg bg-elevated px-2.5 text-sm text-fg shadow-[0_0_0_1px_rgb(var(--fg-rgb)/0.08)] outline-none";
const PAGE = 100;

/** Todos los movimientos, con búsqueda, filtros, editar, borrar con Deshacer y CSV. */
function Movimientos() {
  const txs = useBookTxs();
  const cats = useAllCategories();
  const accounts = useBookAccounts();
  const cards = useBookCards();
  const openQuick = useLedger((s) => s.openQuick);
  const deleteTx = useLedger((s) => s.deleteTx);
  const addTx = useLedger((s) => s.addTx);
  const [f, setF] = useState<TxFilter>({
    q: "",
    month: "",
    category: "",
    account: "",
    card: "",
    currency: "",
  });
  const [limit, setLimit] = useState(PAGE);
  const set = (k: keyof TxFilter, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setLimit(PAGE);
  };
  const ctx = useMemo(() => ({ cards, categories: cats, accounts }), [cards, cats, accounts]);
  const shown = useMemo(() => filterTxs(txs, f, ctx), [txs, f, ctx]);
  const months = useMemo(() => txMonths(txs), [txs]);
  const totals = txTotals(shown);
  const cajas = accounts.filter((a) => a.kind !== "card");
  const currencies = [...new Set(txs.map((t) => t.currency))] as Currency[];
  const active = Object.values(f).some(Boolean);
  const today = todayISO();

  const remove = (t: Transaction) => {
    deleteTx(t.id);
    toast.success("Movimiento eliminado", {
      duration: 8000,
      action: { label: "Deshacer", onClick: () => addTx(t) },
    });
  };

  const groups: [string, Transaction[]][] = [];
  for (const t of shown.slice(0, limit)) {
    const g = groups.at(-1);
    if (g && g[0] === t.date) g[1].push(t);
    else groups.push([t.date, [t]]);
  }

  return (
    <div className="mx-auto grid w-full max-w-2xl min-w-0 grid-cols-1 gap-4 px-4 py-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Todos</p>
          <h1 className="font-display text-4xl tracking-tight">Movimientos</h1>
        </div>
        <button
          type="button"
          disabled={!shown.length}
          onClick={() => downloadCsv(txCsv(shown, cats, accounts))}
          className="flex h-10 items-center gap-2 rounded-lg bg-elevated px-3 text-sm font-medium text-fg disabled:opacity-50"
        >
          <Download className="size-4" />
          CSV
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input
          aria-label="Buscar movimientos"
          placeholder="Buscar comercio, nota o monto"
          value={f.q}
          onChange={(e) => set("q", e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select
          aria-label="Mes"
          className={SELECT}
          value={f.month}
          onChange={(e) => set("month", e.target.value)}
        >
          <option value="">Todos los meses</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <select
          aria-label="Categoría"
          className={SELECT}
          value={f.category}
          onChange={(e) => set("category", e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Caja"
          className={SELECT}
          value={f.account}
          onChange={(e) => set("account", e.target.value)}
        >
          <option value="">Todas las cajas</option>
          {cajas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {cards.length ? (
          <select
            aria-label="Tarjeta"
            className={SELECT}
            value={f.card}
            onChange={(e) => set("card", e.target.value)}
          >
            <option value="">Todas las tarjetas</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <select
          aria-label="Moneda"
          className={SELECT}
          value={f.currency}
          onChange={(e) => set("currency", e.target.value)}
        >
          <option value="">Todas las monedas</option>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {active ? (
          <button
            type="button"
            onClick={() =>
              setF({ q: "", month: "", category: "", account: "", card: "", currency: "" })
            }
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm text-muted hover:bg-elevated"
          >
            <X className="size-4" />
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        {shown.length === 1 ? "1 movimiento" : `${shown.length} movimientos`}
        {(Object.entries(totals) as [Currency, { out: number; in: number }][])
          .map(([c, t]) => ` · ${c}: −${money(t.out, c)}${t.in ? ` / +${money(t.in, c)}` : ""}`)
          .join("")}
      </p>

      {!txs.length ? (
        <div className="rounded-2xl bg-surface p-6 text-center text-sm text-muted">
          Todavía no cargaste movimientos. Tocá + para el primero o subí un resumen desde Tarjetas.
        </div>
      ) : !shown.length ? (
        <div className="rounded-2xl bg-surface p-6 text-center text-sm text-muted">
          Nada coincide con esos filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {groups.map(([day, rows]) => (
            <section key={day}>
              <h2 className="px-2 pb-1 text-xs font-medium text-subtle first-letter:uppercase">
                {dayLabel(day, "EEEE d 'de' LLLL")}
              </h2>
              <div className="rounded-2xl bg-surface p-1">
                {rows.map((t) => (
                  <div key={t.id} className="flex items-center">
                    <div className="min-w-0 flex-1">
                      <TxRow tx={t} onClick={() => openQuick(t)} />
                    </div>
                    {canDelete(t, today) ? (
                      <button
                        type="button"
                        aria-label={`Borrar ${t.merchant || t.note || "movimiento"}`}
                        onClick={() => remove(t)}
                        className={cn(
                          "grid size-11 shrink-0 place-items-center rounded-lg text-subtle hover:bg-elevated hover:text-expense",
                        )}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : (
                      <span className="size-11 shrink-0" aria-hidden />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
          {shown.length > limit ? (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="h-11 rounded-xl bg-elevated text-sm font-medium"
            >
              Ver {Math.min(PAGE, shown.length - limit)} más
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
