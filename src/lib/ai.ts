import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

type Mode = "chat" | "parse" | "report";

type CatHint = { id: string; name: string; kind: string };

type AskInput = {
  mode: Mode;
  message: string;
  snapshot: string;
  history?: { role: "user" | "assistant"; content: string }[];
  categories?: CatHint[];
};

export const AI_UNAVAILABLE = "El asistente no está activo en este entorno.";
export const AI_TIMEOUT = "El asistente no respondió. Reintentá.";
const ASK_MS = 20_000;

const BASE_CHAT = `Sos el analista financiero de Cifra, una app de control de gastos personales. Hablás en español rioplatense, claro y directo. No uses emojis.
Trabajás SOLO con el snapshot del libro que te pasan (totales, categorías, fijos, presupuestos). No hay tickets ni comercios. No inventes movimientos. Si falta data, decilo.
Respondé breve: diagnóstico + 2 o 3 acciones concretas. Números en ARS con separador de miles.
No des consejos ilegales ni de evasión. Tono: socio de confianza, no coach motivacional.`;

const BASE_PARSE = `Convertí el texto del usuario en UN movimiento JSON. Español rioplatense, montos argentinos (15 mil = 15000, 15.000 = 15000).
Devolvé SOLO JSON válido, sin markdown:
{"type":"expense"|"income","amount":number,"currency":"ARS"|"USD"|"USDT","categoryId":string,"merchant":string,"note":string,"date":"YYYY-MM-DD"|null,"method":"efectivo"|"debito"|"credito"|"transferencia"|"mercadopago"|"crypto"|"otro"}
Si dice USDT, tether o cripto, currency=USDT y method=crypto. Si dice dólares o USD, currency=USD. Si no hay fecha, date=null. Si no hay método, "otro". amount siempre positivo.`;

const BASE_REPORT = `Sos el analista de Cifra. Redactá un informe mensual en español rioplatense, sin emojis, con esta estructura exacta (markdown liviano):
1) Cierre del mes (3 líneas con números)
2) Dónde se fue la plata (top categorías, vs presupuesto)
3) Alertas (desvíos, proyección de cierre, vs mes anterior)
4) Tres recortes concretos y realistas (en ARS)
5) Una pregunta para el usuario
Máximo 280 palabras. No inventes movimientos ni comercios.`;

function catBlock(cats: CatHint[] | undefined) {
  if (!cats?.length) {
    return "categoryId debe ser uno de: alimentos, transporte, vivienda, servicios, salud, educacion, ocio, compras, suscripciones, impuestos, transferencias, otros, sueldo, ventas, freelance, inversiones, otros-ing.";
  }
  const lines = cats.map((c) => `${c.id} (${c.name}, ${c.kind === "income" ? "ingreso" : "gasto"})`).join(", ");
  return `Categorías del usuario (usá estos categoryId): ${lines}.`;
}

function systemFor(mode: Mode, cats?: CatHint[]) {
  if (mode === "parse") return `${BASE_PARSE}\n${catBlock(cats)}`;
  if (mode === "report") return `${BASE_REPORT}\n${catBlock(cats)}`;
  return `${BASE_CHAT}\n${catBlock(cats)}`;
}

function isAbort(err: unknown) {
  const name = err instanceof Error ? err.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

export const aiStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ active: Boolean(process.env.XAI_API_KEY?.trim()) }));

export const askCifra = createServerFn({ method: "POST" })
  .validator((input: AskInput) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY?.trim();
    if (!apiKey) return { ok: false as const, error: AI_UNAVAILABLE };

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemFor(data.mode, data.categories) },
    ];
    if (data.mode !== "parse" && data.snapshot.trim()) {
      messages.push({ role: "user", content: `LIBRO (snapshot):\n${data.snapshot.slice(0, 4000)}` });
    }

    if (data.mode === "chat" && data.history?.length) {
      for (const h of data.history.slice(-8)) {
        messages.push({ role: h.role, content: h.content.slice(0, 1200) });
      }
    }

    messages.push({
      role: "user",
      content: data.message.slice(0, 2000) || (data.mode === "report" ? "Generá el informe del mes." : ""),
    });

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          messages,
          max_tokens: data.mode === "parse" ? 400 : 900,
          temperature: data.mode === "parse" ? 0.1 : 0.5,
        }),
        signal: AbortSignal.timeout(ASK_MS),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return { ok: false as const, error: AI_UNAVAILABLE };
        }
        return { ok: false as const, error: AI_TIMEOUT };
      }

      const body = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      const text = body.choices[0]?.message.content ?? "";
      if (!text.trim()) return { ok: false as const, error: AI_TIMEOUT };
      return { ok: true as const, text };
    } catch (err) {
      if (isAbort(err)) return { ok: false as const, error: AI_TIMEOUT };
      return { ok: false as const, error: AI_TIMEOUT };
    }
  });
