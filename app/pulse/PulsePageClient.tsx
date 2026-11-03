"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { usePulse } from "@/lib/hooks/usePulse";
import type { Asset, GovernanceView, Period, Scenario } from "@/lib/clients/pulse/types";
import { TrendChart, Sparkline, type TrendSeries } from "./TrendChart";
import { money, number, percent, points, shortDate, fullDate, dateRange } from "./format";
import { copy, ui } from "./messages";
import styles from "./pulse.module.css";

const BLUE = "#3478f6", PURPLE = "#9a78e8", ORANGE = "#cc7451", TEAL = "#1c9d8f";
const positive = "text-yearn-blue dark:text-blue-400";
const negative = "text-orange-800 dark:text-orange-300";
const selectClass = "h-9 max-w-full rounded-box border border-border bg-surface px-2 text-xs focus-visible:outline-2 focus-visible:outline-yearn-blue";
type Detail = { title: string; note: string; dates: string[]; series: TrendSeries[]; format: (value: number) => string };
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap rounded bg-surface-secondary p-0.5">
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={"min-h-8 rounded px-2.5 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-yearn-blue " + (value === option.value ? "bg-surface font-bold text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary")}>{option.label}</button>)}
  </div>;
}
function Legend({ series }: { series: TrendSeries[] }) {
  return <div className={styles.legend + " text-text-secondary"}>{series.map(s => <span key={s.label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-3 border-t-2" style={{ borderColor: s.color, borderStyle: s.dash ? "dashed" : "solid" }} />{s.label}</span>)}</div>;
}
function Change({ value, suffix }: { value: number; suffix: string }) {
  return <span className={"text-xs " + (value >= 0 ? positive : negative)}>{percent(value, true, 1)} <span className="text-text-secondary">{suffix}</span></span>;
}
function AppLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="rounded text-xs text-text-secondary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-yearn-blue">{children} <span aria-hidden="true">↗</span><span className="sr-only">{ui.newTab}</span></a>;
}

export function PulsePageClient() {
  const [period, setPeriod] = useState<Period>(30);
  const [asset, setAsset] = useState<Asset>("all");
  const [scenario, setScenario] = useState<Scenario>("mixed");
  const [indexed, setIndexed] = useState("usd");
  const [flowBasis, setFlowBasis] = useState("rate");
  const [flowView, setFlowView] = useState("daily");
  const [destinationBasis, setDestinationBasis] = useState("rate");
  const [accountView, setAccountView] = useState("average");
  const [feeView, setFeeView] = useState("fees");
  const [governanceView, setGovernanceView] = useState<GovernanceView>("stake");
  const [priceBasis, setPriceBasis] = useState("usd");
  const [productView, setProductView] = useState("in");
  const [wall, setWall] = useState(false);
  const [method, setMethod] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const data = usePulse(period, asset, scenario);
  const dates = data?.days.map(day => day.date) ?? [];
  const lastGovernance = data?.governance.at(-1);
  const lastVote = data?.governance.filter(day => day.vote).at(-1);
  const colors = { stable: TEAL, eth: BLUE, other: PURPLE };
  const tvlDates = data ? [data.openingDate, ...dates] : [];
  const tvlSeries: TrendSeries[] = data ? [
    { label: ui.marketPrices, color: BLUE, values: indexed === "usd" ? [data.openingTVL, ...data.days.map(day => day.tvl)] : [100, ...data.days.map(day => day.tvlIndex)], kind: "area" },
    { label: ui.fixedOpeningPrices, color: PURPLE, values: indexed === "usd" ? [data.openingTVL, ...data.days.map(day => day.fixedTVL)] : [100, ...data.days.map(day => day.fixedIndex)], dash: true },
  ] : [];
  const flowSeries: TrendSeries[] = data ? [{
    label: flowView === "daily" ? "Daily net flows" : "Cumulative net flows", color: BLUE, kind: flowView === "daily" ? "bar" : "area",
    values: data.days.map(day => flowBasis === "rate" ? flowView === "daily" ? day.netRate : day.cumulativeRate : flowView === "daily" ? day.net : day.cumulativeNet),
  }] : [];
  const accountSeries: TrendSeries[] = data ? [
    { label: ui.depositing, color: BLUE, values: data.days.map(day => accountView === "daily" ? day.depositors : day.depositorAverage) },
    { label: ui.withdrawing, color: ORANGE, values: data.days.map(day => accountView === "daily" ? day.withdrawers : day.withdrawerAverage) },
  ] : [];
  const destinationSeries: TrendSeries[] = data ? data.destinationGroups.map(group => ({
    label: group.label, color: colors[group.id], values: data.days.map(day => destinationBasis === "rate" ? day.destinations[group.id].rate : day.destinations[group.id].dollars),
  })) : [];
  const feeSeries: TrendSeries[] = data ? feeView === "fees" ? [
    { label: ui.feesRecordedDay, color: BLUE, kind: "bar", values: data.days.map(day => day.fees) },
    { label: ui.label7DAverage, color: PURPLE, values: data.days.map(day => day.feeAverage) },
  ] : [{ label: feeView === "pnl" ? "Reported harvest P&L" : "Harvest reports", color: BLUE, kind: "bar", values: data.days.map(day => feeView === "pnl" ? day.harvestPnl : day.reports) }] : [];
  const governanceSeries: TrendSeries[] = data ? governanceView === "stake" ? [
    { label: ui.directStYFI, color: BLUE, kind: "area", values: data.governance.map(day => day.directRate), floor: data.governance.map(() => 0) },
    { label: ui.viaStYFIx, color: PURPLE, kind: "area", values: data.governance.map(day => day.rate), floor: data.governance.map(day => day.directRate) },
  ] : governanceView === "apr" ? [{ label: ui.stYFIxAPR, color: PURPLE, values: data.governance.map(day => day.apr), kind: "area" }]
    : governanceView === "votes" ? [{ label: ui.eligibleVotingPowerUsed, color: BLUE, values: data.governance.map(day => day.vote?.rate ?? null), kind: "points" }]
      : [{ label: priceBasis === "usd" ? "YFI / USD" : "YFI / ETH", color: BLUE, values: data.governance.map(day => priceBasis === "usd" ? day.usd : day.eth), kind: "area" }] : [];
  const tvlFormat = (v: number) => indexed === "usd" ? money(v) : number(v, 1);
  const flowFormat = (v: number) => flowBasis === "rate" ? percent(v) : money(v);
  const destinationFormat = (v: number) => destinationBasis === "rate" ? percent(v) : money(v);
  const governanceFormat = (v: number) => governanceView === "price" ? priceBasis === "usd" ? money(v) : number(v, 3) + " ETH" : percent(v, false, 1);
  const inspect = (title: string, note: string, chartDates: string[], series: TrendSeries[], format: (value: number) => string) => setDetail({ title, note, dates: chartDates, series, format });
  const detailButton = (title: string, note: string, chartDates: string[], series: TrendSeries[], format: (value: number) => string) =>
    <button type="button" aria-label={"Details: " + title} onClick={() => inspect(title, note, chartDates, series, format)} className="min-h-7 rounded px-1 text-[11px] text-text-tertiary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-yearn-blue">{copy.details} <span aria-hidden="true">↗</span></button>;
  const products = data?.products.filter(p => productView === "in" ? p.net > 0 : p.net < 0).sort((a, b) => productView === "in" ? b.net - a.net : a.net - b.net).slice(0, 5) ?? [];

  return <div className={styles.page + (wall ? " " + styles.wall : "")} data-pulse-wall={wall ? "true" : "false"}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <svg aria-hidden="true" viewBox="0 0 36 32" className="h-8 w-9 text-yearn-blue dark:text-blue-400"><path d="M1 17h8l4-11 7 21 5-14 3 4h7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
        {!wall && <span className="hidden border-l border-border pl-3 text-sm text-text-secondary sm:block">{copy.subtitle}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-yearn-blue/20 bg-yearn-blue/5 px-3 py-1.5 text-[11px] text-text-secondary">{copy.sample}</span>
        <button type="button" onClick={() => setMethod(true)} className="min-h-9 rounded text-xs text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-yearn-blue">{copy.method}</button>
        <Button size="sm" variant="secondary" onClick={() => setWall(!wall)} aria-pressed={wall}>{wall ? copy.exitFocus : copy.focus}</Button>
      </div>
    </div>

    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Choice label="History window" value={String(period)} options={[7, 30, 90, 365].map(value => ({ value: String(value), label: value + "D" }))} onChange={value => setPeriod(Number(value) as Period)} />
        <p className="text-xs text-text-secondary" data-testid="pulse-range">{data ? dateRange(data.start, data.end) + " · completed UTC days" : "No observations available"}</p>
      </div>
      <label className="flex items-center gap-2 text-xs text-text-secondary">{copy.scope}
        <select aria-label="Capital asset group" className={selectClass} value={asset} onChange={event => setAsset(event.target.value as Asset)}>
          <option value="all">{ui.allAssets}</option><option value="stable">{ui.stablecoins}</option><option value="eth">{ui.eTHAssets}</option><option value="other">{ui.otherAssets}</option>
        </select>
      </label>
    </div>

    {data?.partial && <p role="status" className="mb-4 rounded-box border border-orange-400/30 bg-orange-400/10 p-3 text-xs">{copy.partial}</p>}
    {!data ? <Card className="py-20 text-center"><h2 className="text-xl font-bold">{copy.unavailable}</h2><p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">{copy.unavailableDetail}</p><Button variant="secondary" className="mt-5" onClick={() => setScenario("mixed")}>{ui.showExampleHistory}</Button></Card> : <>
      {!wall && <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-box border border-yearn-blue/15 bg-yearn-blue/[0.035] px-4 py-3 text-xs" data-testid="pulse-readout">
        <p><strong className="mr-3 text-text-primary">{ui.inThisWindow}</strong><span className="text-text-secondary">{ui.tVL}</span><strong>{percent(data.tvlChange, true, 1)}</strong><span className="mx-2 text-text-tertiary">/</span><span className="text-text-secondary">{ui.atFixedPrices}</span><strong>{percent(data.fixedChange, true, 1)}</strong><span className="mx-2 text-text-tertiary">/</span><span className="text-text-secondary">{ui.last7DNetFlows}</span><strong className={data.recentNet >= 0 ? positive : negative}>{money(data.recentNet, true)}</strong><span className="ml-1 text-text-tertiary">{ui.atOpeningPrices}</span></p>
        <span className="text-text-secondary">{ui.separateNewCapitalFromPriceMoves}</span>
      </div>}

      <section aria-label="Pulse trend dashboard" className={styles.grid}>
        <Card className={styles.tile} data-testid="pulse-tvl">
          <div className={styles.tileTop}><h2 className="text-sm font-bold">{copy.tvl}</h2>{detailButton(copy.tvl, copy.definitions[0][1], tvlDates, tvlSeries, tvlFormat)}</div>
          <div className={styles.metric}><span className="font-number text-[28px] leading-tight">{money(data.tvl)}</span><Change value={data.tvlChange} suffix={"over " + period + "D"} /></div>
          <div className={styles.controls}><span className="text-[11px] text-text-secondary">{ui.fixedPriceGrowth}<strong className="font-number text-text-primary">{percent(data.fixedChange, true, 1)}</strong></span><Choice label="TVL scale" value={indexed} onChange={setIndexed} options={[{ value: "usd", label: ui.uSD }, { value: "index", label: ui.start100 }]} /></div>
          <TrendChart label="TVL over time" dates={tvlDates} series={tvlSeries} format={tvlFormat} />
          <Legend series={tvlSeries} />
          <p className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>{ui.changeFlows}<span className="font-number">{money(data.net, true)}</span>{ui.earned}<span className="font-number">{money(data.earned, true)}</span>{ui.repricing}<span className="font-number">{money(data.repricing, true)}</span></p>
        </Card>

        <Card className={styles.tile} data-testid="pulse-flows">
          <div className={styles.tileTop}><h2 className="text-sm font-bold">{copy.flows}</h2>{detailButton(copy.flows, flowBasis === "rate" ? copy.definitions[3][1] : copy.definitions[2][1], dates, flowSeries, flowFormat)}</div>
          <div className={styles.metric}><span className={"font-number text-[28px] leading-tight " + ((flowBasis === "rate" ? data.fixedNet : data.net) >= 0 ? positive : negative)}>{flowBasis === "rate" ? percent(data.flowRate, true) : money(data.net, true)}</span><span className="text-xs text-text-secondary">{flowBasis === "rate" ? money(data.fixedNet, true) + " " + ui.atOpeningPrices : ui.atMovementPrices}</span></div>
          <div className={styles.controls}><Choice label="Flow aggregation" value={flowView} onChange={setFlowView} options={[{ value: "daily", label: ui.daily }, { value: "cumulative", label: ui.cumulative }]} /><Choice label="Flow units" value={flowBasis} onChange={setFlowBasis} options={[{ value: "usd", label: ui.uSD }, { value: "rate", label: ui.tVL2 }]} /></div>
          <TrendChart label="External flows over time" dates={dates} series={flowSeries} format={flowFormat} zero />
          <div className={styles.legend + " text-text-secondary"}><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-500" />{ui.netInflow}</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-orange-600" />{ui.netOutflow}</span><span className="ml-auto">{flowBasis === "rate" ? "Price-neutral" : "At movement prices"}</span></div>
          <p className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>{flowBasis === "rate" ? "Fixed-price flows ÷ TVL at the start of this window. Daily rates sum to the period rate." : "External deposits less withdrawals. Internal Yearn movements are excluded."}</p>
        </Card>

        <Card className={styles.tile} data-testid="pulse-accounts">
          <div className={styles.tileTop}><h2 className="text-sm font-bold">{copy.accounts}</h2>{detailButton(copy.accounts, copy.definitions[4][1], dates, accountSeries, value => number(value, 1))}</div>
          <div className={styles.metric}><span className="font-number text-[26px] leading-tight">{number(data.depositAverage)}<span className="mx-2 text-lg text-text-tertiary">/</span><span style={{ color: ORANGE }}>{number(data.withdrawAverage)}</span></span><span className="text-[11px] text-text-secondary">{ui.depositingWithdrawingPerDay}</span></div>
          <div className={styles.controls}><span className="text-[11px] text-text-secondary">{ui.vsPrior}{period}{ui.d}<span className="font-number">{percent(data.depositTrend, true, 1)} / {percent(data.withdrawTrend, true, 1)}</span></span><Choice label="Account smoothing" value={accountView} onChange={setAccountView} options={[{ value: "daily", label: ui.daily }, { value: "average", label: ui.label7DAvg }]} /></div>
          <TrendChart label="Account activity over time" dates={dates} series={accountSeries} format={value => number(value)} />
          <Legend series={accountSeries} />
          <p className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>{number(data.depositors)}{ui.depositing2}{number(data.withdrawers)}{ui.withdrawingAccountsIn}{period}{ui.dChainAddressNotPeopleDirectionsCan}</p>
        </Card>

        <Card className={styles.tile} data-testid="pulse-destinations">
          <div className={styles.tileTop}><h2 className="text-sm font-bold">{copy.destinations}</h2>{detailButton(copy.destinations, copy.definitions[3][1], dates, destinationSeries, destinationFormat)}</div>
          <div className={styles.metric}><span className="text-xl font-bold">{ui.cumulativeNetFlows}</span></div>
          <div className={styles.controls}><span className="text-[11px] text-text-secondary">{ui.compareAssetGroupsOnTheSameTimeline}</span><Choice label="Destination units" value={destinationBasis} onChange={setDestinationBasis} options={[{ value: "usd", label: ui.uSD }, { value: "rate", label: ui.ownTVL }]} /></div>
          <TrendChart label="Capital destinations over time" dates={dates} series={destinationSeries} format={destinationFormat} zero />
          <Legend series={destinationSeries} />
          <p className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>{destinationBasis === "rate" ? "Each group uses its own opening TVL and fixed opening prices. Percentages are not additive." : "Cumulative dollar flows at movement prices. A larger product base can produce larger absolute flows."}</p>
        </Card>

        <Card className={styles.tile} data-testid="pulse-fees">
          <div className={styles.tileTop}><h2 className="text-sm font-bold">{copy.fees}</h2><span className="text-[10px] text-text-tertiary">{ui.allProducts}</span>{detailButton(copy.fees, copy.definitions[5][1], dates, feeSeries, value => feeView === "reports" ? number(value) : money(value))}</div>
          <div className={styles.metric}><span className="font-number text-[28px] leading-tight">{feeView === "fees" ? money(data.fees) : feeView === "pnl" ? money(data.harvestPnl) : number(data.reports)}</span>{feeView === "fees" ? <Change value={data.feeChange} suffix={"vs prior " + period + "D"} /> : <span className="text-xs text-text-secondary">{feeView === "pnl" ? "reported strategy profit" : "harvest reports"}{ui.in}{period}{ui.d2}</span>}</div>
          <div className={styles.controls}><Choice label="Harvest measure" value={feeView} onChange={setFeeView} options={[{ value: "fees", label: ui.fees }, { value: "pnl", label: ui.harvestPL }, { value: "reports", label: ui.reports }]} /></div>
          <TrendChart label="Harvest and fee history" dates={dates} series={feeSeries} format={value => feeView === "reports" ? number(value) : money(value)} zero />
          <Legend series={feeSeries} />
          <p className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>{ui.auctionProceeds}<span className="font-number">{money(data.proceeds)}</span>{ui.in}{period}{ui.dASeparateConversionStepNotAdditional}</p>
        </Card>

        <Card className={styles.tile} data-testid="pulse-governance">
          <div className={styles.tileTop}><h2 className="text-sm font-bold">{copy.governance}</h2><span className="text-[10px] text-text-tertiary">{ui.protocolWide}</span>{detailButton(copy.governance, copy.definitions[6][1], dates, governanceSeries, governanceFormat)}</div>
          <div className={styles.metric}>
            <span className="font-number text-[28px] leading-tight">{governanceView === "stake" ? percent(lastGovernance!.rate) : governanceView === "apr" ? percent(lastGovernance!.apr) : governanceView === "votes" ? lastVote ? percent(lastVote.vote!.rate, false, 1) : "—" : priceBasis === "usd" ? "$" + number(lastGovernance!.usd) : number(lastGovernance!.eth, 3) + " ETH"}</span>
            <span className="text-xs text-text-secondary">{governanceView === "stake" ? points(data.stakeDelta) + " of supply over " + period + "D" : governanceView === "apr" ? points(data.aprDelta) + " over " + period + "D" : governanceView === "votes" ? "last closed vote · " + (lastVote ? shortDate(lastVote.date) : "none") : "YFI price"}</span>
          </div>
          <div className={styles.controls}><Choice label="YFI governance measure" value={governanceView} onChange={setGovernanceView} options={[{ value: "stake", label: ui.staking }, { value: "apr", label: ui.aPR }, { value: "votes", label: ui.voting }, { value: "price", label: ui.yFIPrice }]} />{governanceView === "price" && <Choice label="YFI price currency" value={priceBasis} onChange={setPriceBasis} options={[{ value: "usd", label: ui.uSD }, { value: "eth", label: ui.eTH }]} />}</div>
          <TrendChart label="YFI governance history" dates={dates} series={governanceSeries} format={governanceFormat} zero={governanceView === "stake" || governanceView === "votes"} />
          <Legend series={governanceSeries} />
          <p className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>{governanceView === "stake" ? number(lastGovernance!.total) + " underlying YFI, counted once. " + number(lastGovernance!.pending) + " pending unstake excluded." : governanceView === "apr" ? "Historical stated APR, including VoteBoost. No assumed compounding." : governanceView === "votes" ? data.governance.filter(day => day.vote).length + " closed votes. Each dot uses that vote’s eligible power; gaps are not zeros." : "Snapshot context in USD or ETH. Price movement does not count as new capital."}</p>
        </Card>
      </section>

      {!wall && <Card className="mt-4 min-w-0 overflow-hidden p-0 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><h2 className="text-sm font-bold">{copy.products}</h2><p className="mt-1 text-[11px] text-text-secondary">{data.positiveProducts}{ui.of}{data.products.length}{ui.productsHaveNetInflowsInThisWindow}</p></div><Choice label="Product ranking" value={productView} onChange={setProductView} options={[{ value: "in", label: ui.largestInflows }, { value: "out", label: ui.largestOutflows }]} /></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-right text-xs"><caption className="sr-only">{ui.productTrendsOver}{period}{ui.days}</caption>
          <thead className="border-y border-border bg-surface-secondary/40 text-text-secondary"><tr><th scope="col" className="px-5 py-2 text-left font-normal">{ui.product}</th><th scope="col" className="px-3 font-normal">{ui.trend}{period}{ui.d2}</th><th scope="col" className="px-3 font-normal">{ui.netFlows}</th><th scope="col" className="px-3 font-normal">{ui.openingTVL}</th><th scope="col" className="px-3 font-normal">{ui.depositors}</th><th scope="col" className="px-5 font-normal">{ui.rankChange}</th></tr></thead>
          <tbody>{products.map((p, index) => <tr key={p.id} className="border-b border-border last:border-0"><th scope="row" className="px-5 py-3 text-left"><span className="mr-3 font-number text-text-tertiary">{index + 1}</span>{p.name}<span className="ml-2 font-normal text-text-secondary">{p.chain}</span></th><td className="px-3"><div className="flex justify-end"><Sparkline values={p.series} negative={p.net < 0} /></div></td><td className={"px-3 font-number " + (p.net >= 0 ? positive : negative)}>{money(p.net, true)}</td><td className="px-3 font-number">{percent(p.rate, true)}</td><td className="px-3 font-number">{number(p.depositors)}</td><td className="px-5 font-number text-text-secondary">{p.rankChange > 0 ? "↑ " + p.rankChange : p.rankChange < 0 ? "↓ " + Math.abs(p.rankChange) : "—"}</td></tr>)}</tbody>
        </table>{products.length === 0 && <p className="px-5 py-8 text-center text-sm text-text-secondary">{ui.noProductsHave}{productView === "in" ? "net inflows" : "net outflows"}{ui.inThisExampleWindow}</p>}</div>
        <p className="px-5 py-3 text-[11px] text-text-tertiary">{ui.rankChangeIsAcrossAllProductsVersus}{period}{ui.dPriceNeutralFlowRatesUseEach}</p>
      </Card>}
    </>}

    <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
      <div className="flex flex-wrap items-center gap-4">{!wall && <><AppLink href="https://yearn.fi">{ui.products}</AppLink><AppLink href="https://styfi.yearn.fi">{ui.stYFI}</AppLink><AppLink href="https://dao.govern.fi">{ui.governance}</AppLink><AppLink href="https://treasury.govern.fi">{ui.treasury}</AppLink><AppLink href="https://teams.govern.fi">{ui.teamFinances}</AppLink></>}<span className="text-[11px] text-text-tertiary">{ui.mockHistoryEnds2Nov2026}</span></div>
      <label className="flex items-center gap-2 text-[11px]">{ui.previewScenario}<select aria-label="Preview scenario" className={selectClass} value={scenario} onChange={event => setScenario(event.target.value as Scenario)}><option value="mixed">{ui.mixedSignals}</option><option value="growth">{ui.broadInflows}</option><option value="outflows">{ui.capitalLeaving}</option><option value="partial">{ui.partialCoverage}</option><option value="unavailable">{ui.unavailable}</option></select></label>
    </footer>

    <Modal isOpen={method} onClose={() => setMethod(false)} title={copy.method} className="max-h-[85dvh] max-w-2xl overflow-y-auto"><div className="space-y-5">{copy.definitions.map(([title, text]) => <section key={title}><h3 className="text-sm font-bold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-text-secondary">{text}</p></section>)}</div></Modal>
    <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.title} className="max-h-[85dvh] max-w-2xl overflow-y-auto">
      {detail && <><p className="mb-4 text-sm leading-relaxed text-text-secondary">{detail.note}</p><div className="overflow-x-auto"><table className="w-full text-right text-xs"><caption className="sr-only">{detail.title}{ui.dataTable}</caption><thead><tr className="border-b border-border"><th scope="col" className="py-2 text-left">{ui.dateUTC}</th>{detail.series.map(s => <th scope="col" key={s.label} className="px-2">{s.label}</th>)}</tr></thead><tbody>{detail.dates.map((date, index) => <tr key={date} className="border-b border-border"><th scope="row" className="py-2 text-left font-normal">{fullDate(date)}</th>{detail.series.map(s => <td key={s.label} className="px-2 font-number">{s.values[index] === null ? "No observation" : detail.format(s.values[index]! - (s.floor?.[index] ?? 0))}</td>)}</tr>)}</tbody></table></div></>}
    </Modal>
  </div>;
}
