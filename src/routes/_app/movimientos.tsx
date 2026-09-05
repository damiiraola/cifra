import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CATEGORIES, CATEGORY_MAP } from "@/lib/categories";
import { money } from "@/lib/format";
import { toARS } from "@/lib/analytics";
import { useLedger, useBookTxs } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { TxRow } from "@/components/tx-row";

export const Route = createFileRoute("/_app/movimientos")({
  component: Movimientos,
});

function Movimientos() {
  const { viewMonth, usdRate, usdtRate, openQuick } = useLedger();
  const transactions = useBookTxs();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [kind, setKind] = useState<"all" | "expense" | "income">("all");

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return transactions
      .filter((t) => t.date.startsWith(viewMonth))
      .filter((t) => (kind === "all" ? true : t.type === kind))
      .filter((t) => (cat === "all" ? true : t.categoryId === cat))
      .filter((t) => {
        if (!query) return true;
        const hay = `${t.merchant} ${t.note} ${CATEGORY_MAP[t.categoryId]?.name ?? ""}`.toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [transactions, viewMonth, q, cat, kind]);

  const total = rows
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + toARS(t, { usd: usdRate, usdt: usdtRate }), 0);

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Libro</p>
        <h1 className="font-display text-4xl tracking-tight">Movimientos</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} registros · gastos {money(total, "ARS")}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar comercio, nota, categoría"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="h-11 rounded-lg bg-elevated px-3 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
        >
          <option value="all">Todos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
        </select>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="h-11 rounded-lg bg-elevated px-3 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
        >
          <option value="all">Categoría</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-3xl bg-surface p-2 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-3">
        {rows.map((tx) => (
          <TxRow key={tx.id} tx={tx} showDate onClick={() => openQuick(tx)} />
        ))}
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Nada coincide con el filtro.</p>
        ) : null}
      </section>
    </div>
  );
}
