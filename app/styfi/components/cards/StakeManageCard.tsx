"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { useStyfiAccount } from "@/lib/hooks/useStyfi";
import { useEpochCountdown } from "@/lib/hooks/useEpochCountdown";
import { ModeComparison } from "../ModeComparison";
import { StyfiAsset } from "../types";
import { StakeTab } from "./stake/StakeTab";
import { UnstakeTab } from "./stake/UnstakeTab";
import { styfiCopy as copy } from "../../messages";
import { StreamingBadge, ReadyBadge } from "@/components/domain/Badges";
import { useStyfiApr } from "@/lib/hooks/useStyfiApr";
import { StakingAprEstimate } from "../StakingAprEstimate";

type Props = {
  selectedAsset: StyfiAsset;
  onSelectAsset: (asset: StyfiAsset) => void;
};

export function StakeManageCard({ selectedAsset, onSelectAsset }: Props) {
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const { data } = useStyfiAccount();
  const { data: apr, isLoading: isAprLoading } = useStyfiApr();

  const cooldown =
    selectedAsset === "stYFI" ? data?.styfiCooldown : data?.styfiX.cooldown;
  const { isComplete } = useEpochCountdown(cooldown?.endsAt);

  const styfixUnstaking =
    data?.styfiX.assetsInCooldown !== undefined &&
    data.styfiX.assetsInCooldown > 0n
      ? data.styfiX.assetsInCooldown
      : data?.styfiX.sharesInCooldown ?? 0n;
  const unstakingBalance =
    selectedAsset === "stYFI"
      ? data?.styfiInCooldown ?? 0n
      : styfixUnstaking;

  let unstakeBadge;
  if (unstakingBalance > 0n) {
    unstakeBadge = isComplete ? (
      <ReadyBadge className="text-sunset-600" />
    ) : (
      <StreamingBadge className="text-sunset-600" />
    );
  }

  return (
    <Card className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-1">
          {(["stYFI", "stYFIx"] as const).map((asset) => {
            const isActive = selectedAsset === asset;
            return (
              <button
                key={asset}
                type="button"
                onClick={() => onSelectAsset(asset)}
                aria-pressed={isActive}
                className={`min-h-10 rounded-md px-4 py-1.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
                  isActive
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {asset}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setIsCompareOpen(true)}
          className="inline-flex min-h-10 items-center rounded-md px-2 text-xs font-semibold text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-[color] duration-150 ease-out hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app"
        >
          {copy.modeSelector.compareLabel}
        </button>
      </div>

      <div className="space-y-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3">
        <StakingAprEstimate asset={selectedAsset} snapshot={apr} isLoading={isAprLoading} compact />
        <p className="text-xs leading-relaxed text-neutral-600">
          {selectedAsset === "stYFI" ? copy.stakeManage.description.styfi : copy.stakeManage.description.x}
        </p>
      </div>

      <div>
        <Tabs
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as "stake" | "unstake")}
          variant="line"
          tabs={[
            { id: "stake", label: copy.stakeManage.tabs.stake },
            {
              id: "unstake",
              label: copy.stakeManage.tabs.unstake,
              badge: unstakeBadge,
            },
          ]}
        />
      </div>

      <div className="pt-2">
        {activeTab === "stake" && <StakeTab asset={selectedAsset} />}
        {activeTab === "unstake" && <UnstakeTab asset={selectedAsset} />}
      </div>

      <Modal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        title={copy.modeSelector.compareLabel}
        className="max-w-2xl"
      >
        <ModeComparison
          selectedAsset={selectedAsset}
          onSelectAsset={onSelectAsset}
        />
      </Modal>
    </Card>
  );
}
