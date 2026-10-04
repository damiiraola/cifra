import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { aiDailyLimit, aiLimitMessage, aiUsageDay, cleanAskInput } from "@/lib/ai-limit";
import { systemFor, type CatHint } from "@/lib/ai-prompts";
import {
  AI_TIMEOUT,
  AI_UNAVAILABLE,
  aiProviders,
  classifyFailure,
  failureMessage,
  requestBody,
  responseText,
  type AiProvider,
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

function isAbort(err: unknown) {
  const name = err instanceof Error ? err.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

async function providersForRequest(): Promise<AiProvider[]> {
  const { vercelOidcToken } = await import("./ai-oidc.server");
  return aiProviders(process.env, vercelOidcToken());
}

export const aiStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ active: (await providersForRequest()).length > 0 }));

/** One provider, one try. Never throws; never logs the token or the prompt. */
async function callProvider(
  p: AiProvider,
  body: Record<string, unknown>,
  deadline: number,
): Promise<{ ok: true; text: string } | { ok: false; failure: Failure }> {
  const ms = deadline - Date.now();
  if (ms < 1500) return { ok: false, failure: "timeout" };
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      const failure = classifyFailure(res.status, detail);
      console.warn(`[ai] ${p.id} (${p.auth ?? "key"}) ${p.model}: HTTP ${res.status} → ${failure}`);
      return { ok: false, failure };
    }
    const text = responseText(await res.json().catch(() => null));
    if (!text.trim()) return { ok: false, failure: "other" };
    return { ok: true, text };
  } catch (err) {
    const failure: Failure = isAbort(err) ? "timeout" : "other";
    console.warn(`[ai] ${p.id} ${p.model}: ${failure}`);
    return { ok: false, failure };
  }
}

/**
 * Count one question for today and say whether it is still under the cap.
 * Atomic upsert, so parallel requests cannot sneak past the limit.
 */
async function takeAiQuota(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const limit = aiDailyLimit(process.env.AI_DAILY_LIMIT);
  if (limit === 0) return { ok: false, error: aiLimitMessage(0) };
  const sql = await getSql();
  const rows = await sql<{ count: number }>`
    insert into ai_usage (user_id, day, count)
    values (${userId}, ${aiUsageDay()}::date, 1)
    on conflict (user_id, day) do update set count = ai_usage.count + 1
    returning count
  `;
  const used = Number(rows[0]?.count ?? 0);
  return used > limit ? { ok: false, error: aiLimitMessage(limit) } : { ok: true };
}

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
