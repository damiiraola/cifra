import { useMemo, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { readStatementPdf, type ReadStatementResult } from "@/lib/statement-api";
import {
  buildImport,
  PDF_AI_UNITS,
  PDF_DAILY_LIMIT,
  PDF_MAX_BYTES,
  reviewLines,
  statementDates,
  type ImportChoice,
  type ReviewLine,
} from "@/lib/statement-import";
import { money, monthLabel } from "@/lib/format";
import { argentinaDay } from "@/lib/market-hours";
import { useBookTxs, useLedger, useVisibleCategories } from "@/lib/store";
import type { Card } from "@/lib/types";
import { clearDraft, draftStorage, loadDraft, saveDraft } from "@/lib/statement-draft";
import { importedBefore } from "@/lib/statement-card";
import { userMessage } from "@/lib/user-error";
import { cn, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Read = Extract<ReadStatementResult, { ok: true }>;

const SELECT =
  "h-9 max-w-[9.5rem] rounded-lg bg-surface px-2 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none";

function dm(iso: string | null) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("No pude leer el archivo"));
    r.onload = () => resolve(String(r.result ?? "").replace(/^data:[^,]*,/, ""));
    r.readAsDataURL(file);
  });
}

/** Upload a statement PDF, review what Cifra read line by line, import what you approve. */
export function StatementImport({ card, onClose }: { card: Card; onClose: () => void }) {
  // A review left open survives a reload (reading the PDF again costs uses).
  const [read, setReadState] = useState<Read | null>(() => {
    const st = draftStorage();
    return st ? loadDraft<Read>(st, card.id) : null;
  });
  const setRead = (r: Read | null) => {
    const st = draftStorage();
    if (st) {
      if (r) saveDraft(st, card.id, r);
      else clearDraft(st, card.id);
    }
    setReadState(r);
  };
  const close = () => {
    const st = draftStorage();
    if (st) clearDraft(st, card.id);
    onClose();
  };

  if (read) return <Review card={card} read={read} onClose={close} onRetry={() => setRead(null)} />;

  return (
    <PdfUpload
      idp={card.id}
      cardId={card.id}
      title="Importar resumen en PDF (beta)"
      intro={`Subí el PDF del resumen de ${card.name} que bajás del home banking. Cifra lee los movimientos, los compara con lo que ya cargaste y vos elegís qué entra.`}
      onRead={setRead}
      onCancel={onClose}
    />
  );
}

/** The file + password form; reads the PDF on the server (cardId "" = Cifra finds the card). */
export function PdfUpload({
  idp,
  cardId,
  title,
  intro,
  onRead,
  onCancel,
}: {
  idp: string;
  cardId: string;
  title: string;
  intro: string;
  onRead: (r: Read) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cats = useVisibleCategories();
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!file) return;
    if (file.size > PDF_MAX_BYTES) {
      setError("El PDF es muy grande (máximo 3 MB).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const pdf = await toBase64(file);
      const res = await readStatementPdf({
        data: { cardId, pdf, password, categories: cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind })) },
      });
      if (!res.ok) setError(res.error);
      else {
        setPassword("");
        onRead(res);
      }
    } catch (err) {
      setError(userMessage(err, "No pude leer el resumen. Probá de nuevo en un rato."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-3 rounded-xl bg-elevated p-3" aria-label="Importar resumen">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted">{intro}</p>
      </div>
      <div>
        <Label htmlFor={`pdf-${idp}`}>PDF del resumen</Label>
        <input
          ref={inputRef}
          id={`pdf-${idp}`}
          type="file"
          accept="application/pdf,.pdf"
          className="mt-1.5 block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-surface file:px-4 file:text-sm file:font-medium file:text-fg"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError("");
          }}
        />
      </div>
      <div>
        <Label htmlFor={`pdfpw-${idp}`}>Clave del PDF (si tiene)</Label>
        <Input
          id={`pdfpw-${idp}`}
          type="password"
          autoComplete="off"
          className="mt-1.5"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Muchos bancos usan tu DNI"
          maxLength={64}
        />
      </div>
      <p className="text-xs text-subtle">
        Usa {PDF_AI_UNITS} de tus usos diarios del asistente (hasta {PDF_DAILY_LIMIT} resúmenes por día). El PDF se lee
        en el servidor y se descarta enseguida: no lo guardamos, tampoco la clave. A la IA le llegan solo los movimientos
        y totales, sin tu nombre, domicilio, CUIT ni número de tarjeta. Solo funciona con PDFs digitales, no con fotos o
        escaneos.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="button" className="flex-1" onClick={() => void submit()} disabled={!file || busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileUp aria-hidden />}
          {busy ? "Leyendo…" : "Leer resumen"}
        </Button>
      </div>
      {busy ? <p className="text-xs text-subtle">Puede tardar hasta un minuto.</p> : null}
    </div>
  );
}

/**
 * One screen to review a statement and confirm it. `card` is the card the
 * lines are compared with (a stand-in with no movements for a card that does
 * not exist yet); `prepare` runs first on confirm and returns the real card
 * (creates or updates it), or null to stop. `top` = the card's data.
 */
export function Review({
  card,
  read,
  onClose,
  onRetry,
  prepare,
  top,
}: {
  card: Card;
  read: Read;
  onClose: () => void;
  onRetry: () => void;
  prepare?: () => Promise<Card | null>;
  top?: React.ReactNode;
}) {
  const txs = useBookTxs();
  const statements = useLedger((s) => s.statements);
  const saveStatement = useLedger((s) => s.saveStatement);
  const savePurchase = useLedger((s) => s.savePurchase);
  const addTx = useLedger((s) => s.addTx);
  const updateTx = useLedger((s) => s.updateTx);
  const expenseCats = useVisibleCategories("expense");
  const st = read.statement;
  const today = argentinaDay();
  const auto = statementDates(st, card, statements, today);
  const [closing, setClosing] = useState(auto.closing);
  const [due, setDue] = useState(auto.due);
  const [force, setForce] = useState(false);
  const [saving, setSaving] = useState(false);

  // Matching runs once, on what was loaded when the PDF came back.
  const review = useMemo(() => {
    const r = reviewLines(st, card, txs);
    return r.map((x, i) => ({ ...x, inText: read.inText[i] ?? true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read]);
  const [choices, setChoices] = useState<Record<string, ImportChoice>>(() =>
    Object.fromEntries(review.map((r) => [r.key, { include: r.status === "new" && r.inText }])),
  );
  const set = (key: string, patch: Partial<ImportChoice>) =>
    setChoices((c) => ({ ...c, [key]: { ...(c[key] ?? { include: false }), ...patch } }));

  const fresh = review.filter((r) => r.status === "new");
  const diffs = review.filter((r) => r.status === "diff");
  const same = review.filter((r) => r.status === "same");
  const picked = fresh.filter((r) => choices[r.key]?.include).length;
  const fixes = diffs.filter((r) => choices[r.key]?.include && !r.matchIsCuota).length;
  const { ars, usd } = read.checks;
  const mismatch = ars.status === "mismatch" || usd.status === "mismatch";
  const period = closing.slice(0, 7);
  const before = importedBefore(statements, card.id, period);

  async function apply() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(closing) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      toast.error("Revisá las fechas de cierre y vencimiento");
      return;
    }
    setSaving(true);
    let target = card;
    if (prepare) {
      const ready = await prepare().catch((err: unknown) => {
        toast.error(userMessage(err, "No pude guardar la tarjeta. Revisá tu conexión y probá de nuevo."));
        return null;
      });
      if (!ready) {
        setSaving(false);
        return;
      }
      target = ready;
    }
    const existing = importedBefore(statements, target.id, period);
    const plan = buildImport({
      st,
      review,
      choices,
      card: target,
      txs,
      dates: { period, closing, due, nextClosing: auto.nextClosing, nextDue: auto.nextDue },
      statementId: existing?.id ?? uid(),
    });
    try {
      await saveStatement(plan.statement);
    } catch (err) {
      setSaving(false);
      toast.error(userMessage(err, "No pude guardar el resumen. Revisá tu conexión y probá de nuevo."));
      return;
    }
    for (const p of plan.purchases) savePurchase(p);
    for (const t of plan.adds) addTx(t);
    for (const f of plan.fixes) updateTx(f.id, { amount: f.amount });
    for (const m of plan.moves) updateTx(m.id, { cardPeriod: m.cardPeriod });
    const n = plan.purchases.length + plan.adds.length;
    toast.success(
      `Guardé el resumen de ${monthLabel(period, "LLLL")}${n ? ` y cargué ${n} movimiento${n === 1 ? "" : "s"}` : ""}.`,
    );
    onClose();
  }

  return (
    <div className="mt-3 grid gap-4 rounded-xl bg-elevated p-3" aria-label="Revisar resumen">
      {top}
      <div>
        <p className="text-sm font-medium">Resumen de {monthLabel(period, "LLLL yyyy").toLowerCase()}</p>
        <p className="mt-0.5 text-xs text-muted">Revisá lo que leí. Nada entra hasta que lo confirmes.</p>
      </div>
      {before ? (
        <p role="status" className="rounded-lg bg-surface p-3 text-sm text-fg">
          Este resumen ya lo importaste. Lo que ya está cargado aparece en «Ya estaban cargados» y no se vuelve a cargar;
          si confirmás, se actualizan los totales del banco.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`stc-${card.id}`}>Cierre</Label>
          <Input id={`stc-${card.id}`} type="date" className="mt-1.5" value={closing} onChange={(e) => setClosing(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`std-${card.id}`}>Vencimiento</Label>
          <Input id={`std-${card.id}`} type="date" className="mt-1.5" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      {auto.guessed ? <p className="text-xs text-expense">No encontré la fecha de cierre en el PDF: revisala.</p> : null}

      <dl className="grid gap-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Total según el banco</dt>
          <dd className="text-right tabular-nums">
            {money(st.totalArs ?? 0, "ARS")}
            {st.totalUsd ? ` + ${money(st.totalUsd, "USD")}` : ""}
          </dd>
        </div>
        {st.minimumArs ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Pago mínimo</dt>
            <dd className="text-right tabular-nums">{money(st.minimumArs, "ARS")}</dd>
          </div>
        ) : null}
        {st.nextClosingDate ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Próximo cierre</dt>
            <dd className="text-right tabular-nums">
              {dm(st.nextClosingDate)} · vence {dm(st.nextDueDate)}
            </dd>
          </div>
        ) : null}
        {st.paymentsArs || st.paymentsUsd ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Pagos del período</dt>
            <dd className="text-right tabular-nums">
              {money(st.paymentsArs ?? 0, "ARS")}
              {st.paymentsUsd ? ` + ${money(st.paymentsUsd, "USD")}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      <div
        role="status"
        className={cn("rounded-lg p-3 text-sm", mismatch ? "bg-expense/15 text-expense" : "bg-surface text-muted")}
      >
        {mismatch ? (
          <>
            <p>
              Las líneas no cierran con el total del banco
              {ars.status === "mismatch"
                ? `: en pesos suman ${money(ars.expected, "ARS")} y el banco dice ${money(ars.bank ?? 0, "ARS")}`
                : ""}
              {usd.status === "mismatch"
                ? `${ars.status === "mismatch" ? ";" : ":"} en dólares suman ${money(usd.expected, "USD")} y el banco dice ${money(usd.bank ?? 0, "USD")}`
                : ""}
              . Puede faltar o sobrar una línea.
            </p>
            <label className="mt-2 flex min-h-11 items-center gap-2 text-fg">
              <input type="checkbox" className="size-5" checked={force} onChange={(e) => setForce(e.target.checked)} />
              Ya lo revisé, importar igual
            </label>
          </>
        ) : ars.status === "unknown" ? (
          <p>No encontré el total del banco para comparar. Revisá las líneas con el PDF.</p>
        ) : (
          <p>Las líneas suman lo mismo que el total del banco (saldo anterior − pagos + consumos).</p>
        )}
      </div>

      <Group title={`Para cargar (${fresh.length})`} empty="Nada nuevo: ya tenías todo cargado.">
        {fresh.map((r) => (
          <Row key={r.key} r={r}>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5"
                aria-label={`Cargar ${r.line.description}`}
                checked={Boolean(choices[r.key]?.include)}
                onChange={(e) => set(r.key, { include: e.target.checked })}
              />
              <span className="text-xs text-muted">Cargar</span>
            </label>
            {r.line.kind !== "refund" ? (
              <select
                aria-label={`Categoría de ${r.line.description}`}
                className={SELECT}
                value={choices[r.key]?.categoryId ?? r.line.categoryId}
                onChange={(e) => set(r.key, { categoryId: e.target.value })}
              >
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-muted">Devolución</span>
            )}
          </Row>
        ))}
      </Group>

      {diffs.length ? (
        <Group title={`Distintos (${diffs.length})`}>
          {diffs.map((r) => (
            <Row key={r.key} r={r}>
              <span className="text-xs text-muted tabular-nums">En Cifra: {money(r.matchAmount, r.line.currency)}</span>
              {r.matchIsCuota ? (
                <span className="text-xs text-subtle">Es una cuota: corregila desde la compra en esta pantalla.</span>
              ) : (
                <label className="flex min-h-11 items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={Boolean(choices[r.key]?.include)}
                    onChange={(e) => set(r.key, { include: e.target.checked })}
                  />
                  Corregir a {money(r.line.amount, r.line.currency)}
                </label>
              )}
            </Row>
          ))}
        </Group>
      ) : null}

      {same.length ? (
        <details className="rounded-lg bg-surface p-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm text-muted">
            Ya estaban cargados ({same.length})
          </summary>
          <ul className="mt-2 grid gap-1 text-xs text-muted">
            {same.map((r) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span className="truncate">{r.line.description}</span>
                <span className="shrink-0 tabular-nums">{money(r.line.amount, r.line.currency)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-xs text-subtle">
        Las cuotas nuevas se cargan como compra en cuotas desde la cuota del resumen. Los pagos no se importan: el pago
        del resumen es un Cambio de tu banco a la tarjeta.
      </p>
      <p className="text-xs text-subtle">
        Si recargás la página, esta revisión sigue acá sin volver a gastar usos: queda en este dispositivo hasta que la
        importes o la canceles (como mucho un día).
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={onRetry} disabled={saving}>
          Otro PDF
        </Button>
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          type="button"
          className="w-full sm:w-auto sm:flex-1"
          disabled={saving || (mismatch && !force)}
          onClick={() => void apply()}
        >
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {picked + fixes
            ? `Importar ${picked + fixes} y guardar resumen`
            : "Guardar resumen"}
        </Button>
      </div>
    </div>
  );
}

function Group({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode }) {
  const list = Array.isArray(children) ? children : [children];
  return (
    <section>
      <h4 className="text-sm font-medium">{title}</h4>
      {list.length === 0 && empty ? <p className="mt-1 text-sm text-muted">{empty}</p> : null}
      <ul className="mt-2 grid gap-2">{children}</ul>
    </section>
  );
}

function Row({ r, children }: { r: ReviewLine; children: React.ReactNode }) {
  const l = r.line;
  return (
    <li className="rounded-lg bg-surface p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm">{l.description}</p>
        <p className={cn("shrink-0 text-sm tabular-nums", l.kind === "refund" && "text-income")}>
          {l.kind === "refund" ? "−" : ""}
          {money(l.amount, l.currency)}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {dm(l.date)}
        {l.installmentNo ? ` · cuota ${l.installmentNo}/${l.installmentCount}` : ""}
        {l.kind === "charge" ? " · cargo del banco" : ""}
      </p>
      {!r.inText ? (
        <p className="mt-1 text-xs text-expense">No encontré este monto en el PDF. Revisalo antes de cargarlo.</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">{children}</div>
    </li>
  );
}
