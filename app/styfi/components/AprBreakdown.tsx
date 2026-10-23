"use client";

import type { KeyboardEvent } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import type { StyfiAprSnapshot } from "@/lib/clients/styfi/apr-types";
import { formatPercent } from "@/lib/format";
import { styfiCopy as copy } from "../messages";

export function formatAprBps(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value)
    ? copy.rewards.apr.unavailable
    : formatPercent(value / 10000, 2);
}

function formatMultiplier(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function dismissOnEscape(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === "Escape") event.currentTarget.blur();
}

const tooltipClass = "flex w-fit [&_[role=tooltip]]:max-w-[min(260px,calc(100vw-4rem))]";
const underlineClass = "underline decoration-dotted decoration-neutral-400 underline-offset-4";
const priceDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
});

type Props = {
  snapshot?: StyfiAprSnapshot | null;
  isLoading?: boolean;
};

export function AprBreakdown({ snapshot, isLoading = false }: Props) {
  const account = snapshot?.account;
  const hasPosition = !!account && account.totalActive > 0n;
  const label = hasPosition ? copy.rewards.apr.portfolioLabel : copy.rewards.apr.delegatedLabel;
  const value = hasPosition ? account.portfolioAprBps : snapshot?.styfixAprBps;
  const formatted = isLoading ? "—" : formatAprBps(value);
  const hasPersonalBoost = !!account && (account.styfiActive > 0n || account.externalActive > 0n || (account.voteBoostAprBps ?? 0) > 0);

  return (
    <div className="space-y-2" data-testid="styfi-apr-breakdown" aria-busy={isLoading}>
      <Tooltip content={<AprCalculation snapshot={snapshot} />} side="top" align="start" className={tooltipClass}>
        <button
          type="button"
          aria-label={label}
          onClick={event => event.currentTarget.focus()}
          onKeyDown={dismissOnEscape}
          className="flex min-h-12 cursor-help flex-col items-start gap-2 rounded text-left transition-colors hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-4"
        >
          <span className={`text-xs font-bold text-neutral-500 ${underlineClass}`}>{label}</span>
          <span className={`font-number font-bold tabular-nums text-neutral-900 tracking-tight ${formatted === copy.rewards.apr.unavailable ? "text-lg" : "text-3xl md:text-4xl"}`} data-testid="styfi-total-apr">
            {formatted}
          </span>
        </button>
      </Tooltip>
      {hasPersonalBoost && (
        <Tooltip content={<VoteBoostCalculation snapshot={snapshot} />} side="top" align="start" className={tooltipClass}>
          <button
            type="button"
            onClick={event => event.currentTarget.focus()}
            onKeyDown={dismissOnEscape}
            className="relative cursor-help rounded text-left text-xs leading-6 text-neutral-500 transition-colors after:absolute after:inset-x-0 after:-inset-y-2 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2"
          >
            <span className={underlineClass}>{copy.rewards.apr.voteBoostLabel}:</span>{" "}
            <span className="font-number font-semibold tabular-nums text-neutral-700" data-testid="styfi-vote-boost">{formatMultiplier(account.appliedVoteBoostMultiplier)}×</span>
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function AprCalculation({ snapshot }: Pick<Props, "snapshot">) {
  const account = snapshot?.account;
  const hasPosition = !!account && account.totalActive > 0n;
  const total = hasPosition ? account.portfolioAprBps : snapshot?.styfixAprBps;
  const hasHistoricalAllocation = !!account && account.styfiActive > 0n && account.yourStyfiAprBps === null && account.portfolioAprBps !== null;

  return (
    <div className="w-full min-w-[210px] space-y-2 text-xs leading-relaxed" data-testid="styfi-apr-calculation">
      <p className="font-bold text-neutral-900">{copy.rewards.apr.calculationTitle}</p>
      {hasPosition ? (
        <dl className="space-y-1" data-testid="styfi-apr-contributions">
          {account.styfiActive > 0n && <Contribution label={copy.rewards.apr.baseContributionLabel} value={account.baseAprBps} />}
          {account.styfixActive > 0n && <Contribution label={copy.rewards.apr.delegatedContributionLabel} value={account.delegatedAprBps} />}
          {(account.externalActive > 0n || (account.externalAprBps ?? 0) > 0) && <Contribution label={copy.rewards.apr.externalContributionLabel} value={account.externalAprBps} />}
          {(account.styfiActive > 0n || account.externalActive > 0n || (account.voteBoostAprBps ?? 0) > 0) && <Contribution label={copy.rewards.apr.personalBoostLabel} value={account.voteBoostAprBps} />}
          {account.isYbcMember && <Contribution label={copy.rewards.apr.ybcLabel} value={account.ybcAprBps} />}
        </dl>
      ) : <p>{copy.rewards.apr.delegatedTooltip}</p>}
      <dl className="border-t border-neutral-200 pt-2">
        <Contribution label={copy.rewards.apr.totalLabel} value={total} total />
      </dl>
      {total == null && <p role="status">{copy.rewards.apr.unavailableBody}</p>}
      {hasPosition && <p>{copy.rewards.apr.portfolioTooltip}</p>}
      {hasPosition && (account.externalActive > 0n || hasHistoricalAllocation) && <p>{copy.rewards.apr.mixedPositions}</p>}
      {snapshot?.valuation.stale && snapshot.valuation.timestamp != null && (
        <p>{copy.rewards.apr.priceTimestamp(priceDateFormat.format(snapshot.valuation.timestamp * 1000))}</p>
      )}
      {snapshot?.rewardEpoch != null && snapshot.currentEpoch != null && <p>{copy.rewards.apr.streamingEpoch(snapshot.rewardEpoch, snapshot.currentEpoch)}</p>}
    </div>
  );
}

function VoteBoostCalculation({ snapshot }: Pick<Props, "snapshot">) {
  const account = snapshot?.account;
  if (!account) return null;
  const { votes, proposals } = account.rewardParticipation;
  return (
    <div className="w-full min-w-[210px] space-y-2 text-xs leading-relaxed">
      <p className="font-bold text-neutral-900">{copy.rewards.apr.voteBoostLabel}</p>
      {proposals > 0n ? (
        <>
          <p>{copy.rewards.apr.participation(votes.toString(), proposals.toString())}</p>
          {snapshot?.appliedMaxVoteBoostMultiplier != null && (
            <p className="font-number tabular-nums text-neutral-700">{copy.rewards.apr.boostFormula(formatMultiplier(snapshot.appliedMaxVoteBoostMultiplier), votes.toString(), proposals.toString())}</p>
          )}
        </>
      ) : <p>{copy.rewards.apr.noProposals}</p>}
      <dl className="border-t border-neutral-200 pt-2">
        <div className="flex items-baseline justify-between gap-3 font-bold text-neutral-900">
          <dt>{copy.rewards.apr.voteBoostLabel}</dt>
          <dd className="font-number tabular-nums">{formatMultiplier(account.appliedVoteBoostMultiplier)}×</dd>
        </div>
      </dl>
      {snapshot?.rewardEpoch != null && snapshot.currentEpoch != null && (
        <p>{copy.rewards.apr.appliedTiming(snapshot.rewardEpoch, snapshot.currentEpoch)}</p>
      )}
      <p>{copy.rewards.apr.boostScope}</p>
      <div className="space-y-1 border-t border-neutral-200 pt-2">
        <p className="flex items-baseline justify-between gap-3 font-semibold text-neutral-900">
          <span>{copy.rewards.apr.nextEpochLabel}</span>
          <span className="font-number tabular-nums">{formatMultiplier(account.voteBoostMultiplier)}×</span>
        </p>
        <p>{copy.rewards.apr.participation(account.participation.votes.toString(), account.participation.proposals.toString())}</p>
        <p>{copy.rewards.apr.participationTiming}</p>
      </div>
    </div>
  );
}

function Contribution({ label, value, total = false }: { label: string; value: number | null | undefined; total?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${total ? "font-bold text-neutral-900" : "text-neutral-600"}`}>
      <dt>{label}</dt>
      <dd className="shrink-0 font-number tabular-nums">{formatAprBps(value)}</dd>
    </div>
  );
}
