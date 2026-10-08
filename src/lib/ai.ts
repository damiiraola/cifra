import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { cleanAskInput } from "@/lib/ai-limit";
import { callProvider, providersForRequest, takeAiQuota } from "@/lib/ai-call";
import { systemFor, type CatHint } from "@/lib/ai-prompts";
import {
  AI_TIMEOUT,
  AI_UNAVAILABLE,
  failureMessage,
  requestBody,
  type ChatMessage,
  type Failure,
} from "@/lib/ai-provider";

export { AI_TIMEOUT, AI_UNAVAILABLE };

type Mode = "chat" | "parse" | "report";

type AskInput = {
  mode: Mode;
  message: string;
  snapshot: string;
  history?: { role: "user" | "assistant"; content: string }[];
  categories?: CatHint[];
};

/** Whole question, all providers included (the browser gives up at 22 s). */
const ASK_MS = 20_000;

export const aiStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ active: (await providersForRequest()).length > 0 }));

export const askCifra = createServerFn({ method: "POST" })
  .validator((input: AskInput) => cleanAskInput(input) as AskInput)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const providers = await providersForRequest();
    if (!providers.length) return { ok: false as const, error: AI_UNAVAILABLE };
    const quota = await takeAiQuota(context.userId);
    if (!quota.ok) return { ok: false as const, error: quota.error };

    const messages: ChatMessage[] = [
      { role: "system", content: systemFor(data.mode, data.categories) },
    ];
    if (data.mode !== "parse" && data.snapshot.trim()) {
      messages.push({ role: "user", content: `LIBRO:\n${data.snapshot.slice(0, 14000)}` });
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

    const deadline = Date.now() + ASK_MS;
    const categoryIds = (data.categories ?? []).map((c) => c.id);
    let last: Failure | null = null;
    // Gateway first; Groq (if configured) only when the Gateway fails.
    for (const [i, p] of providers.entries()) {
      // Leave the fallback ~7 s if the first provider hangs.
      const until = i < providers.length - 1 ? Math.min(deadline, Date.now() + 13_000) : deadline;
      const r = await callProvider(p, requestBody(p, { mode: data.mode, messages, categoryIds }), until);
      if (r.ok) return { ok: true as const, text: r.text };
      last = r.failure;
    }
    return { ok: false as const, error: failureMessage(last) };
  });
