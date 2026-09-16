import { moneyARS } from "@/lib/format";
import { toARS } from "@/lib/analytics";
import { useLedger } from "@/lib/store";
import { TxRow } from "@/components/tx-row";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { Transaction } from "@/lib/types";

export function DrillSheet({
  title,
  hint,
  txs,
  open,
  onOpenChange,
}: {
  title: string;
  hint?: string;
  txs: Transaction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { usdRate, usdtRate, openQuick } = useLedger();
  const fx = { usd: usdRate, usdt: usdtRate };
  const total = txs
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + toARS(t, fx), 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="min-h-0 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className="mt-1">
            {hint ?? `${txs.length} movimientos · ${moneyARS(total)}`}
          </DrawerDescription>
          <div className="mt-4">
            {txs.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                showDate
                onClick={() => {
                  onOpenChange(false);
                  openQuick(tx);
                }}
              />
            ))}
            {txs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Nada en este recorte.</p>
            ) : null}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}