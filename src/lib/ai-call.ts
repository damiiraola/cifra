/**
 * Server-side pieces shared by every AI feature (assistant, statement PDF):
 * which providers to use, one call to one provider, and the daily cap in
 * units (chat = 1, statement PDF = 6). Never logs tokens, prompts or answers.
 */
import { getSql } from "@/lib/db";
import { aiDailyLimit, aiLimitMessage, aiUsageDay, pdfLimitMessage } from "@/lib/ai-limit";
import { aiProviders, classifyFailure, responseText, type AiProvider, type Failure } from "@/lib/ai-provider";
import { PDF_DAILY_LIMIT } from "@/lib/statement-import";
import { aiGlobalDailyUsd, callLog, type AiCallLog, type AiKind } from "@/lib/ai-cost";
import { insertCallLogs, purgeCallLog, spentSince } from "@/lib/ai-cost-db";

/** Where one request's calls are collected (metadata only), to be saved with recordAiCalls. */
export type AiTrack = { kind: AiKind; logs: AiCallLog[] };

function isAbort(err: unknown) {
  const name = err instanceof Error ? err.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

export async function providersForRequest(): Promise<AiProvider[]> {
  const { vercelOidcToken } = await import("./ai-oidc.server");
  return aiProviders(process.env, vercelOidcToken());
}

/** One provider, one try, whole JSON answer (tool calling). Never throws or logs prompts. */
export async function callProviderJson(
  p: AiProvider,
  body: Record<string, unknown>,
  deadline: number,
  track?: AiTrack,
): Promise<{ ok: true; body: unknown } | { ok: false; failure: Failure }> {
  const ms = deadline - Date.now();
  if (ms < 1500) return { ok: false, failure: "timeout" };
  const started = Date.now();
  const r = await fetchJson(p, body, ms);
  track?.logs.push(callLog(track.kind, p, r, Date.now() - started));
  return r;
}

async function fetchJson(
  p: AiProvider,
  body: Record<string, unknown>,
  ms: number,
): Promise<{ ok: true; body: unknown } | { ok: false; failure: Failure }> {
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
    const json = await res.json().catch(() => null);
    if (!json) return { ok: false, failure: "other" };
    return { ok: true, body: json };
  } catch (err) {
    const failure: Failure = isAbort(err) ? "timeout" : "other";
    console.warn(`[ai] ${p.id} ${p.model}: ${failure}`);
    return { ok: false, failure };
  }
}

/** One provider, one try. Never throws; never logs the token or the prompt. */
export async function callProvider(
  p: AiProvider,
  body: Record<string, unknown>,
  deadline: number,
  track?: AiTrack,
): Promise<{ ok: true; text: string } | { ok: false; failure: Failure }> {
  const ms = deadline - Date.now();
  if (ms < 1500) return { ok: false, failure: "timeout" };
  const started = Date.now();
  const r = await fetchJson(p, body, ms);
  track?.logs.push(callLog(track.kind, p, r, Date.now() - started));
  if (!r.ok) return r;
  const text = responseText(r.body);
  if (!text.trim()) {
    const last = track?.logs[track.logs.length - 1];
    if (last) last.result = "error";
    return { ok: false, failure: "other" };
  }
  return { ok: true, text };
}

/**
 * Whether the global daily cap (AI_GLOBAL_DAILY_USD, see ai-cost.ts) is
 * reached. Checked before every AI request, before the user's own units.
 */
export async function globalAiCapReached(): Promise<boolean> {
  const cap = aiGlobalDailyUsd(process.env.AI_GLOBAL_DAILY_USD);
  if (cap <= 0) return true;
  return (await spentSince(await getSql(), aiUsageDay())) >= cap;
}

/** Save one request's calls (metadata only). Never throws: the answer matters more. */
export async function recordAiCalls(userId: string | null, logs: AiCallLog[]) {
  if (!logs.length) return;
  try {
    await insertCallLogs(await getSql(), userId, aiUsageDay(), logs);
  } catch (err) {
    console.warn(`[ai] cost log: ${err instanceof Error ? err.name : "error"}`);
  }
}

/** Retention: drop log rows older than AI_LOG_DAYS (daily cron). */
export async function purgeAiCallLog(): Promise<number> {
  return purgeCallLog(await getSql(), aiUsageDay());
}

/**
 * Count one assistant question (`units`: chat 1, informe 2) for today and say
 * whether it is still under the cap. Atomic upsert, so parallel requests cannot sneak past the limit.
 */
export async function takeAiQuota(userId: string, units = 1): Promise<{ ok: true } | { ok: false; error: string }> {
  const limit = aiDailyLimit(process.env.AI_DAILY_LIMIT);
  if (limit === 0) return { ok: false, error: aiLimitMessage(0) };
  const n = Math.max(1, Math.round(units));
  const sql = await getSql();
  const rows = await sql<{ count: number }>`
    insert into ai_usage (user_id, day, count)
    values (${userId}, ${aiUsageDay()}::date, ${n})
    on conflict (user_id, day) do update set count = ai_usage.count + ${n}
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
