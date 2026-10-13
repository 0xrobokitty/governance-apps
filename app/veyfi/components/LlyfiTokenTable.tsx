"use client";

import { useLlyfiTokens, useVeyfiStats } from "@/lib/hooks/useVeyfi";
import { LlyfiTokenRow } from "./LlyfiTokenRow";
import { Skeleton } from "@/components/ui/Skeleton";
import { veyfiCopy as copy } from "../messages";
import { useEpochClock } from "@/lib/hooks/useEpochClock";
import { useProtocol } from "@/state/protocol";

export function LlyfiTokenTable() {
  const tokens = useLlyfiTokens();
  const { data: stats } = useVeyfiStats();
  const { epochInfo } = useEpochClock({ tickMs: 60_000 });
  const { globalData, usesMockBackend } = useProtocol();
  const isEpochZero = epochInfo?.currentEpoch === 0;
  const aprLabel = isEpochZero
    ? copy.manage.columns.aprEpoch1
    : copy.manage.columns.apr;
  const isGlobalDataReady =
    usesMockBackend || (!!globalData?.global?.veyfi && !!globalData?.llyfi);

  if (!isGlobalDataReady || tokens.length === 0) {
    return (
      <div id="llyfi-ledger" className="scroll-mt-24 space-y-4">
        <h3 className="text-xl font-bold text-neutral-900 px-1">
          {copy.manage.title}
        </h3>

        <div className="rounded-box border border-neutral-300 bg-surface overflow-hidden">
          <div className="grid grid-cols-[1.5fr_1.2fr_1.2fr_1.2fr_1.5fr_40px] items-center p-4 bg-neutral-100 border-b border-neutral-200 text-xs font-bold uppercase tracking-wide text-neutral-500">
            <div>{copy.manage.columns.asset}</div>
            <div className="text-right">{copy.manage.columns.backing}</div>
            <div className="text-right">{copy.manage.columns.ratio}</div>
            <div className="text-right">{aprLabel}</div>
            <div className="text-right">{copy.manage.columns.deposits}</div>
            <div />
          </div>

          <div className="divide-y divide-neutral-200">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`llyfi-skeleton-${index}`}
                className="grid grid-cols-[1.5fr_1.2fr_1.2fr_1.2fr_1.5fr_60px] items-center p-4"
              >
                <div className="space-y-2">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="text-right space-y-2">
                  <Skeleton className="h-5 w-24 ml-auto" />
                  <Skeleton className="h-3 w-14 ml-auto" />
                </div>
                <div className="flex justify-end">
                  <Skeleton className="h-8 w-20" />
                </div>
                <div className="flex justify-end">
                  <Skeleton className="h-8 w-14" />
                </div>
                <div className="text-right space-y-2">
                  <Skeleton className="h-5 w-20 ml-auto" />
                  <Skeleton className="h-3 w-24 ml-auto" />
                </div>
                <div className="flex justify-end">
                  <Skeleton className="h-8 w-8 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="llyfi-ledger" className="scroll-mt-24 space-y-4">
      <h3 className="text-xl font-bold text-neutral-900 px-1">
        {copy.manage.title}
      </h3>

      <div className="rounded-box border border-neutral-300 bg-surface">
        <div className="grid grid-cols-[1.5fr_1.2fr_1.2fr_1.2fr_1.5fr_40px] items-center p-4 bg-neutral-100 border-b border-neutral-200 text-xs font-bold uppercase tracking-wide text-neutral-500 first:rounded-t-box">
          <div>{copy.manage.columns.asset}</div>
          <div className="text-right">{copy.manage.columns.backing}</div>
          <div className="text-right">{copy.manage.columns.ratio}</div>
          <div className="text-right">{aprLabel}</div>
          <div className="text-right">{copy.manage.columns.deposits}</div>
          <div />
        </div>

        <div className="divide-y divide-neutral-200">
          {tokens.map((token) => (
            <LlyfiTokenRow
              key={token.symbol}
              token={token}
              maxBoostMultiplier={stats?.maxBoostMultiplier}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
