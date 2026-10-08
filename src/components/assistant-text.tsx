import { answerBlocks } from "@/lib/assistant/blocks";

/** The assistant's answer, laid out for the phone: short paragraphs, lists and label/value rows. */
export function AssistantText({ text }: { text: string }) {
  const blocks = answerBlocks(text);
  return (
    <div className="grid gap-2 text-sm leading-relaxed text-fg">
      {blocks.map((b, i) =>
        b.kind === "list" ? (
          <ul
            key={i}
            className="grid gap-1.5 rounded-2xl px-3.5 py-2.5 shadow-[0_0_0_1px_rgba(244,244,240,0.08)]"
          >
            {b.items.map((it, j) =>
              "label" in it && it.value.length <= 28 ? (
                <li key={j} className="flex items-baseline justify-between gap-3">
                  <span className="text-muted">{it.label}</span>
                  <span className="text-right whitespace-nowrap tabular-nums">{it.value}</span>
                </li>
              ) : "label" in it ? (
                // A long value ("no llega para enero 2027; …") reads better under its label.
                <li key={j} className="grid">
                  <span className="text-muted">{it.label}</span>
                  <span>{it.value}</span>
                </li>
              ) : (
                <li key={j} className="flex gap-2">
                  <span aria-hidden className="text-subtle">
                    •
                  </span>
                  <span>{it.text}</span>
                </li>
              ),
            )}
          </ul>
        ) : b.kind === "lead" ? (
          <p key={i} className="pt-1 text-xs font-medium tracking-wide text-muted uppercase">
            {b.text.replace(/:$/, "")}
          </p>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}
