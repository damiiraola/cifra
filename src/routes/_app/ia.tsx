import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { askCifra } from "@/lib/ai";
import { computeMonth, snapshotText } from "@/lib/analytics";
import { todayISO, uid } from "@/lib/utils";
import { useLedger, useBookTxs, useAllCategories } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type { PayMethod, TxType, Currency } from "@/lib/types";
import { CATEGORY_MAP } from "@/lib/categories";

export const Route = createFileRoute("/_app/ia")({
  component: Asistente,
});

const SUGGESTIONS = [
  "¿Dónde más estoy gastando este mes?",
  "Armame un plan para recortar 20%",
  "¿Me voy a pasar el presupuesto?",
  "Compará alimentación vs el mes pasado",
  "Gasté 15 mil en Coto con Mercado Pago",
];

export function Asistente() {
  const {
    viewMonth,
    usdRate,
    usdtRate,
    budgets,
    globalBudget,
    chat,
    pushChat,
    clearChat,
    openQuick,
  } = useLedger();
  const transactions = useBookTxs();
  const allCats = useAllCategories();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [parseMode, setParseMode] = useState(false);

  const snapshot = useMemo(() => {
    const fx = { usd: usdRate, usdt: usdtRate };
    const cur = computeMonth(transactions, viewMonth, fx);
    const prevYm = shift(viewMonth);
    const prev = computeMonth(transactions, prevYm, fx);
    return snapshotText(cur, prev, budgets, globalBudget, fx, allCats);
  }, [transactions, viewMonth, usdRate, usdtRate, budgets, globalBudget, allCats]);

  async function send(message: string, mode: "chat" | "parse" | "report" = "chat") {
    const trimmed = message.trim();
    if (!trimmed && mode === "chat") return;
    if (pending) return;
    setPending(true);
    if (mode !== "parse") {
      pushChat({
        id: uid(),
        role: "user",
        content:
          mode === "report" ? "Informe del mes" : trimmed,
        createdAt: new Date().toISOString(),
      });
    }
    setText("");
    try {
      const history = chat.map((m) => ({ role: m.role, content: m.content }));
      const res = await askCifra({
        data: {
          mode,
          message: trimmed,
          snapshot,
          history,
          categories: allCats.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (mode === "parse") {
        const parsed = parseTx(
          res.text,
          new Set(allCats.map((c) => c.id)),
        );
        if (!parsed) {
          toast.error("No pude armar el movimiento. Probá ser más específico.");
          return;
        }
        openQuick(parsed);
        toast.success("Revisá y confirmá el movimiento");
        return;
      }
      pushChat({
        id: uid(),
        role: "assistant",
        content: res.text,
        createdAt: new Date().toISOString(),
      });
    } catch {
      toast.error("Falló la consulta a la IA.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Grok</p>
          <h1 className="font-display text-4xl tracking-tight">Asistente</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => send("informe", "report")}>
            Informe del mes
          </Button>
          {chat.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearChat}>
              Limpiar
            </Button>
          ) : null}
        </div>
      </div>

      <p className="max-w-xl text-sm text-muted">
        Analiza tu libro del mes en curso: desvíos, proyección y recortes. También podés dictar un
        gasto o pegar un mensaje de WhatsApp.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            onClick={() => send(s)}
            className="h-9 rounded-full bg-elevated px-3 text-[13px] text-muted transition-colors duration-150 hover:text-fg"
          >
            {s}
          </button>
        ))}
      </div>

      <section className="min-h-72 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        {chat.length === 0 && !pending ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <p className="font-display text-2xl tracking-tight">Preguntale a tu libro</p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              No se envía tu historial completo: solo un resumen del mes y los últimos movimientos,
              cuando vos lo pedís.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {chat.map((m) => (
              <article
                key={m.id}
                className={
                  m.role === "user"
                    ? "ml-8 rounded-2xl bg-elevated px-4 py-3 text-sm"
                    : "mr-4"
                }
              >
                {m.role === "assistant" ? (
                  <p className="mb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
                    Cifra
                  </p>
                ) : null}
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{m.content}</div>
              </article>
            ))}
            {pending ? <p className="text-sm text-muted">Pensando…</p> : null}
          </div>
        )}
      </section>

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text, parseMode ? "parse" : "chat");
        }}
      >
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={parseMode}
            onChange={(e) => setParseMode(e.target.checked)}
            className="size-4 accent-accent"
          />
          Interpretar como movimiento (ej. “15 mil en el super ayer con débito”)
        </label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={parseMode ? "Gasté 12.400 en YPF con Mercado Pago" : "Escribí una pregunta sobre tus gastos"}
          rows={3}
        />
        <Button type="submit" disabled={pending || !text.trim()}>
          {parseMode ? "Armar movimiento" : "Preguntar"}
        </Button>
      </form>
    </div>
  );
}

function shift(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseTx(raw: string, allowed: Set<string>) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const j = JSON.parse(match[0]) as {
      type?: string;
      amount?: number;
      currency?: string;
      categoryId?: string;
      merchant?: string;
      note?: string;
      date?: string | null;
      method?: string;
    };
    if (!j.amount || j.amount <= 0) return null;
    const type: TxType = j.type === "income" ? "income" : "expense";
    const categoryId =
      j.categoryId && (allowed.has(j.categoryId) || CATEGORY_MAP[j.categoryId])
        ? j.categoryId
        : type === "income"
          ? "otros-ing"
          : "otros";
    return {
      type,
      amount: j.amount,
      currency: (j.currency === "USDT" ? "USDT" : j.currency === "USD" ? "USD" : "ARS") as Currency,
      categoryId,
      merchant: j.merchant ?? "",
      note: j.note ?? "",
      date: j.date && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : todayISO(),
      method: (j.method as PayMethod) || "otro",
    };
  } catch {
    return null;
  }
}
