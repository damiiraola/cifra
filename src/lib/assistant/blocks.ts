/**
 * The assistant's text as blocks for the chat (pure, no HTML): paragraphs,
 * a line that introduces a list ("Topes sugeridos:") and lists, whose items
 * may be "Etiqueta: valor" rows (shown like a small table on the phone).
 * The same for the model's answers and Cifra's template.
 */
export type ListItem = { label: string; value: string } | { text: string };
export type Block =
  | { kind: "p"; text: string }
  | { kind: "lead"; text: string }
  | { kind: "list"; items: ListItem[] };

const BULLET = /^\s*(?:[-•*·]|\d{1,2}[.)])\s+/;

function item(raw: string): ListItem {
  const text = raw.replace(BULLET, "").replace(/\*\*/g, "").trim();
  const m = text.match(/^([^:]{1,40}):\s+(.+)$/);
  // "Bariloche: llega en mayo 2028" → row; a label with digits is not a label.
  if (m && !/\d/.test(m[1]!)) return { label: m[1]!.trim(), value: m[2]!.trim() };
  return { text };
}

export function answerBlocks(text: string): Block[] {
  const out: Block[] = [];
  const rows = text.replace(/\r/g, "").split("\n");
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]!.trim();
    if (!line) continue;
    if (BULLET.test(line) && !/^\d{1,2}[.)]\s+\d/.test(line)) {
      const last = out[out.length - 1];
      const it = item(line);
      if (last?.kind === "list") last.items.push(it);
      else out.push({ kind: "list", items: [it] });
      continue;
    }
    const clean = line.replace(/\*\*/g, "");
    const next = rows.slice(i + 1).find((r) => r.trim());
    if (clean.endsWith(":") && next && BULLET.test(next.trim()))
      out.push({ kind: "lead", text: clean });
    else out.push({ kind: "p", text: clean });
  }
  return out;
}
