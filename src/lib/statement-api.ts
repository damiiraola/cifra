import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  callProvider,
  globalAiCapReached,
  providersForRequest,
  recordAiCalls,
  refundPdfQuota,
  takePdfQuota,
  type AiTrack,
} from "@/lib/ai-call";
import { PDF_GLOBAL_CAP, capLog } from "@/lib/ai-cost";
import { AI_UNAVAILABLE, failureMessage, statementBody, type Failure } from "@/lib/ai-provider";
import {
  amountInText,
  checkTotals,
  cleanPdfInput,
  isPdf,
  itemsToLines,
  parseModelStatement,
  PDF_AI_UNITS,
  PDF_MAX_BYTES,
  statementPrompt,
  statementSchema,
  textForModel,
  type ParsedStatement,
  type ReadPdfInput,
} from "@/lib/statement-import";

/** The model gets up to 55 s (a long statement is ~5k tokens out). */
const PDF_AI_MS = 55_000;

export type ReadStatementResult =
  | {
      ok: true;
      statement: ParsedStatement;
      /** Per line: is its amount printed in the PDF? */
      inText: boolean[];
      checks: ReturnType<typeof checkTotals>;
      /** How many lines of text went to the model and how many were left out. */
      sentLines: number;
      droppedLines: number;
    }
  | { ok: false; error: string };

const READ_ERRORS = {
  password: "El PDF tiene clave. Escribila abajo (suele ser tu DNI) y probá de nuevo.",
  badPassword: "Esa clave no abre el PDF. Revisala y probá de nuevo.",
  unreadable: "No pude abrir ese PDF. Probá descargarlo de nuevo desde tu banco.",
  tooManyPages: "El PDF tiene demasiadas páginas para un resumen.",
};

/**
 * Read a card statement PDF. Everything happens in this request's memory:
 * the PDF and its text are never stored or logged. Only the movements and
 * totals (personal data removed) go to the model; the answer comes back to
 * the browser for review and nothing is saved until the user approves it.
 */
export const readStatementPdf = createServerFn({ method: "POST" })
  .validator((input: ReadPdfInput) => cleanPdfInput(input))
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<ReadStatementResult> => {
    const sql = await getSql();
    const card = await sql<{ id: string }>`
      select id from ledger_cards where id = ${data.cardId} and user_id = ${context.userId} limit 1
    `;
    if (!card[0]) return { ok: false, error: "Esa tarjeta no es tuya." };
    const user = await sql<{ name: string | null }>`select name from "user" where id = ${context.userId} limit 1`;

    const bytes = new Uint8Array(Buffer.from(data.pdf, "base64"));
    if (bytes.length > PDF_MAX_BYTES) return { ok: false, error: "El PDF es muy grande (máximo 3 MB)." };
    if (!isPdf(bytes)) return { ok: false, error: "Eso no parece un PDF." };
    const { readPdfItems } = await import("./statement-pdf");
    // The bytes live only in this request; nothing is written to disk, the DB or the logs.
    const read = await readPdfItems(bytes, data.password);
    if (!read.ok) return { ok: false, error: READ_ERRORS[read.error] };

    const { text, amountLines, keptLines, droppedLines } = textForModel(itemsToLines(read.items), user[0]?.name ?? "");
    if (amountLines < 3) {
      return {
        ok: false,
        error: "No encontré texto en el PDF: parece escaneado o es una foto. Por ahora leo solo resúmenes digitales (los que bajás del home banking).",
      };
    }

    const providers = await providersForRequest();
    if (!providers.length) return { ok: false, error: AI_UNAVAILABLE };
    if (await globalAiCapReached()) {
      await recordAiCalls(context.userId, [capLog("pdf")]);
      return { ok: false, error: PDF_GLOBAL_CAP };
    }
    const quota = await takePdfQuota(context.userId, PDF_AI_UNITS);
    if (!quota.ok) return { ok: false, error: quota.error };

    const categoryIds = data.categories.filter((c) => c.kind !== "income").map((c) => c.id);
    const messages = [
      { role: "system" as const, content: statementPrompt(data.categories) },
      { role: "user" as const, content: `TEXTO DEL RESUMEN:\n${text}` },
    ];
    const schema = statementSchema(categoryIds);
    const deadline = Date.now() + PDF_AI_MS;
    const track: AiTrack = { kind: "pdf", logs: [] };
    let last: Failure | null = null;
    for (const [i, p] of providers.entries()) {
      const until = i < providers.length - 1 ? Math.min(deadline, Date.now() + 40_000) : deadline;
      const r = await callProvider(p, statementBody(p, messages, schema), until, track);
      if (!r.ok) {
        last = r.failure;
        continue;
      }
      const statement = parseModelStatement(r.text, categoryIds);
      if (!statement || !statement.lines.length) {
        const lastCall = track.logs[track.logs.length - 1];
        if (lastCall) lastCall.result = "error";
        last = "other";
        continue;
      }
      await recordAiCalls(context.userId, track.logs);
      return {
        ok: true,
        statement,
        inText: statement.lines.map((l) => amountInText(l.amount, text)),
        checks: checkTotals(statement),
        sentLines: keptLines,
        droppedLines,
      };
    }
    await recordAiCalls(context.userId, track.logs);
    await refundPdfQuota(context.userId, PDF_AI_UNITS);
    return {
      ok: false,
      error: last === "other" ? "No pude leer los movimientos del resumen. Probá de nuevo en un rato." : failureMessage(last),
    };
  });
