import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { BUILTIN_IDS } from "@/lib/categories";
import { moneyARS, parseAmount } from "@/lib/format";
import { formatRate, USD_SOURCES } from "@/lib/fx";
import { CatIcon } from "@/lib/icons";
import { isArgentineWeekday } from "@/lib/market-hours";
import { autoBackupHint, downloadLocalVault } from "@/lib/local-vault";
import { useAllCategories, useBookAccounts, useBookTxs, useLedger } from "@/lib/store";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { UserButton } from "@/lib/auth/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CategoryKind, Transaction } from "@/lib/types";

export const Route = createFileRoute("/_app/ajustes")({
  component: Ajustes,
});

function exportCsv(txs: Transaction[]) {
  const header = ["fecha", "tipo", "monto", "moneda", "categoria", "comercio", "nota", "medio"];
  const lines = txs.map((t) =>
    [t.date, t.type, t.amount, t.currency, t.categoryId, t.merchant, t.note, t.method]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cifra-movimientos.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function Ajustes() {
  const user = useCurrentUser();
  const categories = useAllCategories();
  const accounts = useBookAccounts();
  const transactions = useBookTxs();
  const {
    books,
    activeBookId,
    usdRate,
    usdtRate,
    usdSource,
    quotes,
    quotesBusy,
    quotesAt,
    setUsdSource,
    refreshQuotes,
    globalBudget,
    setGlobalBudget,
    budgets,
    setBudget,
    setCategoryName,
    setCategoryHidden,
    addCustomCategory,
    removeCustomCategory,
    hiddenCategoryIds,
    wipe,
    setAccountOpening,
  } = useLedger();
  const hidden = useMemo(() => new Set(hiddenCategoryIds), [hiddenCategoryIds]);
  const book = books.find((b) => b.id === activeBookId);
  const [budget, setBudgetInput] = useState(String(globalBudget || ""));
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CategoryKind>("expense");
  const [confirmWipe, setConfirmWipe] = useState(false);
  const live = isArgentineWeekday();
  const auto = autoBackupHint(user?.primaryEmail);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://cifra-prpfe-ye.vercel.app";

  const gastos = categories.filter((c) => c.kind === "expense");
  const ingresos = categories.filter((c) => c.kind === "income");

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Configuración</p>
        <h1 className="font-display text-4xl tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm text-muted">
          Cotizaciones, cajas y categorías del libro {book?.name ?? "activo"}.
        </p>
      </div>

      <section className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Cuenta</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm">{user?.displayName || "Cifra"}</p>
            <p className="text-xs text-muted">{user?.primaryEmail}</p>
            <p className="mt-1 text-xs text-subtle">El libro está atado a este mail. Otro mail = otro libro vacío.</p>
          </div>
          <UserButton />
        </div>
      </section>

      <section className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Cotizaciones</p>
            <p className="mt-1 text-xs text-subtle">
              {live
                ? "Hábil: se actualizan solas cada 10 min."
                : "Fin de semana: queda la última. Actualizá a mano si hace falta."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshQuotes()}
            disabled={quotesBusy}
            className="text-xs text-muted hover:text-fg disabled:opacity-40"
          >
            {quotesBusy ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        <div className="mt-4 grid gap-1.5">
          {USD_SOURCES.filter((s) => ["blue", "bolsa", "cripto", "oficial"].includes(s.id)).map((s) => {
            const q = quotes.find((x) => x.casa === s.id);
            const venta = q?.venta ?? (s.id === "cripto" ? usdtRate : s.id === usdSource ? usdRate : null);
            const on = usdSource === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setUsdSource(s.id)}
                className={cn(
                  "flex h-11 items-center justify-between rounded-lg px-3 text-left text-sm",
                  on ? "bg-accent text-accent-fg" : "bg-elevated text-fg",
                )}
              >
                <span>
                  <span className="font-medium">{s.label}</span>
                  <span className={cn("ml-2 text-xs", on ? "opacity-70" : "text-muted")}>{s.hint}</span>
                </span>
                <span className="tabular-nums">{venta != null ? `$${formatRate(venta)}` : "—"}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs tabular-nums text-subtle">
          USDT ${formatRate(usdtRate)}
          {quotesAt
            ? ` · ${new Date(quotesAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </p>
      </section>

      <section className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Cajas · {book?.name}</p>
        <p className="mt-1 text-xs text-subtle">Saldo inicial. El de hoy se calcula encima de los movimientos.</p>
        <div className="mt-4 grid gap-2">
          {accounts.map((a) => (
            <div key={a.id} className="grid grid-cols-[1fr_7rem] items-center gap-2">
              <span className="truncate text-sm text-muted">
                {a.name} · {a.currency}
              </span>
              <Input
                inputMode="decimal"
                defaultValue={a.opening ? String(a.opening) : ""}
                placeholder="0"
                onBlur={(e) => setAccountOpening(a.id, parseAmount(e.target.value) ?? 0)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Categorías</p>
        <p className="mt-1 text-xs text-subtle">
          Nombre, visibilidad y tope. Oculta no sale en Nuevo. Los movimientos viejos quedan.
        </p>
        <div className="mt-4">
          <Label htmlFor="gbudget">Tope de gasto del mes (ARS)</Label>
          <Input
            id="gbudget"
            className="mt-1.5"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudgetInput(e.target.value)}
            onBlur={() => {
              const n = parseAmount(budget);
              if (n && n > 0) setGlobalBudget(n);
            }}
          />
          <p className="mt-1 text-xs text-subtle">{moneyARS(globalBudget)}</p>
        </div>

        <CatGroup
          title="Gastos"
          rows={gastos}
          hidden={hidden}
          budgets={budgets}
          onName={setCategoryName}
          onHide={setCategoryHidden}
          onBudget={setBudget}
          onRemove={removeCustomCategory}
        />
        <CatGroup
          title="Ingresos"
          rows={ingresos}
          hidden={hidden}
          budgets={budgets}
          hideBudget
          onName={setCategoryName}
          onHide={setCategoryHidden}
          onBudget={setBudget}
          onRemove={removeCustomCategory}
        />

        <form
          className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            addCustomCategory({ name: newName, kind: newKind });
            setNewName("");
            toast.success("Categoría lista");
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nueva categoría"
            minLength={2}
            required
          />
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as CategoryKind)}
            className="h-11 rounded-lg bg-elevated px-3 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
          >
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </select>
          <Button type="submit">Agregar</Button>
        </form>
      </section>

      <section className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Atajos de iPhone</p>
        <p className="mt-1 text-xs text-subtle">
          Apple Atajos abre Cifra con un link. Tenés que estar logueado. La sesión de Safari vale.
        </p>
        <div className="mt-4 grid gap-2 sm:max-w-sm">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(`${origin}/?cargar=1`);
              toast.success("Copié el link de cargar");
            }}
          >
            Copiar link: anotar gasto
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(`${origin}/?cargar=1&tipo=gasto&guardar=1&monto=`);
              toast.success("Copié el link con monto");
            }}
          >
            Copiar link: guardar directo
          </Button>
        </div>
        <ol className="mt-4 list-decimal space-y-2 pl-4 text-sm text-muted">
          <li>
            Abrí <span className="text-fg">Atajos</span> → + → Agregar acción → <span className="text-fg">Abrir URL</span>.
            Pegá el primer link. Nombralo “Cifra”.
          </li>
          <li>
            En Atajos, tap del atajo → Automatización → <span className="text-fg">Hora del día</span> → todos los días 21:30.
            Así se abre y corre el respaldo.
          </li>
          <li>
            Otro atajo “Anotar gasto”: Pedir entrada (Número, “¿Cuánto?”) → Abrir URL
            <span className="text-fg"> {origin}/?tipo=gasto&guardar=1&monto=</span>
            y concatená la respuesta. Agregar a Siri: “anotar gasto”.
          </li>
          <li>
            Opcional: agregá <span className="text-fg">&libro=negocio&caja=usdt&nota=</span> y otra pregunta para la nota.
          </li>
        </ol>
      </section>

      <section className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Datos</p>
        <p className="mt-1 text-xs text-subtle">
          Se respalda solo, todos los días, en tu cuenta. No tenés que tocar nada. Quedan 30 días.
          {auto ? ` Último automático: ${auto.day.slice(8, 10)}/${auto.day.slice(5, 7)}.` : " Hoy se copia al abrir el libro."}
        </p>
        <div className="mt-4 grid gap-2 sm:max-w-sm">
          <Button variant="secondary" onClick={() => exportCsv(transactions)}>
            Exportar CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (downloadLocalVault(user?.primaryEmail)) toast.success("Bajé el JSON del libro");
              else toast.error("No hay respaldo local todavía");
            }}
          >
            Descargar respaldo JSON
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!confirmWipe) {
                setConfirmWipe(true);
                return;
              }
              wipe();
              setConfirmWipe(false);
              toast.success("Este libro quedó vacío");
            }}
          >
            {confirmWipe ? "¿Seguro? Borrar este libro" : "Borrar movimientos de este libro"}
          </Button>
        </div>
        <p className="mt-4 text-xs text-subtle">
          Cotizaciones: DolarApi.{" "}
          <Link to="/beta" className="underline-offset-4 hover:text-fg hover:underline">
            Definir la beta
          </Link>
        </p>
      </section>
    </div>
  );
}

function CatGroup({
  title,
  rows,
  hidden,
  budgets,
  hideBudget,
  onName,
  onHide,
  onBudget,
  onRemove,
}: {
  title: string;
  rows: { id: string; name: string; token: string; icon: string }[];
  hidden: Set<string>;
  budgets: Record<string, number>;
  hideBudget?: boolean;
  onName: (id: string, name: string) => void;
  onHide: (id: string, hidden: boolean) => void;
  onBudget: (id: string, amount: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="grid gap-2">
        {rows.map((c) => {
          const off = hidden.has(c.id);
          const custom = !BUILTIN_IDS.has(c.id);
          return (
            <div
              key={c.id}
              className={cn(
                "grid gap-2 rounded-xl bg-elevated p-3 sm:grid-cols-[1fr_7rem_auto] sm:items-center",
                off && "opacity-50",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface"
                  style={{ color: `var(--color-${c.token})` }}
                >
                  <CatIcon name={c.icon} className="size-3.5" />
                </span>
                <Input
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const n = e.target.value.trim();
                    if (n.length >= 2) onName(c.id, n);
                  }}
                />
              </div>
              {hideBudget ? (
                <span className="hidden sm:block" />
              ) : (
                <Input
                  inputMode="decimal"
                  defaultValue={budgets[c.id] ? String(budgets[c.id]) : ""}
                  placeholder="Tope"
                  onBlur={(e) => {
                    const n = parseAmount(e.target.value);
                    onBudget(c.id, n && n > 0 ? n : 0);
                  }}
                />
              )}
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => onHide(c.id, !off)}>
                  {off ? "Mostrar" : "Ocultar"}
                </Button>
                {custom ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(c.id)}>
                    Quitar
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
