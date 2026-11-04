"use client";

import { GovernanceAppNotice } from "../GovernanceShell";
import { useConnectModal } from "@/web3/wallet-ui";
import { useIdentity } from "@/state/identity";
import { StatsBar } from "@/components/ui/StatsBar";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatPercent, formatTokenAmount } from "@/lib/format";
import {
  useStyfiAccount,
  useStyfiStats,
} from "@/lib/hooks/useStyfi";
import { useStyfiApr } from "@/lib/hooks/useStyfiApr";
import { useVeyfiAccount, useVeyfiStats } from "@/lib/hooks/useVeyfi";
import { StyfiCockpit } from "./components/StyfiCockpit";
import { AccountSummary } from "./components/AccountSummary";
import type { StyfiAsset } from "./components/types";
import { styfiCopy as copy } from "./messages";
import { MockControls } from "./components/MockControls";
import { useProtocol } from "@/state/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StyfiAccountState } from "@/lib/clients/styfi/types";
import { useEpochClock } from "@/lib/hooks/useEpochClock";
import { CrossAppNudge } from "@/components/domain/CrossAppNudge";
import { useCrossChainNudge } from "@/lib/hooks/useCrossChainNudge";
import { scrollToTargetWhenReady } from "@/lib/scrollToTarget";
import { deriveExternalPositions } from "./external-positions";
import { getLlyfiBackingYfi } from "@/lib/portfolio/governance";
import { ContractsFooter } from "@/components/domain/ContractsFooter";
import {
  REWARD_CLAIMER_ADDRESS,
  REWARD_TOKEN_CONFIG,
  STYFI_ADDRESS,
  STYFIX_ADDRESS,
  YFI_ADDRESS,
} from "@/lib/constants";

function deriveBalances(account: StyfiAccountState) {
  const styfiActive = account.styfiActive;
  const styfiUnstaking = account.styfiInCooldown;
  const styfiWithdrawable = account.styfiWithdrawable;
  const styfiTotalRaw = styfiActive + styfiUnstaking + account.styfiUnlocked;
  const styfiTotal = styfiTotalRaw > 0n ? styfiTotalRaw : styfiWithdrawable;

  const styfixActive =
    account.styfiX.assetsActive > 0n
      ? account.styfiX.assetsActive
      : account.styfiX.sharesActive;
  const styfixUnstaking =
    account.styfiX.assetsInCooldown > 0n
      ? account.styfiX.assetsInCooldown
      : account.styfiX.sharesInCooldown;
  const styfixWithdrawable = account.styfiX.assetsWithdrawable;
  const styfixTotalRaw =
    styfixActive + styfixUnstaking + account.styfiX.assetsUnlocked;
  const styfixTotal = styfixTotalRaw > 0n ? styfixTotalRaw : styfixWithdrawable;

  return {
    styfi: {
      active: styfiActive,
      unstaking: styfiUnstaking,
      withdrawable: styfiWithdrawable,
      total: styfiTotal,
    },
    styfix: {
      active: styfixActive,
      unstaking: styfixUnstaking,
      withdrawable: styfixWithdrawable,
      total: styfixTotal,
    },
  };
}

type StyfiPageClientProps = {
  hostname?: string | null;
};

export function StyfiPageClient({ hostname }: StyfiPageClientProps) {
  const { usesMockBackend } = useProtocol();

  return (
    <>
      <StyfiPageShell hostname={hostname} />
      {usesMockBackend && <MockControls />}
    </>
  );
}

function StyfiPageShell({ hostname }: StyfiPageClientProps) {
  const { isConnected, isWrongNetwork } = useIdentity();
  const { openConnectModal } = useConnectModal();
  const { data: apr } = useStyfiApr();
  const { data: stats } = useStyfiStats();
  const { data: account, isLoading: isAccountLoading } = useStyfiAccount();
  const { data: veyfiAccount, isLoading: isVeyfiLoading } = useVeyfiAccount();
  const { data: veyfiStats } = useVeyfiStats();
  const { globalData } = useProtocol();
  const { epochInfo, now } = useEpochClock({ tickMs: 60_000 });
  const [selectedAsset, setSelectedAsset] = useState<StyfiAsset>();
  const cockpitRef = useRef<HTMLDivElement>(null);
  const { nudge, dismiss } = useCrossChainNudge({
    currentApp: "styfi",
    hostname,
  });

  const handleSelectAsset = useCallback((asset: StyfiAsset) => {
    setSelectedAsset(asset);
  }, []);

  const handleHeroSelect = useCallback((asset: StyfiAsset) => {
    setSelectedAsset(asset);
    setTimeout(() => {
      cockpitRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  }, []);

  // Resolve the initial selection once, without an effect-driven render.
  if (selectedAsset === undefined && account) {
    const derived = deriveBalances(account);
    setSelectedAsset(
      derived.styfi.total > derived.styfix.total ? "stYFI" : "stYFIx"
    );
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const focus = search.get("focus");
    const hash = window.location.hash.replace(/^#/, "");
    const targetId =
      hash ||
      (focus === "rewards"
        ? "rewards"
        : focus === "stake"
          ? "stake-manage"
          : "");
    if (!targetId) return;

    return scrollToTargetWhenReady(targetId);
  }, []);

  // Dynamic stats or loading placeholder
  const totalSupply = stats
    ? formatTokenAmount(stats.totalSupply, 18, 0) + " YFI"
    : "-- YFI";

  const statsApyBps = apr?.baseAprBps ?? undefined;
  const formattedApy = apr?.styfixAprBps == null
    ? "--%"
    : formatPercent(Number(apr.styfixAprBps) / 10000, 2);
  const activeAsset = selectedAsset ?? "stYFIx";
  const balances = account ? deriveBalances(account) : null;
  const externalPositions = deriveExternalPositions(
    veyfiAccount,
    epochInfo?.currentEpoch ?? null,
    globalData,
    statsApyBps,
  );
  const hasGlobalStakedData = !!stats && !!veyfiStats;
  const styfiStaked = stats?.totalStaked ?? 0n;
  const migratedVeYfi = veyfiStats?.migratedYfi ?? 0n;
  const llyfiLocked =
    veyfiStats?.tokens.reduce((sum, token) => {
      return (
        sum +
        getLlyfiBackingYfi({
          symbol: token.symbol,
          fallbackCapacity: token.redemption.capacity,
          globalData,
        })
      );
    }, 0n) ?? 0n;
  const globalStaked = styfiStaked + migratedVeYfi + llyfiLocked;
  const globalStakedLabel = `${formatTokenAmount(globalStaked, 18, 0)} YFI`;
  let stakedPercentage = "0.0";
  if (hasGlobalStakedData && stats.totalSupply > 0n) {
    const ratio = Number((globalStaked * 10000n) / stats.totalSupply) / 100;
    stakedPercentage = ratio.toFixed(1);
  }
  const stakedTooltipContent = hasGlobalStakedData ? (
    <div className="w-full min-w-[240px] text-xs leading-tight">
      <div className="mb-2 font-bold uppercase tracking-wide text-neutral-500">
        Ecosystem Breakdown
      </div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-neutral-600">stYFI & stYFIx</span>
        <span className="font-medium font-number">
          {formatTokenAmount(styfiStaked, 18, 0)} YFI
        </span>
      </div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-neutral-600">Liquid Lockers</span>
        <span className="font-medium font-number">
          {formatTokenAmount(llyfiLocked, 18, 0)} YFI
        </span>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-neutral-600">Migrated veYFI</span>
        <span className="font-medium font-number">
          {formatTokenAmount(migratedVeYfi, 18, 0)} YFI
        </span>
      </div>
      <div className="my-1.5 border-t border-neutral-200" />
      <div className="flex items-center justify-between">
        <span className="font-bold text-neutral-900">Total Participating</span>
        <span className="font-bold font-number text-neutral-900">
          {formatTokenAmount(globalStaked, 18, 0)} YFI
        </span>
      </div>
    </div>
  ) : null;
  const stakedValue = hasGlobalStakedData ? (
    <Tooltip content={stakedTooltipContent} side="bottom">
      <button
        type="button"
        className="cursor-help border-b border-dotted border-neutral-400 transition-colors hover:text-neutral-700 focus:outline-none focus-visible:text-neutral-700"
        aria-label="View ecosystem staking breakdown"
      >
        {globalStakedLabel} ({stakedPercentage}%)
      </button>
    </Tooltip>
  ) : "-- YFI";
  const isSummaryLoading = isAccountLoading || isVeyfiLoading;

  return (
    <div className="space-y-0">
      <StatsBar
        data-testid="styfi-stats"
        items={[
          {
            label: copy.page.stats.totalSupply.label,
            value: totalSupply,
          },
          {
            label: copy.page.stats.staked.label,
            value: stakedValue,
          },
          {
            label: copy.page.stats.apr.label,
            value: (
              <Tooltip content={copy.rewards.apr.delegatedTooltip} side="bottom">
                <button
                  type="button"
                  aria-label={copy.page.stats.apr.label}
                  onClick={event => event.currentTarget.focus()}
                  onKeyDown={event => { if (event.key === "Escape") event.currentTarget.blur(); }}
                  className="relative cursor-help tabular-nums underline decoration-dotted decoration-neutral-400 underline-offset-4 transition-colors after:absolute after:inset-x-0 after:-inset-y-3 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                >
                  {formattedApy}
                </button>
              </Tooltip>
            ),
          },
        ]}
      />
      <GovernanceAppNotice placement="after-stats" />

      <main className="container mx-auto px-4 md:px-6 pt-8 space-y-6 pb-24">
        <CrossAppNudge nudge={nudge} onDismiss={dismiss} />

        <AccountSummary
          now={now}
          selectedAsset={activeAsset}
          onSelectAsset={handleHeroSelect}
          balances={balances}
          externalPositions={externalPositions}
          ybcMembership={apr?.account?.ybcMembership}
          hostname={hostname}
          isLoading={isSummaryLoading}
          isConnected={isConnected}
          isWrongNetwork={isWrongNetwork}
          onConnect={openConnectModal}
          connectLabel={copy.page.connectBanner.cta}
          connectBody={copy.page.connectBanner.body}
          wrongNetworkBody={copy.page.connectBanner.wrongNetwork}
        />


        <div id="stake-manage" ref={cockpitRef} className="scroll-mt-8">
          <StyfiCockpit
            selectedAsset={activeAsset}
            onSelectAsset={handleSelectAsset}
          />
        </div>

        <ContractsFooter
          contracts={[
            { label: "YFI Token", address: YFI_ADDRESS },
            { label: "stYFI (Staking)", address: STYFI_ADDRESS },
            { label: "stYFIx (Delegated Vault)", address: STYFIX_ADDRESS },
            { label: "Reward Claimer", address: REWARD_CLAIMER_ADDRESS },
            {
              label: `Reward Token (${REWARD_TOKEN_CONFIG.symbol})`,
              address: REWARD_TOKEN_CONFIG.address,
            },
          ]}
        />
      </main>
    </div>
  );
}
