import { useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import { saveCards } from "@/lib/ledger-api";
import {
  applyCardChanges,
  cardChanges,
  cardDraftFrom,
  debtFromBefore,
  EMPTY_CARD_INFO,
  matchCard,
  missingFields,
  type CardDraft,
  type DraftField,
} from "@/lib/statement-card";
import { validLast4 } from "@/lib/card-math";
import { amountInput, money, parseAmount } from "@/lib/format";
import {
  clearDraft,
  draftStorage,
  loadDraft,
  saveDraft,
  UPLOAD_DRAFT_KEY,
} from "@/lib/statement-draft";
import { useBookAccounts, useBookCards, useLedger } from "@/lib/store";
import { CARD_NETWORKS, type Card, type CardNetwork } from "@/lib/types";
import { accountLabel } from "@/lib/books";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PdfUpload, Review, type Read } from "@/components/statement-import";
import { toast } from "sonner";

const NEW = "nueva";

const SELECT =
  "mt-1.5 h-11 w-full rounded-lg bg-surface px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)] outline-none";

/**
 * «Subir resumen PDF» with no card needed: Cifra reads the PDF, recognises
 * the card (or proposes a new one with the PDF's data) and shows one review
 * screen. Nothing is saved until the user confirms.
 */
export function CardFromPdf({ onClose }: { onClose: () => void }) {
  const [read, setReadState] = useState<Read | null>(() => {
    const st = draftStorage();
    return st ? loadDraft<Read>(st, UPLOAD_DRAFT_KEY) : null;
  });
  const setRead = (r: Read | null) => {
    const st = draftStorage();
    if (st) {
      if (r) saveDraft(st, UPLOAD_DRAFT_KEY, r);
      else clearDraft(st, UPLOAD_DRAFT_KEY);
    }
    setReadState(r);
  };
  const close = () => {
    const st = draftStorage();
    if (st) clearDraft(st, UPLOAD_DRAFT_KEY);
    onClose();
  };

  if (read) return <CardReview read={read} onClose={close} onRetry={() => setRead(null)} />;
  return (
    <PdfUpload
      idp="subir"
      cardId=""
      title="Subir resumen PDF"
      intro="Subí el PDF del resumen que bajás del home banking. Cifra lee la tarjeta (banco, red, últimos 4, cierre, vencimiento y límite) y los movimientos con sus cuotas. No hace falta cargar nada antes."
      onRead={setRead}
      onCancel={onClose}
    />
  );
}

function CardReview({
  read,
  onClose,
  onRetry,
}: {
  read: Read;
  onClose: () => void;
  onRetry: () => void;
}) {
  const cards = useBookCards();
  const info = read.card ?? EMPTY_CARD_INFO;
  const st = read.statement;
  const match = useMemo(() => matchCard(info, cards), [info, cards]);
  const [target, setTarget] = useState<string>(() => match?.card.id ?? NEW);
  const [draft, setDraft] = useState<CardDraft>(() => cardDraftFrom(info, st, cards));
  const missing = useMemo(() => new Set(missingFields(info, st)), [info, st]);
  const debt = debtFromBefore(st);
  const [withDebt, setWithDebt] = useState(true);
  const existing = cards.find((c) => c.id === target) ?? null;
  const changes = existing ? cardChanges(existing, draft) : [];
  const [update, setUpdate] = useState(true);
  const upsertCard = useLedger((s) => s.upsertCard);
  const setAccountOpening = useLedger((s) => s.setAccountOpening);
  const accounts = useBookAccounts();
  const payFrom = accounts.filter((a) => a.kind !== "card" && a.currency === "ARS");
  const [payAccountId, setPayAccountId] = useState(
    payFrom.find((a) => a.kind === "bank")?.id ?? "",
  );

  // A new card has no movements yet: the lines are compared with nothing.
  const standIn: Card = existing ?? {
    id: NEW,
    bookId: "",
    name: draft.name || "Tarjeta nueva",
    bank: draft.bank,
    network: draft.network,
    last4: draft.last4,
    closingDay: draft.closingDay ?? 1,
    dueDay: draft.dueDay ?? 10,
    limitArs: draft.limitArs,
    accountArsId: "",
    accountUsdId: "",
    payAccountId: "",
    usdPerceptionPct: draft.usdPerceptionPct,
    tna: draft.tna,
    archived: false,
  };

  async function prepare(): Promise<Card | null> {
    if (existing) {
      if (!changes.length || !update) return existing;
      const next = applyCardChanges(existing, draft, changes);
      const saved = upsertCard({ ...next });
      if (!saved) return null;
      await saveCards({ data: [saved] });
      return saved;
    }
    if (draft.name.trim().length < 2)
      return fail("Poné un nombre para la tarjeta, por ejemplo Visa Galicia");
    if (!draft.closingDay || draft.closingDay < 1 || draft.closingDay > 31)
      return fail("Completá el día de cierre (1 a 31)");
    if (!draft.dueDay || draft.dueDay < 1 || draft.dueDay > 31)
      return fail("Completá el día de vencimiento (1 a 31)");
    if (draft.last4 && !validLast4(draft.last4))
      return fail("Solo los últimos 4 números, o dejalo vacío");
    const card = upsertCard({
      name: draft.name,
      bank: draft.bank,
      network: draft.network,
      last4: validLast4(draft.last4),
      closingDay: draft.closingDay,
      dueDay: draft.dueDay,
      limitArs: draft.limitArs,
      payAccountId,
      usdPerceptionPct: draft.usdPerceptionPct,
      tna: draft.tna,
    });
    if (!card) return null;
    // The statement, purchases and movements need the card on the server first.
    await saveCards({ data: [card] });
    if (withDebt && debt.ars > 0) setAccountOpening(card.accountArsId, -debt.ars);
    if (withDebt && debt.usd > 0) setAccountOpening(card.accountUsdId, -debt.usd);
    return card;
  }

  const top = (
    <section aria-label="Tarjeta del resumen" className="grid gap-3">
      <div className="flex items-start gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
          <CreditCard className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {existing
              ? match?.card.id === existing.id
                ? `Es tu ${existing.name}`
                : `Lo cargo en ${existing.name}`
              : "Tarjeta nueva, con los datos del resumen"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {existing
              ? match?.card.id === existing.id && match.how === "probable"
                ? "Coincide la red y el banco. Si no es esta, elegí otra abajo."
                : "Lo que ya tenías cargado no se duplica."
              : "Revisá los datos. Lo marcado no estaba en el PDF: completalo."}
          </p>
        </div>
      </div>

      {cards.length ? (
        <div>
          <Label htmlFor="pdf-target">Tarjeta</Label>
          <select
            id="pdf-target"
            className={SELECT}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.last4 ? ` •••• ${c.last4}` : ""}
              </option>
            ))}
            <option value={NEW}>Crear una tarjeta nueva</option>
          </select>
        </div>
      ) : null}

      {existing ? (
        changes.length ? (
          <label className="flex min-h-11 items-center gap-2 rounded-lg bg-surface p-3 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={update}
              onChange={(e) => setUpdate(e.target.checked)}
            />
            Actualizar {changes.map((c) => c.label).join(", ")} con lo que dice el resumen
          </label>
        ) : null
      ) : (
        <CardFields
          draft={draft}
          setDraft={setDraft}
          missing={missing}
          payFrom={payFrom}
          payAccountId={payAccountId}
          setPayAccountId={setPayAccountId}
        />
      )}

      {!existing && (debt.ars > 0 || debt.usd > 0) ? (
        <label className="flex min-h-11 items-start gap-2 rounded-lg bg-surface p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5"
            checked={withDebt}
            onChange={(e) => setWithDebt(e.target.checked)}
          />
          <span>
            Del resumen anterior quedaron sin pagar {money(debt.ars, "ARS")}
            {debt.usd > 0 ? ` + ${money(debt.usd, "USD")}` : ""}. Cargarlo como deuda de la tarjeta
            (no es un gasto de este mes).
          </span>
        </label>
      ) : null}
    </section>
  );

  return (
    <Review
      key={target}
      card={standIn}
      read={read}
      onClose={onClose}
      onRetry={onRetry}
      prepare={prepare}
      top={top}
    />
  );
}

function fail(message: string): null {
  toast.error(message);
  return null;
}

const MISSING_HINT: Partial<Record<DraftField, string>> = {
  closingDay: "No lo encontré en el PDF: completalo.",
  dueDay: "No lo encontré en el PDF: completalo.",
};

function CardFields({
  draft,
  setDraft,
  missing,
  payFrom,
  payAccountId,
  setPayAccountId,
}: {
  draft: CardDraft;
  setDraft: (d: CardDraft) => void;
  missing: Set<DraftField>;
  payFrom: ReturnType<typeof useBookAccounts>;
  payAccountId: string;
  setPayAccountId: (id: string) => void;
}) {
  const set = (patch: Partial<CardDraft>) => setDraft({ ...draft, ...patch });
  const [limit, setLimit] = useState(amountInput(draft.limitArs || undefined));
  const [tna, setTna] = useState(draft.tna > 0 ? String(draft.tna).replace(".", ",") : "");
  const mark = (f: DraftField) => (missing.has(f) ? "shadow-[0_0_0_2px_var(--color-expense)]" : "");
  const hint = (f: DraftField, optional = true) =>
    missing.has(f) ? (
      <p className="mt-1 text-xs text-expense">
        {MISSING_HINT[f] ??
          (optional ? "No estaba en el PDF (opcional)." : "No estaba en el PDF: completalo.")}
      </p>
    ) : null;
  const day = (v: string) => {
    const n = Number(v.replace(/\D/g, "").slice(0, 2));
    return n ? n : null;
  };
  return (
    <div className="grid gap-3">
      <div>
        <Label htmlFor="nc-name">Nombre</Label>
        <Input
          id="nc-name"
          className="mt-1.5"
          value={draft.name}
          maxLength={60}
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="nc-net">Red</Label>
          <select
            id="nc-net"
            className={cn(SELECT, mark("network"))}
            value={draft.network}
            onChange={(e) => set({ network: e.target.value as CardNetwork })}
          >
            {CARD_NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          {hint("network", false)}
        </div>
        <div>
          <Label htmlFor="nc-last4">Últimos 4</Label>
          <Input
            id="nc-last4"
            className={cn("mt-1.5", mark("last4"))}
            inputMode="numeric"
            maxLength={4}
            value={draft.last4}
            onChange={(e) => set({ last4: e.target.value.replace(/\D/g, "") })}
          />
          {hint("last4")}
        </div>
      </div>
      <div>
        <Label htmlFor="nc-bank">Banco o emisor</Label>
        <Input
          id="nc-bank"
          className={cn("mt-1.5", mark("bank"))}
          value={draft.bank}
          maxLength={60}
          onChange={(e) => set({ bank: e.target.value })}
        />
        {hint("bank")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="nc-close">Día de cierre</Label>
          <Input
            id="nc-close"
            className={cn("mt-1.5", mark("closingDay"))}
            inputMode="numeric"
            value={draft.closingDay ?? ""}
            onChange={(e) => set({ closingDay: day(e.target.value) })}
          />
          {hint("closingDay", false)}
        </div>
        <div>
          <Label htmlFor="nc-due">Día de vencimiento</Label>
          <Input
            id="nc-due"
            className={cn("mt-1.5", mark("dueDay"))}
            inputMode="numeric"
            value={draft.dueDay ?? ""}
            onChange={(e) => set({ dueDay: day(e.target.value) })}
          />
          {hint("dueDay", false)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="nc-limit">Límite en ARS</Label>
          <Input
            id="nc-limit"
            className={cn("mt-1.5", mark("limitArs"))}
            inputMode="decimal"
            value={limit}
            placeholder="0"
            onChange={(e) => {
              setLimit(e.target.value);
              set({ limitArs: parseAmount(e.target.value) ?? 0 });
            }}
          />
          {hint("limitArs")}
        </div>
        <div>
          <Label htmlFor="nc-tna">TNA (%)</Label>
          <Input
            id="nc-tna"
            className={cn("mt-1.5", mark("tna"))}
            inputMode="decimal"
            value={tna}
            onChange={(e) => {
              setTna(e.target.value);
              const n = Number(e.target.value.replace(",", "."));
              set({ tna: Number.isFinite(n) && n > 0 && n <= 1000 ? n : 0 });
            }}
          />
          {hint("tna")}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="nc-pay">La pagás desde</Label>
          <select
            id="nc-pay"
            className={SELECT}
            value={payAccountId}
            onChange={(e) => setPayAccountId(e.target.value)}
          >
            <option value="">Sin elegir</option>
            {payFrom.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="nc-pct">Percepción USD (%)</Label>
          <Input
            id="nc-pct"
            className="mt-1.5"
            inputMode="decimal"
            value={String(draft.usdPerceptionPct)}
            onChange={(e) => {
              const n = Number(e.target.value.replace(",", "."));
              if (Number.isFinite(n) && n >= 0 && n <= 100) set({ usdPerceptionPct: n });
            }}
          />
        </div>
      </div>
      <p className="-mt-1 text-xs text-subtle">
        Los consumos en dólares que pagues en pesos llevan esta percepción, como en Ajustes. Con tus
        dólares no.
      </p>
    </div>
  );
}
