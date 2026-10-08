import { useState } from "react";
import { toast } from "sonner";
import type { Proposal } from "@/lib/assistant/tools";
import { argentinaDay } from "@/lib/market-hours";
import { useBookGoals, useLedger } from "@/lib/store";
import { Button } from "@/components/ui/button";

const BUTTON: Record<Proposal["kind"], string> = {
  aplicar_topes: "Aplicar",
  meta: "Cambiar la meta",
  compra_cuotas: "Cargar la compra",
  gasto: "Revisar y cargar",
};

/**
 * What the assistant proposes, each with its own button. Nothing changes until
 * the user taps it; then the app writes with the same functions as the rest of
 * the screens (setBudget, saveGoal, savePurchase, Nuevo prefilled).
 */
export function AssistantProposals({ proposals }: { proposals: Proposal[] }) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const goals = useBookGoals();
  const setBudget = useLedger((s) => s.setBudget);
  const saveGoal = useLedger((s) => s.saveGoal);
  const savePurchase = useLedger((s) => s.savePurchase);
  const openQuick = useLedger((s) => s.openQuick);
  if (!proposals.length) return null;

  function apply(p: Proposal) {
    if (p.kind === "aplicar_topes") {
      for (const t of p.topes) setBudget(t.id, t.tope);
      toast.success(
        `Apliqué ${p.topes.length} tope${p.topes.length === 1 ? "" : "s"} en Presupuestos`,
      );
    } else if (p.kind === "meta") {
      const g = goals.find((x) => x.id === p.goalId);
      if (!g) {
        toast.error("No encontré esa meta");
        return;
      }
      saveGoal({
        id: g.id,
        kind: g.kind,
        name: g.name,
        currency: g.currency,
        target: p.target ?? g.target,
        deadline: p.deadline ?? g.deadline,
        priority: p.priority ?? g.priority,
      });
      toast.success(`${g.name} actualizada`);
    } else if (p.kind === "compra_cuotas") {
      const each = p.interestFree ? Math.round((p.amount / p.installments) * 100) / 100 : p.amount;
      const saved = savePurchase({
        cardId: p.cardId,
        date: argentinaDay(),
        merchant: p.what,
        categoryId: "compras",
        currency: "ARS",
        installments: p.installments,
        installmentAmount: each,
        total: p.interestFree ? p.amount : Math.round(p.amount * p.installments * 100) / 100,
        interestFree: p.interestFree,
        cashPrice: 0,
        paidBefore: 0,
        note: "",
      });
      if (!saved) return;
      toast.success("Cargué la compra en cuotas");
    } else {
      // Nuevo opens prefilled: the user still confirms there.
      openQuick({
        type: "expense",
        amount: p.amount,
        accountId: p.accountId,
        currency: p.currency,
        ...(p.card ? { method: "credito" as const } : {}),
      });
    }
    setDone((prev) => new Set(prev).add(p.id));
  }

  return (
    <div className="mt-3 grid gap-2" aria-label="Propuestas">
      {proposals.map((p) => (
        <div key={p.id} className="rounded-2xl bg-elevated px-4 py-3">
          <p className="text-sm text-fg">{p.label}</p>
          {p.kind === "aplicar_topes" ? (
            <p className="mt-1 text-xs text-subtle">{p.topes.map((t) => t.name).join(", ")}</p>
          ) : null}
          <div className="mt-2">
            {done.has(p.id) ? (
              <p className="text-xs text-muted">Hecho</p>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => apply(p)}>
                {BUTTON[p.kind]}
              </Button>
            )}
          </div>
        </div>
      ))}
      <p className="text-xs text-subtle">Nada cambia hasta que tocás el botón.</p>
    </div>
  );
}
