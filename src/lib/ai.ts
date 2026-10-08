import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { cleanAskInput } from "@/lib/ai-limit";
import {
  callProvider,
  globalAiCapReached,
  providersForRequest,
  recordAiCalls,
  takeAiQuota,
  type AiTrack,
} from "@/lib/ai-call";
import { AI_GLOBAL_CAP, capLog } from "@/lib/ai-cost";
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

type AskInput = {
  mode: "parse";
  message: string;
  categories?: CatHint[];
};

/** Whole question, all providers included (the browser gives up at 22 s). */
const ASK_MS = 20_000;

export const aiStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ active: (await providersForRequest()).length > 0 }));

/**
 * One sentence → one movement as strict JSON ("15 mil en el super ayer"). The
 * browser opens Nuevo prefilled and the user confirms there. Questions go
 * through the assistant (assistant/ask.ts).
 */
export const askCifra = createServerFn({ method: "POST" })
  .validator((input: AskInput) => cleanAskInput(input) as AskInput)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const providers = await providersForRequest();
    if (!providers.length) return { ok: false as const, error: AI_UNAVAILABLE };
    if (await globalAiCapReached()) {
      await recordAiCalls(context.userId, [capLog("movimiento")]);
      return { ok: false as const, error: AI_GLOBAL_CAP };
    }
    const quota = await takeAiQuota(context.userId);
    if (!quota.ok) return { ok: false as const, error: quota.error };

    const messages: ChatMessage[] = [
      { role: "system", content: systemFor(data.categories) },
      { role: "user", content: data.message.slice(0, 2000) },
    ];
    const deadline = Date.now() + ASK_MS;
    const categoryIds = (data.categories ?? []).map((c) => c.id);
    let last: Failure | null = null;
    const track: AiTrack = { kind: "movimiento", logs: [] };
    // Gateway first; Groq (if configured) only when the Gateway fails.
    for (const [i, p] of providers.entries()) {
      // Leave the fallback ~7 s if the first provider hangs.
      const until = i < providers.length - 1 ? Math.min(deadline, Date.now() + 13_000) : deadline;
      const r = await callProvider(p, requestBody(p, { messages, categoryIds }), until, track);
      if (r.ok) {
        await recordAiCalls(context.userId, track.logs);
        return { ok: true as const, text: r.text };
      }
      last = r.failure;
    }
    await recordAiCalls(context.userId, track.logs);
    return { ok: false as const, error: failureMessage(last) };
  });
