"use client";
import { createContext, useContext, useId, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {SourceDetails} from "./SourceDetails";
import { useLivePulse } from "@/lib/hooks/useLivePulse";
import {MARKET_METRIC_IDS,marketMetrics} from "@/lib/clients/pulse/market-history";
import {flexMetrics} from "@/lib/clients/pulse/flex";
import { CHAIN_NAMES, type LiveMetric,type PulseFeed } from "@/lib/clients/pulse/feed";
import { accountTrend, lockerPegValue, capitalChains, globalCapitalTrend, coveredDays, dayAt, metricStatus, metricTrend, productActivity, windowDays, xTrend, tvlTrend } from "@/lib/clients/pulse/live";
import type { XTab } from "@/lib/clients/pulse/x";
import type { Period } from "@/lib/clients/pulse/types";
import { TrendChart, type TrendSeries } from "./TrendChart";
import { MetricTabs } from "./MetricTabs";
import { liveCopy as c } from "./messages";
import styles from "./pulse.module.css";

const BLUE = "#3478f6", PURPLE = "#9a78e8", ORANGE = "#cc7451";
const COLORS = [BLUE, PURPLE, "#42a68c", ORANGE, "#c8a444", "#7489a3", "#cb79a8"];
const numeric = (v: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2, notation: Math.abs(v) >= 10000 ? "compact" : "standard" }).format(v);
const percent = (v: number) => numeric(v) + "%";
const usd = (v: number) => "$" + numeric(v);
const eth = (v:number) => new Intl.NumberFormat("en",{maximumFractionDigits:4}).format(v)+" ETH";
const PlotHeight = createContext(140);
type Chart = { axisLabel?:string;rightAxis?:{label:string;format:(value:number)=>string};integerAxis?:boolean; domain?:[number,number]; dates: string[]; series: TrendSeries[]; format?: (value: number) => string; zero?: boolean; reference?: { value: number; label: string }; markers?: {date: string; label: string}[]; provisional?: boolean[] };
export function Plot({ title, dates, series, format = numeric, zero, reference, markers, domain, integerAxis, axisLabel, rightAxis }: Chart & { title: string }) {
  const height = useContext(PlotHeight);
  const any = series.some(s => s.values.some(v => v !== null));
  return <div className={styles.plot}>
    {any ? <TrendChart label={title} dates={dates} series={series} format={format} zero={zero} reference={reference} markers={markers} height={height} domain={domain} integerAxis={integerAxis} axisLabel={axisLabel} rightAxis={rightAxis} groupBars detailsHint={c.chartHint} /> : <div style={{height}} className="flex items-center justify-center text-center text-sm text-text-secondary">{c.noData}</div>}
    <div className={styles.legend}>{series.filter(s=>!s.tooltipOnly).map(s => <span key={s.label} className="inline-flex items-center gap-1.5 text-text-secondary"><span className="h-0.5 w-3" style={{ background: s.color }} />{s.label}</span>)}</div>

  </div>;
}
export function Tile({ title, status = c.partial, children, note, href, hrefLabel = c.methodLink, details, detailsId,notice,embedded=false }: { title: string; status?: string; children: React.ReactNode; note: string; href?: string; hrefLabel?: string; details?:React.ReactNode; detailsId?:string;notice?:string;embedded?:boolean }) {
  const explanation=<><p>{note}</p>{details}{href&&<p><a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{hrefLabel} ↗</a></p>}</>;
  if(embedded)return <div><p className="mb-2 text-xs text-text-secondary" data-testid="pulse-embedded-status">{status}</p>{children}<div className="mt-4 space-y-3 text-sm text-text-secondary">{explanation}</div></div>;
  return <Card className={styles.tile} data-testid="pulse-live-card">
    <div className={styles.tileTop}><h2 className="text-sm font-bold">{title}</h2><span className="text-[10px] text-text-secondary">{status}</span></div>
    {children}
    <SourceDetails title={title} testId={detailsId} notice={notice}>{explanation}</SourceDetails>
  </Card>;
}
function stackSeries(series:TrendSeries[]):TrendSeries[] {
  return series.map((s,i)=>({...s,kind:"area",values:s.values.map((v,d)=>v===null||series.some(p=>p.values[d]===null)?null:series.slice(0,i+1).reduce((n,p)=>n+p.values[d]!,0)),floor:s.values.map((v,d)=>v===null||series.some(p=>p.values[d]===null)?null:series.slice(0,i).reduce((n,p)=>n+p.values[d]!,0))}));
}

function statusLabel(status: string) {
  return status === "available" ? c.fresh : status === "estimated" ? c.estimated : status === "stale" ? c.staleMetric : status === "unavailable" ? c.pending : c.partial;
}
function MiniTrend({ values, label }: { values: (number | null)[]; label: string }) {
  const finite = values.filter((v): v is number => v !== null);
  const low = Math.min(0, ...finite), high = Math.max(0, ...finite), span = high - low || 1;
  const x = (i: number) => 2 + i / Math.max(1, values.length - 1) * 94;
  const y = (v: number) => 25 - (v - low) / span * 22;
  const path = values.map((v, i) => v === null ? "" : (i > 0 && values[i - 1] !== null ? "L" : "M") + x(i) + "," + y(v)).join(" ");
  return <svg role="img" aria-label={label} viewBox="0 0 98 28" className="h-7 w-20">
    <line x1="2" x2="96" y1={y(0)} y2={y(0)} stroke="currentColor" className="text-border" />
    <path d={path} fill="none" stroke={BLUE} strokeWidth="1.5" />
    {values.map((v, i) => v !== null && (values[i - 1] == null && values[i + 1] == null) ? <circle key={i} cx={x(i)} cy={y(v)} r="2" fill={BLUE} /> : null)}
  </svg>;
}

export function MetricCard({ feed, period, title, options, note, href, scopeLabel,embedded=false,metricSource,methodDetails }: { feed: PulseFeed; period: Period; title: string; options: { value: string; label: string; ids: string[]; format?: (v: number) => string; divisor?: number; headlineId?: string; stacked?:boolean; labels?:string[]; connectGaps?:boolean;href?:string;closed?:boolean;axisLabel?:string;rightAxis?:{index:number;label:string;format:(value:number)=>string};headlineLabel?:string }[]; note: string; href: string; scopeLabel?:string;embedded?:boolean;metricSource?:LiveMetric[];methodDetails?:React.ReactNode }) {
  const instance=useId();
  const tabsId="live-"+title.replaceAll(" ","-")+instance;
  const [tab, setTab] = useState(options[0].value);
  const option = options.find(o => o.value === tab) ?? options[0];
  const source={generatedAt:feed.generatedAt,metrics:metricSource??feed.metrics};
  const trends = option.ids.map(id => metricTrend(source, period, id,option.closed));
  const format = option.format ?? numeric;
  const series:TrendSeries[] = trends.map((t, i) => ({ axis:option.rightAxis?.index===i?"right":"left",format:option.rightAxis?.index===i?option.rightAxis.format:format,label: option.labels?.[i] ?? t.metric?.label ?? option.label, color: COLORS[i % COLORS.length], connectGaps:option.connectGaps,values: t.values.map(v => v === null ? null : v / (option.divisor ?? 1)) }));
  const headline = option.headlineId ? metricTrend(source, period, option.headlineId,option.closed) : trends[0];
  const latest = headline?.metric?.latest;
  const secondaryValue=option.rightAxis?trends[option.rightAxis.index]?.values.findLast(v=>v!==null):undefined;
  const selectedValues = (headline?.values ?? []).map(v => v === null ? null : v / (option.divisor ?? 1)).filter((v): v is number => v !== null) ?? [];
  const sourceStatus = metricStatus([...trends.map(t => t.metric), headline?.metric]);
  const status = scopeLabel && sourceStatus !== "stale" && sourceStatus !== "unavailable" ? scopeLabel : statusLabel(sourceStatus);
  const observed = trends[0]?.values.filter((v,i) => v !== null && (!option.stacked || trends.every(t=>t.values[i]!==null))).length ?? 0;
  return <Tile title={title} status={status} note={note} href={option.href??href} embedded={embedded} details={<>{methodDetails}{trends.map(t => t.metric && <p key={t.metric.id}>{t.metric.label}: {t.metric.basis}{t.metric.reason ? " · " + t.metric.reason : ""}</p>)}</>}>
    <div className="mt-2"><MetricTabs id={tabsId} label={title} value={option.value} options={options} onChange={setTab} /></div>
    <div id={tabsId+"-panel"} role="tabpanel" aria-labelledby={tabsId+"-"+option.value}>
      <div className={styles.metric}>{option.headlineLabel&&<span className="w-full text-[10px] text-text-secondary">{option.headlineLabel}</span>}<strong className="font-number text-2xl">{selectedValues.length ? format(selectedValues.at(-1)!) : "—"}</strong>{option.rightAxis&&<strong className="font-number text-base">{secondaryValue===undefined||secondaryValue===null?"—":option.rightAxis.format(secondaryValue)}</strong>}<span className="text-[10px] text-text-secondary">{latest ? dayAt(latest.observedAt) + " · " + (option.divisor ? "%" : trends[0]?.metric?.unit ?? "") : c.pending} · {observed}/{period} {c.observedDays}</span></div>
      <Plot title={title + ": " + option.label} dates={trends[0]?.dates ?? []} series={option.stacked ? stackSeries(series) : series} format={format} integerAxis={trends[0]?.metric?.unit==="accounts"} axisLabel={option.axisLabel} rightAxis={option.rightAxis} zero />
    </div>
  </Tile>;
}
export function TvlCard({ feed, period }: { feed: PulseFeed; period: Period }) {
  const data = feed.tvlHistory;
  const trend = tvlTrend(feed, period);
  const latest = data?.latest;
  const observed = trend.values.filter(v => v !== null).length;
  const status = !data || data.status === "unavailable" ? c.pending : data.status === "stale" ? c.staleMetric : c.tvlEstimated;
  const breakdown = trend.chains.some(chain => chain.values.some(v=>v!==null));
  const chainSeries = stackSeries(trend.chains.map((chain,i)=>({label:chain.name,color:COLORS[i % COLORS.length],values:chain.values})));
  const series:TrendSeries[] = [...(breakdown ? chainSeries : []),{label:c.total,color:"#6b7280",values:trend.values,dash:breakdown}];
  return <Tile title={c.tvl} status={status} note={c.tvlDataNote} href="https://defillama.com/protocol/yearn-finance" hrefLabel={c.tvlSource} notice={trend.annotations.length?c.tvlMethod+" · "+c.tvlMethodNote:undefined}
    details={<>{data && <><p>{data.source.label}. {data.source.scope}.</p>{trend.annotations.length>0&&<><p><a href="https://github.com/DefiLlama/DefiLlama-Adapters/commit/23854d551c781d936c4f3afcb730949a3e22ba72" target="_blank" rel="noreferrer" className="underline">15 Oct: overlap deductions</a> · <a href="https://github.com/DefiLlama/DefiLlama-Adapters/commit/7720cad1d37278a7acae2212bc977414b29a1df0" target="_blank" rel="noreferrer" className="underline">16 Oct: strategy coverage</a></p></>}<p>{data.source.chains.map(chain => chain.name).join(" · ")}</p>{data.annotations.map(a => <p key={a.at}>{dayAt(a.at)}: {a.detail}</p>)}<p>{data.coverage.observedClosedDays}/{data.coverage.requestedClosedDays} {c.observedDays}.</p></>}<p>{breakdown ? c.chainBreakdownNote : c.chainBreakdownMissing}</p></>}>
    <div className={styles.metric}><strong className="font-number text-2xl">{latest ? usd(Number(latest.value)) : "—"}</strong><span className="text-[10px] text-text-secondary">{latest ? dayAt(latest.observedAt) + " · " + (latest.provisional ? c.tvlProvisional : c.tvlDaily) : c.pending} · {observed}/{period} {c.observedDays}</span></div>
    <Plot title={c.tvl} dates={trend.dates} series={series} format={usd} zero markers={trend.annotations.map(a => ({date:dayAt(a.at),label:a.label}))} />
    {!latest && <p className="mt-2 text-xs text-text-secondary">{c.tvlUnavailable}</p>}
  </Tile>;
}

function Lockers({ feed, period }: { feed: PulseFeed; period: Period }) {
  const [tab, setTab] = useState("rewards");
  const data = feed.yLockers;
  const start = windowDays(feed.generatedAt, period)[0];
  const rewards = (data?.rewards.history ?? []).filter(r => !r.provisional && r.end >= start && r.end <= feed.generatedAt);
  const dates = tab === "rewards" ? [...new Set(rewards.map(r => dayAt(r.end)))].sort() : windowDays(feed.generatedAt, period).map(dayAt);
  const series: TrendSeries[] = (["ycrv", "yyb"] as const).map((id, i) => ({
    label: id === "ycrv" ? "yCRV" : "yYB", color: i ? PURPLE : BLUE, kind: tab === "rewards" ? "bar" : "line",
    values: dates.map(date => {
      if (tab === "rewards") { const r = rewards.find(r => r.product === id && dayAt(r.end) === date); return r ? Number(r.assetsRaw) / 1e18 : null; }
      return lockerPegValue(feed, id, date);
    }),
  }));
  const current = (data?.rewards.history ?? []).filter(r => r.provisional && r.start <= feed.generatedAt && r.end > feed.generatedAt);
  return <Tile title={c.ylockers} status={!data || !series.some(s=>s.values.some(v=>v!==null)) ? c.pending : data.status === "stale" ? c.staleMetric : c.observed} note={tab === "rewards" ? c.rewardsNote : c.pegNote} href="https://ybs.wavey.info/" details={<><p>{c.lockerHistoryNote}</p><p>{c.lockerFlowsNote}</p></>}>
    <div className="mt-2"><MetricTabs id="live-lockers" label={c.ylockers} value={tab} options={[{ value: "rewards", label: c.rewards }, { value: "peg", label: c.peg }]} onChange={setTab} /></div>
    <div id="live-lockers-panel" role="tabpanel" aria-labelledby={"live-lockers-" + tab}>
      <div className={styles.metric}><span className="text-xs text-text-secondary">{tab === "rewards" ? c.currentWeek + ": " + (current.length ? current.map(r => (r.product === "ycrv" ? "yCRV " : "yYB ") + numeric(Number(r.assetsRaw) / 1e18) + " crvUSD").join(" · ") : "—") : tab === "peg" ? "yCRV / CRV · yYB / YB" : c.pending}</span></div>
      {<Plot title={c.ylockers + ": " + tab} dates={dates} series={series} format={tab === "peg" ? percent : numeric} reference={tab === "peg" ? { value: 100, label: c.parity } : undefined} zero={tab === "rewards"} />}
    </div>
  </Tile>;
}
export function XAudience({ feed, period }: { feed: PulseFeed; period: Period }) {
  const data = feed.x;
  const trend = xTrend(feed, period);
  const last = trend.latest;
  const [tab, setTab] = useState<XTab>(() => last?.intervalStart === null && last.followers !== null ? "followers" : "impressions");
  const options = [{ value: "impressions", label: c.xImpressions }, { value: "linkClicks", label: c.xClicks }, { value: "followers", label: c.xFollowers }];
  const label = options.find(o => o.value === tab)!.label;
  const status = !data ? c.pending : data.status === "disabled" ? c.xDisabled : data.status === "stale" ? c.xStale : data.status === "unavailable" ? c.pending : c.partial;
  const reason = !data ? c.xNoHistory : data.reason === "x_observation_stale" ? c.xStaleNote : data.reason === "x_credentials_missing" ? c.xMissing : data.status === "disabled" ? c.xDisabled : data.reason === "x_budget_limit" ? c.xBudget : data.reason === "x_no_observations" ? c.xNoHistory : data.reason ? c.xFailure : !last ? c.noData : last.intervalStart === null && tab !== "followers" ? (data.history.length === 1 ? c.xBaseline : c.xGap) : null;
  const series: TrendSeries[] = [{ label, color: BLUE, values: trend[tab], kind: tab === "followers" ? "line" : "bar" }];
  if (tab !== "followers") series.push({ label: tab === "linkClicks" ? c.xClickAverage : c.xAverage, color: PURPLE, values: tab === "impressions" ? trend.impressionAverage : trend.clickAverage, dash: true });
  const headline = last?.[tab] ?? null;
  return <Tile title={c.x} status={status} note={tab === "followers" ? c.xFollowNote : c.xNote} href="https://x.com/yearnfi" hrefLabel={c.xProfile} detailsId="pulse-x-details" details={<>
        <p className="font-semibold">{c.xTypical}</p>
        {last?.medianSevenDayImpressions !== null && last?.medianSevenDayImpressions !== undefined ? <dl className="space-y-1">
          <div className="flex flex-wrap justify-between gap-2"><dt>{c.xMedian}</dt><dd className="font-number">{numeric(last.medianSevenDayImpressions)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>{c.xClickRate}</dt><dd className="font-number">{last.clicksPerThousandImpressions === null ? "—" : numeric(last.clicksPerThousandImpressions)}</dd></div>
        </dl> : <p>{c.xPerformancePending}</p>}
        <p className="text-text-secondary">{last?.performancePosts ?? 0} {c.xPerformanceSamples} · {last?.performanceLinkPosts ?? 0} {c.xPerformanceLinkSamples}. {c.xPerformanceNote}</p>
        {last && <>
          <p>{c.xCoverage}: {new Date(last.observedAt * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC.</p>
          {tab === "followers" && <p>{c.xNetFollowers}: {last.netFollowers === null ? "—" : (last.netFollowers > 0 ? "+" : "") + numeric(last.netFollowers)}</p>}
          <p>{last.trackedPosts} {c.xTracked} · {last.measuredPosts} {c.xMeasured} · {last.measuredLinkPosts} {c.xLinkMeasured}.</p>
          <p>{last.baselinedPosts} {c.xBaselineCount} · {last.missingPosts} {c.xMissingPosts} · {last.counterCorrections} {c.xCorrections}.</p>
          {last.truncated && <p>{c.xTruncated}</p>}
        </>}
        <p className="text-text-secondary">{c.xClickSubset}</p><p className="text-text-secondary">{c.xClickAvailability}</p>
        <p className="text-text-secondary">{c.xSnapshotNote}</p>
      </>}>
    <div className="mt-2"><MetricTabs id="live-x" label={c.x} value={tab} options={options} onChange={value => setTab(value as XTab)} /></div>
    <div id="live-x-panel" role="tabpanel" aria-labelledby={"live-x-" + tab}>
      <div className={styles.metric}><strong className="font-number text-2xl" data-testid="pulse-x-headline">{headline === null ? "—" : numeric(headline)}</strong><span className="text-[10px] text-text-secondary">{last ? dayAt(last.observedAt) + " · " + (tab === "followers" ? c.xFollowerCount : c.xInterval) : c.pending}</span></div>
      {tab === "linkClicks" && last && <div className="mb-2 space-y-1 text-xs text-text-secondary" data-testid="pulse-x-click-coverage">
        <p>{last.intervalStart === null ? c.xClickBaseline : <><span className="font-number">{last.measuredLinkPosts}</span> {c.xClickContributors}</>}</p>
      </div>}
      <Plot title={c.x + ": " + label} dates={trend.dates} series={series} zero={tab !== "followers"} integerAxis />
      {reason && <p className="mt-2 text-xs text-text-secondary" role="status">{reason}</p>}

    </div>
  </Tile>;
}

function GlobalFlows({feed,period}:{feed:PulseFeed;period:Period}) {
  const [tab,setTab]=useState("usd");
  const data=feed.globalCapital;
  const trend=globalCapitalTrend(feed,period);
  const usdValues=trend.net.filter((v):v is number=>v!==null);
  const headline=tab==="usd" ? usdValues.length ? usd(usdValues.reduce((n,v)=>n+v,0)) : "—" : trend.periodBalance === null ? "—" : percent(trend.periodBalance);
  const status=!data||!trend.observed?c.pending:data.status==="stale"?c.staleMetric:trend.partial?c.pricedSubtotal:c.estimated;
  const unpriced=[...new Map(trend.rows.flatMap(p=>p?.priceCoverage.unpricedAssets??[]).map(a=>[a.chainId+":"+a.address,a])).values()];
  return <Tile title={c.flows} status={status} note={c.flowsNote} details={<>
    <p>{c.deposits}: {usdValues.length?usd(trend.depositsUsd):"—"} · {c.withdrawals}: {usdValues.length?usd(trend.withdrawalsUsd):"—"}.</p><p>{c.flowBalanceNote}</p><p>{c.runningNote}</p><p>{data?.source.valuation??c.valuationPending}</p>
    <p>{trend.pricedActions}/{trend.actions} {c.pricedActions}. {c.priceCoverageNote}</p>
    <p>{trend.unresolved} {c.unresolvedEvents}. {c.coverageNote}</p>
    {unpriced.length>0&&<div><p>{unpriced.length} {c.unpricedAssets}</p><ul className="mt-1 max-h-40 overflow-auto">{unpriced.map(a=><li key={a.chainId+":"+a.address}>{CHAIN_NAMES[a.chainId]} · {a.symbol}: {a.reason}</li>)}</ul></div>}
  </>}>
    <MetricTabs id="live-flows" label={c.flows} value={tab} options={[{value:"usd",label:"USD"},{value:"balance",label:c.flowBalance}]} onChange={setTab}/>
    <div id="live-flows-panel" role="tabpanel" aria-labelledby={"live-flows-"+tab}>
      <div className={styles.metric}><strong className="font-number text-2xl">{headline}</strong><span className="text-[10px] text-text-secondary">{tab==="usd"?c.periodNet:c.periodBalance} · {trend.observed}/{period} {c.observedDays}</span></div>
      <Plot title={c.flows+": "+(tab==="usd"?"USD":c.flowBalance)} dates={trend.dates} series={[{label:tab==="usd"?c.daily:c.dailyBalance,color:BLUE,values:tab==="usd"?trend.net:trend.balance,kind:"bar"},{label:tab==="usd"?c.runningNet:c.runningBalance,color:PURPLE,values:tab==="usd"?trend.cumulativeNet:trend.runningBalance},{label:c.deposits,color:BLUE,values:trend.deposits,format:usd,tooltipOnly:true},{label:c.withdrawals,color:ORANGE,values:trend.withdrawals,format:usd,tooltipOnly:true}]} format={tab==="usd"?usd:percent} domain={tab==="balance"?[-100,100]:undefined} zero/>
      {trend.partial&&<p className="text-[10px] text-text-secondary">{c.pricedSubtotal} · {trend.pricedActions}/{trend.actions} {c.pricedActions}</p>}
    </div>
  </Tile>;
}
function Movers({feed,period}:{feed:PulseFeed;period:Period}) {
  const [tab,setTab]=useState("activity");
  const activity=productActivity(feed,period);
  const priced=globalCapitalTrend(feed,period);
  const hasUsd=priced.products.length>0;
  const view=tab==="flows"&&hasUsd?"flows":"activity";
  const rows=view==="activity"?activity.products:priced.products;
  const observed=view==="activity"?activity.observedChainDays:priced.observed*6;
  const stale=view==="activity"?feed.reviewedCapital?.sources.chains.some(s=>s.status==="stale"):feed.globalCapital?.status==="stale";
  return <Tile title={c.movers} status={!observed?c.pending:stale?c.staleMetric:view==="flows"?(priced.partial?c.pricedSubtotal:c.estimated):c.reviewed} note={view==="activity"?c.activityNote:c.productsNote}
    details={<><p>{activity.observedChainDays}/{activity.expectedChainDays} {c.chainDays}.</p><p>{c.scope}</p>{view==="flows"&&<p>{c.priceCoverageNote}</p>}</>}>
    <MetricTabs id="live-movers" label={c.movers} value={view} options={[{value:"activity",label:c.activity},...(hasUsd?[{value:"flows",label:c.moverFlows}]:[])]} onChange={setTab}/>
    <div id="live-movers-panel" role="tabpanel" aria-labelledby={"live-movers-"+view}>
      <div className={styles.metric}><span className="text-[10px] text-text-secondary">{c.allCapitalChains} · {period}D</span></div>
      <div className={styles.movers}><table className="w-full text-left text-xs"><caption className="sr-only">{c.movers}</caption><thead><tr><th className="pb-2">{c.product}</th><th className="pb-2 text-right">{view==="flows"?c.netAmount:c.actions}</th><th className="pb-2 pl-2 text-right">{c.movement}</th></tr></thead><tbody>
        {rows.map(p=><tr key={p.id}><td className="max-w-40 truncate py-1" title={p.name}><span className={styles.productIdentity}><span className="truncate">{p.name}</span><span className="text-[10px] text-text-secondary">{CHAIN_NAMES[p.chainId]??p.chainId}</span></span></td><td className="pl-2 text-right font-number">{"net" in p?usd(p.net)+(p.partial?" *":""):numeric(p.actions)}</td><td className="pl-2"><div className="flex justify-end"><MiniTrend values={p.values} label={p.name+": "+(view==="flows"?c.net:c.actions)}/></div></td></tr>)}
      </tbody></table>{!rows.length&&<p className="py-8 text-center text-sm text-text-secondary">{observed?c.noActivity:c.noData}</p>}</div>
    </div>
  </Tile>;
}
export function LivePulsePage() {
  const query = useLivePulse();
  const [period, setPeriod] = useState<Period>(30);
  const [wall, setWall] = useState(false);
  const feed = query.data;
  const hasMarketHistory=(feed?.marketHistory?.history.length??0)>0;
  const publishedDays=feed?.reviewedCapital?.coverage.publishedHistory?.days;
  const publicationNote=publishedDays?c.capitalWindow.replace("{days}",String(publishedDays)):null;
  const windowExceedsPublication=publishedDays!==undefined&&period>publishedDays;
  const accounts=feed?accountTrend(feed,period):null;
  const chains=feed?capitalChains(feed):[];
  return <PlotHeight.Provider value={wall?108:140}><section aria-label="Pulse dashboard" className={styles.page+(wall?" "+styles.wall:"")}><div className={styles.overview}>
    <div className={styles.liveHeader+" flex flex-wrap items-center justify-between gap-3"}>
      <div><h1 className="text-2xl font-bold">{c.title}</h1><p className="mt-1 text-sm text-text-secondary">{c.subtitle}</p></div>
      <div className="flex flex-wrap items-center gap-2"><div role="group" aria-label={c.ranges} className="flex rounded-box bg-surface-secondary p-1">{([7,30,90,365] as const).map(p=><button type="button" key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)} className={"min-h-8 rounded px-3 text-xs "+(period===p?"bg-surface font-bold":"text-text-secondary")}>{p}D</button>)}</div><Button variant="secondary" onClick={()=>setWall(!wall)}>{wall?c.exitWall:c.wall}</Button><Button variant="secondary" onClick={()=>void query.refetch()}>{c.retry}</Button></div>
    </div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary"><span data-testid={windowExceedsPublication?"pulse-capital-horizon":undefined}>{windowExceedsPublication?publicationNote:c.live}</span><span>{feed?c.updated+" "+new Date(feed.generatedAt*1000).toISOString().replace("T"," ").slice(0,19)+" UTC":c.loading}</span></div>
    {(query.stale||query.isError)&&<p role="status" className="mb-3 rounded-box border border-border p-2 text-sm text-text-secondary">{query.stale?c.stale:c.failed}</p>}
    {!feed?<Card><p role="status">{query.isPending?c.loading:c.unavailable}</p></Card>:<>
      <div className="mb-3"><SourceDetails title={c.coverage} label={c.coverage}><p>{c.coverageNote}</p>{publicationNote&&<p>{publicationNote} {c.capitalWindowNote}</p>}<p>{c.rangeCoverage}: {coveredDays(feed,period).length}/{period*chains.length}.</p><p>{c.scope}</p><p>{c.liveHistory}</p>{feed.reviewedCapital?.coverage.gaps.map((gap,i)=><p key={i}>{gap}</p>)}{feed.reviewedCapital?.sources.chains.map(s=><p key={s.chainId}>{CHAIN_NAMES[s.chainId]}: {s.status} · {s.coveredThrough?c.closedDaysThrough+" "+dayAt(s.coveredThrough-1):c.chainPending}</p>)}</SourceDetails></div>
      <div className={styles.grid} data-testid="pulse-main-grid">
        <TvlCard feed={feed} period={period}/>
        <GlobalFlows feed={feed} period={period}/>
        <Tile title={c.accounts} status={!accounts?.completeDays?c.pending:feed.reviewedCapital?.sources.chains.some(s=>s.status==="stale")?c.staleMetric:c.reviewed} note={c.accountsNote}
          details={<><p>{accounts?.chainDays}/{accounts?.expected} {c.chainDays}.</p><p>{c.scope}</p></>}>
          <div className={styles.metric}><span className="text-xs text-text-secondary">{c.chainQualified} · {accounts?.completeDays}/{period} {c.observedDays}</span></div>
          {accounts&&<Plot title={c.accounts} dates={accounts.dates} series={[{label:c.depositing,color:BLUE,values:accounts.deposits},{label:c.withdrawing,color:ORANGE,values:accounts.withdrawals}]} format={v=>numeric(Math.round(v))} integerAxis zero/>}
        </Tile>
        <Lockers feed={feed} period={period}/>
        <MetricCard feed={feed} period={period} title="Flex" metricSource={flexMetrics(feed.flex)} note={c.flexSeparate} href="https://flexmeow.com/info"
          methodDetails={<><p>{feed.flex?.scope}</p>{feed.flex?.limitations.map((limit,i)=><p key={i}>{limit}</p>)}{feed.flex?.participation.activeTroves!==null&&feed.flex?.participation.activeTroves!==undefined&&<p>{feed.flex.participation.activeTroves} {c.flexTroves} · {feed.flex.participation.marketCount??"—"} {c.flexMarkets}</p>}</>}
          options={[{value:"capital",label:c.flexCapital,ids:["flex.value_usd","flex.debt_usd","flex.deposits_usd"],labels:[c.flexValue,c.flexDebt,c.flexDeposits],format:usd},
          {value:"accounts",label:c.flexAccounts,ids:["flex.borrower_accounts"]},
          {value:"fees",label:c.flexFees,ids:["flex.claimable_fees_usd"],format:usd}]}/>

        <Movers feed={feed} period={period}/>
        <XAudience feed={feed} period={period}/>
        <MetricCard feed={feed} period={period} title={c.governance} metricSource={[...feed.metrics.filter(m=>!MARKET_METRIC_IDS.some(id=>id===m.id)),...marketMetrics(feed.marketHistory)]} methodDetails={hasMarketHistory&&feed.marketHistory&&<><p>{c.marketNote}</p><p>{c.priceAxesNote}</p>{feed.marketHistory.history.at(-1)&&<p>{c.marketSamples(new Date(feed.marketHistory.history.at(-1)!.yfiQuoteAt*1000).toISOString(),new Date(feed.marketHistory.history.at(-1)!.wethQuoteAt*1000).toISOString())}</p>}</>} note={c.governanceNote} href="https://styfi.yearn.fi" options={[
          {value:"stake",label:c.stake,ids:["yfi.veyfi_migrated","yfi.liquid_lockers_backing","yfi.styfix","yfi.styfi_direct"],labels:["Migrated veYFI","Liquid lockers","stYFIx","Direct stYFI"],headlineId:"yfi.participating",stacked:true},
          {value:"rate",label:c.rate,ids:["yfi.participation_rate_bps"],divisor:100,format:percent},
          {value:"apr",label:c.apr,ids:["yfi.styfix_apr_bps"],divisor:100,format:percent},
          {value:"price",label:c.price,ids:hasMarketHistory?["yfi.market_price_usd","yfi.market_price_eth"]:["yfi.price_usd"],labels:hasMarketHistory?[c.marketUsdLabel,c.marketEthLabel]:[c.chainlinkUsdLabel],format:usd,closed:hasMarketHistory,href:hasMarketHistory?feed.marketHistory?.sourceUrl:undefined,axisLabel:hasMarketHistory?"USD":undefined,rightAxis:hasMarketHistory?{index:1,label:"ETH",format:eth}:undefined},
          ...(feed.metrics.some(m=>m.id==="yfi.turnout_bps"&&m.history.length)?[{value:"votes",label:c.turnout,ids:["yfi.turnout_bps"],divisor:100,format:percent}]:[]),
        ]}/>
        <MetricCard feed={feed} period={period} title={c.treasury} scopeLabel={c.pricedHoldings} note={c.treasuryNote} href="https://treasury.yearn.fi" options={[
          {value:"operating",label:c.operating,ids:["treasury.available_operating_ex_yfi_usd"],format:usd,connectGaps:true},
          {value:"holdings",label:c.holdings,ids:["treasury.priced_ex_yfi_usd"],format:usd,connectGaps:true},
        ]}/>
      </div>
    </>}
    </div>
    {feed&&<div className={styles.grid+" mt-4"} data-testid="pulse-recovery-section"><RecoveryCard feed={feed} period={period}/></div>}
  </section></PlotHeight.Provider>;
}

function RecoveryCard({feed,period}:{feed:PulseFeed;period:Period}) {
 const target=feed.metrics.find(m=>m.id==="recovery.target_gap_weth");
 return <MetricCard feed={feed} period={period} title={c.recovery} note={c.recoveryProgrammeNote} href="https://yeth.yearn.fi"
  methodDetails={<><p>{c.recoveryPaymentsNote}</p><p>{c.recoveryExample}</p><p>{c.issuedGapLabel}: {target?.latest?numeric(Number(target.latest.value))+" WETH · "+dayAt(target.latest.observedAt)+" · "+statusLabel(target.status):c.pending}.</p><p>{c.issuedGapNote}</p></>}
  options={[
   {value:"yeth",label:c.recoverySeries,ids:["yeth.remaining_principal_weth","recovery.principal_settled_weth","recovery.cash_paid_weth"],labels:[c.remainingPrincipal,c.settledPrincipal,c.wethPaid],headlineLabel:c.remainingPrincipal,connectGaps:true},
   {value:"loans",label:c.loans,ids:["loans.resupply_crvusd"],connectGaps:true,href:"https://treasury.yearn.fi"},
  ]}/>;
}
