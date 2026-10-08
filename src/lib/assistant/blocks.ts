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

/**
 * A paragraph the model wrote as "Cuota: $ 50.000. Primera: noviembre 2026.
 * Última: octubre 2027." (no line breaks): two or more "Etiqueta: valor."
 * sentences in a row become rows; the other sentences stay as text. Dots
 * inside numbers ("$ 1.250.000") are not followed by a space, so they don't
 * end a sentence.
 */
function inlineRows(text: string): Block[] {
  const sentences = text.split(/(?<=[.!?])\s+(?=[¿¡]?\p{Lu})/u);
  const rowOf = (x: string) => {
    const m = x.match(/^([^:\d]{1,28}):\s+(.+?)\.?$/u);
    if (!m || m[1]!.trim().split(/\s+/).length > 4) return null;
    return { label: m[1]!.trim(), value: m[2]!.trim() };
  };
  const out: Block[] = [];
  let i = 0;
  while (i < sentences.length) {
    let j = i;
    while (j < sentences.length && rowOf(sentences[j]!)) j++;
    if (j - i >= 2) {
      out.push({ kind: "list", items: sentences.slice(i, j).map((x) => rowOf(x)!) });
      i = j;
      continue;
    }
    const last = out[out.length - 1];
    if (last?.kind === "p") last.text += ` ${sentences[i]}`;
    else out.push({ kind: "p", text: sentences[i]! });
    i++;
  }
  return out;
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
    else out.push(...inlineRows(clean));
  }
  return out;
}
