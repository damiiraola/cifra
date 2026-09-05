import { createServerFn } from "@tanstack/react-start";

type Mode = "chat" | "parse" | "report";

type AskInput = {
  mode: Mode;
  message: string;
  snapshot: string;
  history?: { role: "user" | "assistant"; content: string }[];
};

const SYSTEM: Record<Mode, string> = {
  chat: `Sos el analista financiero de Cifra, una app de control de gastos personales. Hablás en español rioplatense, claro y directo. No uses emojis.
Trabajás SOLO con el snapshot del libro que te pasan. No inventes movimientos que no estén. Si falta data, decilo.
Respondé breve: diagnóstico + 2 o 3 acciones concretas. Números en ARS con separador de miles.
No des consejos ilegales ni de evasión. Tono: socio de confianza, no coach motivacional.`,
  parse: `Convertí el texto del usuario en UN movimiento JSON. Español rioplatense, montos argentinos (15 mil = 15000, 15.000 = 15000).
Devolvé SOLO JSON válido, sin markdown:
{"type":"expense"|"income","amount":number,"currency":"ARS"|"USD"|"USDT","categoryId":string,"merchant":string,"note":string,"date":"YYYY-MM-DD"|null,"method":"efectivo"|"debito"|"credito"|"transferencia"|"mercadopago"|"crypto"|"otro"}
categoryId debe ser uno de: alimentos, transporte, vivienda, servicios, salud, educacion, ocio, compras, suscripciones, impuestos, transferencias, otros, sueldo, ventas, freelance, inversiones, otros-ing.
Si dice USDT, tether o cripto, currency=USDT y method=crypto. Si dice dólares o USD, currency=USD. Si no hay fecha, date=null. Si no hay método, "otro". amount siempre positivo.`,
  report: `Sos el analista de Cifra. Redactá un informe mensual en español rioplatense, sin emojis, con esta estructura exacta (markdown liviano):
1) Cierre del mes (3 líneas con números)
2) Dónde se fue la plata (top categorías, vs presupuesto)
3) Alertas (desvíos, proyección de cierre, vs mes anterior)
4) Tres recortes concretos y realistas (en ARS)
5) Una pregunta para el usuario
Máximo 280 palabras. No inventes movimientos.`,
};

export const askCifra = createServerFn({ method: "POST" })
  .validator((input: AskInput) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "La IA no está disponible en este entorno." };

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: SYSTEM[data.mode] },
      { role: "user", content: `LIBRO (snapshot):\n${data.snapshot.slice(0, 8000)}` },
    ];

    if (data.mode === "chat" && data.history?.length) {
      for (const h of data.history.slice(-8)) {
        messages.push({ role: h.role, content: h.content.slice(0, 1200) });
      }
    }

    messages.push({
      role: "user",
      content: data.message.slice(0, 2000) || (data.mode === "report" ? "Generá el informe del mes." : ""),
    });

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
    });

    if (!res.ok) {
      return { ok: false as const, error: `No pude consultar la IA (${res.status}).` };
    }

    const body = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const text = body.choices[0]?.message.content ?? "";
    return { ok: true as const, text };
  });
