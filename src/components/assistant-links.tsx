import { Link } from "@tanstack/react-router";
import { ArrowRight, MessageCircle } from "lucide-react";
import type { GuideLink } from "@/lib/assistant/app-guide";
import { openFeedback } from "@/lib/feedback-events";

const CHIP =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-elevated px-3.5 text-[13px] text-fg shadow-[0_0_0_1px_rgba(244,244,240,0.16)] transition-colors duration-150 hover:bg-surface";

/** "Ir a Tarjetas", "Abrir Contanos": straight to the place the answer talks about. */
export function AssistantLinks({ links }: { links: GuideLink[] }) {
  if (!links.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Ir a la app">
      {links.map((l) => {
        if ("action" in l) {
          return (
            <button key={l.action} type="button" className={CHIP} onClick={() => openFeedback()}>
              <MessageCircle className="size-4" aria-hidden />
              {l.label}
            </button>
          );
        }
        const [path, hash] = l.to.split("#");
        return (
          <Link key={l.to} to={path as "/"} hash={hash || undefined} className={CHIP}>
            {l.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        );
      })}
    </div>
  );
}
