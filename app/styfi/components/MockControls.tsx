"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "@/state/identity";
import { Button } from "@/components/ui/Button";
import { styfiKeys } from "@/lib/hooks/useStyfi";
import { veyfiKeys } from "@/lib/hooks/useVeyfi";
import { useProtocol } from "@/state/protocol";
import { toast } from "@/components/ui/Toast";
import { DebugControls } from "@/components/DebugControls";
import { LlyfiTokenId } from "@/lib/clients/veyfi";
import { getLlyfiDisplaySymbol } from "@/lib/clients/veyfi/display";
import { setStyfiMockScenario, type StyfiMockScenario } from "@/lib/clients/styfi/scenarios";
import { styfiCopy as copy } from "../messages";

export function MockControls() {
  const queryClient = useQueryClient();
  const { address } = useIdentity();
  const { styfi, veyfi } = useProtocol();

  const handleInjectBalance = useCallback(
    async (mode: "stYFI" | "stYFIx") => {
      // Amount: 100
      const amount = 100n * 10n ** 18n;

      if (address && styfi.debugSetBalance) {
        // Connected: Apply immediately
        styfi.debugSetBalance(address, mode, amount);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: styfiKeys.account(address),
          }),
          queryClient.invalidateQueries({
            queryKey: ["cross-app", "nudge"],
          }),
        ]);
        toast.success(`Added 100 ${mode} to ${address.slice(0, 6)}...`);
      } else if (styfi.debugSetPendingBalance) {
        // Disconnected: Queue for next connection
        styfi.debugSetPendingBalance(mode, amount);
        toast.success(`Pending: 100 ${mode} will be added upon connection.`);
      }
    },
    [address, styfi, queryClient]
  );

  const handleInjectVeYfi = useCallback(async () => {
    const amount = 10n * 10n ** 18n;
    if (!veyfi.debugSetPendingVeYfi) return;

    veyfi.debugSetPendingVeYfi(amount);
    if (address) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: veyfiKeys.account(address),
        }),
        queryClient.invalidateQueries({
          queryKey: ["cross-app", "nudge"],
        }),
      ]);
      toast.success("Added 10 legacy veYFI");
      return;
    }

    toast.success("Pending: 10 legacy veYFI will be added upon connection");
  }, [veyfi, address, queryClient]);

  const handleInjectLlyfi = useCallback(
    async (symbol: LlyfiTokenId, amount: bigint) => {
      if (address && veyfi.debugSetLlyfiBalance) {
        veyfi.debugSetLlyfiBalance(address, symbol, amount);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: veyfiKeys.account(address),
          }),
          queryClient.invalidateQueries({
            queryKey: ["cross-app", "nudge"],
          }),
        ]);
        toast.success(
          `Added ${amount / 10n ** 18n} ${getLlyfiDisplaySymbol(symbol)}`
        );
      } else {
        toast.error("Connect wallet first");
      }
    },
    [veyfi, address, queryClient]
  );

  const handleSeedExternalPortfolio = useCallback(async () => {
    if (!address || !veyfi.debugSeedStakedExternalPortfolio) {
      toast.error("Connect wallet first");
      return;
    }

    veyfi.debugSeedStakedExternalPortfolio(address);
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: veyfiKeys.account(address),
      }),
      queryClient.invalidateQueries({
        queryKey: ["cross-app", "nudge"],
      }),
    ]);
    toast.success("Seeded migrated veYFI + staked LLYFI");
  }, [address, veyfi, queryClient]);

  const handleInjectYfi = useCallback(async () => {
    const amount = 10n * 10n ** 18n;
    if (address && styfi.debugMintYfi) {
      styfi.debugMintYfi(address, amount);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: styfiKeys.account(address) }),
        queryClient.invalidateQueries({ queryKey: ["cross-app", "nudge"] }),
      ]);
      toast.success("Added 10 YFI");
    } else {
      toast.error("Connect wallet first");
    }
  }, [styfi, address, queryClient]);

  return (
    <DebugControls>
      <div className="grid grid-cols-2 gap-2 mb-2" aria-label={copy.debug.aprScenariosLabel}>
        {(["full", "partial", "missed", "ybc"] as const).map((scenario: StyfiMockScenario) => (
          <Button key={scenario} size="sm" variant="secondary" onClick={async () => {
            setStyfiMockScenario(scenario);
            if (address && styfi.debugSetBalance) {
              const account = await styfi.getAccountState(address);
              if (account.styfiActive === 0n) styfi.debugSetBalance(address, "stYFI", 25n * 10n ** 18n);
            }
            await queryClient.invalidateQueries({ refetchType: "all" });
          }}>
            {copy.debug.aprScenarios[scenario]}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handleInjectBalance("stYFI")}
        >
          Add stYFI
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handleInjectBalance("stYFIx")}
        >
          Add stYFIx
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 pt-2 mb-2">
        <p className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
          Seed External Portfolio
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="col-span-2"
          onClick={handleSeedExternalPortfolio}
        >
          Add External Portfolio
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 pt-2 mb-2">
        <Button size="sm" variant="secondary" onClick={handleInjectVeYfi}>
          +10 Legacy veYFI
        </Button>
        <Button size="sm" variant="secondary" onClick={handleInjectYfi}>
          +10 YFI
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handleInjectLlyfi("sdYFI", 10n * 10n ** 18n)}
        >
          +10 sdYFI
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handleInjectLlyfi("coveYFI", 10n * 10n ** 18n)}
        >
          +10 coveYFI
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="col-span-2"
          onClick={() => handleInjectLlyfi("upYFI", 10000n * 10n ** 18n)}
        >
          +10,000 {getLlyfiDisplaySymbol("upYFI")}
        </Button>
      </div>
    </DebugControls>
  );
}
