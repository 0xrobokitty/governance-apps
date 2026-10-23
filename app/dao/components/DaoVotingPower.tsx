"use client";

import { useSyncExternalStore } from "react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatTokenAmount } from "@/lib/format";
import { useDaoMockRuntime } from "@/lib/hooks/useDao";
import { useStyfiVotingPower } from "@/lib/hooks/useStyfiVotingPower";
import { createMockDaoVotingPower, type StyfiVotingPower } from "@/lib/clients/styfi/voting-power";
import { getStyfiMockScenario, subscribeStyfiMockScenario } from "@/lib/clients/styfi/scenarios";
import { daoCopy } from "../messages";

const copy = daoCopy.votingPower;

export function DaoVotingPower() {
  const runtime = useDaoMockRuntime();
  const scenario = useSyncExternalStore(subscribeStyfiMockScenario, getStyfiMockScenario, getStyfiMockScenario);
  if (!runtime) return <LiveVotingPower />;
  const data = createMockDaoVotingPower({
    account: runtime.account,
    timestamp: runtime.now,
    isYbcMember: scenario === "ybc",
  });
  return data ? <VotingPowerSummary data={data} /> : null;
}

function LiveVotingPower() {
  const { data, isConnected, isLoading } = useStyfiVotingPower();
  if (!isConnected) return null;
  return <VotingPowerSummary data={data} isLoading={isLoading} />;
}

function VotingPowerSummary({ data, isLoading = false }: { data: StyfiVotingPower | null; isLoading?: boolean }) {
  const estimate = data?.isYbcMember ? data.ybcInfluence : null;
  const amount = estimate?.totalPower ?? data?.directPower;
  const caption = estimate ? copy.estimated : data?.isYbcMember ? copy.directOnly : copy.direct;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3" data-testid="dao-voting-power" aria-label={copy.title}>
      <h2 className="text-sm font-medium text-text-secondary">
        {data ? (
          <Tooltip side="bottom" align="start" content={<VotingPowerDetails data={data} />}>
            <button
              type="button"
              aria-label={copy.breakdown}
              onClick={(event) => event.currentTarget.focus()}
              onKeyDown={(event) => { if (event.key === "Escape") event.currentTarget.blur(); }}
              className="flex min-h-10 items-center gap-2 rounded-md text-left transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
            >
              <span>{copy.title}</span>
              <span aria-hidden className="flex size-4 items-center justify-center rounded-full border border-current text-[10px] font-bold">i</span>
            </button>
          </Tooltip>
        ) : copy.title}
      </h2>
      {isLoading ? (
        <Skeleton className="h-8 w-28" />
      ) : amount === undefined ? (
        <p className="text-sm text-text-secondary" role="status">{copy.unavailable}</p>
      ) : (
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
          <span className="font-number text-xl font-semibold tabular-nums text-text-primary">{formatPower(amount)}</span>
          <span className="text-xs text-text-secondary">{caption}</span>
        </div>
      )}
    </Card>
  );
}

function VotingPowerDetails({ data }: { data: StyfiVotingPower }) {
  const estimate = data.ybcInfluence;
  return (
    <span className="block space-y-3">
      <span className="block space-y-1.5">
        <PowerRow label={copy.staked} value={data.stakedPower} />
        <PowerRow label={copy.migrated} value={data.migratedVePower} />
        <PowerRow label={copy.direct} value={data.directPower} total />
      </span>
      {data.isYbcMember && (
        <span className="block space-y-1.5 border-t border-border pt-2">
          <PowerRow label={copy.delegated} value={estimate?.delegatedPower ?? null} />
          <PowerRow label={copy.collective} value={estimate?.collectivePower ?? null} />
          {estimate && data.directPower > 0n && data.memberWeight > 0n && (
            <span className="flex items-baseline justify-between gap-4">
              <span>{copy.memberShare}</span>
              <span className="shrink-0 font-number tabular-nums">{estimate.memberShareBps === 0n ? "<0.01" : formatTokenAmount(estimate.memberShareBps, 2, 2)}%</span>
            </span>
          )}
        </span>
      )}
      <span className="block text-pretty">
        {data.isYbcMember ? `${estimate ? copy.estimate : copy.influenceUnavailable} ` : ""}
        {copy.beforeDecay}
      </span>
      {data.delegatedBalance > 0n && <span className="block text-pretty">{copy.delegatedNotice}</span>}
    </span>
  );
}

function PowerRow({ label, value, total = false }: { label: string; value: bigint | null; total?: boolean }) {
  return (
    <span className={`flex items-baseline justify-between gap-4 ${total ? "font-semibold text-text-primary" : ""}`}>
      <span>{label}</span>
      <span className="shrink-0 font-number tabular-nums">{value === null ? "—" : formatPower(value)}</span>
    </span>
  );
}

function formatPower(value: bigint) {
  return `${formatTokenAmount(value, 18, 2)} ${copy.unit}`;
}
