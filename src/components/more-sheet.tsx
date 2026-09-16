import { Link } from "@tanstack/react-router";
import { Brain, LogOut, Settings, Shield, Target } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { BookEntryButton } from "@/components/book-mode";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

const ITEMS = [
  { to: "/presupuestos", label: "Presupuestos", icon: Target },
  { to: "/ia", label: "Asistente", icon: Brain },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

export function MoreSheet({
  open,
  onOpenChange,
  pathname,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <DrawerTitle>Más</DrawerTitle>
          <DrawerDescription className="mt-1">Negocio, tope, asistente y cuenta.</DrawerDescription>
          <nav className="mt-5 grid gap-1">
            <BookEntryButton onPicked={() => onOpenChange(false)} />
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                    active ? "bg-elevated text-fg" : "text-muted hover:bg-elevated hover:text-fg",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            <Link
              to="/privacidad"
              onClick={() => onOpenChange(false)}
              className={cn(
                "flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                pathname === "/privacidad" ? "bg-elevated text-fg" : "text-muted hover:bg-elevated hover:text-fg",
              )}
            >
              <Shield className="size-4" />
              Privacidad
            </Link>
            <button
              type="button"
              className="mt-2 flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted hover:bg-elevated hover:text-fg"
              onClick={() => {
                onOpenChange(false);
                void signOut("/login").catch(() => undefined);
              }}
            >
              <LogOut className="size-4" />
              Cerrar sesión
            </button>
          </nav>
        </div>
      </DrawerContent>
    </Drawer>
  );
}