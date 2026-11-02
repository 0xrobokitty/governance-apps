"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useMetrics } from "@/lib/hooks/useMetrics";
import { rankProducts } from "@/lib/clients/metrics/client";
import type { AssetGroup, MetricsPeriod, MetricsScenario, ProductMetric, Ranking } from "@/lib/clients/metrics/types";
import { FlowChart } from "./FlowChart";
import { number, rate, usd } from "./format";
import { messages, metricsLabels } from "./messages";

const selectClass = "min-h-10 max-w-full rounded-box border border-border bg-surface px-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yearn-blue";
const positiveClass = "text-yearn-blue dark:text-blue-400";
const negativeClass = "text-orange-800 dark:text-orange-300";
const links = [
  ["Treasury", "https://treasury.govern.fi"],
  ["Team finances", "https://teams.govern.fi"],
  ["stYFI", "https://styfi.yearn.fi"],
  ["Governance", "https://dao.govern.fi"],
] as const;

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-yearn-blue">{children}<span aria-hidden="true">↗</span><span className="sr-only">{metricsLabels.opensInANewTab}</span></a>;
}

function MetricCard({ label, value, detail, foot, direction }: { label: string; value: string; detail: string; foot: string; direction?: number }) {
  return <Card className="min-w-0 p-5 md:p-6">
    <h2 className="text-sm text-text-secondary">{label}</h2>
    <p className={"mt-3 font-number text-3xl tracking-tight xl:text-4xl " + (direction === undefined ? "" : direction >= 0 ? positiveClass : negativeClass)}>{value}</p>
    <p className="mt-3 text-sm">{detail}</p>
    <p className="mt-1 text-xs text-text-tertiary">{foot}</p>
  </Card>;
}

export function MetricsPageClient() {
  const [period, setPeriod] = useState<MetricsPeriod>(7);
  const [asset, setAsset] = useState<AssetGroup>("All assets");
  const [scenario, setScenario] = useState<MetricsScenario>("normal");
  const [ranking, setRanking] = useState<Ranking>("inflows");
  const [expanded, setExpanded] = useState(false);
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductMetric | null>(null);
  const data = useMetrics(period, asset, scenario);
  const ranked = data ? rankProducts(data.products, ranking) : [];
  const products = expanded ? ranked : ranked.slice(0, 5);
  const stake = data ? data.staking.total : 0;

  return <div className="container mx-auto max-w-7xl min-w-0 space-y-6 px-4 py-6 md:px-6 md:py-8">
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 rounded-box border border-yearn-blue/20 bg-yearn-blue/5 px-4 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-bold">{messages.preview}</span><span className="text-text-secondary">{messages.sample}</span></div>
      <button type="button" onClick={() => setShowDefinitions(true)} className="min-h-8 rounded text-text-secondary underline decoration-border underline-offset-4 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-yearn-blue">{messages.definitions} <span aria-hidden="true">↗</span></button>
    </div>

    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-3xl font-bold tracking-tight md:text-4xl">{messages.title}</h1><p className="mt-2 text-sm text-text-secondary">{messages.subtitle}</p></div>
      <div className="text-left text-xs text-text-secondary sm:text-right"><p>{metricsLabels.sampleSnapshot}</p><p className="mt-1 font-number text-text-primary">{messages.close}</p></div>
    </div>

    <section aria-label="Capital and product activity filters" className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={messages.period} className="inline-flex rounded-box border border-border bg-surface p-1">
          {([1, 7, 30] as const).map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); setSelectedProduct(null); }} className={"min-h-9 min-w-12 rounded px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yearn-blue " + (period === value ? "bg-text-primary font-bold text-surface" : "text-text-secondary hover:bg-surface-secondary")}>{value}{metricsLabels.d}</button>)}
        </div>
        <span className="text-sm text-text-secondary" data-testid="metrics-range">{data?.range ?? "No snapshot"}</span>
      </div>
      <label className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">{messages.scope}
        <select aria-label="Asset group" value={asset} onChange={event => { setAsset(event.target.value as AssetGroup); setSelectedProduct(null); }} className={selectClass}>
          {(["All assets", "Stablecoins", "ETH", "Other"] as const).map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
    </section>

    {data?.partial && <p role="status" className="rounded-box border border-orange-300/40 bg-orange-400/10 px-4 py-3 text-sm">{messages.partial}</p>}

    {!data ? <Card className="py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary text-2xl" aria-hidden="true">—</div>
      <h2 className="text-xl font-bold">{messages.noData}</h2><p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">{messages.noDataDetail}</p>
      <Button className="mt-6" variant="secondary" onClick={() => setScenario("normal")}>{messages.restore}</Button>
    </Card> : <>
      <section aria-label="Capital summary" className="grid gap-4 md:grid-cols-3">
        <MetricCard label={messages.net} value={usd(data.net, true)} direction={data.net} detail={rate(data.neutralRate) + " of opening capital, price-adjusted"} foot="External deposits less withdrawals" />
        <MetricCard label={messages.depositors} value={number(data.depositors)} detail={usd(data.deposits) + " deposited"} foot={number(data.depositActions) + " actions · unique chain + address"} />
        <MetricCard label={messages.withdrawers} value={number(data.withdrawers)} detail={usd(data.withdrawals) + " withdrawn"} foot={number(data.withdrawalActions) + " actions · unique chain + address"} />
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <FlowChart data={data} />
        <Card className="min-w-0 p-5 md:p-6">
          <h2 className="text-lg font-bold">{messages.assets}</h2><p className="mt-1 text-xs text-text-secondary">{metricsLabels.netFlowsPricesHeldAtPeriodStart}</p>
          <div className="mt-6 space-y-6">
            {data.assets.map(group => <div key={group.name}>
              <div className="flex items-baseline justify-between gap-2"><h3 className="text-sm font-bold">{group.name}</h3><span className={"font-number text-lg " + (group.neutralRate >= 0 ? positiveClass : negativeClass)}>{rate(group.neutralRate)}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-secondary"><div className={"h-full rounded-full " + (group.neutralRate >= 0 ? "bg-yearn-blue" : "bg-orange-700")} style={{ width: Math.min(100, Math.abs(group.neutralRate) / Math.max(...data.assets.map(a => Math.abs(a.neutralRate)), 1) * 100) + "%" }} /></div>
              <p className="mt-2 text-xs text-text-secondary">{group.name === "Stablecoins" ? usd(group.net, true) + " at movement prices" : (group.nativeNet >= 0 ? "+" : "−") + number(Math.abs(group.nativeNet), 2) + " " + group.unit + " · " + usd(group.net, true)}</p>
            </div>)}
          </div>
          <p className="mt-6 border-t border-border pt-3 text-xs leading-relaxed text-text-tertiary">{metricsLabels.priceNeutralNote}</p>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 pb-4 pt-5 md:px-6">
          <div><h2 className="text-lg font-bold">{messages.products}</h2><p className="mt-1 text-xs text-text-secondary">{messages.productDescription}</p></div>
          <label className="flex items-center gap-2 text-xs text-text-secondary">{metricsLabels.rankBy}<select aria-label="Rank products by" value={ranking} onChange={event => setRanking(event.target.value as Ranking)} className={selectClass}>
              <option value="inflows">{metricsLabels.highestNetFlows}</option><option value="outflows">{metricsLabels.lowestNetFlows}</option><option value="depositors">{metricsLabels.depositors}</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[590px] text-right text-sm">
            <caption className="sr-only">{metricsLabels.productActivityFor}{data.range}, {asset}. {data.partial ? "Base excluded." : "All example chains."}</caption>
            <thead className="border-y border-border bg-surface-secondary/50 text-xs text-text-secondary"><tr><th scope="col" className="py-3 pl-5 text-left font-normal md:pl-6">{metricsLabels.product}</th><th scope="col" className="px-3 font-normal">{metricsLabels.deposits}</th><th scope="col" className="px-3 font-normal">{metricsLabels.withdrawals}</th><th scope="col" className="px-3 font-normal">{metricsLabels.netFlow}</th><th scope="col" className="pr-5 font-normal md:pr-6">{metricsLabels.depositors}</th></tr></thead>
            <tbody>{products.map((product, index) => <tr key={product.id} className="border-b border-border last:border-0 hover:bg-surface-secondary/40">
              <th scope="row" className="py-2 pl-5 text-left font-normal md:pl-6"><button type="button" aria-label={"View " + product.name + " on " + product.chain} onClick={() => setSelectedProduct(product)} className="flex min-h-12 items-center gap-3 rounded pr-3 text-left focus-visible:outline-2 focus-visible:outline-yearn-blue">
                <span className="w-3 font-number text-xs text-text-tertiary">{index + 1}</span><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-secondary font-number text-xs text-text-secondary">{product.asset === "ETH" ? "Ξ" : product.asset === "BTC" ? "₿" : "$"}</span>
                <span><span className="font-bold">{product.name}</span><span className="mt-0.5 block text-xs text-text-secondary">{product.chain}</span></span>
              </button></th>
              <td className="px-3 font-number text-xs">{usd(product.deposits)}</td><td className="px-3 font-number text-xs text-text-secondary">{usd(product.withdrawals)}</td>
              <td className={"px-3 font-number text-xs " + (product.net >= 0 ? positiveClass : negativeClass)}>{usd(product.net, true)}<span className="mt-1 block text-[11px] text-text-secondary">{rate(product.neutralRate)}{metricsLabels.flowRate}</span></td>
              <td className="pr-5 font-number text-xs md:pr-6">{number(product.depositors)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-text-secondary md:px-6"><span>{data.overlap}{metricsLabels.overlappingAccounts}</span>{ranked.length > 5 && <button type="button" onClick={() => setExpanded(!expanded)} className="min-h-9 rounded px-2 font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-yearn-blue">{expanded ? "Show top 5" : "View all " + ranked.length} <span aria-hidden="true">{expanded ? "↑" : "↓"}</span></button>}</div>
      </Card>

      <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-2">
        <Card data-testid="metrics-fees" className="min-w-0 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{messages.fees}</h2><span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-text-secondary">{metricsLabels.allProducts}{period}{metricsLabels.d}</span></div>
          <p className="mt-1 text-xs text-text-secondary">{metricsLabels.feeStages}</p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
            <div><p className="text-xs text-text-secondary">{metricsLabels.feesRecorded}</p><p className="mt-2 font-number text-2xl">{usd(data.fees.recorded)}</p><p className="mt-2 text-xs text-text-tertiary">{number(data.fees.harvests)}{metricsLabels.feeBearingHarvests}</p></div>
            <div className="min-w-0"><p className="text-xs text-text-secondary">{metricsLabels.auctionProceeds}</p><p className="mt-2 font-number text-2xl">{usd(data.fees.proceeds)}</p><p className="mt-2 text-xs text-text-tertiary">{data.fees.rounds}{metricsLabels.completedRounds}{data.fees.fills}{metricsLabels.fills}</p></div>
            <div className="min-w-0"><p className="text-xs text-text-secondary">{metricsLabels.awaitingConversion}</p><p className="mt-2 font-number text-2xl">{usd(data.fees.inventory)}</p><p className="mt-2 text-xs text-text-tertiary">{metricsLabels.inventoryAtSnapshotClose}</p></div>
          </div>
          <p className="mt-6 rounded-box bg-surface-secondary px-3 py-3 text-xs leading-relaxed text-text-secondary">{metricsLabels.feeStagesNote}</p>
          <div className="mt-3 flex flex-wrap gap-x-5"><ExternalLink href="https://treasury.govern.fi">{metricsLabels.treasuryDetail}</ExternalLink><ExternalLink href="https://teams.govern.fi">{metricsLabels.reportedFinances}</ExternalLink></div>
        </Card>

        <Card className="min-w-0 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{messages.staking}</h2><span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-text-secondary">{metricsLabels.protocolWide}</span></div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs text-text-secondary">{metricsLabels.activeStake}</p><p className="mt-2 font-number text-3xl">{number(data.staking.rate, 2)}<span className="text-xl">%</span></p></div>
            <div className="text-right"><p className="font-number text-sm">{number(stake)}{metricsLabels.yfiUnit}</p><p className={"mt-1 font-number text-xs " + (data.staking.change >= 0 ? positiveClass : negativeClass)}>{data.staking.change >= 0 ? "+" : "−"}{number(Math.abs(data.staking.change), 1)}{metricsLabels.stakePeriod}{period}{metricsLabels.d}</p></div>
          </div>
          <div aria-hidden="true" className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface-secondary"><div className="bg-yearn-blue" style={{ width: data.staking.directShare + "%" }} /><div className="bg-violet-400" style={{ width: data.staking.delegatedShare + "%" }} /></div>
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs"><span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-yearn-blue" />{metricsLabels.directStYFI}<span className="ml-1 font-number">{number(data.staking.direct)}</span></span><span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-violet-400" />{metricsLabels.viaStYFIx}<span className="ml-1 font-number">{number(data.staking.delegated)}</span></span></div>
          <p className="mt-2 text-[11px] text-text-tertiary">{metricsLabels.underlyingStake}{data.staking.pending}{metricsLabels.pendingStake}</p>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div><p className="text-xs text-text-secondary">{metricsLabels.stYFIxAPR}</p><p className="mt-2 font-number text-xl">{data.staking.apr}%</p><p className="mt-1 text-[11px] text-text-tertiary">{metricsLabels.snapshotRateIncludesVoteBoost}</p></div>
            <div><p className="text-xs text-text-secondary">{metricsLabels.votingPowerUsed}</p><p className="mt-2 font-number text-xl">{number(data.staking.votingRate, 1)}%</p><p className="mt-1 text-[11px] text-text-tertiary">{metricsLabels.lastClosedVote29Oct}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2"><p className="text-xs text-text-secondary">{metricsLabels.yfiPriceLabel}<span className="ml-1 font-number text-text-primary">{"$" + number(data.market.yfiUSD)}</span><span className="mx-2">/</span><span className="font-number text-text-primary">{number(data.market.yfiETH, 2)}{metricsLabels.ethUnit}</span></p><ExternalLink href="https://styfi.yearn.fi">{metricsLabels.stakingDetail}</ExternalLink></div>
        </Card>
      </div>
    </>}

    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2">
      <p className="text-xs text-text-tertiary">{metricsLabels.goDeeperInTheApps}</p><nav aria-label="Related apps" className="flex flex-wrap gap-x-6">{links.map(([label, href]) => <ExternalLink key={label} href={href}>{label}</ExternalLink>)}</nav>
    </footer>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-box bg-surface-secondary px-4 py-3">
      <div><p className="text-xs font-bold">{metricsLabels.previewControls}</p><p className="mt-1 text-xs text-text-secondary">{metricsLabels.scenarioHint}</p></div>
      <label className="flex items-center gap-3 text-xs text-text-secondary">{metricsLabels.scenario}<select aria-label="Preview scenario" value={scenario} onChange={event => { setScenario(event.target.value as MetricsScenario); setSelectedProduct(null); }} className={selectClass}><option value="normal">{metricsLabels.netInflows}</option><option value="outflows">{metricsLabels.netOutflows}</option><option value="partial">{metricsLabels.partialCoverage}</option><option value="unavailable">{metricsLabels.dataUnavailable}</option></select></label>
    </div>

    <Modal isOpen={showDefinitions} onClose={() => setShowDefinitions(false)} title={messages.definitions} className="max-h-[85dvh] max-w-2xl overflow-y-auto">
      <div className="space-y-5">{messages.methodology.map(([title, body]) => <section key={title}><h3 className="text-sm font-bold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-text-secondary">{body}</p></section>)}</div>
    </Modal>
    <Modal isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} title={selectedProduct ? selectedProduct.name + " · " + selectedProduct.chain : undefined}>
      {selectedProduct && <div className="space-y-4 text-sm"><p className="text-text-secondary">{data?.range}{metricsLabels.fictionalProductExample}</p><dl className="space-y-3">{[
        ["Deposits", usd(selectedProduct.deposits)],
        ["Withdrawals", usd(selectedProduct.withdrawals)],
        ["Net external flow", usd(selectedProduct.net, true)],
        ["Price-adjusted flow rate", rate(selectedProduct.neutralRate)],
        ["Native asset net flow", number(selectedProduct.nativeNet, 3) + " " + selectedProduct.asset],
        ["Depositing accounts / actions", number(selectedProduct.depositors) + " / " + number(selectedProduct.depositActions)],
        ["Withdrawing accounts / actions", number(selectedProduct.withdrawers) + " / " + number(selectedProduct.withdrawalActions)],
      ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-text-secondary">{label}</dt><dd className="font-number">{value}</dd></div>)}</dl><p className="border-t border-border pt-4 text-xs leading-relaxed text-text-secondary">{metricsLabels.productLinkHint}</p><ExternalLink href="https://yearn.fi">{metricsLabels.exploreYearnProducts}</ExternalLink></div>}
    </Modal>
  </div>;
}
