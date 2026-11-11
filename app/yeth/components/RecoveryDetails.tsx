import { formatEther } from "viem";
import { ContractLink } from "@/components/ui/ContractLink";
import { normalizedRecovery, recoveryProjectionYears } from "@/lib/clients/yeth/recovery/model";
import { recoveryFunding } from "@/lib/clients/yeth/recovery/journey";
import type { RecoverySnapshot } from "@/lib/clients/yeth/recovery/types";
import { recoveryCopy as copy, recoveryJourneyCopy as words, recoveryLiveCopy as text, recoveryProductionCopy as live } from "../messages";
import { RecoveryChart } from "./RecoveryChart";
import { RecoveryPpsChart } from "./RecoveryPpsChart";
import { recoveryPpsChart } from "@/lib/clients/yeth/recovery/chart";
const amount = (value: bigint, digits = 4) => Number(formatEther(value)).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const pct = (value: number) => (value * 100).toFixed(2) + "%";
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="min-w-0"><p className="text-xs text-text-secondary">{label}</p><p className="mt-2 break-words font-number text-xl font-bold md:text-2xl">{value}</p>{note && <p className="mt-2 text-xs text-text-secondary">{note}</p>}</div>;
}
export function RecoveryOverview({ snapshot: s }: { snapshot: RecoverySnapshot }) {
  const recovery = normalizedRecovery(s.vaultPps, s.recoveryRate);
  const years = recoveryProjectionYears(s);
  const change = (s.history.at(-1)?.recovery ?? 0) - (s.history[0]?.recovery ?? 0);
  const measured = s.live?.measuredPerformance.find(window => window.windowDays === 30);
  const ppsChart = recoveryPpsChart(s);
  return <div className="space-y-7">
    <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
      <Metric label={s.live ? live.reference : text.overview.recovery} value={pct(recovery)} note={s.live ? s.live.feedFresh ? undefined : live.lastVerified : text.overview.basis} />
      <Metric label={s.live ? live.measured + " · 30 days" : text.overview.growth} value={s.live ? measured ? pct(measured.periodReturn) : "—" : "+" + (change * 100).toFixed(2) + " pts"} note={measured?.annualizedReturn != null ? live.annualized + ": " + pct(measured.annualizedReturn) : undefined} />
      <Metric label={text.overview.assets} value={amount(s.vaultAssetsEth, 1) + " ETH"} note={s.live && !s.live.feedFresh ? live.lastVerified : undefined} />
      <Metric label={text.overview.shares} value={amount(s.totalShares, 1)} note={s.live && !s.live.feedFresh ? live.lastVerified : undefined} />
    </div>
    {ppsChart ? <RecoveryPpsChart data={ppsChart} /> : <div className="rounded-box border border-border bg-surface p-5 text-tokyo-600 dark:text-tokyo-100">
      <h2 className="font-bold text-text-primary">{words.historyTitle}</h2>
      <RecoveryChart points={s.progressHistory.map(p => ({ x: p.day, y: p.recovery }))} label={words.historyLabel} startLabel={words.historyStart} endLabel={words.historyEnd} />
    </div>}
    <div className="rounded-box border border-border bg-surface p-5 md:p-7">
      <div className="grid gap-8 md:grid-cols-[1fr_1.4fr]">
        <div><h2 className="text-xl font-bold">{s.live ? live.targetTitle : copy.outlook.estimate}</h2><p className="my-3 font-number text-4xl font-bold">{years === null ? text.overview.unavailable : years.toFixed(1) + text.overview.years}</p><p className="text-sm leading-relaxed text-text-secondary">{copy.outlook.unavailable}</p></div>
        <div className="space-y-4">
          {[{ label: text.overview.half, multiplier: 0.5 }, { label: text.overview.same, multiplier: 1 }, { label: text.overview.double, multiplier: 2 }].map(item => {
            const value = recoveryProjectionYears(s, item.multiplier);
            return <div key={item.label}><div className="mb-2 flex justify-between gap-4 text-sm"><span>{item.label}</span><span className="font-number">{value === null ? text.overview.unavailable : value.toFixed(1) + text.overview.years}</span></div><div className="h-2 rounded-full bg-surface-tertiary"><div className="h-2 rounded-full bg-tokyo-600" style={{ width: value === null || years === null ? "0%" : Math.min(100, value / (years * 2) * 100) + "%" }} /></div></div>;
          })}
        </div>
      </div>
      <p className="mt-6 border-t border-border pt-4 text-sm leading-relaxed text-text-secondary">{s.live ? live.forecastBasis : copy.outlook.assumptions}</p>
    </div>
  </div>;
}
export function RecoveryCapital({ snapshot: s }: { snapshot: RecoverySnapshot }) {
  const funding = recoveryFunding(s);
  const vaultPct = funding.vaultPercent;
  const fundingAvailable = !s.live || s.live.fundingTotals !== null;
  const pendingSources = funding.pendingSources.slice(-5).reverse();
  const fundingAmount = (value: bigint) => value > 0n && value < 100_000_000_000_000n
    ? "<0.0001 WETH" : amount(value, 4) + " WETH";
  return <div className="space-y-7">
    <div><h2 className="text-xl font-bold">{copy.capital.title}</h2></div>
    <div className="grid gap-6 md:grid-cols-3">
      <Metric label={text.capital} value={amount(s.yieldAssetsEth, 1) + " ETH"} note={s.live && !s.live.feedFresh ? live.lastVerified : undefined} />
      <Metric label={s.yieldApyBasis === "estimated" ? text.estimatedApy : text.apy} value={s.yieldApy === null ? text.overview.unavailable : pct(s.yieldApy)} />
      <Metric label={s.live ? live.yieldAllTime : text.yieldReceived} value={fundingAvailable ? amount(funding.yieldReceived, 1) + " WETH" : "—"} />
    </div>
    <div className="rounded-box border border-border bg-surface p-5" data-testid="recovery-funding">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-bold">{s.live ? live.fundingPeriod : text.fundingTitle}</h3>
        <span className="font-number font-bold">
          {fundingAvailable ? amount(funding.total, 1) + " WETH" + (funding.complete ? "" : live.classifiedSuffix) : "—"}
        </span>
      </div>
      {fundingAvailable && <p className="mt-2 text-xs text-text-secondary">
        {text.fundingSources(amount(funding.yieldReceived, 1), amount(funding.donations, 1))}
        {funding.yearnRevenueShare > 0n && live.revenueShare(fundingAmount(funding.yearnRevenueShare))}
      </p>}
      {!fundingAvailable && <p className="mt-4 text-sm text-text-secondary">{live.fundingUnavailable}</p>}
      {fundingAvailable && funding.complete && funding.total === 0n && <p className="mt-4 text-sm text-text-secondary">{text.noFunding}</p>}
      {vaultPct !== null && <div className="my-4 flex h-3 overflow-hidden rounded-full bg-surface-tertiary" aria-hidden="true">
        <div className="bg-yearn-blue" style={{ width: vaultPct + "%" }} />
        <div className="bg-tokyo-600" style={{ width: 100 - vaultPct + "%" }} />
      </div>}
      {fundingAvailable && (funding.total > 0n || !funding.complete) && <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="border-l-2 border-yearn-blue pl-3">
          <p className="text-sm font-bold">{amount(funding.vault, 1)} WETH{vaultPct === null ? live.classifiedSuffix : " · " + vaultPct.toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%"}</p>
          <p className="mt-1 text-sm text-text-secondary">{text.toVault}</p>
        </div>
        <div className="border-l-2 border-tokyo-600 pl-3">
          <p className="text-sm font-bold">{amount(funding.auctions, 1)} WETH{vaultPct === null ? live.classifiedSuffix : " · " + (100 - vaultPct).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%"}</p>
          <p className="mt-1 text-sm text-text-secondary">{text.toAuctions}</p>
          <p className="mt-1 text-xs text-text-secondary">{text.auctionRounds(funding.rounds)}</p>
        </div>
      </div>}
      {funding.unclassified > 0n && <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm text-text-secondary">
        {funding.pendingSources.length !== 1 && <li>{live.unclassifiedFunding(fundingAmount(funding.unclassified))}</li>}
        {pendingSources.map(source => <li key={source.id} className="flex flex-wrap items-baseline gap-x-3">
          <span>{live.pendingFunding(fundingAmount(source.amount), source.destination)}</span>
          {source.transactionHash && <a className="underline" href={"https://etherscan.io/tx/" + source.transactionHash} target="_blank" rel="noreferrer">{live.fundingTransaction}</a>}
        </li>)}
        {funding.pendingSources.length > pendingSources.length && <li>{live.fundingEvidenceCount(pendingSources.length, funding.pendingSources.length)}</li>}
      </ul>}
      {funding.pendingAllocation > 0n && <p className="mt-4 text-sm text-text-secondary">{live.awaitingAllocation(fundingAmount(funding.pendingAllocation))}</p>}
      {fundingAvailable && !funding.complete && funding.unclassified === 0n && <p className="mt-4 text-sm text-text-secondary">{live.fundingReconciliationPending}</p>}
    </div>
    <div className="divide-y divide-border rounded-box border border-border bg-surface">
      {s.strategies.length === 0 && <p className="p-5 text-sm text-text-secondary">{live.noStrategies}</p>}
      {s.strategies.map(strategy => <details key={strategy.id} className="p-5">
        <summary className="grid cursor-pointer list-none grid-cols-2 items-center gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]"><div><p className="font-bold">{strategy.name} <span aria-hidden="true">⌄</span></p><p className="mt-1 text-xs text-text-secondary">{strategy.asset}</p></div><div className="text-right font-number">{amount(strategy.assetsEth, 1)} ETH</div><div className="text-sm text-text-secondary md:text-right">{(strategy.allocationBps / 100).toFixed(1)}{text.allocation}</div><div className="text-right text-sm">{strategy.historicalApy === null ? text.apyUnavailable : pct(strategy.historicalApy) + " APY"}</div></summary>
        {s.live && <div className="mt-4"><ContractLink address={strategy.id} /></div>}
        {strategy.description && <p className="mt-4 text-sm leading-relaxed text-text-secondary">{strategy.description}</p>}
      </details>)}
    </div>
  </div>;
}
