import { useCallback, useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  betaInvitesReport,
  createBetaInvites,
  removeBetaWaitlist,
  revokeBetaInvite,
  type BetaInvitesReport,
} from "@/lib/beta-api";
import { inviteLink, type InviteRow } from "@/lib/beta-invites";
import { betaPanelMetrics, type PanelMetrics } from "@/lib/beta-feedback-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/panel")({
  component: Panel,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
});

const card = "rounded-3xl bg-surface px-5 py-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]";

/** Only for the owner: invitations, waiting list (and, later, how the beta is going). */
function Panel() {
  const [r, setR] = useState<BetaInvitesReport | null>(null);
  const load = useCallback(() => {
    void betaInvitesReport()
      .then(setR)
      .catch(() => setR({ ok: false }));
  }, []);
  useEffect(load, [load]);

  if (!r) return <p className="text-sm text-muted">Cargando…</p>;
  if (!r.ok) return <p className="text-sm text-muted">No encontrado.</p>;
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Solo para vos</p>
        <h1 className="font-display text-4xl tracking-tight">Beta</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          {r.mode === "abierto"
            ? "El registro está abierto: cualquiera puede crear una cuenta, con o sin invitación."
            : "Cerrada: solo se puede crear una cuenta con invitación. Para abrirla, SIGNUP_MODE=abierto en Vercel."}
        </p>
      </div>
      <Metrics />
      <NewInvites onDone={load} />
      <Invites invites={r.invites} onChange={load} />
      <Waitlist rows={r.waitlist} onChange={load} />
    </div>
  );
}

function NewInvites({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState("1");
  const [uses, setUses] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-medium">Nuevas invitaciones</h2>
      <form
        className={`${card} grid gap-3`}
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void createBetaInvites({ data: { count: Number(count), maxUses: Number(uses), note } })
            .then((x) => {
              if (!x.ok) throw new Error("no");
              toast.success(
                x.codes.length === 1
                  ? "Invitación creada"
                  : `${x.codes.length} invitaciones creadas`,
              );
              setNote("");
              onDone();
            })
            .catch(() => toast.error("No pude crear las invitaciones. Probá de nuevo."))
            .finally(() => setBusy(false));
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="inv-count">Cuántas</Label>
            <Input
              id="inv-count"
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inv-uses">Usos por código</Label>
            <Input
              id="inv-uses"
              inputMode="numeric"
              value={uses}
              onChange={(e) => setUses(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inv-note">Para quién (opcional, solo lo ves vos)</Label>
          <Input
            id="inv-note"
            value={note}
            maxLength={60}
            placeholder="Ej.: grupo de la facu"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Creando…" : "Crear"}
        </Button>
      </form>
    </section>
  );
}

function status(i: InviteRow) {
  if (i.revoked) return "anulada";
  if (i.expiresAt && new Date(i.expiresAt) < new Date()) return "vencida";
  if (i.uses >= i.maxUses) return "usada";
  return i.maxUses > 1 ? `${i.uses} de ${i.maxUses} usos` : "sin usar";
}

function Invites({ invites, onChange }: { invites: InviteRow[]; onChange: () => void }) {
  const origin = typeof window === "undefined" ? "https://cifra.lol" : window.location.origin;
  const used = invites.reduce((s, i) => s + i.uses, 0);
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-medium">
        Invitaciones · {invites.length} {invites.length === 1 ? "código" : "códigos"}, {used}{" "}
        {used === 1 ? "cuenta creada" : "cuentas creadas"}
      </h2>
      <div className={`${card} grid divide-y divide-border`}>
        {invites.length === 0 ? (
          <p className="py-1 text-sm text-muted">Todavía no creaste ninguna.</p>
        ) : null}
        {invites.map((i) => {
          const live = status(i) === "sin usar" || /de \d+ usos/.test(status(i));
          const link = inviteLink(origin, i.code);
          return (
            <div key={i.code} className="grid gap-1.5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-base tracking-wider">{i.code}</span>
                <span className="text-xs text-muted">{status(i)}</span>
              </div>
              {i.note ? <p className="text-xs text-subtle">{i.note}</p> : null}
              {live ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(link)
                        .then(() => toast.success("Link copiado"))
                        .catch(() => toast.error(link));
                    }}
                  >
                    Copiar link
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (!window.confirm(`¿Anular ${i.code}? Nadie más va a poder usarlo.`))
                        return;
                      void revokeBetaInvite({ data: { code: i.code } }).then(onChange);
                    }}
                  >
                    Anular
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Waitlist({
  rows,
  onChange,
}: {
  rows: { email: string; createdAt: string }[];
  onChange: () => void;
}) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-medium">Lista de espera · {rows.length}</h2>
      <div className={`${card} grid divide-y divide-border`}>
        {rows.length === 0 ? <p className="py-1 text-sm text-muted">Nadie todavía.</p> : null}
        {rows.map((w) => (
          <div key={w.email} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">{w.email}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void removeBetaWaitlist({ data: { email: w.email } }).then(onChange)}
            >
              Sacar
            </Button>
          </div>
        ))}
      </div>
      <p className="text-xs text-subtle">
        Para invitar a alguien de la lista, creá un código y mandale el link. Sacalo de la lista
        cuando lo invites.
      </p>
    </section>
  );
}

const usd = (n: number) => `US$ ${n < 0.01 && n > 0 ? n.toFixed(5) : n.toFixed(n < 1 ? 4 : 2)}`;
const FEATURE: Record<string, { label: string; uses: string }> = {
  tarjetas: { label: "Tarjetas", uses: "" },
  pdf: { label: "Resumen PDF", uses: "lecturas" },
  asistente: { label: "Asistente", uses: "consultas" },
  metas: { label: "Metas", uses: "" },
};
const KIND: Record<string, string> = {
  problema: "Problema",
  idea: "Idea",
  comentario: "Comentario",
};
const people = (n: number) => `${n} ${n === 1 ? "persona" : "personas"}`;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <p className="grid gap-0.5">
      <span className="text-[11px] tracking-wide text-muted uppercase">{label}</span>
      <span className="font-display text-2xl tabular-nums">{value}</span>
    </p>
  );
}

/** How the beta is going: aggregates only, plus the comments people sent. */
function Metrics() {
  const [m, setM] = useState<PanelMetrics | null>(null);
  useEffect(() => {
    void betaPanelMetrics()
      .then(setM)
      .catch(() => setM({ ok: false }));
  }, []);
  if (!m) return <p className="text-sm text-muted">Cargando números…</p>;
  if (!m.ok) return null;
  const { invites, users, features, feedback } = m.metrics;
  return (
    <>
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Cómo viene</h2>
        <div className={`${card} grid grid-cols-2 gap-4`}>
          <Stat label="Cuentas" value={users.total} />
          <Stat label="Activas 7 días" value={users.active7} />
          <Stat label="Nuevas 7 días" value={users.new7} />
          <Stat label="Confirmadas" value={users.verified} />
          <Stat label="Invitaciones usadas" value={invites.used} />
          <Stat label="Códigos disponibles" value={invites.usable} />
          <Stat label="Lista de espera" value={invites.waitlist} />
          <Stat label="Comentarios 7 días" value={feedback.last7} />
        </div>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Qué usan</h2>
        <div className={card}>
          {features.map((f) => (
            <div key={f.key} className="flex justify-between gap-3 py-1 text-sm">
              <span className="text-muted">{FEATURE[f.key]!.label}</span>
              <span className="text-right tabular-nums">
                {people(f.users)}
                {f.uses30 != null ? ` · ${f.uses30} ${FEATURE[f.key]!.uses} en 30 días` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Costo de la IA</h2>
        <div className={card}>
          <div className="flex justify-between gap-3 py-1 text-sm">
            <span className="text-muted">Hoy ({m.day})</span>
            <span className="tabular-nums">
              {usd(m.ai.today.usd)} · {m.ai.today.calls} llamadas
            </span>
          </div>
          <div className="flex justify-between gap-3 py-1 text-sm">
            <span className="text-muted">Este mes</span>
            <span className="tabular-nums">
              {usd(m.ai.month.usd)} · {m.ai.month.calls} llamadas
            </span>
          </div>
          <Link
            to="/costos"
            className="mt-1 inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:underline"
          >
            Ver el detalle en Costos
          </Link>
        </div>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Comentarios · {feedback.total}</h2>
        <div className={`${card} grid divide-y divide-border`}>
          {feedback.recent.length === 0 ? (
            <p className="py-1 text-sm text-muted">Todavía no llegó ninguno.</p>
          ) : null}
          {feedback.recent.map((f, i) => (
            <div key={i} className="grid gap-1 py-3 text-sm">
              <p className="flex justify-between gap-3 text-xs text-muted">
                <span>
                  {KIND[f.kind] ?? f.kind}
                  {f.page ? ` · ${f.page}` : ""}
                </span>
                <span>
                  {new Date(f.createdAt).toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </p>
              <p className="whitespace-pre-wrap">{f.message}</p>
              {f.contactOk ? (
                <p className="text-xs text-subtle">
                  Se le puede escribir (el mail está en el aviso).
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
