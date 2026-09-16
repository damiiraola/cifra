import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BUILTIN_IDS, DEFAULT_BUDGETS } from "@/lib/categories";
import { computeMonth } from "@/lib/analytics";
import { effectiveCategoryBudget } from "@/lib/budget-math";
import { moneyARS, parseAmount } from "@/lib/format";
import { formatRate, USD_SOURCES } from "@/lib/fx";
import { CatIcon } from "@/lib/icons";
import { isArgentineWeekday, quotesAgeLabel } from "@/lib/market-hours";
import { autoBackupHint, clearLocalVault, downloadLocalVault, shareVaultToIcloud } from "@/lib/local-vault";
import { deleteAccount } from "@/lib/ledger-api";
import { useAllCategories, useBookAccounts, useBookTxs, useLedger } from "@/lib/store";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Category, CategoryKind, Transaction } from "@/lib/types";

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

const USD_PICK = new Set(["blue", "bolsa", "cripto", "oficial"]);

function Ajustes() {
  const user = useCurrentUser();
  const categories = useAllCategories();
  const accounts = useBookAccounts();
  const transactions = useBookTxs();
  const {
    books,
    activeBookId,
    viewMonth,
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
    resetClient,
  } = useLedger();
  const hidden = useMemo(() => new Set(hiddenCategoryIds), [hiddenCategoryIds]);
  const book = books.find((b) => b.id === activeBookId);
  const [budget, setBudgetInput] = useState(String(globalBudget || ""));
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CategoryKind>("expense");
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [, setTick] = useState(0);
  const live = isArgentineWeekday();
  const auto = autoBackupHint(user?.primaryEmail);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const gastos = categories.filter((c) => c.kind === "expense");
  const ingresos = categories.filter((c) => c.kind === "income");
  const spentByCat = computeMonth(transactions, viewMonth, { usd: usdRate, usdt: usdtRate }).byCat;

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
        <div className="mt-3">
          <p className="text-sm">{user?.displayName || "Cifra"}</p>
          <p className="text-xs text-muted">{user?.primaryEmail}</p>
          <p className="mt-1 text-xs text-subtle">El libro está atado a este mail. Otro mail = otro libro vacío.</p>
        </div>
        <div className="mt-4 grid gap-2 sm:max-w-sm">
          <Button
            variant="secondary"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut("/login").catch(() => {
                setSigningOut(false);
                toast.error("No pude cerrar sesión. Reintentá.");
              });
            }}
          >
            {signingOut ? "Cerrando…" : "Cerrar sesión"}
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/privacidad">Privacidad</Link>
          </Button>
        </div>
        <div className="mt-6 grid gap-2 sm:max-w-sm">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Borrar cuenta</p>
          <p className="text-xs text-subtle">
            Escribí tu mail para confirmar. Se van movimientos, fijos, respaldos y el login. No hay
            vuelta atrás.
          </p>
          <Input
            id="delete-email"
            type="email"
            autoComplete="off"
            placeholder={user?.primaryEmail ?? "tu@mail.com"}
            value={deleteEmail}
            onChange={(e) => {
              setDeleteEmail(e.target.value);
              setConfirmDelete(false);
            }}
          />
          <Button
            variant="danger"
            disabled={deleting}
            onClick={() => {
              const expected = (user?.primaryEmail ?? "").trim().toLowerCase();
              if (deleteEmail.trim().toLowerCase() !== expected) {
                toast.error("El mail no coincide");
                return;
              }
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              setDeleting(true);
              void deleteAccount({ data: { email: deleteEmail.trim() } })
                .then(async () => {
                  clearLocalVault();
                  resetClient();
                  try {
                    await signOut("/login");
                  } catch {
                    window.location.replace("/login");
                  }
                })
                .catch((err) => {
                  setDeleting(false);
                  toast.error(err instanceof Error ? err.message : "No pude borrar la cuenta");
                });
            }}
          >
            {deleting ? "Borrando…" : confirmDelete ? "¿Seguro? Borrar cuenta para siempre" : "Borrar cuenta"}
          </Button>
        </div>
      </section>

      <section className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Cotizaciones</p>
            <p className="mt-1 text-xs text-subtle">
              {live
                ? `Hábil: se actualizan solas cada 10 min · ${quotesAgeLabel(quotesAt)}`
                : `Fin de semana: queda la última · ${quotesAgeLabel(quotesAt)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshQuotes()}
            disabled={quotesBusy}
            className="h-11 px-2 text-xs text-muted hover:text-fg disabled:opacity-40"
          >
            {quotesBusy ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        <div className="mt-4 grid gap-1.5">
          {USD_SOURCES.filter((s) => USD_PICK.has(s.id)).map((s) => {
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
        <p className="mt-3 text-xs tabular-nums text-subtle">USDT ${formatRate(usdtRate)}</p>
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
          Nombre, visibilidad y tope. El tope es el mismo que en Presupuestos: solo cuenta si la categoría tiene gasto o si lo escribiste vos. Oculta no sale en Nuevo.
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
          spentByCat={spentByCat}
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
          spentByCat={spentByCat}
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
            if (addCustomCategory({ name: newName, kind: newKind })) {
              setNewName("");
              toast.success("Categoría lista");
            }
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
          <li>
            iCloud: Abrir URL <span className="text-fg">{origin}/?icloud=1</span> → tocá
            “Guardar respaldo en iCloud” → Guardar en Archivos → iCloud Drive → carpeta Cifra.
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
              void shareVaultToIcloud(user?.primaryEmail).then((r) => {
                if (r === "empty") toast.error("No hay respaldo todavía");
                else if (r === "shared") toast.success("Elegí Guardar en Archivos → iCloud Drive");
                else toast.success("Bajé el JSON. Movelo a iCloud Drive");
              });
            }}
          >
            Guardar en iCloud
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
        <p className="mt-4 text-xs text-subtle">Cotizaciones: DolarApi.</p>
      </section>
    </div>
  );
}

function CatGroup({
  title,
  rows,
  hidden,
  budgets,
  spentByCat,
  hideBudget,
  onName,
  onHide,
  onBudget,
  onRemove,
}: {
  title: string;
  rows: Category[];
  hidden: Set<string>;
  budgets: Record<string, number>;
  spentByCat: Record<string, number>;
  hideBudget?: boolean;
  onName: (id: string, name: string) => void;
  onHide: (id: string, hidden: boolean) => void;
  onBudget: (id: string, amount: number) => void;
  onRemove: (id: string) => void;
}) {
  const visibleCount = rows.filter((c) => !hidden.has(c.id)).length;
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-subtle">
          {visibleCount} visible{visibleCount === 1 ? "" : "s"}
          {rows.length - visibleCount > 0 ? ` · ${rows.length - visibleCount} oculta${rows.length - visibleCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      <div className="hidden grid-cols-[1fr_7rem_auto] gap-2 px-3 text-[11px] tracking-wide text-subtle uppercase sm:grid">
        <span>Categoría</span>
        <span>{hideBudget ? "" : "Tope"}</span>
        <span className="sr-only">Acciones</span>
      </div>
      <div className="mt-1 grid gap-2">
        {rows.map((c) => {
          const off = hidden.has(c.id);
          const custom = !BUILTIN_IDS.has(c.id);
          const tope = effectiveCategoryBudget(c.id, budgets[c.id] ?? 0, spentByCat[c.id] ?? 0, DEFAULT_BUDGETS);
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
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface"
                  style={{ color: `var(--color-${c.token})` }}
                >
                  <CatIcon name={c.icon} className="size-3.5" />
                </span>
                <Input
                  defaultValue={c.name}
                  aria-label={`Nombre de ${c.name}`}
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
                  key={`${c.id}-${tope}`}
                  inputMode="decimal"
                  defaultValue={tope ? String(tope) : ""}
                  placeholder="Tope"
                  aria-label={`Tope de ${c.name}`}
                  onBlur={(e) => {
                    const n = parseAmount(e.target.value);
                    onBudget(c.id, n && n > 0 ? n : 0);
                  }}
                />
              )}
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 min-w-11"
                  aria-label={off ? `Mostrar ${c.name}` : `Ocultar ${c.name}`}
                  onClick={() => onHide(c.id, !off)}
                >
                  {off ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  <span className="sm:hidden">{off ? "Oculta" : "Visible"}</span>
                </Button>
                {custom ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 min-w-11"
                    aria-label={`Quitar ${c.name}`}
                    onClick={() => onRemove(c.id)}
                  >
                    <Trash2 className="size-4" />
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
