"use client";

import { useId, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  formatTeamsPercentFromBps,
  formatTeamsTokenAmount,
  formatTeamsUsd,
  type TeamBonusState,
} from "@/lib/clients/teams";
import type { TxState } from "@/lib/tx/types";
import { teamsCopy } from "../messages";

type BonusCardProps = {
  bonus: TeamBonusState;
  financialDataAvailable?: boolean;
  canClaimBonus: boolean;
  viewerAddress?: string | null;
  onClaimBonus?: (recipient: string) => Promise<boolean>;
  txState?: TxState;
};

export function BonusCard({
  bonus,
  financialDataAvailable = true,
  canClaimBonus,
  viewerAddress,
  onClaimBonus,
  txState,
}: BonusCardProps) {
  const [isMockClaimStaged, setIsMockClaimStaged] = useState(false);
  const actionDescriptionId = useId();
  const status = teamsCopy.bonus.statuses[bonus.status];
  const pendingPeriods = bonus.periods.filter(
    (period) => period.status === "pending-finalization"
  ).length;
  const isTxPending = isTeamsTxPending(txState);
  const action = getBonusAction({
    bonus,
    canClaimBonus,
    hasLiveClaim: Boolean(onClaimBonus),
    hasRecipient: Boolean(viewerAddress),
    isMockClaimStaged,
    isTxPending,
  });

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-text-primary">{teamsCopy.bonus.title}</h2>
          <p className="text-sm leading-6 text-text-secondary">
            {teamsCopy.bonus.description}
          </p>
        </div>

        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <BonusMetric
          label={teamsCopy.bonus.summary.claimable}
          value={formatTeamsTokenAmount(bonus.totalClaimable, bonus.tokenSymbol)}
        />
        <BonusMetric
          label={teamsCopy.bonus.summary.periods}
          value={formatPeriodCount(bonus.includedPeriodCount)}
        />
        <BonusMetric
          label={teamsCopy.bonus.summary.awaitingFinalization}
          value={
            pendingPeriods > 0
              ? formatPeriodCount(pendingPeriods)
              : teamsCopy.bonus.summary.noPendingFinalization
          }
        />
      </dl>

      <div className="rounded-box border border-border bg-app px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
          {teamsCopy.bonus.summary.currentState}
        </p>
        <p className="mt-1 text-sm leading-6 text-text-primary">
          {getBonusSummary(bonus, pendingPeriods)}
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-box border border-border bg-app px-4 py-4">
        <div className="max-w-xl space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
            {teamsCopy.bonus.action.title}
          </p>
          <p id={actionDescriptionId} className="text-sm leading-6 text-text-primary">
            {action.body}
          </p>
        </div>

        <Button
          size="sm"
          variant={action.variant}
          disabled={action.disabled}
          isLoading={action.isLoading}
          aria-describedby={action.disabled ? actionDescriptionId : undefined}
          onClick={() => {
            if (action.canSubmitLiveClaim && onClaimBonus && viewerAddress) {
              void onClaimBonus(viewerAddress).catch(() => undefined);
              return;
            }

            if (!action.canStageMockClaim) return;
            setIsMockClaimStaged(true);
          }}
        >
          {action.label}
        </Button>
      </div>

      {txState?.status === "error" && txState.errorMessage ? (
        <div
          role="alert"
          className="rounded-box border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {txState.errorMessage}
        </div>
      ) : null}

      <details className="group rounded-box border border-border bg-app">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-text-primary transition-colors hover:text-yearn-blue">
          {teamsCopy.bonus.periodDetailSummary}
        </summary>

        <div className="space-y-3 border-t border-border px-4 py-4">
          {bonus.periods.length > 0 ? (
            bonus.periods.map((period) => {
              const periodStatus = teamsCopy.bonus.periodStatuses[period.status];

              return (
                <div
                  key={period.period}
                  className="rounded-box border border-border bg-surface px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-text-primary">
                          {teamsCopy.bonus.periodLabel(period.period)}
                        </p>
                        <Badge variant={periodStatus.variant}>{periodStatus.label}</Badge>
                      </div>
                      <p className="text-sm leading-6 text-text-secondary">
                        {teamsCopy.bonus.periodStatuses[period.status].body}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
                          {teamsCopy.bonus.periodClaimable}
                        </p>
                        <p className="font-number text-base font-bold text-text-primary">
                          {formatTeamsTokenAmount(period.claimableYfi, bonus.tokenSymbol)}
                        </p>
                      </div>
                      <Tooltip
                        content={
                          <BonusMathTooltip
                            bonus={bonus}
                            period={period}
                            financialDataAvailable={financialDataAvailable}
                          />
                        }
                        align="end"
                      >
                        <button
                          type="button"
                          className="inline-flex min-h-10 items-center justify-center rounded-box border border-border px-3 text-xs font-bold text-text-secondary transition-[border-color,color] duration-150 ease-out hover:border-border-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app"
                        >
                          {teamsCopy.bonus.mathTrigger}
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-text-secondary">{teamsCopy.bonus.noPeriods}</p>
          )}
        </div>
      </details>
    </Card>
  );
}

function BonusMathTooltip({
  bonus,
  period,
  financialDataAvailable,
}: {
  bonus: TeamBonusState;
  period: TeamBonusState["periods"][number];
  financialDataAvailable: boolean;
}) {
  return (
    <dl className="grid w-[min(15rem,calc(100vw-4rem))] min-w-0 gap-2">
      <MathRow
        label={teamsCopy.bonus.math.profit}
        value={
          financialDataAvailable
            ? formatTeamsUsd(period.profitUsd)
            : teamsCopy.financialData.unavailableValue
        }
      />
      <MathRow
        label={teamsCopy.bonus.math.adjustedPrice}
        value={
          financialDataAvailable
            ? formatTeamsUsd(period.adjustedPriceUsd, 2)
            : teamsCopy.financialData.unavailableValue
        }
      />
      <MathRow
        label={teamsCopy.bonus.math.bonusFactor}
        value={formatTeamsPercentFromBps(period.bonusFactorBps)}
      />
      <MathRow
        label={teamsCopy.bonus.math.ybcSplit}
        value={formatTeamsPercentFromBps(period.ybcSplitBps)}
      />
      <MathRow
        label={teamsCopy.bonus.math.yfiOutput}
        value={formatTeamsTokenAmount(period.claimableYfi, bonus.tokenSymbol)}
      />
    </dl>
  );
}

function BonusMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-box border border-border bg-app px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
        {label}
      </dt>
      <dd className="mt-1 font-number text-base font-bold text-text-primary">{value}</dd>
    </div>
  );
}

function MathRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <dt className="min-w-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 max-w-36 break-words text-right font-number font-bold text-neutral-900 [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

function formatPeriodCount(count: number) {
  return teamsCopy.bonus.periodCount(count);
}

function getBonusSummary(bonus: TeamBonusState, pendingPeriods: number) {
  if (bonus.status === "claimable") {
    return pendingPeriods > 0
      ? teamsCopy.bonus.summaries.claimableWithPending(
          formatTeamsTokenAmount(bonus.totalClaimable, bonus.tokenSymbol),
          pendingPeriods
        )
      : teamsCopy.bonus.summaries.claimable(
          formatTeamsTokenAmount(bonus.totalClaimable, bonus.tokenSymbol)
        );
  }

  if (bonus.status === "pending-finalization") {
    return teamsCopy.bonus.summaries.pendingFinalization(pendingPeriods || 1);
  }

  if (bonus.status === "claimed") {
    return teamsCopy.bonus.summaries.claimed;
  }

  return bonus.periods.length > 0
    ? teamsCopy.bonus.summaries.noneWithHistory
    : teamsCopy.bonus.summaries.none;
}

function getBonusAction({
  bonus,
  canClaimBonus,
  hasLiveClaim,
  hasRecipient,
  isMockClaimStaged,
  isTxPending,
}: {
  bonus: TeamBonusState;
  canClaimBonus: boolean;
  hasLiveClaim: boolean;
  hasRecipient: boolean;
  isMockClaimStaged: boolean;
  isTxPending: boolean;
}) {
  if (isMockClaimStaged) {
    return {
      label: teamsCopy.bonus.action.stagedCta,
      body: teamsCopy.bonus.action.stagedBody,
      disabled: true,
      isLoading: false,
      variant: "secondary" as const,
      canStageMockClaim: false,
      canSubmitLiveClaim: false,
    };
  }

  if (bonus.status === "claimable" && canClaimBonus) {
    return {
      label: teamsCopy.bonus.action.claimCta,
      body: hasLiveClaim
        ? teamsCopy.bonus.action.liveClaimBody
        : teamsCopy.bonus.action.claimBody,
      disabled: isTxPending || (hasLiveClaim && !hasRecipient),
      isLoading: isTxPending,
      variant: "primary" as const,
      canStageMockClaim: !hasLiveClaim,
      canSubmitLiveClaim: hasLiveClaim && hasRecipient,
    };
  }

  if (bonus.status === "claimable") {
    return {
      label: teamsCopy.bonus.action.permissionCta,
      body: teamsCopy.bonus.action.permissionBody,
      disabled: true,
      isLoading: false,
      variant: "secondary" as const,
      canStageMockClaim: false,
      canSubmitLiveClaim: false,
    };
  }

  if (bonus.status === "pending-finalization") {
    return {
      label: teamsCopy.bonus.action.pendingCta,
      body: teamsCopy.bonus.action.pendingBody,
      disabled: true,
      isLoading: false,
      variant: "secondary" as const,
      canStageMockClaim: false,
      canSubmitLiveClaim: false,
    };
  }

  if (bonus.status === "claimed") {
    return {
      label: teamsCopy.bonus.action.claimedCta,
      body: teamsCopy.bonus.action.claimedBody,
      disabled: true,
      isLoading: false,
      variant: "secondary" as const,
      canStageMockClaim: false,
      canSubmitLiveClaim: false,
    };
  }

  return {
    label: teamsCopy.bonus.action.noneCta,
    body: teamsCopy.bonus.action.noneBody,
    disabled: true,
    isLoading: false,
    variant: "secondary" as const,
    canStageMockClaim: false,
    canSubmitLiveClaim: false,
  };
}

function isTeamsTxPending(state?: TxState) {
  return (
    state?.status === "signing" ||
    state?.status === "submitted" ||
    state?.status === "mining"
  );
}
