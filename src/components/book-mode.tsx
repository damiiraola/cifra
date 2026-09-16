import { useEffect, useRef, useState } from "react";
import { Briefcase, UserRound } from "lucide-react";
import { useLedger } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Book } from "@/lib/types";

export function useActiveBook() {
  const books = useLedger((s) => s.books);
  const activeBookId = useLedger((s) => s.activeBookId);
  return books.find((b) => b.id === activeBookId) ?? books[0] ?? null;
}

export function useBusinessBook() {
  return useLedger((s) => s.books.find((b) => b.kind === "business") ?? null);
}

export function usePersonalBook() {
  return useLedger((s) => s.books.find((b) => b.kind === "personal") ?? null);
}

export function BookTheme() {
  const book = useActiveBook();
  const kind = book?.kind === "business" ? "business" : "personal";

  useEffect(() => {
    document.documentElement.dataset.book = kind;
    return () => {
      delete document.documentElement.dataset.book;
    };
  }, [kind]);

  return null;
}

export function BookTransit() {
  const book = useActiveBook();
  const prev = useRef(book?.id);
  const [flash, setFlash] = useState<Book | null>(null);

  useEffect(() => {
    if (!book) return;
    if (prev.current == null) {
      prev.current = book.id;
      return;
    }
    if (prev.current === book.id) return;
    prev.current = book.id;
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    setFlash(book);
    const t = window.setTimeout(() => setFlash(null), 720);
    return () => window.clearTimeout(t);
  }, [book]);

  if (!flash) return null;

  const business = flash.kind === "business";
  return (
    <div
      className="cifra-book-veil pointer-events-none fixed inset-0 z-50 grid place-items-center bg-bg"
      role="status"
      aria-live="polite"
    >
      <div className="px-6 text-center">
        <p className="cifra-book-kicker text-[11px] font-medium tracking-wide text-muted uppercase">
          {business ? "Entrando al libro" : "Volviendo"}
        </p>
        <p className="cifra-book-title mt-2 font-display text-6xl tracking-tight text-fg">{flash.name}</p>
      </div>
    </div>
  );
}

export function BookMark() {
  const book = useActiveBook();
  const personal = usePersonalBook();
  const setActiveBook = useLedger((s) => s.setActiveBook);
  if (!book) return null;
  const business = book.kind === "business";

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="font-display text-2xl leading-none tracking-tight">{business ? "Negocio" : "Cifra"}</p>
        {business ? (
          <p className="mt-1 text-[11px] tracking-wide text-muted uppercase">Libro separado</p>
        ) : null}
      </div>
      {business && personal ? (
        <button
          type="button"
          onClick={() => setActiveBook(personal.id)}
          className="h-11 rounded-lg px-3 text-sm text-muted hover:bg-elevated hover:text-fg"
        >
          Personal
        </button>
      ) : null}
    </div>
  );
}

export function BookEntryButton({
  onPicked,
  className,
}: {
  onPicked?: () => void;
  className?: string;
}) {
  const book = useActiveBook();
  const personal = usePersonalBook();
  const business = useBusinessBook();
  const setActiveBook = useLedger((s) => s.setActiveBook);
  if (!personal || !business || !book) return null;

  const inBusiness = book.kind === "business";
  const target = inBusiness ? personal : business;
  const Icon = inBusiness ? UserRound : Briefcase;

  return (
    <button
      type="button"
      onClick={() => {
        setActiveBook(target.id);
        onPicked?.();
      }}
      className={cn(
        "flex h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted hover:bg-elevated hover:text-fg",
        className,
      )}
    >
      <Icon className="size-4" />
      {inBusiness ? "Volver a Personal" : "Entrar a Negocio"}
    </button>
  );
}