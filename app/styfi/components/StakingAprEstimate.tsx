import type { StyfiAprSnapshot } from "@/lib/clients/styfi/apr-types";
import { formatPercent } from "@/lib/format";
import { styfiCopy } from "../messages";
import type { StyfiAsset } from "./types";

const copy = styfiCopy.stakingApr;

export function StakingAprEstimate({
  asset,
  snapshot,
  isLoading = false,
  compact = false,
}: {
  asset: StyfiAsset;
  snapshot: StyfiAprSnapshot | null;
  isLoading?: boolean;
  compact?: boolean;
}) {
  const base = snapshot?.baseAprBps;
  const full = asset === "stYFI" ? snapshot?.fullBoostEstimateAprBps : snapshot?.fullBoostStyfixEstimateAprBps;
  const maximum = snapshot?.maxVoteBoostMultiplier;
  const available = snapshot?.status === "available" && base != null && full != null && maximum != null;
  const value = isLoading ? copy.loading : !available ? copy.unavailable
    : asset === "stYFI"
      ? copy.range(formatPercent(base / 10_000, 2), formatPercent(full / 10_000, 2))
      : formatPercent(full / 10_000, 2);

  return (
    <div className={compact ? "space-y-1" : "space-y-1 border-t border-border pt-4"} data-testid={`staking-apr-${asset.toLowerCase()}`}>
      <div className={compact ? "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1" : "space-y-1"}>
        <p className="text-xs font-medium text-neutral-500">{copy.label}</p>
        <p className={`font-number font-bold tabular-nums text-neutral-900 ${compact ? "text-base" : "text-2xl"}`}>{value}</p>
      </div>
      {available && !isLoading && (
        <p className={`text-xs text-neutral-500 ${compact ? "text-right" : ""}`}>
          {asset === "stYFI" ? copy.participation(String(maximum)) : copy.delegated}
          {snapshot.valuation.stale && <span className="block">{copy.priceStale}</span>}
        </p>
      )}
    </div>
  );
}
