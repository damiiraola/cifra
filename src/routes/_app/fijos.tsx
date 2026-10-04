import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { money, parseAmount, amountInput } from "@/lib/format";
import { FIJO_TEMPLATES, dueUnposted, isDue, isPosted, likelyDuplicate } from "@/lib/recurring";
import { PAY_METHODS, type AccountKind, type Currency, type PayMethod, type Recurring, type TxType } from "@/lib/types";
import { methodForAccount } from "@/lib/quick-defaults";
import { accountLabel, inferAccount } from "@/lib/books";
import { cn, uid } from "@/lib/utils";
import { useAllCategories, useVisibleCategories, useBookAccounts, useBookTxs, useLedger } from "@/lib/store";
import { MonthSwitcher } from "@/components/month-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/fijos")({
  component: Fijos,
});

function Fijos() {
  const allCats = useAllCategories();
  const {
    recurrings,
    activeBookId,
    viewMonth,
    setViewMonth,
    upsertRecurring,
    deleteRecurring,
    postRecurring,
    pendingRecurringIds,
  } = useLedger();
  const accounts = useBookAccounts();
  const txs = useBookTxs();
  const mine = recurrings.filter((r) => r.bookId === activeBookId);
  const unsaved = useMemo(() => new Set(pendingRecurringIds), [pendingRecurringIds]);
  // Only the ones whose day already came (or the month is over). Future
  // fijos of this month are "programado", not pending.
  const pending = dueUnposted(mine, txs, viewMonth);
  const [editing, setEditing] = useState<Recurring | null>(null);

  function postPending() {
    const twins = pending.filter((r) => likelyDuplicate(r, txs, viewMonth));
    let list = pending;
    if (twins.length) {
      const names = twins.map((r) => r.name).join(", ");
      const all = window.confirm(
        `Parece que ya cargaste a mano: ${names} (mismo monto y categoría este mes).\n\n` +
          "Aceptar: anotar igual todos. Cancelar: anotar solo los demás.",
      );
      if (!all) list = pending.filter((r) => !twins.includes(r));
    }
    let n = 0;
    for (const r of list) {
      if (postRecurring(r.id, viewMonth)) n += 1;
    }
    if (n === 0) toast.message("No anoté ningún fijo");
    else toast.success(n === 1 ? "Anoté 1 fijo" : `Anoté ${n} fijos`);
  }

  const usedNames = new Set(mine.map((r) => r.name.toLowerCase()));
  const templates = FIJO_TEMPLATES.filter((t) => !usedNames.has(t.name.toLowerCase()));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Cada mes</p>
          <h1 className="font-display text-4xl tracking-tight">Fijos</h1>
        </div>
        <MonthSwitcher value={viewMonth} onChange={setViewMonth} />
      </div>

      <p className="max-w-xl text-sm text-muted">
        Alquiler, Edenor, Netflix, sueldo. Cuando llega el día, Cifra te avisa y vos decidís si
        anotarlos. Si el mes ya pasó, cargalos acá.
      </p>

      {pending.length > 0 ? (
        <button
          type="button"
          onClick={postPending}
          className="rounded-2xl bg-elevated px-4 py-3 text-left text-sm text-fg"
        >
          Hay {pending.length} fijo{pending.length === 1 ? "" : "s"} sin anotar en este mes. Tocá para
          cargarlos.
        </button>
      ) : mine.length > 0 ? (
        <p className="text-sm text-subtle">Este mes está al día.</p>
      ) : null}

      <div className="grid gap-2">
        {mine.map((r) => {
          const posted = isPosted(r, txs, viewMonth);
          const due = isDue(r, viewMonth);
          const twin = !posted && due && likelyDuplicate(r, txs, viewMonth);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setEditing(r)}
              className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left shadow-[0_0_0_1px_rgba(244,244,240,0.06)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{r.name}</span>
                <span className="block text-xs text-muted">
                  Día {r.day}
                  {" · "}
                  {allCats.find((c) => c.id === r.categoryId)?.name}
                  {posted ? " · cargado" : due ? " · pendiente" : " · programado"}
                  {twin ? " · ¿ya lo cargaste a mano?" : ""}
                  {unsaved.has(r.id) ? " · sin guardar" : ""}
                  {!r.active ? " · pausado" : ""}
                </span>
              </span>
              <span className={cn("text-sm tabular-nums", r.type === "income" ? "text-income" : "text-fg")}>
                {r.type === "income" ? "+" : "−"}
                {money(r.amount, r.currency, true)}
              </span>
            </button>
          );
        })}
      </div>

      {templates.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium">Agregar de una</h2>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => {
                  const accId = inferAccount(accounts, activeBookId, t.method, "ARS");
                  const acc = accounts.find((a) => a.id === accId) ?? accounts[0];
                  setEditing({
                    id: uid(),
                    bookId: activeBookId,
                    type: t.type === "income" ? "income" : "expense",
                    name: t.name,
                    amount: 0,
                    currency: acc?.currency ?? "ARS",
                    categoryId: t.categoryId,
                    accountId: acc?.id ?? "",
                    method: t.method,
                    day: t.day,
                    note: "",
                    active: true,
                  });
                }}
                className="h-11 rounded-full bg-elevated px-3.5 text-sm text-muted hover:text-fg"
              >
                {t.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <Button
        variant="secondary"
        onClick={() => {
          const acc = accounts.find((a) => a.currency === "ARS") ?? accounts[0];
          setEditing({
            id: uid(),
            bookId: activeBookId,
            type: "expense",
            name: "",
            amount: 0,
            currency: acc?.currency ?? "ARS",
            categoryId: "servicios",
            accountId: acc?.id ?? "",
            method: "debito",
            day: 10,
            note: "",
            active: true,
          });
        }}
      >
        Otro fijo
      </Button>

      {editing ? (
        <FijoEditor
          value={editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSave={(row) => {
            upsertRecurring(row);
            setEditing(null);
            toast.success("Fijo guardado");
          }}
          onDelete={(id) => {
            const row = recurrings.find((r) => r.id === id);
            deleteRecurring(id);
            setEditing(null);
            toast.success("Fijo eliminado", {
              duration: 8000,
              action: row ? { label: "Deshacer", onClick: () => upsertRecurring(row) } : undefined,
            });
          }}
        />
      ) : null}
    </div>
  );
}

function FijoEditor({
  value,
  accounts,
  onClose,
  onSave,
  onDelete,
}: {
  value: Recurring;
  accounts: { id: string; name: string; currency: Currency; kind?: AccountKind }[];
  onClose: () => void;
  onSave: (row: Recurring) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(value.name);
  const [amount, setAmount] = useState(amountInput(value.amount));
  const [day, setDay] = useState(String(value.day));
  const [type, setType] = useState<TxType>(value.type);
  const [categoryId, setCategoryId] = useState(value.categoryId);
  const [accountId, setAccountId] = useState(value.accountId);
  const [method, setMethod] = useState<PayMethod>(value.method);
  const [active, setActive] = useState(value.active);
  const visible = useVisibleCategories();
  const cats = useMemo(
    () => visible.filter((c) => c.kind === (type === "income" ? "income" : "expense")),
    [type, visible],
  );
  const existing = Boolean(value.amount);

  return (
    <section className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
      <h2 className="font-display text-2xl tracking-tight">{existing ? "Editar fijo" : "Nuevo fijo"}</h2>
      <div className="mt-4 grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setCategoryId(t === "income" ? "sueldo" : "servicios");
              }}
              className={cn(
                "h-11 rounded-lg text-sm font-medium",
                type === t ? "bg-elevated text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.16)]" : "bg-elevated text-muted",
              )}
            >
              {t === "income" ? "Ingreso" : "Gasto"}
            </button>
          ))}
        </div>
        <div>
          <Label htmlFor="fname">Nombre</Label>
          <Input id="fname" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Edenor" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="famt">Monto</Label>
            <Input id="famt" className="mt-1.5" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fday">Día del mes</Label>
            <Input
              id="fday"
              className="mt-1.5"
              inputMode="numeric"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              aria-describedby="fday-hint"
            />
          </div>
        </div>
        <p id="fday-hint" className="-mt-1 text-xs text-subtle">
          Del 1 al 31. Si el mes tiene menos días, va el último (ej. 31 → 28 de febrero).
        </p>
        <div>
          <Label htmlFor="fcat">Categoría</Label>
          <select
            id="fcat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
          >
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="facc">Caja</Label>
          <select
            id="facc"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              const acc = accounts.find((a) => a.id === e.target.value);
              if (acc) setMethod(methodForAccount(acc.kind, method));
            }}
            className="mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="fmethod">Medio</Label>
          <select
            id="fmethod"
            value={method}
            onChange={(e) => setMethod(e.target.value as PayMethod)}
            className="mt-1.5 h-11 w-full rounded-lg bg-elevated px-3 text-base text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
          >
            {PAY_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-11 items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activo — el día que toca, Cifra te avisa para anotarlo
        </label>
      </div>
      <div className="mt-5 flex gap-2">
        {existing ? (
          <Button variant="danger" className="flex-1" onClick={() => onDelete(value.id)}>
            Eliminar
          </Button>
        ) : (
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={() => {
            const n = parseAmount(amount);
            if (!name.trim()) {
              toast.error("Poné un nombre");
              return;
            }
            if (n == null || n <= 0) {
              toast.error("Poné el monto");
              return;
            }
            const acc = accounts.find((a) => a.id === accountId);
            onSave({
              ...value,
              name: name.trim(),
              amount: n,
              day: Math.min(31, Math.max(1, Math.round(Number(day)) || 1)),
              type: type === "income" ? "income" : "expense",
              categoryId,
              accountId,
              currency: acc?.currency ?? "ARS",
              method,
              active,
            });
          }}
        >
          Guardar
        </Button>
      </div>
    </section>
  );
}
