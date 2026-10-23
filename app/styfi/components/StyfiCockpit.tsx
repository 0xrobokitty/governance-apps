"use client";

import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useDisconnect } from "wagmi";
import { resetMockStyfiStore } from "@/lib/clients/styfi/mock";
import { resetMockVeyfiStore } from "@/lib/clients/veyfi/mock";
import { useProtocol } from "@/state/protocol";
import { RewardsCard } from "./cards/RewardsCard";
import { StakeManageCard } from "./cards/StakeManageCard";
import { styfiCopy as copy } from "../messages";
import type { StyfiAsset } from "./types";

type Props = {
  selectedAsset: StyfiAsset;
  onSelectAsset: (asset: StyfiAsset) => void;
};

export function StyfiCockpit({
  selectedAsset,
  onSelectAsset,
}: Props) {
  const { usesMockBackend } = useProtocol();

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <StakeManageCard
          selectedAsset={selectedAsset}
          onSelectAsset={onSelectAsset}
        />
        <div id="rewards" className="scroll-mt-8">
          <RewardsCard />
        </div>
      </div>

      {usesMockBackend && <MockModeBanner />}
    </div>
  );
}

function MockModeBanner() {
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);
  const { disconnectAsync } = useDisconnect();

  const handleReset = useCallback(async () => {
    setIsResetting(true);
    try {
      try {
        await disconnectAsync?.();
      } catch {
        // best effort only
      }

      resetMockStyfiStore();
      resetMockVeyfiStore();
      queryClient.clear();

      if (typeof window !== "undefined") {
        try {
          window.localStorage.clear();
        } catch {
          // best effort only
        }

        try {
          window.sessionStorage?.clear();
        } catch {
          // best effort only
        }

        window.location.reload();
      }
    } finally {
      setIsResetting(false);
    }
  }, [disconnectAsync, queryClient]);

  return (
    <Banner variant="info" title={copy.cockpit.mockBanner.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{copy.cockpit.mockBanner.body}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleReset}
          isLoading={isResetting}
        >
          {copy.cockpit.mockBanner.resetCta}
        </Button>
      </div>
    </Banner>
  );
}
