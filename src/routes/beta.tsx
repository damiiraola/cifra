import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { toast, Toaster } from "sonner";
import { saveBetaBrief } from "@/lib/beta-api";
import { BETA_QUESTIONS, isAnswered, type BetaAnswers } from "@/lib/beta-brief";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export const Route = createFileRoute("/beta")({
  component: BetaBrief,
});

const STORAGE_KEY = "cifra-beta-brief";

function loadSaved(): BetaAnswers {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BetaAnswers) : {};
  } catch {
    return {};
  }
}

function BetaBrief() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<BetaAnswers>({});
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const saved = loadSaved();
    setAnswers(saved);
    const v = saved.sensible;
    if (typeof v === "string" && v !== "nada" && v !== "omitir") setNote(v);
  }, []);

  const q = BETA_QUESTIONS[step];
  const last = step === BETA_QUESTIONS.length - 1;
  const progress = ((step + 1) / BETA_QUESTIONS.length) * 100;

  const selected = answers[q.id];
  const selectedSet = useMemo(() => {
    if (Array.isArray(selected)) return new Set(selected);
    if (typeof selected === "string" && selected) return new Set([selected]);
    return new Set<string>();
  }, [selected]);

  function persist(next: BetaAnswers) {
    setAnswers(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function pick(id: string) {
    if (q.multi) {
      const cur = Array.isArray(answers[q.id]) ? [...(answers[q.id] as string[])] : [];
      const i = cur.indexOf(id);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(id);
      persist({ ...answers, [q.id]: cur });
      return;
    }
    if (q.input === "text" && (id === "nada" || id === "omitir")) {
      persist({ ...answers, [q.id]: id });
      goNext({ ...answers, [q.id]: id });
      return;
    }
    const next = { ...answers, [q.id]: id };
    persist(next);
    goNext(next);
  }

  function goNext(nextAnswers: BetaAnswers = answers) {
    if (last) {
      void submit(nextAnswers);
      return;
    }
    setStep((s) => Math.min(s + 1, BETA_QUESTIONS.length - 1));
  }

  async function submit(nextAnswers: BetaAnswers) {
    const payload = { ...nextAnswers };
    if (note.trim()) payload.sensible = note.trim();
    persist(payload);
    setSending(true);
    try {
      await saveBetaBrief({ data: { answers: payload } });
      try {
        localStorage.setItem("cifra-beta-brief-done", "1");
      } catch {
        /* ignore */
      }
      setDone(true);
    } catch {
      try {
        localStorage.setItem("cifra-beta-brief-done", "1");
      } catch {
        /* ignore */
      }
      toast.error("Se guardó en el teléfono. Avisame y lo leo igual.");
      setDone(true);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
        <Toaster theme="dark" position="top-center" />
        <div className="w-full max-w-md">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Beta</p>
          <h1 className="mt-2 font-display text-5xl tracking-tight">Listo.</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Ya tengo tus respuestas. En el chat escribí “listo” y armo el corte de la beta con eso.
          </p>
          <Button className="mt-8 w-full" onClick={() => navigate({ to: "/" })}>
            Volver al libro
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-bg text-fg">
      <Toaster theme="dark" position="top-center" />
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            type="button"
            aria-label="Anterior"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="grid size-11 place-items-center rounded-lg text-muted disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
              {step + 1} / {BETA_QUESTIONS.length}
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-elevated">
              <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <h1 className="font-display text-[2.15rem] leading-[1.1] tracking-tight">{q.title}</h1>
        {q.hint ? <p className="mt-2 text-sm text-muted">{q.hint}</p> : null}

        <div className="mt-6 grid gap-2">
          {q.options.map((opt) => {
            const on = selectedSet.has(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => pick(opt.id)}
                className={cn(
                  "min-h-14 rounded-2xl px-4 py-3 text-left transition-[transform,background-color,box-shadow] duration-150 active:scale-[0.98]",
                  on
                    ? "bg-elevated text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.28)]"
                    : "bg-surface text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.06)]",
                )}
              >
                <span className="block text-[15px] font-medium">{opt.label}</span>
                {opt.sub ? <span className="mt-0.5 block text-xs text-muted">{opt.sub}</span> : null}
              </button>
            );
          })}
        </div>

        {q.input === "text" ? (
          <Textarea
            className="mt-3"
            placeholder="Ej: nunca CBU, nunca clientes de FIXA"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        ) : null}

        <div className="mt-auto pt-8">
          {step === 0 ? (
            <button
              type="button"
              className="mb-3 w-full text-center text-xs text-subtle"
              onClick={() => {
                try {
                  localStorage.setItem("cifra-beta-brief-done", "1");
                } catch {
                  /* ignore */
                }
                navigate({ to: "/" });
              }}
            >
              Ahora no
            </button>
          ) : null}
          {q.multi || q.optional || q.input === "text" ? (
            <Button
              className="w-full"
              disabled={(!q.optional && !isAnswered(q, { ...answers, sensible: note || answers.sensible })) || sending}
              onClick={() => {
                if (q.input === "text" && note.trim()) persist({ ...answers, sensible: note.trim() });
                goNext(note.trim() ? { ...answers, sensible: note.trim() } : answers);
              }}
            >
              {last ? (sending ? "Enviando…" : "Enviar") : "Siguiente"}
            </Button>
          ) : last ? (
            <Button className="w-full" disabled={!isAnswered(q, answers) || sending} onClick={() => void submit(answers)}>
              {sending ? "Enviando…" : "Enviar"}
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
