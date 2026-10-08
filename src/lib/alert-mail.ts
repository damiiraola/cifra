/**
 * Avisos por mail (fase 8, cifra-design/tarjetas-y-asesor.md §2.5). Pure parts:
 * which alerts go by mail, the digest, and the two HTTP handlers (cron and
 * unsubscribe) with their dependencies injected so they can be tested.
 *
 * Off unless ALERT_MAILS_ENABLED=1 and CRON_SECRET are set on the server. Each
 * user opts in from Ajustes; every mail has a one-click unsubscribe link; an
 * alert id (card/goal + period) is mailed at most once.
 */
import { planAlerts, type PlanAlert } from "./plan/alerts.ts";
import { monthlySurplus, projectCashflow, type PlanData } from "./plan/cashflow.ts";
import { goalPlan } from "./plan/goal-plan.ts";
import type { LedgerSnapshot } from "./ledger-api.ts";
import { MAIL_COLORS, type MailItem, type SendInput } from "./mail.ts";
import { tokensMatch } from "./mail-drill.ts";

/** Alert kinds worth a mail: statement due soon, statement overdue, goal behind. */
export const MAIL_ALERT_KINDS = ["vence", "vencido", "meta"] as const;

export function alertKind(id: string) {
  return id.split(":")[0] ?? "";
}

export function isMailAlert(a: Pick<PlanAlert, "id">) {
  return (MAIL_ALERT_KINDS as readonly string[]).includes(alertKind(a.id));
}

/** Important alerts not mailed before, worst first, at most `max`. */
export function newMailAlerts(alerts: PlanAlert[], sent: ReadonlySet<string>, max = 8): PlanAlert[] {
  const order = { bad: 0, warn: 1, info: 2 } as const;
  const seen = new Set<string>();
  return alerts
    .filter((a) => isMailAlert(a) && !sent.has(a.id) && !seen.has(a.id) && seen.add(a.id))
    .sort((a, b) => order[a.tone] - order[b.tone])
    .slice(0, max);
}

export function alertMailsEnabled(env: Record<string, string | undefined>) {
  return env.ALERT_MAILS_ENABLED?.trim() === "1" && Boolean(env.CRON_SECRET?.trim());
}

export function unsubscribeUrl(origin: string, token: string) {
  return `${origin.replace(/\/+$/, "")}/api/alertas/baja?t=${encodeURIComponent(token)}`;
}

/** The digest mail (no `to`). */
export function alertDigest(input: {
  name?: string | null;
  alerts: PlanAlert[];
  origin: string;
  token: string;
}): Omit<SendInput, "to"> {
  const n = input.alerts.length;
  const bad = input.alerts.some((a) => a.tone === "bad");
  const first = input.name?.trim() ? `Hola ${input.name.trim()}. ` : "";
  const items: MailItem[] = input.alerts.map((a) => ({ text: a.text, tone: a.tone }));
  return {
    subject: n === 1 ? "Un aviso de Cifra" : `${n} avisos de Cifra`,
    kicker: "Avisos",
    accent: bad ? MAIL_COLORS.rose : MAIL_COLORS.gold,
    heading: n === 1 ? "Tenés un aviso" : `Tenés ${n} avisos`,
    preheader: input.alerts[0]?.text.slice(0, 110) ?? "",
    body: `${first}Esto es lo importante de tus tarjetas y metas. Los números salen de lo que cargaste en Cifra.`,
    items,
    cta: "Ver en Cifra",
    url: `${input.origin.replace(/\/+$/, "")}/metas#avisos`,
    signoff: "Cada aviso te llega una sola vez. Los intereses son estimados: el resumen del banco manda.",
    note: "Recibiste este mail porque activaste los avisos por mail en Ajustes.",
    unsubscribeUrl: unsubscribeUrl(input.origin, input.token),
  };
}

/** All alerts of every book of a user, as the app would show them today. */
export function ledgerAlerts(snap: Pick<LedgerSnapshot, "books" | "transactions" | "accounts" | "cards" | "statements" | "recurrings" | "goals" | "usdRate" | "usdtRate">, today: string): PlanAlert[] {
  const out: PlanAlert[] = [];
  const rates = { usd: snap.usdRate, usdt: snap.usdtRate };
  for (const book of snap.books) {
    const data: PlanData = {
      today,
      bookId: book.id,
      txs: snap.transactions.filter((t) => t.bookId === book.id),
      accounts: snap.accounts.filter((a) => a.bookId === book.id),
      cards: snap.cards.filter((c) => c.bookId === book.id && !c.archived),
      statements: snap.statements.filter((s) => s.bookId === book.id),
      recurrings: snap.recurrings,
      rates,
    };
    const goals = snap.goals.filter((g) => g.bookId === book.id && g.active);
    if (!data.txs.length && !data.cards.length && !goals.length) continue;
    const surplus = monthlySurplus(projectCashflow(data, 4));
    out.push(
      ...planAlerts({
        ...data,
        budgetRows: [],
        globalBudget: 0,
        monthSpent: 0,
        projected: 0,
        goals: goalPlan(goals, surplus, today, rates),
      }),
    );
  }
  return out;
}

// ------------------------------------------------------------------ HTTP

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export type CronSummary = { users: number; sent: number; skipped: number; failed: number };

export type AlertCronDeps = {
  /** ALERT_MAILS_ENABLED=1 */
  enabled: boolean;
  /** CRON_SECRET (Vercel sends it as `Authorization: Bearer …`). */
  secret: string | undefined;
  mailConfigured: () => boolean;
  run: () => Promise<CronSummary>;
};

/**
 * `/api/cron/alertas`, called once a day by Vercel Cron.
 * - feature off or no CRON_SECRET → 404, as if the route did not exist
 * - missing or wrong bearer → 401
 * - no RESEND_API_KEY → 500
 */
export async function handleAlertCron(request: Request, deps: AlertCronDeps): Promise<Response> {
  const secret = deps.secret?.trim();
  if (!deps.enabled || !secret) return json({ ok: false, error: "Not found" }, 404);
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m || !(await tokensMatch(m[1]!.trim(), secret))) {
    return json({ ok: false, error: "No autorizado." }, 401, { "WWW-Authenticate": "Bearer" });
  }
  if (!deps.mailConfigured()) return json({ ok: false, error: "Falta RESEND_API_KEY." }, 500);
  const summary = await deps.run();
  return json({ ok: true, ...summary }, 200);
}

function page(title: string, text: string, form = "") {
  const C = MAIL_COLORS;
  const esc = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Cifra</title></head>
<body style="margin:0;background:${C.bg};color:${C.body};font-family:Helvetica,Arial,sans-serif;">
<main style="max-width:480px;margin:0 auto;padding:56px 24px;">
<p style="font-family:Georgia,serif;font-size:34px;color:${C.fg};margin:0 0 28px;">Cifra</p>
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:30px;color:${C.fg};margin:0 0 12px;">${esc(title)}</h1>
<p style="font-size:16px;line-height:24px;margin:0 0 24px;">${esc(text)}</p>${form}
<p style="font-size:13px;color:${C.muted};margin-top:32px;"><a href="/ajustes" style="color:${C.muted};">Ir a Ajustes</a></p>
</main></body></html>`;
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
  });
}

export type UnsubscribeDeps = {
  /** Turns the mails off for the owner of `token`; false if no such token. */
  unsubscribe: (token: string) => Promise<boolean>;
};

/**
 * `/api/alertas/baja?t=<token>`. GET shows a button (link scanners open GET
 * links, so GET never unsubscribes); POST unsubscribes, including the
 * one-click POST mail apps send from the List-Unsubscribe header.
 */
export async function handleUnsubscribe(request: Request, deps: UnsubscribeDeps): Promise<Response> {
  const url = new URL(request.url);
  const token = (url.searchParams.get("t") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    return html(page("Enlace inválido", "Este enlace para darte de baja no sirve. Podés apagar los avisos en Ajustes."), 400);
  }
  if (request.method === "GET") {
    const C = MAIL_COLORS;
    const action = `?t=${encodeURIComponent(token)}`;
    return html(
      page(
        "Avisos por mail",
        "¿Querés dejar de recibir los avisos de tus tarjetas y metas por mail? En la app los vas a seguir viendo.",
        `<form method="post" action="${action}"><button type="submit" style="font-size:15px;font-weight:600;padding:14px 26px;border-radius:999px;border:0;background:${C.fg};color:${C.bg};cursor:pointer;">Dejar de recibirlos</button></form>`,
      ),
    );
  }
  if (request.method !== "POST") return html(page("Método no permitido", "Usá el botón."), 405);
  const ok = await deps.unsubscribe(token);
  return ok
    ? html(page("Listo", "No te mandamos más avisos por mail. Si cambiás de idea, activalos de nuevo en Ajustes."))
    : html(page("Enlace vencido", "No encontré esta suscripción. Podés revisar los avisos en Ajustes."), 404);
}
