import { useMemo, useState, type ReactNode } from "react";
import { money, amountInput } from "@/lib/format";
import { parseAmount } from "@/lib/format";
import { moreFijos, onboardingFijos, suggestTope, templateFor, COMMON_FIJOS } from "@/lib/onboarding-plan";
import { fijoAccount } from "@/lib/books";
import { useLedger } from "@/lib/store";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account } from "@/lib/types";

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

function OpeningList({
  rows,
  openings,
  onChange,
}: {
  rows: Account[];
  openings: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {rows.map((a) => (
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
            onChange={(e) => onChange(a.id, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

export function Onboarding() {
  const books = useLedger((s) => s.books);
  const accounts = useLedger((s) => s.accounts);
  const { completeOnboarding, usdSource, setUsdSource, upsertRecurring } = useLedger();
  const [step, setStep] = useState(0);
  const [income, setIncome] = useState("");
  // The store starts with a default tope; onboarding never shows it as if the user chose it.
  const [budget, setBudget] = useState("");
  const [budgetTouched, setBudgetTouched] = useState(false);
  const [openings, setOpenings] = useState<Record<string, string>>({});
  const [fijoRows, setFijoRows] = useState<{ name: string; amount: string }[]>(
    COMMON_FIJOS.map((name) => ({ name, amount: "" })),
  );
  const [adding, setAdding] = useState(false);
  const incomeN = parseAmount(income) ?? 0;
  const suggested = suggestTope(incomeN);
  // Until the user types a tope, it follows the income (80 %). Nothing invented without income.
  const tope = budgetTouched ? (parseAmount(budget) ?? 0) : suggested;
  const [wantBusiness, setWantBusiness] = useState(false);

  const personal = books.find((b) => b.kind === "personal");
  const business = books.find((b) => b.kind === "business");
  const personalAccounts = useMemo(
    () => accounts.filter((a) => a.bookId === personal?.id && !a.archived),
    [accounts, personal?.id],
  );
  const businessAccounts = useMemo(
    () => accounts.filter((a) => a.bookId === business?.id && !a.archived),
    [accounts, business?.id],
  );

  function setOpening(id: string, value: string) {
    setOpenings((s) => ({ ...s, [id]: value }));
  }

  function finish() {
    const n = tope;
    const rows = wantBusiness ? [...personalAccounts, ...businessAccounts] : personalAccounts;
    completeOnboarding({
      globalBudget: n,
      openings: rows.map((a) => ({
        id: a.id,
        opening: parseAmount(openings[a.id] ?? "") ?? 0,
      })),
    });
    const bookId = personal?.id;
    if (!bookId || personalAccounts.length === 0) return;
    const fijos = onboardingFijos(
      incomeN,
      fijoRows.map((r) => ({ name: r.name, amount: parseAmount(r.amount) })),
    );
    for (const f of fijos) {
      const t = { ...templateFor(f.name), name: f.name };
      const amount = f.amount;
      // Same caja the Fijos page picks for the template (the Banco for
      // transferencia/débito), not the first ARS caja, which is Efectivo.
      const acc = fijoAccount(personalAccounts, bookId, t.method);
      if (!acc) continue;
      upsertRecurring({
        id: uid(),
        bookId,
        type: t.type === "income" ? "income" : "expense",
        name: t.name,
        amount,
        currency: acc.currency,
        categoryId: t.categoryId,
        accountId: acc.id,
        method: t.method,
        day: t.day,
        note: "",
        active: true,
      });
    }
  }

  if (step === 0) {
    return (
      <Frame
        kicker="Bienvenida"
        title="¿Cuánto entra por mes?"
        hint="Tu sueldo o lo que cobrás en un mes normal. Con eso te sugerimos un tope de gasto. Si no querés decirlo, seguí: lo cargás después."
        footer={
          <Button className="w-full" onClick={() => setStep(1)}>
            {incomeN > 0 || tope > 0 ? "Siguiente" : "Saltear"}
          </Button>
        }
      >
        <Label htmlFor="income">Lo que entra por mes (ARS)</Label>
        <Input
          id="income"
          className="mt-1.5 h-14 font-display text-2xl"
          inputMode="decimal"
          placeholder="Ej. 1.200.000"
          value={income}
          onChange={(e) => setIncome(e.target.value)}
        />
        {incomeN > 0 || budgetTouched ? (
          <div className="mt-6">
            <Label htmlFor="budget">Tope de gasto del mes (ARS)</Label>
            <Input
              id="budget"
              className="mt-1.5"
              inputMode="decimal"
              placeholder="Sin tope"
              value={budgetTouched ? budget : suggested ? amountInput(suggested) : ""}
              onChange={(e) => {
                setBudgetTouched(true);
                setBudget(e.target.value);
              }}
            />
            {!budgetTouched && suggested > 0 ? (
              <p className="mt-1.5 text-xs text-muted">
                Sugerido: el 80 % de lo que entra. El resto queda para ahorro y metas. Cambialo si querés.
              </p>
            ) : null}
          </div>
        ) : null}
      </Frame>
    );
  }

  if (step === 1) {
    return (
      <Frame
        kicker="Personal"
        title="¿Cuánto hay hoy?"
        hint="Efectivo, Mercado Pago, Banco, dólares y USDT. Si no sabés, dejalo en cero."
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
        <OpeningList rows={personalAccounts} openings={openings} onChange={setOpening} />
      </Frame>
    );
  }

  if (step === 2) {
    return (
      <Frame
        kicker="Negocio"
        title="¿Llevás el negocio aparte?"
        hint="Si sí, Cifra abre el libro Negocio con las mismas cajas. Si no, queda vacío para después."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>
              Atrás
            </Button>
          </div>
        }
      >
        <div className="grid gap-2">
          <Button
            className="w-full"
            onClick={() => {
              setWantBusiness(true);
              setStep(3);
            }}
          >
            Sí, anotar el negocio
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setWantBusiness(false);
              setStep(4);
            }}
          >
            Ahora no
          </Button>
        </div>
      </Frame>
    );
  }

  if (step === 3) {
    return (
      <Frame
        kicker="Negocio"
        title="Cajas del negocio"
        hint="Saldo inicial. Cero también vale."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(2)}>
              Atrás
            </Button>
            <Button className="flex-1" onClick={() => setStep(4)}>
              Siguiente
            </Button>
          </div>
        }
      >
        <OpeningList rows={businessAccounts} openings={openings} onChange={setOpening} />
      </Frame>
    );
  }

  if (step === 4) {
    const extra = moreFijos().filter((n) => !fijoRows.some((r) => r.name === n));
    return (
      <Frame
        kicker="Fijos"
        title="¿Qué pagás todos los meses?"
        hint="Los más comunes. Poné el monto de los que tengas y dejá vacío el resto. Podés saltear esto y cargarlos después."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(wantBusiness ? 3 : 2)}>
              Atrás
            </Button>
            <Button className="flex-1" onClick={() => setStep(5)}>
              {fijoRows.some((r) => parseAmount(r.amount)) ? "Siguiente" : "Saltear"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          {fijoRows.map((r, i) => (
            <div key={`${r.name}-${i}`}>
              {COMMON_FIJOS.includes(r.name as (typeof COMMON_FIJOS)[number]) || moreFijos().includes(r.name) ? (
                <Label htmlFor={`fijo-${i}`}>{r.name}</Label>
              ) : (
                <Input
                  aria-label="Nombre del fijo"
                  className="mb-1.5"
                  placeholder="Nombre (ej. Gimnasio)"
                  value={r.name}
                  onChange={(e) => setFijoRows((rows) => rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
              )}
              <Input
                id={`fijo-${i}`}
                className="mt-1.5"
                inputMode="decimal"
                placeholder="0"
                aria-label={r.name ? `Monto de ${r.name}` : "Monto"}
                value={r.amount}
                onChange={(e) => setFijoRows((rows) => rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              />
            </div>
          ))}
          {adding ? (
            <div className="flex flex-wrap gap-1.5">
              {[...extra, "Otro"].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="inline-flex h-11 items-center rounded-full bg-elevated px-3.5 text-sm text-muted"
                  onClick={() => {
                    setFijoRows((rows) => [...rows, { name: n === "Otro" ? "" : n, amount: "" }]);
                    setAdding(false);
                  }}
                >
                  {n === "Otro" ? "Otro…" : n}
                </button>
              ))}
            </div>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setAdding(true)}>
              Agregar otro
            </Button>
          )}
        </div>
      </Frame>
    );
  }

  return (
    <Frame
      kicker="Dólar"
      title="¿A qué dólar convertimos?"
      hint="Lo usamos para pasar tus dólares a pesos. Si no sabés, dejá el blue. USDT va al cripto, o ponés el precio P2P en cada carga. Se cambia después en Ajustes."
      footer={
        <>
          <Button className="w-full" onClick={finish}>
            Empezar
          </Button>
          <p className="mt-3 text-center text-xs text-subtle">
            {wantBusiness ? "Personal y Negocio." : "Personal ahora. Negocio queda para Ajustes."}{" "}
            {tope > 0 ? `Tope ${money(tope, "ARS")}.` : "Sin tope por ahora."}
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
      <button type="button" className="mt-2 inline-flex min-h-11 items-center self-start px-1 text-sm text-muted underline-offset-4 hover:underline" onClick={() => setStep(4)}>
        Atrás
      </button>
    </Frame>
  );
}
