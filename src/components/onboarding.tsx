import { useMemo, useState, type ReactNode } from "react";
import { money } from "@/lib/format";
import { parseAmount } from "@/lib/format";
import { useBookAccounts, useLedger } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Frame({
  kicker,
  title,
  hint,
  children,
  footer,
}: {
  kicker: string;
  title: string;
  hint: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{kicker}</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">{hint}</p>
      <div className="mt-8 min-h-0 flex-1">{children}</div>
      <div className="mt-6">{footer}</div>
    </main>
  );
}

export function Onboarding() {
  const accounts = useBookAccounts();
  const { globalBudget, completeOnboarding, usdSource, setUsdSource } = useLedger();
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState(String(globalBudget || 1_150_000));
  const [openings, setOpenings] = useState<Record<string, string>>({});

  const personalAccounts = useMemo(
    () => accounts.filter((a) => ["cash", "mp", "crypto"].includes(a.kind) || a.currency !== "ARS"),
    [accounts],
  );

  if (step === 0) {
    return (
      <Frame
        kicker="Bienvenida"
        title="Tu libro, vacío."
        hint="Tres preguntas y empezás. Nada de ejemplo."
        footer={
          <Button className="w-full" onClick={() => setStep(1)}>
            Siguiente
          </Button>
        }
      >
        <Label htmlFor="budget">Tope de gasto del mes (ARS)</Label>
        <Input
          id="budget"
          className="mt-1.5 h-14 font-display text-2xl"
          inputMode="decimal"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      </Frame>
    );
  }

  if (step === 1) {
    return (
      <Frame
        kicker="Cajas"
        title="¿Cuánto hay hoy?"
        hint="Saldo inicial. Si no sabés, dejalo en cero."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(0)}>
              Atrás
            </Button>
            <Button className="flex-1" onClick={() => setStep(2)}>
              Siguiente
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          {personalAccounts.map((a) => (
            <div key={a.id}>
              <Label htmlFor={a.id}>
                {a.name} · {a.currency}
              </Label>
              <Input
                id={a.id}
                className="mt-1.5"
                inputMode="decimal"
                placeholder="0"
                value={openings[a.id] ?? ""}
                onChange={(e) => setOpenings((s) => ({ ...s, [a.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  return (
    <Frame
      kicker="Dólar"
      title="Default cash: blue."
      hint="USD se toma al blue. USDT al cripto, o ponés precio P2P en cada carga."
      footer={
        <>
          <Button
            className="w-full"
            onClick={() => {
              const n = parseAmount(budget) ?? 0;
              completeOnboarding({
                globalBudget: n,
                openings: personalAccounts.map((a) => ({
                  id: a.id,
                  opening: parseAmount(openings[a.id] ?? "") ?? 0,
                })),
              });
            }}
          >
            Empezar
          </Button>
          <p className="mt-3 text-center text-xs text-subtle">
            Tenés dos libros: Personal y Negocio. El tope de este mes es {money(parseAmount(budget) ?? 0, "ARS")}.
          </p>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {(["blue", "bolsa", "cripto", "oficial"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setUsdSource(id)}
            className={
              usdSource === id
                ? "h-11 rounded-lg bg-elevated text-sm font-medium text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.2)]"
                : "h-11 rounded-lg bg-elevated text-sm text-muted"
            }
          >
            {id === "bolsa" ? "MEP" : id === "cripto" ? "Cripto" : id === "oficial" ? "Oficial" : "Blue"}
          </button>
        ))}
      </div>
    </Frame>
  );
}
