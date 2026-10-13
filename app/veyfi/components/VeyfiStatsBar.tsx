"use client";

import { StatsBar } from "@/components/ui/StatsBar";
import { useVeyfiStats } from "@/lib/hooks/useVeyfi";
import { formatTokenAmount, formatPercent } from "@/lib/format";
import { veyfiCopy as copy } from "../messages";

export function VeyfiStatsBar() {
  const { data: stats } = useVeyfiStats();

  let migratedLabel = "--";
  if (stats) {
    const amount = formatTokenAmount(stats.migratedYfi, 18, 2);
    // If supply is 0 or missing, hide the percentage to avoid Infinity/NaN/Garbage
    if (stats.lockedYfi > 0n) {
      const ratio =
        Number((stats.migratedYfi * 10000n) / stats.lockedYfi) / 10000;
      migratedLabel = `${amount} (${formatPercent(ratio, 1)})`;
    } else {
      migratedLabel = `${amount}`;
    }
  }

  const boostLabel = stats ? `${stats.maxBoostMultiplier.toFixed(2)}x` : "--x";

  const stakedLabel = stats
    ? formatPercent(stats.totalLlyfiStakedPercent, 1)
    : "--%";

  return (
    <StatsBar
      data-testid="veyfi-stats"
      items={[
        { label: copy.page.stats.migrated.label, value: migratedLabel },
        { label: copy.page.stats.boost.label, value: boostLabel },
        { label: copy.page.stats.staked.label, value: stakedLabel },
      ]}
    />
  );
}
