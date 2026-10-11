import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { toast } from "sonner";
import { useInstall } from "@/lib/install";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

/** "Instalar Cifra" in Más: native prompt on Android, steps on iPhone. */
export function InstallEntry({ onDone }: { onDone?: () => void }) {
  const { mode, prompt, dismiss } = useInstall();
  const [steps, setSteps] = useState(false);
  if (mode === "hidden" && !steps) return null;
  return (
    <>
      {mode !== "hidden" ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex h-12 flex-1 items-center gap-3 rounded-xl px-3 text-sm font-medium text-fg hover:bg-elevated"
            onClick={async () => {
              if (mode === "ios") return setSteps(true);
              const ok = await prompt();
              if (ok) {
                toast.success("Listo: Cifra quedó en tu inicio.");
                onDone?.();
              }
            }}
          >
            <Download className="size-4" />
            Instalar Cifra
          </button>
          <button
            type="button"
            aria-label="No mostrar Instalar Cifra"
            className="grid size-11 place-items-center rounded-xl text-subtle hover:bg-elevated hover:text-fg"
            onClick={dismiss}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      <Drawer open={steps} onOpenChange={setSteps}>
        <DrawerContent>
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
            <DrawerTitle>Instalar Cifra en el iPhone</DrawerTitle>
            <DrawerDescription className="mt-1">Queda como una app, con su ícono y a pantalla completa.</DrawerDescription>
            <ol className="mt-5 grid gap-4 text-sm">
              <li className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-elevated"><Share className="size-4" /></span>
                <span>Tocá <b>Compartir</b> en la barra de Safari (el cuadrado con la flecha para arriba).</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-elevated"><SquarePlus className="size-4" /></span>
                <span>Bajá y elegí <b>Agregar a inicio</b>.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-elevated text-xs font-semibold">3</span>
                <span>Tocá <b>Agregar</b>. Abrí Cifra desde el ícono nuevo.</span>
              </li>
            </ol>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => { dismiss(); setSteps(false); }}>Ya la instalé</Button>
              <Button onClick={() => setSteps(false)}>Entendido</Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
