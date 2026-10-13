"use client";

import { GovernanceAppNotice } from "../GovernanceShell";
import { useEffect } from "react";
import { VeyfiStatsBar } from "./components/VeyfiStatsBar";
import { VeyfiCockpit } from "./components/VeyfiCockpit";
import { useProtocol } from "@/state/protocol";
import { MockControls } from "./components/MockControls";
import { CrossAppNudge } from "@/components/domain/CrossAppNudge";
import { useCrossChainNudge } from "@/lib/hooks/useCrossChainNudge";
import { scrollToTargetWhenReady } from "@/lib/scrollToTarget";
import { ContractsFooter } from "@/components/domain/ContractsFooter";
import {
  LIQUID_LOCKER_REDEMPTION_ADDRESS,
  VEYFI_ADDRESS,
  VEYFI_REWARD_DISTRIBUTOR_ADDRESS,
} from "@/lib/constants";

type VeyfiPageClientProps = {
  hostname?: string | null;
};

export function VeyfiPageClient({ hostname }: VeyfiPageClientProps) {
  const { usesMockBackend } = useProtocol();
  const { nudge, dismiss } = useCrossChainNudge({
    currentApp: "veyfi",
    hostname,
  });
  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const action = search.get("action");
    const focus = search.get("focus");
    const hash = window.location.hash.replace(/^#/, "");
    const targetId =
      hash ||
      (action === "migration"
        ? "migration-card"
        : focus === "stake" || focus === "manage"
          ? "llyfi-ledger"
          : "");
    if (!targetId) return;

    return scrollToTargetWhenReady(targetId);
  }, []);

  return (
    <div className="space-y-0">
      <VeyfiStatsBar />
      <GovernanceAppNotice placement="after-stats" />

      <main className="container mx-auto px-4 md:px-6 pt-8 space-y-8 pb-24">
        <CrossAppNudge nudge={nudge} onDismiss={dismiss} />
        <VeyfiCockpit hostname={hostname} />
        <ContractsFooter
          contracts={[
            { label: "Legacy veYFI", address: VEYFI_ADDRESS },
            {
              label: "veYFI Reward Distributor",
              address: VEYFI_REWARD_DISTRIBUTOR_ADDRESS,
            },
            {
              label: "Global Redemption Facility",
              address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
            },
          ]}
        />
      </main>

      {usesMockBackend && <MockControls />}
    </div>
  );
}
