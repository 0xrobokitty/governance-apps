"use client";
import { useEffect, useState } from "react";
import { useTx } from "@/lib/tx/useTx";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import type { AuctionScenario, RecoverySnapshot } from "@/lib/clients/yeth/recovery/types";

export function useYethRecoveryPreview() {
  const [client] = useState(() => new MockRecoveryPreviewClient());
  const [snapshot, setSnapshot] = useState<RecoverySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<AuctionScenario>("active");
  const tx = useTx();
  useEffect(() => {
    const refresh = () => {
      try { setSnapshot(client.getSnapshot()); setError(null); }
      catch (error) { setSnapshot(null); setError(error instanceof Error ? error.message : "Preview unavailable."); }
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [client, scenario]);
  const refresh = () => setSnapshot(client.getSnapshot());
  return {
    snapshot, error, scenario, tx,
    setScenario: (value: AuctionScenario) => { client.setScenario(value); setScenario(value); tx.reset(); try { refresh(); setError(null); } catch { setSnapshot(null); } },
    advance: () => { client.advanceStep(); refresh(); },
    approve: (shares: bigint) => tx.execute(client.prepareApprove(shares), { skipWaitForReceipt: true, onSuccess: refresh }),
    take: async (weth: bigint, shares: bigint, kickedAt: number): Promise<RecoverySnapshot | null> => {
      let result: RecoverySnapshot | null = null;
      await tx.execute(client.prepareTake(weth, shares, kickedAt), { skipWaitForReceipt: true, onSuccess: () => { result = client.getSnapshot(); refresh(); } });
      return result;
    },
    redeem: async () => {
      let success = false;
      await tx.execute(client.prepareRedeem(), { skipWaitForReceipt: true, onSuccess: () => { success = true; refresh(); } });
      return success;
    },
  };
}
