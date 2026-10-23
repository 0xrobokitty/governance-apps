"use client";

import type { StyfiAprSnapshot } from "@/lib/clients/styfi/apr-types";
import { formatPercent } from "@/lib/format";
import { styfiCopy as copy } from "../messages";

export function formatAprBps(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value)
    ? copy.rewards.apr.unavailable
    : formatPercent(value / 10000, 2);
}

type Props = {
  snapshot?: StyfiAprSnapshot | null;
  isLoading?: boolean;
};

export function AprBreakdown({ snapshot, isLoading = false }: Props) {
  const account = snapshot?.account;
  const hasPosition = !!account && account.totalActive > 0n;
  const unavailable = !isLoading && (!snapshot || snapshot.status === "unavailable" || snapshot.baseAprBps === null);
  const hasHistoricalAllocation = !!account && account.styfiActive > 0n && account.yourStyfiAprBps === null && account.portfolioAprBps !== null;

  return (
    <div className="space-y-4" data-testid="styfi-apr-breakdown" aria-busy={isLoading}>
      <dl className="grid grid-cols-2 gap-3">
        <Rate label={copy.rewards.apr.baseLabel} value={snapshot?.baseAprBps} loading={isLoading} />
        <Rate label={copy.rewards.apr.delegatedLabel} value={snapshot?.styfixAprBps} loading={isLoading} />
      </dl>
      <p className="text-xs leading-relaxed text-neutral-500">{copy.rewards.apr.delegatedNote}</p>

      <div className="space-y-1.5">
        <dl className="flex items-center justify-between gap-4 text-sm">
          <dt className="font-medium text-neutral-600">{copy.rewards.apr.maxLabel}</dt>
          <dd className="font-number font-bold tabular-nums text-neutral-900">{isLoading ? "—" : formatAprBps(snapshot?.maxAprBps)}</dd>
        </dl>
        <p className="text-xs leading-relaxed text-neutral-500">{copy.rewards.apr.maxTooltip}</p>
      </div>

      {account && account.styfiActive > 0n && account.yourStyfiAprBps !== null && (
        <div className="space-y-1.5">
          <dl className="flex items-center justify-between gap-4 text-sm">
            <dt className="font-medium text-neutral-600">{copy.rewards.apr.personalLabel}</dt>
            <dd className="font-number font-bold tabular-nums text-neutral-900" data-testid="styfi-personal-apr">
              {formatAprBps(account.yourStyfiAprBps)}
            </dd>
          </dl>
          <p className="text-xs leading-relaxed text-neutral-500">{copy.rewards.apr.personalNote}</p>
        </div>
      )}

      {hasPosition && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-bold text-neutral-500">{copy.rewards.apr.contributionsTitle}</p>
          <dl className="space-y-1.5 text-sm" data-testid="styfi-apr-contributions">
            {account.styfiActive > 0n && <Contribution label={copy.rewards.apr.baseContributionLabel} value={account.baseAprBps} />}
            {account.styfixActive > 0n && <Contribution label={copy.rewards.apr.delegatedContributionLabel} value={account.delegatedAprBps} />}
            {(account.externalActive > 0n || (account.externalAprBps ?? 0) > 0) && <Contribution label={copy.rewards.apr.externalContributionLabel} value={account.externalAprBps} />}
            {(account.styfiActive > 0n || account.externalActive > 0n || (account.voteBoostAprBps ?? 0) > 0) && (
              <Contribution label={copy.rewards.apr.personalBoostLabel} value={account.voteBoostAprBps} />
            )}
            {account.isYbcMember && <Contribution label={copy.rewards.apr.ybcLabel} value={account.ybcAprBps} />}
          </dl>
          {(account.externalActive > 0n || hasHistoricalAllocation) && <p className="text-xs leading-relaxed text-neutral-500">{copy.rewards.apr.mixedPositions}</p>}
          {account.isYbcMember && <p className="text-xs text-neutral-500">{copy.rewards.apr.ybcIncluded}</p>}
        </div>
      )}

      {account && (account.styfiActive > 0n || account.externalActive > 0n) && (
        <div className="space-y-1.5 rounded-lg bg-surface-secondary/50 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <p className="font-bold text-neutral-600">{copy.rewards.apr.participationLabel}</p>
            <p className="font-number font-bold tabular-nums text-neutral-900" data-testid="styfi-participation">
              {account.participation.proposals > 0n
                ? copy.rewards.apr.participation(account.participation.votes.toString(), account.participation.proposals.toString())
                : copy.rewards.apr.noProposals}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-neutral-500">{copy.rewards.apr.participationTiming}</p>
        </div>
      )}

      <div className="space-y-1 text-xs leading-relaxed text-neutral-500">
        {unavailable && <p role="status">{copy.rewards.apr.unavailableBody}</p>}
        {snapshot?.valuation.stale && <p className="text-amber-700">{copy.rewards.apr.priceStale}</p>}
        {snapshot?.rewardEpoch != null && snapshot.currentEpoch != null && (
          <p>{copy.rewards.apr.streamingEpoch(snapshot.rewardEpoch, snapshot.currentEpoch)}</p>
        )}
        <p>{copy.rewards.apr.ratesEstimate}</p>
      </div>
    </div>
  );
}

function Rate({ label, value, loading }: { label: string; value?: number | null; loading: boolean }) {
  return (
    <div className="space-y-1 rounded-lg bg-surface-secondary/50 p-3">
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className={`font-number font-bold tabular-nums text-neutral-900 ${value == null ? "text-sm" : "text-xl"}`}>
        {loading ? "—" : formatAprBps(value)}
      </dd>
    </div>
  );
}

function Contribution({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="font-number font-medium tabular-nums text-neutral-900">{formatAprBps(value)}</dd>
    </div>
  );
}
