"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Banner } from "@/components/ui/Banner";
import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatTokenAmount, formatUsd } from "@/lib/format";
import {
  useStyfiAccount,
  useStyfiClaimRewards,
  useRewardTokenInfo,
} from "@/lib/hooks/useStyfi";
import { styfiCopy as copy } from "../../messages";
import { IconCheck } from "@/components/icons/IconCheck";
import { IconWallet } from "@/components/icons/IconWallet";
import { useEpochClock } from "@/lib/hooks/useEpochClock";
import { useStyfiApr } from "@/lib/hooks/useStyfiApr";
import { AprBreakdown, formatAprBps } from "../AprBreakdown";

export function RewardsCard() {
  const { data, isLoading } = useStyfiAccount();
  const { write, state } = useStyfiClaimRewards();
  const { data: apr, isLoading: isAprLoading } = useStyfiApr();
  const { apy: rewardApy, convertBalanceToUsd } = useRewardTokenInfo();
  const { epochInfo } = useEpochClock({ tickMs: 60_000 });
  const isEpochZero = epochInfo?.currentEpoch === 0;
  const hasActivePositions = !!apr?.account && apr.account.totalActive > 0n;
  const titleLabel = hasActivePositions ? copy.rewards.apr.portfolioLabel : copy.rewards.apr.maxLabel;
  const displayAprLabel = isAprLoading ? "—" : formatAprBps(hasActivePositions ? apr?.account?.portfolioAprBps : apr?.maxAprBps);
  const aprTooltipContent = hasActivePositions ? copy.rewards.apr.portfolioTooltip : copy.rewards.apr.maxTooltip;

  const claimable = useMemo(() => {
    if (!data) return 0n;
    return data.claimableGenericRewards + data.claimableBoostedRewards;
  }, [data]);

  const rewardValueLabel = useMemo(() => {
    if (!data) return null;
    const value = convertBalanceToUsd(claimable);
    if (value === null) return null;
    return formatUsd(value, data.rewardToken.decimals, 2);
  }, [claimable, convertBalanceToUsd, data]);

  const blacklistStatus = data?.blacklistStatus ?? "unknown";
  const isDisabled =
    !data ||
    blacklistStatus === "blocked" ||
    claimable === 0n ||
    state.status === "signing" ||
    state.status === "submitted" ||
    state.status === "mining";

  if (isLoading) {
    return (
      <Card className="h-full flex flex-col justify-between min-h-[300px] p-0 overflow-hidden border border-border">
        <div className="p-6 space-y-6">
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
        <div className="bg-neutral-50 p-6 border-t border-border">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-12 w-32 rounded-box" />
          </div>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="h-full min-h-[300px] space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">{copy.rewards.title}</h3>
        <AprBreakdown snapshot={apr} isLoading={isAprLoading} />
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <IconWallet className="h-5 w-5 shrink-0 text-neutral-400" />
          <p className="text-sm text-neutral-500">
            {copy.rewards.disconnected}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col p-0 border border-border bg-surface">
      <div className="p-6 space-y-6 flex-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">
            {copy.rewards.title}
          </h3>
        </div>

        {blacklistStatus === "blocked" && (
          <Banner variant="error" title={copy.shared.blacklistedTitle}>
            {copy.shared.blacklistedBody}
          </Banner>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Tooltip content={aprTooltipContent} side="top">
              <button
                type="button"
                className="min-h-10 text-xs font-bold text-neutral-500 cursor-help border-b border-dotted border-neutral-400 hover:text-neutral-700 transition-colors focus:outline-none focus-visible:text-neutral-700"
              >
                {titleLabel}
              </button>
            </Tooltip>
            <p className={`font-number font-bold tabular-nums text-neutral-900 tracking-tight ${displayAprLabel === copy.rewards.apr.unavailable ? "text-lg" : "text-2xl md:text-3xl"}`} data-testid="styfi-total-apr">
              {displayAprLabel}
            </p>
          </div>

          <div className="space-y-1">
            <Tooltip
              content={copy.rewards.token.tooltip(data.rewardToken.symbol)}
              side="top"
            >
              <span className="inline-flex min-h-10 items-center text-xs font-bold text-neutral-500 cursor-help border-b border-dotted border-neutral-400 hover:text-neutral-700 transition-colors">
                {copy.rewards.token.label}
              </span>
            </Tooltip>

            <div className="flex flex-col items-start gap-1.5">
              <div className="flex items-center gap-2">
                <a
                  href={data.rewardToken.vaultUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${data.rewardToken.symbol} Yearn vault`}
                  className="text-lg font-bold text-neutral-900 transition-colors hover:text-neutral-700 hover:underline hover:decoration-dotted hover:underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-offset-2"
                >
                  {data.rewardToken.symbol}
                </a>
                {rewardApy && (
                  <Badge
                    variant="success"
                    className="text-[10px] h-5 px-1.5 font-bold"
                  >
                    +{rewardApy} APY
                  </Badge>
                )}
              </div>
              <span className="text-xs text-neutral-400 font-medium">
                {copy.rewards.token.desc}
              </span>
            </div>
          </div>
        </div>

        <AprBreakdown snapshot={apr} isLoading={isAprLoading} />

        {isEpochZero && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            {copy.rewards.epochZeroNotice}
          </div>
        )}
      </div>

      <div className="bg-neutral-50 border-t border-border p-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between rounded-b-[calc(var(--radius-box)-2px)]">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">
            {copy.rewards.claim.label}
          </p>
          <div className="flex flex-col">
            <span
              className={`text-3xl font-number font-bold tracking-tight ${
                claimable > 0n ? "text-neutral-900" : "text-neutral-400"
              }`}
            >
              {rewardValueLabel ?? "$0.00"}
            </span>
            <span className="text-sm font-number text-neutral-500 font-medium">
              {`${formatTokenAmount(
                claimable,
                data.rewardToken.decimals
              )} ${data.rewardToken.symbol}`}
            </span>
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          className="w-full sm:w-auto min-w-[140px] shadow-sm font-bold"
          disabled={isDisabled}
          isLoading={
            state.status === "signing" ||
            state.status === "submitted" ||
            state.status === "mining"
          }
          onClick={() => write()}
        >
          {state.status === "success" ? (
            <span className="flex items-center gap-2">
              <IconCheck className="w-4 h-4" /> Claimed
            </span>
          ) : (
            copy.rewards.claim.button
          )}
        </Button>
      </div>
    </Card>
  );
}
