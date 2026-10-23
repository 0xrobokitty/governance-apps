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
  const available = snapshot?.status === "available" && base != null && full != null;
  const value = isLoading ? copy.loading : !available ? copy.unavailable
    : asset === "stYFI"
      ? copy.range(formatPercent(base / 10_000, 2), formatPercent(full / 10_000, 2))
      : formatPercent(full / 10_000, 2);

  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${compact ? "" : "border-t border-border pt-4"}`} data-testid={`staking-apr-${asset.toLowerCase()}`}>
      <p className="text-xs font-semibold text-neutral-500">{copy.label}</p>
      <p className={`font-number font-bold tabular-nums text-neutral-900 ${compact ? "text-lg" : "text-2xl"}`}>{value}</p>
    </div>
  );
}
