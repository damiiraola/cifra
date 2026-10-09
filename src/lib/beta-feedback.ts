/**
 * "Contanos" (migration 0019) and the owner's beta numbers on /panel.
 *
 * Feedback is the only free text here, and people send it on purpose. The
 * numbers are aggregates only: counts, never ids, mails or amounts.
 */
import type { Sql } from "./db.ts";
import type { SendInput } from "./mail.ts";

export const FEEDBACK_KINDS = ["comentario", "problema", "idea"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_MAX = 2000;
export const FEEDBACK_PER_DAY = 10;

export type FeedbackInput = {
  kind: FeedbackKind;
  message: string;
  page: string | null;
  contactOk: boolean;
};

export function normalizeFeedback(raw: unknown): FeedbackInput | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = FEEDBACK_KINDS.includes(r.kind as FeedbackKind)
    ? (r.kind as FeedbackKind)
    : "comentario";
  const message = String(r.message ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, FEEDBACK_MAX);
  if (!message) return null;
  // Only the path: no query (it could carry a token) and nothing long.
  const page =
    typeof r.page === "string" && r.page.startsWith("/")
      ? r.page.split(/[?#]/)[0]!.slice(0, 80)
      : null;
  return { kind, message, page, contactOk: r.contactOk === true };
}

export type SaveResult = "ok" | "vacio" | "tope";

export async function saveFeedback(
  sql: Sql,
  userId: string,
  raw: unknown,
): Promise<{ result: SaveResult; fb?: FeedbackInput }> {
  const fb = normalizeFeedback(raw);
  if (!fb) return { result: "vacio" };
  const [c] = await sql<{ n: number }>`
    select count(*)::int as n from beta_feedback
    where user_id = ${userId} and created_at > now() - interval '1 day'
  `;
  if (Number(c?.n ?? 0) >= FEEDBACK_PER_DAY) return { result: "tope" };
  await sql`
    insert into beta_feedback (user_id, kind, message, page, contact_ok)
    values (${userId}, ${fb.kind}, ${fb.message}, ${fb.page}, ${fb.contactOk})
  `;
  return { result: "ok", fb };
}

const KIND_LABEL: Record<FeedbackKind, string> = {
  comentario: "Comentario",
  problema: "Problema",
  idea: "Idea",
};

/** The mail to the owner. The sender's mail goes in only if they said so. */
export function feedbackMail(fb: FeedbackInput, to: string, replyTo: string | null): SendInput {
  return {
    to,
    subject: `Cifra · ${KIND_LABEL[fb.kind].toLowerCase()} de la beta`,
    kicker: "Beta",
    heading: `${KIND_LABEL[fb.kind]} nuevo`,
    preheader: fb.message.slice(0, 90),
    body: fb.message,
    ledger: [
      ["Pantalla", fb.page ?? "—"],
      ["Responder", fb.contactOk && replyTo ? replyTo : "Prefiere que no le escriban"],
    ],
    note: "Lo ves también en cifra.lol/panel.",
  };
}

export type FeedbackRow = {
  kind: FeedbackKind;
  message: string;
  page: string | null;
  contactOk: boolean;
  createdAt: string;
};

export type BetaMetrics = {
  invites: { codes: number; usable: number; used: number; waitlist: number };
  users: { total: number; verified: number; new7: number; active7: number };
  features: {
    key: "tarjetas" | "pdf" | "asistente" | "metas";
    users: number;
    uses30: number | null;
  }[];
  feedback: { total: number; last7: number; recent: FeedbackRow[] };
};

const num = (v: unknown) => Number(v ?? 0) || 0;

export async function betaMetrics(sql: Sql): Promise<BetaMetrics> {
  const [inv] = await sql<Record<string, number>>`
    select count(*)::int as codes,
           count(*) filter (where uses < max_uses and revoked_at is null and (expires_at is null or expires_at > now()))::int as usable,
           coalesce(sum(uses), 0)::int as used,
           (select count(*)::int from beta_waitlist) as waitlist
    from beta_invites
  `;
  const [u] = await sql<Record<string, number>>`
    select count(*)::int as total,
           count(*) filter (where "emailVerified")::int as verified,
           count(*) filter (where "createdAt" > now() - interval '7 days')::int as new7,
           (select count(*)::int from (
              select "userId" as id from "session" where "updatedAt" > now() - interval '7 days'
              union
              select user_id from ledger_transactions where created_at > now() - interval '7 days'
            ) a where a.id in (select id from "user")) as active7
    from "user"
  `;
  const [f] = await sql<Record<string, number>>`
    select
      (select count(distinct user_id)::int from ledger_cards where user_id in (select id from "user")) as cards,
      (select count(distinct user_id)::int from ledger_card_statements where user_id in (select id from "user")) as pdf_users,
      (select count(*)::int from ai_call_log where kind = 'pdf' and result = 'ok' and day > current_date - 30) as pdf30,
      (select count(distinct user_id)::int from ai_call_log where kind = 'asistente' and day > current_date - 30
         and user_id in (select id from "user")) as chat_users,
      (select count(*)::int from ai_call_log where kind = 'asistente' and day > current_date - 30) as chat30,
      (select count(*)::int from ledger_settings where jsonb_array_length(goals) > 0 and user_id in (select id from "user")) as goals
  `;
  const [fbc] = await sql<Record<string, number>>`
    select count(*)::int as total, count(*) filter (where created_at > now() - interval '7 days')::int as last7
    from beta_feedback
  `;
  const recent = await sql<{
    kind: FeedbackKind;
    message: string;
    page: string | null;
    contact_ok: boolean;
    created_at: string | Date;
  }>`
    select kind, message, page, contact_ok, created_at from beta_feedback order by created_at desc limit 30
  `;
  return {
    invites: {
      codes: num(inv?.codes),
      usable: num(inv?.usable),
      used: num(inv?.used),
      waitlist: num(inv?.waitlist),
    },
    users: {
      total: num(u?.total),
      verified: num(u?.verified),
      new7: num(u?.new7),
      active7: num(u?.active7),
    },
    features: [
      { key: "tarjetas", users: num(f?.cards), uses30: null },
      { key: "pdf", users: num(f?.pdf_users), uses30: num(f?.pdf30) },
      { key: "asistente", users: num(f?.chat_users), uses30: num(f?.chat30) },
      { key: "metas", users: num(f?.goals), uses30: null },
    ],
    feedback: {
      total: num(fbc?.total),
      last7: num(fbc?.last7),
      recent: recent.map((r) => ({
        kind: r.kind,
        message: r.message,
        page: r.page,
        contactOk: Boolean(r.contact_ok),
        createdAt: new Date(r.created_at).toISOString(),
      })),
    },
  };
}
