import type { Transaction } from "./types";

export const OUTBOX_MAX_TRIES = 3;

export type OutboxAction = "add" | "update" | "delete";

export type OutboxOp = {
  id: string;
  action: OutboxAction;
  row?: Transaction;
  at: number;
  tries: number;
};

export function parseOutbox(raw: unknown): OutboxOp[] {
  if (!Array.isArray(raw)) return [];
  const out: OutboxOp[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? "");
    const action = o.action;
    if (!id || seen.has(id)) continue;
    if (action !== "add" && action !== "update" && action !== "delete") continue;
    const row = isTx(o.row) ? o.row : undefined;
    if ((action === "add" || action === "update") && !row) continue;
    seen.add(id);
    out.push({
      id,
      action,
      row,
      at: Number(o.at) || 0,
      tries: Math.max(0, Number(o.tries) || 0),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

function isTx(raw: unknown): raw is Transaction {
  if (!raw || typeof raw !== "object") return false;
  const t = raw as Partial<Transaction>;
  return typeof t.id === "string" && t.id.length > 0 && typeof t.amount === "number";
}

export function enqueue(outbox: OutboxOp[], op: OutboxOp): OutboxOp[] {
  const prev = outbox.find((x) => x.id === op.id);
  const rest = outbox.filter((x) => x.id !== op.id);
  if (op.action === "delete" && prev?.action === "add") return rest;
  if (op.action === "update" && prev?.action === "add" && op.row) {
    return [...rest, { ...prev, row: op.row, at: op.at }].sort((a, b) => a.at - b.at);
  }
  return [...rest, { ...op, tries: prev && op.action === prev.action ? prev.tries : 0 }].sort(
    (a, b) => a.at - b.at,
  );
}

export function applyOutbox(snapshot: Transaction[], outbox: OutboxOp[]): Transaction[] {
  let txs = snapshot.slice();
  for (const op of outbox) {
    if (op.action === "delete") {
      txs = txs.filter((t) => t.id !== op.id);
      continue;
    }
    if (!op.row) continue;
    const idx = txs.findIndex((t) => t.id === op.id);
    if (idx >= 0) txs[idx] = op.row;
    else txs = [op.row, ...txs];
  }
  return txs;
}

function sig(t: Transaction) {
  return [
    t.type,
    t.amount,
    t.currency,
    t.categoryId,
    t.note,
    t.merchant,
    t.date,
    t.method,
    t.accountId,
    t.counterpartyId,
    t.amountTo,
    t.rateArs,
    t.rateLocked,
  ].join("|");
}

export function pruneOutbox(outbox: OutboxOp[], remote: Transaction[]): OutboxOp[] {
  const byId = new Map(remote.map((t) => [t.id, t]));
  return outbox.filter((op) => {
    const remoteTx = byId.get(op.id);
    if (op.action === "add") return !remoteTx;
    if (op.action === "delete") return Boolean(remoteTx);
    if (op.action === "update") {
      if (!remoteTx || !op.row) return true;
      return sig(remoteTx) !== sig(op.row);
    }
    return true;
  });
}

export function resetTries(outbox: OutboxOp[]): OutboxOp[] {
  return outbox.map((op) => (op.tries ? { ...op, tries: 0 } : op));
}
