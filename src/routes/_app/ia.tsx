import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AI_TIMEOUT, AI_UNAVAILABLE, aiStatus, askCifra } from "@/lib/ai";
import { askAssistant } from "@/lib/assistant/ask";
import { CHIPS } from "@/lib/assistant/run";
import { todayISO, uid } from "@/lib/utils";
import { useLedger, useAllCategories, useBookCards } from "@/lib/store";
import { cuotasFromText, draftFromModel } from "@/lib/movement-parse";
import { AssistantProposals } from "@/components/assistant-proposals";
import { AssistantText } from "@/components/assistant-text";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { CATEGORY_MAP } from "@/lib/categories";

export const Route = createFileRoute("/_app/ia")({
  component: Asistente,
});

const SUGGESTIONS = CHIPS.filter((c) => c.id !== "informe");

const CLIENT_MS = 22_000;

export function Asistente() {
  const {
    chat,
    chatThreads,
    activeChatId,
    pushChat,
    startChat,
    openChat,
    deleteChat,
    openQuick,
    activeBookId,
    outbox,
  } = useLedger();
  const allCats = useAllCategories();
  const cards = useBookCards();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [parseMode, setParseMode] = useState(false);
  const [aiActive, setAiActive] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void aiStatus()
      .then((s) => {
        if (live) setAiActive(s.active);
      })
      .catch(() => {
        if (live) setAiActive(true);
      });
    return () => {
      live = false;
    };
  }, []);

  function fail(message: string, mode: "chat" | "parse") {
    toast.error(message);
    if (mode !== "parse") {
      pushChat({
        id: uid(),
        role: "assistant",
        content: message,
        createdAt: new Date().toISOString(),
      });
    }
  }

  function timeout() {
    return new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("TIMEOUT")), CLIENT_MS);
    });
  }

  /** "15 mil en el super ayer con débito" → Nuevo prefilled; cuotas and card too. */
  async function parse(message: string) {
    const res = await Promise.race([
      askCifra({
        data: {
          mode: "parse",
          message,
          categories: allCats.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
        },
      }),
      timeout(),
    ]);
    if (!res.ok) return fail(res.error, "parse");
    const parsed = draftFromModel(res.text, {
      allowedCategories: new Set(allCats.map((c) => c.id)),
      knownCategory: (id) => Boolean(CATEGORY_MAP[id]),
      cards,
      today: todayISO(),
    });
    if (!parsed) {
      toast.error("No pude armar el movimiento. Probá ser más específico.");
      return;
    }
    openQuick(parsed);
    toast.success("Revisá y confirmá el movimiento");
  }

  /** A question or a chip: the assistant with tools (the numbers come from Cifra). */
  async function ask(message: string, chip = "") {
    const history = chat.map((m) => ({ role: m.role, content: m.content }));
    pushChat({ id: uid(), role: "user", content: message, createdAt: new Date().toISOString() });
    const res = await Promise.race([
      askAssistant({
        data: {
          message: chip ? "" : message,
          chip,
          history,
          bookId: activeBookId,
          pending: outbox.slice(-20),
        },
      }),
      timeout(),
    ]);
    if (!res.ok) return fail(res.error, "chat");
    pushChat({
      id: uid(),
      role: "assistant",
      content: res.text,
      createdAt: new Date().toISOString(),
      extra: { proposals: res.proposals, followUps: res.followUps, source: res.source },
    });
  }

  async function send(message: string, opts: { chip?: string; parse?: boolean } = {}) {
    const trimmed = message.trim();
    if (!trimmed || pending) return;
    // "tele 600 mil en 12 con la Visa": Cifra reads it, no model call.
    const cuotas = opts.parse ? cuotasFromText(trimmed, cards, todayISO()) : null;
    if (cuotas) {
      setText("");
      openQuick(cuotas);
      toast.success("Revisá y confirmá la compra en cuotas");
      return;
    }
    if (aiActive === false && !opts.chip) {
      toast.error(AI_UNAVAILABLE);
      return;
    }
    setPending(true);
    setText("");
    try {
      if (opts.parse) await parse(trimmed);
      else await ask(trimmed, opts.chip);
    } catch {
      fail(AI_TIMEOUT, opts.parse ? "parse" : "chat");
    } finally {
      setPending(false);
    }
  }

  const blocked = aiActive === false;
  const busy = pending || aiActive === null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Asesor Cifra</p>
          <h1 data-tour="titulo" className="font-display text-4xl tracking-tight">Asistente</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => send("Informe del mes", { chip: "informe" })}>
            Informe del mes
          </Button>
          {chat.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={startChat}>
              Nueva
            </Button>
          ) : null}
          {activeChatId && chatThreads.some((t) => t.id === activeChatId) ? (
            <Button variant="ghost" size="sm" onClick={() => deleteChat(activeChatId)}>
              Borrar
            </Button>
          ) : null}
        </div>
      </div>

      <p className="max-w-xl text-sm text-muted">
        Cifra hace las cuentas con tus tarjetas, metas y plan, y el asistente te las explica en criollo. Si
        propone un cambio, lo aplicás vos con un botón. Si el asistente no está disponible o ya
        usaste el tope del día, te muestra los números de Cifra igual.{" "}
        <Link to="/aprender" className="underline-offset-4 hover:underline">
          Si nunca anotaste la plata, empezá por Aprender.
        </Link>
      </p>

      {chatThreads.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {chatThreads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openChat(t.id)}
              aria-pressed={t.id === activeChatId}
              className={
                t.id === activeChatId
                  ? "h-11 shrink-0 rounded-full bg-elevated px-3.5 text-sm text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.16)]"
                  : "h-11 shrink-0 rounded-full bg-elevated px-3.5 text-sm text-muted"
              }
            >
              {t.title}
            </button>
          ))}
        </div>
      ) : null}

      {blocked ? (
        <p className="rounded-2xl bg-elevated px-4 py-3 text-sm text-fg">{AI_UNAVAILABLE}</p>
      ) : null}

      <div data-tour="ideas" className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={busy}
            onClick={() => send(c.text, { chip: c.id })}
            className="h-11 rounded-full bg-elevated px-3.5 text-[13px] text-muted transition-colors duration-150 hover:text-fg disabled:opacity-50"
          >
            {c.text}
          </button>
        ))}
      </div>

      <section data-tour="charla" className="min-h-72 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] sm:p-5">
        {chat.length === 0 && !pending ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <p className="font-display text-2xl tracking-tight">Preguntale a tu libro</p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Preguntá por tus tarjetas, metas, deudas o qué pasa si comprás algo en cuotas. Los
              números los calcula Cifra; el asistente no inventa ninguno.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {chat.map((m) => (
              <article
                key={m.id}
                className={
                  m.role === "user"
                    ? "ml-8 rounded-2xl bg-elevated px-4 py-3 text-sm"
                    : "mr-4"
                }
              >
                {m.role === "assistant" ? (
                  <p className="mb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
                    Cifra
                  </p>
                ) : null}
                {m.role === "assistant" ? (
                  <AssistantText text={m.content} />
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{m.content}</div>
                )}
                {m.role === "assistant" && m.extra?.proposals?.length ? (
                  <AssistantProposals proposals={m.extra.proposals} />
                ) : null}
                {m.role === "assistant" && m.id === chat.at(-1)?.id && m.extra?.followUps?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.extra.followUps.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={busy || blocked}
                        onClick={() => send(q)}
                        className="min-h-9 rounded-full bg-elevated px-3 text-xs text-muted hover:text-fg disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {pending ? <p className="text-sm text-muted">Pensando…</p> : null}
          </div>
        )}
      </section>

      <form
        data-tour="pregunta"
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text, { parse: parseMode });
        }}
      >
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={parseMode}
            onChange={(e) => setParseMode(e.target.checked)}
            disabled={busy || blocked}
            className="size-4 accent-accent"
          />
          Interpretar como movimiento (ej. “15 mil en el super ayer con débito”)
        </label>
        <Textarea
          aria-label={parseMode ? "Movimiento a interpretar" : "Pregunta para el asistente"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={parseMode ? "Gasté 12.400 en YPF con Mercado Pago" : "¿Y si compro una tele de 600 mil en 12 cuotas?"}
          rows={3}
          disabled={busy || blocked}
        />
        <Button type="submit" disabled={busy || blocked || !text.trim()}>
          {pending ? "Pensando…" : parseMode ? "Armar movimiento" : "Preguntar"}
        </Button>
      </form>
    </div>
  );
}
