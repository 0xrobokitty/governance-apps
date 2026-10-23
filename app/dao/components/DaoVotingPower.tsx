"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { IconChevron } from "@/components/icons/IconChevron";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
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
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const estimate = data?.isYbcMember ? data.ybcInfluence : null;
  const amount = estimate?.totalPower ?? data?.directPower;
  const caption = estimate ? copy.estimated : data?.isYbcMember ? copy.directOnly : copy.direct;
  const system = data?.systemPower;
  const share = estimate ? system?.estimatedShareBps : system?.directShareBps;
  const formattedShare = share === null || share === undefined || amount === undefined
    ? null
    : formatShare(share, amount > 0n);
  const value = isLoading ? copy.loading : formattedShare ?? (amount === undefined ? copy.missingTotal : formatPower(amount));
  const status = isLoading || amount === undefined ? null : formattedShare
    ? copy.ofTotal
    : isSystemLoading ? copy.loadingTotal : copy.shareUnavailable;
  const explanation = isLoading ? copy.loading : amount === undefined ? copy.unavailable : !system
    ? isSystemLoading ? copy.loadingTotal : copy.totalUnavailable
    : formattedShare === null ? copy.emptyTotal
    : `${copy.calculation}: ${formatPower(amount)} ÷ ${formatPower(system.totalPower)} ≈ ${formattedShare}.`;

  return (
    <div className="min-w-0 w-full sm:w-auto" data-testid="dao-voting-power">
      <Tooltip side="bottom" align="start" className="w-full" content={
        <span className="block space-y-1.5 text-pretty">
          <span className="block font-number tabular-nums">{explanation}</span>
          {estimate && <span className="block">{copy.estimate}</span>}
          {data?.isYbcMember && !estimate && <span className="block">{copy.influenceUnavailable}</span>}
          <span className="block font-medium text-text-primary">{copy.openBreakdown}</span>
        </span>
      }>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-busy={isLoading || isSystemLoading}
          onClick={() => setIsOpen(true)}
          onKeyDown={(event) => { if (event.key === "Escape") event.currentTarget.blur(); }}
          className="h-auto min-h-11 w-full justify-between gap-3 rounded-xl border-border/70 px-3 py-2 text-left shadow-sm hover:shadow-md motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <span className="min-w-0 space-y-0.5">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-text-secondary">
              <span>{copy.yours}</span>{" "}
              {estimate && <span className="font-medium">{copy.ybcEstimate}</span>}
              {data?.isYbcMember && !estimate && <span>{copy.directOnly}</span>}
            </span>
            <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="font-number text-base font-semibold tabular-nums">{value}</span>{" "}
              {status && <span className="text-xs text-text-secondary">{status}</span>}
            </span>
          </span>
          <IconChevron aria-hidden="true" className="size-4 shrink-0 -rotate-90 text-text-secondary" />
        </Button>
      </Tooltip>

      <Modal isOpen={isOpen} onClose={close} title={copy.breakdown} className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <div className="space-y-5">
          <p className="text-pretty text-sm text-text-secondary">{copy.description}</p>
          {isLoading || amount === undefined ? (
            <p className="text-sm text-text-secondary" role="status">{isLoading ? copy.loading : copy.unavailable}</p>
          ) : <>
            <div className="rounded-xl bg-surface-secondary p-4">
              <p className="text-xs text-text-secondary">{estimate ? copy.estimatedShare : copy.share}</p>
              <p className="mt-1 font-number text-2xl font-semibold tabular-nums">{formattedShare ?? copy.shareUnavailable}</p>
              <p className="mt-2 text-pretty text-sm text-text-secondary">{explanation}</p>
              <p className="mt-1 text-xs text-text-secondary">{caption}</p>
            </div>
            {data && <VotingPowerBreakdown data={data} isSystemLoading={isSystemLoading} />}
          </>}
        </div>
      </Modal>
    </div>
  );
}

function VotingPowerBreakdown({ data, isSystemLoading }: { data: StyfiVotingPower; isSystemLoading: boolean }) {
  const estimate = data.isYbcMember ? data.ybcInfluence : null;
  const system = data.systemPower;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <h3 className="text-sm font-semibold">{copy.personalBreakdown}</h3>
        <dl className="space-y-2 text-sm">
          <PowerRow label={copy.staked} value={data.stakedPower} />
          <PowerRow label={copy.migrated} value={data.migratedVePower} />
          <PowerRow label={copy.direct} value={data.directPower} total />
          {data.isYbcMember && <>
            <PowerRow label={copy.delegated} value={estimate?.delegatedPower ?? null} />
            <PowerRow label={copy.collective} value={estimate?.collectivePower ?? null} />
            {estimate && <PowerRow label={copy.estimated} value={estimate.totalPower} total />}
            {estimate && data.memberWeight > 0n && data.directPower > 0n && <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-text-secondary"><dt>{copy.memberShare}</dt><dd className="ml-auto font-number tabular-nums">{formatShare(estimate.memberShareBps, true)}</dd></div>}
          </>}
        </dl>
        <p className="text-pretty text-xs leading-relaxed text-text-secondary">{data.isYbcMember ? `${estimate ? copy.estimate : copy.influenceUnavailable} ` : ""}{copy.beforeDecay}</p>
        {data.delegatedBalance > 0n && <p className="text-pretty text-xs leading-relaxed text-text-secondary">{copy.delegatedNotice}</p>}
      </div>
      <div className="min-w-0 space-y-3">
        <h3 className="text-sm font-semibold">{copy.systemBreakdown}</h3>
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
  );
}

function PowerRow({ label, value, total = false }: { label: string; value: bigint | null; total?: boolean }) {
  return <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${total ? "border-t border-border pt-2 font-semibold" : "text-text-secondary"}`}><dt className="min-w-0">{label}</dt><dd className="ml-auto font-number tabular-nums">{value === null ? "—" : formatPower(value)}</dd></div>;
}
function formatPower(value: bigint) { return `${formatTokenAmount(value, 18, 2)} ${copy.unit}`; }
function formatShare(value: bigint, positive: boolean) { return `${value === 0n && positive ? "<0.01" : formatTokenAmount(value, 2, 2)}%`; }
