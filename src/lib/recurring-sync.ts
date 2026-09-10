import type { Recurring } from "./types";

export function recurringFingerprint(row: Recurring): string {
  return [
    row.type,
    row.name.trim().toLowerCase(),
    row.bookId,
    String(row.day),
    String(row.amount),
    row.currency,
  ].join("|");
}

export function mergeRecurrings(remote: Recurring[], incoming: Recurring[]): {
  merged: Recurring[];
  added: Recurring[];
} {
  const byId = new Map(remote.map((r) => [r.id, r]));
  const fps = new Set(remote.map(recurringFingerprint));
  const added: Recurring[] = [];
  for (const row of incoming) {
    if (!row?.id) continue;
    if (byId.has(row.id)) continue;
    const fp = recurringFingerprint(row);
    if (fps.has(fp)) continue;
    added.push(row);
    byId.set(row.id, row);
    fps.add(fp);
  }
  return { merged: [...remote, ...added], added };
}
