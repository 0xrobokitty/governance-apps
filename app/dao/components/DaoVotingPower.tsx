"use client";

import { useId, useSyncExternalStore } from "react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { UtcTime } from "@/components/ui/UtcTime";
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
  const data = createMockDaoVotingPower({ account: runtime.account, timestamp: runtime.now, isYbcMember: scenario === "ybc" });
  return data ? <VotingPowerSummary data={data} /> : null;
}

function LiveVotingPower() {
  const { data, isConnected, isLoading, isSystemLoading } = useStyfiVotingPower();
  return isConnected ? <VotingPowerSummary data={data} isLoading={isLoading} isSystemLoading={isSystemLoading} /> : null;
}

function VotingPowerSummary({ data, isLoading = false, isSystemLoading = false }: { data: StyfiVotingPower | null; isLoading?: boolean; isSystemLoading?: boolean }) {
  const titleId = useId();
  const estimate = data?.isYbcMember ? data.ybcInfluence : null;
  const amount = estimate?.totalPower ?? data?.directPower;
  const caption = estimate ? copy.estimated : data?.isYbcMember ? copy.directOnly : copy.direct;
  const system = data?.systemPower;
  const share = estimate ? system?.estimatedShareBps : system?.directShareBps;
  return (
    <section aria-labelledby={titleId} data-testid="dao-voting-power">
      <Card className="space-y-5">
        <div className="space-y-1">
          <h2 id={titleId} className="text-xl font-semibold text-text-primary">{copy.title}</h2>
          <p className="text-sm text-text-secondary">{copy.description}</p>
        </div>
        {isLoading ? <Skeleton className="h-20 w-full" /> : amount === undefined ? (
          <p className="text-sm text-text-secondary" role="status">{copy.unavailable}</p>
        ) : (
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
            <Metric label={copy.yours} value={formatPower(amount)} caption={caption} />
            <Metric label={estimate ? copy.estimatedShare : copy.share} value={share === null || share === undefined ? "—" : formatShare(share, amount > 0n)} />
            <Metric label={copy.system} value={system ? formatPower(system.totalPower) : isSystemLoading ? copy.loadingTotal : copy.missingTotal} />
          </div>
        )}
        {data && (
          <details className="group border-t border-border pt-2">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary [&::-webkit-details-marker]:hidden">
              {copy.breakdown}
              <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="grid gap-6 pt-3 md:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-text-secondary">{copy.personalBreakdown}</h3>
                <dl className="space-y-2 text-sm">
                  <PowerRow label={copy.staked} value={data.stakedPower} />
                  <PowerRow label={copy.migrated} value={data.migratedVePower} />
                  <PowerRow label={copy.direct} value={data.directPower} total />
                  {data.isYbcMember && <>
                    <PowerRow label={copy.delegated} value={estimate?.delegatedPower ?? null} />
                    <PowerRow label={copy.collective} value={estimate?.collectivePower ?? null} />
                    {estimate && data.memberWeight > 0n && data.directPower > 0n && <div className="flex items-baseline justify-between gap-4 text-text-secondary"><dt>{copy.memberShare}</dt><dd className="shrink-0 font-number tabular-nums">{formatShare(estimate.memberShareBps, true)}</dd></div>}
                  </>}
                </dl>
                <p className="text-pretty text-xs leading-relaxed text-text-secondary">{data.isYbcMember ? `${estimate ? copy.estimate : copy.influenceUnavailable} ` : ""}{copy.beforeDecay}</p>
                {data.delegatedBalance > 0n && <p className="text-pretty text-xs leading-relaxed text-text-secondary">{copy.delegatedNotice}</p>}
              </div>
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-text-secondary">{copy.systemBreakdown}</h3>
                {system ? <>
                  <dl className="space-y-2 text-sm">
                    <PowerRow label={copy.staked} value={system.stakedPower} />
                    <PowerRow label={copy.migrated} value={system.migratedVePower} />
                    <PowerRow label={copy.systemDelegated} value={system.delegatedPower} />
                    <PowerRow label={copy.system} value={system.totalPower} total />
                  </dl>
                  <p className="text-pretty text-xs leading-relaxed text-text-secondary">{copy.totalExplanation}</p>
                  <p className="text-xs text-text-secondary">{copy.snapshot}: <UtcTime timestamp={data.timestamp} /></p>
                </> : <p className="text-pretty text-xs leading-relaxed text-text-secondary">{isSystemLoading ? copy.loadingTotal : copy.totalUnavailable}</p>}
              </div>
            </div>
          </details>
        )}
      </Card>
    </section>
  );
}

function Metric({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return <div className="space-y-1"><p className="text-xs text-text-secondary">{label}</p><p className="font-number text-2xl font-semibold tabular-nums text-text-primary">{value}</p>{caption && <p className="text-xs text-text-secondary">{caption}</p>}</div>;
}
function PowerRow({ label, value, total = false }: { label: string; value: bigint | null; total?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-4 ${total ? "border-t border-border pt-2 font-semibold" : "text-text-secondary"}`}><dt>{label}</dt><dd className="shrink-0 font-number tabular-nums">{value === null ? "—" : formatPower(value)}</dd></div>;
}
function formatPower(value: bigint) { return `${formatTokenAmount(value, 18, 2)} ${copy.unit}`; }
function formatShare(value: bigint, positive: boolean) { return `${value === 0n && positive ? "<0.01" : formatTokenAmount(value, 2, 2)}%`; }
