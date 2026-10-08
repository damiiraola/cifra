/**
 * Server-side pieces shared by every AI feature (assistant, statement PDF):
 * which providers to use, one call to one provider, and the daily cap in
 * units (chat = 1, statement PDF = 6). Never logs tokens, prompts or answers.
 */
import { getSql } from "@/lib/db";
import { aiDailyLimit, aiLimitMessage, aiUsageDay, pdfLimitMessage } from "@/lib/ai-limit";
import { aiProviders, classifyFailure, responseText, type AiProvider, type Failure } from "@/lib/ai-provider";
import { PDF_DAILY_LIMIT } from "@/lib/statement-import";

function isAbort(err: unknown) {
  const name = err instanceof Error ? err.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

export async function providersForRequest(): Promise<AiProvider[]> {
  const { vercelOidcToken } = await import("./ai-oidc.server");
  return aiProviders(process.env, vercelOidcToken());
}

/** One provider, one try. Never throws; never logs the token or the prompt. */
export async function callProvider(
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
 * Count one assistant question for today and say whether it is still under
 * the cap. Atomic upsert, so parallel requests cannot sneak past the limit.
 */
export async function takeAiQuota(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
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

/**
 * Take `units` for one statement PDF, only if they fit today's cap and the
 * user read fewer than PDF_DAILY_LIMIT statements today (one atomic upsert).
 */
export async function takePdfQuota(userId: string, units: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const limit = aiDailyLimit(process.env.AI_DAILY_LIMIT);
  if (limit === 0) return { ok: false, error: aiLimitMessage(0) };
  if (units > limit) return { ok: false, error: pdfLimitMessage({ limit, used: 0, pdfs: 0, units }) };
  const sql = await getSql();
  const day = aiUsageDay();
  const rows = await sql<{ count: number }>`
    insert into ai_usage (user_id, day, count, pdf_count)
    values (${userId}, ${day}::date, ${units}, 1)
    on conflict (user_id, day) do update
      set count = ai_usage.count + ${units}, pdf_count = ai_usage.pdf_count + 1
      where ai_usage.count + ${units} <= ${limit} and ai_usage.pdf_count < ${PDF_DAILY_LIMIT}
    returning count
  `;
  if (rows[0]) return { ok: true };
  const now = await sql<{ count: number; pdf_count: number }>`
    select count, pdf_count from ai_usage where user_id = ${userId} and day = ${day}::date
  `;
  return {
    ok: false,
    error: pdfLimitMessage({ limit, used: Number(now[0]?.count ?? 0), pdfs: Number(now[0]?.pdf_count ?? 0), units }),
  };
}

/** Give the units back when the model failed (the user got nothing). */
export async function refundPdfQuota(userId: string, units: number) {
  try {
    const sql = await getSql();
    await sql`
      update ai_usage
      set count = greatest(0, count - ${units}), pdf_count = greatest(0, pdf_count - 1)
      where user_id = ${userId} and day = ${aiUsageDay()}::date
    `;
  } catch {
    // Not worth failing the answer over.
  }
}
