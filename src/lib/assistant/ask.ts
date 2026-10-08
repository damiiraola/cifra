import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  callProviderJson,
  globalAiCapReached,
  providersForRequest,
  recordAiCalls,
  takeAiQuota,
  type AiTrack,
} from "@/lib/ai-call";
import { AI_GLOBAL_CAP, AI_GLOBAL_CAP_NOTE, capLog } from "@/lib/ai-cost";
import { AI_UNAVAILABLE, failureMessage, type Failure } from "@/lib/ai-provider";
import { getSql } from "@/lib/db";
import { readLedger } from "@/lib/ledger-api";
import { argentinaDay } from "@/lib/market-hours";
import { assistantData, cleanPending } from "./context";
import { chipById, cleanAssistantInput, retryWhenBusy, runAssistant, type ModelCall } from "./run";
import type { Proposal } from "./tools";

/** Whole question, both model calls included (the browser gives up at 22 s). */
const ASK_MS = 20_000;

export type AssistantResponse =
  | {
      ok: true;
      text: string;
      proposals: Proposal[];
      followUps: string[];
      source: "ia" | "plantilla";
    }
  | { ok: false; error: string };

/**
 * The assistant with tools (§2.7). The server reads the user's ledger (session
 * user id), merges the outbox the phone sent, runs Cifra's tools and lets the
 * model explain them. Counts against AI_DAILY_LIMIT and the global daily
 * cap (AI_GLOBAL_DAILY_USD); each model call is saved in ai_call_log
 * (metadata only). Never logs prompts, answers or amounts.
 */
export const askAssistant = createServerFn({ method: "POST" })
  .validator((input: unknown) => cleanAssistantInput(input))
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<AssistantResponse> => {
    const chip = chipById(data.chip);
    const providers = await providersForRequest();
    const track: AiTrack = { kind: chip?.id === "informe" ? "informe" : "asistente", logs: [] };
    let note = "";
    let call: ModelCall | null = null;
    if (!providers.length) {
      if (!chip) return { ok: false, error: AI_UNAVAILABLE };
      note = "El asistente no está disponible ahora. Estos son los números de Cifra:";
    } else if (await globalAiCapReached()) {
      await recordAiCalls(context.userId, [capLog(track.kind)]);
      if (!chip) return { ok: false, error: AI_GLOBAL_CAP };
      note = AI_GLOBAL_CAP_NOTE;
    } else {
      const quota = await takeAiQuota(context.userId, chip?.units ?? 1);
      if (!quota.ok) {
        if (!chip) return { ok: false, error: quota.error };
        note = `${quota.error} Mientras, estos son los números de Cifra:`;
      } else {
        const deadline = Date.now() + ASK_MS;
        call = async (build) => {
          let last: Failure = "other";
          for (const [i, p] of providers.entries()) {
            const until =
              i < providers.length - 1 ? Math.min(deadline, Date.now() + 9_000) : deadline;
            const r = await retryWhenBusy(() => callProviderJson(p, build(p), until, track), {
              deadline: until,
            });
            if (r.ok) return r;
            last = r.failure;
          }
          return { ok: false, failure: last };
        };
      }
    }

    const sql = await getSql();
    const ledger = await readLedger(sql, context.userId);
    const today = argentinaDay();
    const assistant = assistantData(ledger, data.bookId, today, cleanPending(data.pending));
    const reply = await runAssistant({
      data: assistant,
      message: data.message,
      chip,
      history: data.history,
      call,
      note,
    });
    // The model answered but Cifra showed its template: the last call says so.
    const lastCall = track.logs[track.logs.length - 1];
    if (reply.source === "plantilla" && lastCall?.result === "ok") lastCall.result = "plantilla";
    await recordAiCalls(context.userId, track.logs);
    if (reply.source === "plantilla" && reply.reason) {
      // Only the reason class, never the text or the numbers.
      console.warn(
        `[assistant] plantilla: ${reply.reason.replace(/\d[\d.,]*/g, "#").slice(0, 60)}`,
      );
    }
    if (
      !chip &&
      reply.source === "plantilla" &&
      reply.reason?.startsWith("modelo:") &&
      reply.modelCalls === 1
    ) {
      return { ok: false, error: failureMessage(reply.reason.slice(8).trim() as Failure) };
    }
    return {
      ok: true,
      text: reply.text,
      proposals: reply.proposals,
      followUps: reply.followUps,
      source: reply.source,
    };
  });
