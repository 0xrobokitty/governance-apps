"use client";

import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatTokenAmount } from "@/lib/format";
import { useStyfiVotingPower } from "@/lib/hooks/useStyfiVotingPower";
import { styfiCopy } from "../messages";

const copy = styfiCopy.votingPower;

export function VotingPowerBreakdown() {
  const { data, isConnected, isLoading } = useStyfiVotingPower();
  if (!isConnected) return null;
  return (
    <Card data-testid="styfi-voting-power" aria-label={copy.title}>
      <div className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">{copy.title}</h2>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data ? (
          <p className="text-sm text-neutral-500" role="status">{copy.unavailable}</p>
        ) : (
          <div className={data.isYbcMember ? "grid gap-6 md:grid-cols-2" : "max-w-xl"}>
            <div className="space-y-3">
              <dl className="space-y-2 text-sm">
                <PowerRow label={copy.staked} value={data.stakedPower} />
                <PowerRow label={copy.migrated} value={data.migratedVePower} />
                <PowerRow label={copy.direct} value={data.directPower} total />
              </dl>
              <p className="text-xs leading-relaxed text-neutral-500">{copy.beforeDecay} {copy.aggregation}</p>
              {data.delegatedBalance > 0n && <p className="text-xs leading-relaxed text-neutral-500">{copy.delegatedNotice}</p>}
            </div>
            {data.isYbcMember && (
              <div className="space-y-3" aria-label={copy.ybcTitle}>
                <dl className="space-y-2 text-sm">
                  <PowerRow label={copy.direct} value={data.directPower} />
                  <PowerRow label={copy.delegated} value={data.ybcInfluence?.delegatedPower ?? null} />
                  <PowerRow label={copy.collective} value={data.ybcInfluence?.collectivePower ?? null} />
                  <PowerRow label={copy.influence} value={data.ybcInfluence?.totalPower ?? null} total />
                </dl>
                <p className="text-xs leading-relaxed text-neutral-500">
                  {data.ybcInfluence ? copy.estimate : copy.influenceUnavailable}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function PowerRow({ label, value, total = false }: { label: string; value: bigint | null; total?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${total ? "border-t border-border pt-2 font-bold text-neutral-900" : "text-neutral-600"}`}>
      <dt>{label}</dt>
      <dd className="shrink-0 font-number tabular-nums">{value === null ? "—" : `${formatTokenAmount(value, 18, 2)} ${copy.unit}`}</dd>
    </div>
  );
}
