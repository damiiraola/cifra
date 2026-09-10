import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Brain,
  CalendarDays,
  LayoutDashboard,
  List,
  Menu,
  Plus,
  Repeat,
  Settings,
  Target,
} from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useLedger } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QuickAdd } from "@/components/quick-add";
import { ShortcutListener } from "@/components/shortcut-listener";
import { QuotesTicker } from "@/components/quotes-ticker";
import { OutboxFlusher } from "@/components/outbox-flusher";
import { Onboarding } from "@/components/onboarding";
import { BookSwitcher } from "@/components/book-switcher";
import { MoreSheet } from "@/components/more-sheet";
import { Toaster } from "sonner";

const NAV = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/diario", label: "Diario", icon: CalendarDays },
  { to: "/analitica", label: "Analítica", icon: BarChart3 },
  { to: "/ia", label: "Asistente", icon: Brain },
];

const MORE = [
  { to: "/movimientos", label: "Movimientos", icon: List },
  { to: "/presupuestos", label: "Presupuestos", icon: Target },
  { to: "/fijos", label: "Fijos", icon: Repeat },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
];

const TAB = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/movimientos", label: "Movs", icon: List },
  { to: "/fijos", label: "Fijos", icon: Repeat },
  { to: "/presupuestos", label: "Tope", icon: Target },
];

const MORE_PATHS = new Set(["/diario", "/analitica", "/ia", "/ajustes", "/privacidad"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const openQuick = useLedger((s) => s.openQuick);
  const status = useLedger((s) => s.status);
  const hydrate = useLedger((s) => s.hydrate);
  const user = useCurrentUser();
  const userId = user?.id;
  const onboarded = useLedger((s) => s.onboarded);
  const chrome = status === "ready" && onboarded;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreOpen || MORE_PATHS.has(pathname);

  useEffect(() => {
    if (!userId) return;
    void hydrate({ id: userId, email: user?.primaryEmail });
  }, [userId, user?.primaryEmail, hydrate]);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="min-h-dvh bg-bg text-fg">
        <aside className={cn("fixed inset-y-0 left-0 z-30 w-56 flex-col border-r border-border bg-bg px-4 py-6", chrome ? "hidden md:flex" : "hidden")}>
          <Link to="/" className="px-2">
            <p className="font-display text-3xl tracking-tight">Cifra</p>
            <p className="mt-0.5 text-[11px] tracking-wide text-muted uppercase">Libro de gastos</p>
          </Link>
          <div className="mt-5 px-1">
            <BookSwitcher />
          </div>
          <nav className="mt-8 flex flex-1 flex-col gap-1">
            <Button className="mb-3 w-full" onClick={() => openQuick()}>
              <Plus className="size-4" />
              Nuevo
            </Button>
            {[...NAV, ...MORE].map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150",
                    active ? "bg-elevated text-fg" : "text-muted hover:bg-elevated hover:text-fg",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="overflow-hidden px-1 [&_span]:truncate [&_button]:text-muted">
            <UserButton />
          </div>
        </aside>

        {chrome ? <header className="sticky top-0 z-20 border-b border-border bg-bg/90 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm md:hidden">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-2xl leading-none tracking-tight">Cifra</p>
            <div className="flex items-center gap-1">
              <Link to="/ajustes" aria-label="Ajustes" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-elevated hover:text-fg">
                <Settings className="size-4" />
              </Link>
              <Button size="icon-sm" aria-label="Nuevo movimiento" onClick={() => openQuick()}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <div className="mt-3">
            <BookSwitcher />
          </div>
        </header> : null}

        <div className={chrome ? "md:pl-56" : ""}>
          {status === "ready" && !onboarded ? (
            <Onboarding />
          ) : (
          <div className="cifra-main mx-auto min-h-dvh w-full max-w-5xl px-4 pt-4 md:px-8 md:pt-8 md:pb-12">
            {status === "ready" ? (
              children
            ) : status === "error" ? (
              <div className="grid min-h-[50vh] place-items-center">
                <div className="max-w-sm text-center">
                  <p className="font-display text-3xl">No pude abrir el libro</p>
                  <p className="mt-2 text-sm text-muted">Reintentá. Si sigue fallando, recargá la app.</p>
                  <Button className="mt-4" onClick={() => void hydrate()}>
                    Reintentar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="h-10 w-40 animate-pulse rounded-lg bg-elevated" />
                <div className="h-40 animate-pulse rounded-3xl bg-surface" />
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />
                  ))}
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {chrome ? <nav className="cifra-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 px-1 pt-1 backdrop-blur-sm md:hidden">
          <div className="grid grid-cols-5">
            {TAB.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-medium leading-tight",
                    active ? "text-fg" : "text-muted",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-medium leading-tight",
                moreActive ? "text-fg" : "text-muted",
              )}
            >
              <Menu className="size-4" />
              Más
            </button>
          </div>
        </nav> : null}

        <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} pathname={pathname} />
        <QuickAdd />
        <ShortcutListener />
        {chrome ? <QuotesTicker /> : null}
        {chrome ? <OutboxFlusher /> : null}
        <Toaster theme="dark" position="top-center" />
      </div>
    </TooltipProvider>
  );
}
