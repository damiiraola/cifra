import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { aiCostReport, type CostReport } from "@/lib/ai-cost-api";
import type { CostSummary } from "@/lib/ai-cost";

export const Route = createFileRoute("/_app/costos")({
  component: Costos,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
});

const KIND: Record<string, string> = {
  asistente: "Asistente",
  informe: "Informe",
  pdf: "Resumen PDF",
  movimiento: "Interpretar movimiento",
};
const RESULT: Record<string, string> = {
  ok: "ok",
  plantilla: "plantilla",
  "429": "429 (ritmo)",
  credito: "sin crédito",
  timeout: "timeout",
  error: "error",
  tope: "frenadas por el tope",
};

const usd = (n: number) => `US$ ${n < 0.01 && n > 0 ? n.toFixed(5) : n.toFixed(n < 1 ? 4 : 2)}`;

/** Only for the owner: what the AI cost today and this month (metadata, no texts). */
function Costos() {
  const [r, setR] = useState<CostReport | null>(null);
  useEffect(() => {
    let live = true;
    void aiCostReport()
      .then((x) => live && setR(x))
      .catch(() => live && setR({ ok: false }));
    return () => {
      live = false;
    };
  }, []);

  if (!r) return <p className="text-sm text-muted">Cargando…</p>;
  if (!r.ok) return <p className="text-sm text-muted">No encontrado.</p>;
  const pct = r.capUsd > 0 ? Math.round((r.today.usd / r.capUsd) * 100) : 100;
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Solo para vos</p>
        <h1 className="font-display text-4xl tracking-tight">Costos de la IA</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Hoy ({r.day}) va {usd(r.today.usd)} de un tope de {usd(r.capUsd)} por día ({pct} %).
          Últimos 30 días: {usd(r.last30Usd)} de los US$ 5 gratis del AI Gateway.
        </p>
      </div>
      <Block
        title="Hoy"
        s={r.today}
        extra={`${r.users} ${r.users === 1 ? "usuario" : "usuarios"}`}
      />
      <Block title="Este mes" s={r.month} />
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Últimos 14 días</h2>
        <div className="rounded-3xl bg-surface px-5 py-3 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
          {r.days.length ? (
            r.days.map((d) => (
              <div key={d.day} className="flex justify-between py-1 text-sm">
                <span className="text-muted">{d.day}</span>
                <span className="tabular-nums">
                  {d.calls} · {usd(d.usd)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">Sin llamadas.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Block({ title, s, extra }: { title: string; s: CostSummary; extra?: string }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="rounded-3xl bg-surface px-5 py-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
        <Row label="Costo" value={usd(s.usd)} />
        <Row label="Llamadas" value={String(s.calls)} />
        <Row
          label="Tokens"
          value={`${s.input.toLocaleString("es-AR")} entrada · ${s.output.toLocaleString("es-AR")} salida`}
        />
        {extra ? <Row label="Usaron" value={extra} /> : null}
        {s.byKind.map((k) => (
          <Row key={k.kind} label={KIND[k.kind] ?? k.kind} value={`${k.calls} · ${usd(k.usd)}`} />
        ))}
        {s.byResult.length ? (
          <p className="mt-2 text-xs text-muted">
            {s.byResult.map((x) => `${RESULT[x.result] ?? x.result}: ${x.n}`).join(" · ")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}
