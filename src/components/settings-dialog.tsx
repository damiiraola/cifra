import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CATEGORIES } from "@/lib/categories";
import { moneyARS, parseAmount } from "@/lib/format";
import { formatRate, USD_SOURCES } from "@/lib/fx";
import { useLedger, useBookTxs, useBookAccounts } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

function exportCsv(txs: Transaction[]) {
  const header = ["fecha", "tipo", "monto", "moneda", "categoria", "comercio", "nota", "medio"];
  const lines = txs.map((t) =>
    [t.date, t.type, t.amount, t.currency, t.categoryId, t.merchant, t.note, t.method]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cifra-movimientos.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
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
    loadDemo,
    wipe,
    categoryNames,
    setCategoryName,
    setAccountOpening,
  } = useLedger();
  const transactions = useBookTxs();
  const accounts = useBookAccounts();
  const [budget, setBudget] = useState(String(globalBudget));
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    if (open) void refreshQuotes();
    else setConfirmWipe(false);
  }, [open, refreshQuotes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Ajustes</DialogTitle>
        <DialogDescription className="mt-1">
          Tipo de cambio, presupuesto y datos de tu cuenta.
        </DialogDescription>

        <div className="mt-4 md:hidden">
          <UserButton />
        </div>

        <div className="mt-5 flex flex-wrap gap-2 md:hidden">
          <Button variant="secondary" size="sm" asChild>
            <Link to="/movimientos" onClick={() => onOpenChange(false)}>
              Movimientos
            </Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/presupuestos" onClick={() => onOpenChange(false)}>
              Presupuestos
            </Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/fijos" onClick={() => onOpenChange(false)}>
              Fijos
            </Link>
          </Button>
        </div>

        <div className="mt-5 grid gap-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <Label>Cotizaciones</Label>
              <button
                type="button"
                onClick={() => void refreshQuotes()}
                disabled={quotesBusy}
                className="text-xs text-muted hover:text-fg disabled:opacity-40"
              >
                {quotesBusy ? "Actualizando…" : "Actualizar"}
              </button>
            </div>
            <p className="mt-1 text-xs text-subtle">
              USD usa la cotización que elijas, del día de cada movimiento. USDT usa cripto, o el precio P2P que pongas al cargar.
            </p>
            <div className="mt-2 grid gap-1.5">
              {USD_SOURCES.map((s) => {
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
                    <span className="tabular-nums">
                      {venta != null ? `$${formatRate(venta)}` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs tabular-nums text-subtle">
              USDT {formatRate(usdtRate)} · USD {formatRate(usdRate)}
              {quotesAt ? ` · ${new Date(quotesAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
          </div>
          <div>
            <Label htmlFor="gbudget">Presupuesto global del mes</Label>
            <Input
              id="gbudget"
              className="mt-1.5"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              onBlur={() => {
                const n = parseAmount(budget);
                if (n && n > 0) setGlobalBudget(n);
              }}
            />
            <p className="mt-1 text-xs text-subtle">{moneyARS(globalBudget)}</p>
          </div>
          <div>
            <Label>Saldos iniciales de cajas</Label>
            <p className="mt-1 text-xs text-subtle">Lo que había en cada caja antes de Cifra. El saldo de hoy se calcula encima.</p>
            <div className="mt-2 grid gap-2">
              {accounts.map((a) => (
                <div key={a.id} className="grid grid-cols-[1fr_7rem] items-center gap-2">
                  <span className="truncate text-sm text-muted">
                    {a.name} · {a.currency}
                  </span>
                  <Input
                    inputMode="decimal"
                    defaultValue={a.opening ? String(a.opening) : ""}
                    placeholder="0"
                    onBlur={(e) => {
                      const n = parseAmount(e.target.value) ?? 0;
                      setAccountOpening(a.id, n);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label>Nombres de categorías</Label>
            <p className="mt-1 text-xs text-subtle">Renombrá las que uses. El resto puede quedar.</p>
            <div className="mt-2 grid gap-1.5">
              {CATEGORIES.filter((c) => c.kind === "expense").map((c) => (
                <Input
                  key={c.id}
                  value={categoryNames[c.id] ?? c.name}
                  onChange={(e) => setCategoryName(c.id, e.target.value)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-2">
          <Button variant="secondary" onClick={() => exportCsv(transactions)}>
            Exportar CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              loadDemo();
              toast.success("Cargué el libro de ejemplo");
              onOpenChange(false);
            }}
          >
            Cargar datos de ejemplo
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
              onOpenChange(false);
            }}
          >
            {confirmWipe ? "¿Seguro? Borrar este libro" : "Borrar movimientos de este libro"}
          </Button>
        </div>
        <p className="mt-4 text-xs text-subtle">
          El libro se guarda en tu cuenta. Las cotizaciones salen de DolarApi.com. El chat de la IA
          queda en esta sesión.{" "}
          <Link to="/beta" className="text-muted underline-offset-4 hover:text-fg hover:underline">
            Definir la beta
          </Link>
        </p>
      </DialogContent>
    </Dialog>
  );
}
