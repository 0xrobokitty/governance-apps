"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useLivePulse } from "@/lib/hooks/useLivePulse";
import { CHAIN_NAMES, type PulseFeed } from "@/lib/clients/pulse/feed";
import { accountTrend, capitalAssets, capitalTrend, coveredDays, dayAt, metricTrend, windowDays, xTrend } from "@/lib/clients/pulse/live";
import type { XTab } from "@/lib/clients/pulse/x";
import type { Period } from "@/lib/clients/pulse/types";
import { TrendChart, type TrendSeries } from "./TrendChart";
import { MetricTabs } from "./MetricTabs";
import { liveCopy as c } from "./messages";
import styles from "./pulse.module.css";

const BLUE = "#3478f6", PURPLE = "#9a78e8", ORANGE = "#cc7451";
const numeric = (v: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2, notation: Math.abs(v) >= 10000 ? "compact" : "standard" }).format(v);
const precise = (v: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 8 }).format(v);
const percent = (v: number) => numeric(v) + "%";
const usd = (v: number) => "$" + numeric(v);
type Chart = { dates: string[]; series: TrendSeries[]; format?: (value: number) => string; zero?: boolean; reference?: { value: number; label: string } };
function Plot({ title, dates, series, format = numeric, zero, reference }: Chart & { title: string }) {
  const any = series.some(s => s.values.some(v => v !== null));
  return <>
    {any ? <TrendChart label={title} dates={dates} series={series} format={format} zero={zero} reference={reference} height={168} groupBars detailsHint={c.chartHint} /> : <div className="flex h-[168px] items-center justify-center text-center text-sm text-text-secondary">{c.noData}</div>}
    <div className={styles.legend}>{series.map(s => <span key={s.label} className="inline-flex items-center gap-1.5 text-text-secondary"><span className="h-0.5 w-3" style={{ background: s.color }} />{s.label}</span>)}</div>
    {any && <details className="mt-2 text-xs"><summary className="cursor-pointer text-text-secondary">{c.values}</summary><div className="mt-2 max-h-48 overflow-auto"><table className="w-full text-left"><caption className="sr-only">{title}</caption><thead><tr><th>{c.date}</th>{series.map(s => <th key={s.label} className="px-2">{s.label}</th>)}</tr></thead><tbody>{dates.map((date, i) => <tr key={date}><td className="whitespace-nowrap py-1">{date}</td>{series.map(s => <td key={s.label} className="px-2 font-number">{s.values[i] === null ? "—" : precise(s.values[i]!)}</td>)}</tr>)}</tbody></table></div></details>}
  </>;
}
function Tile({ title, status = c.partial, children, note, href }: { title: string; status?: string; children: React.ReactNode; note: string; href?: string }) {
  return <Card className={styles.tile} data-testid="pulse-live-card">
    <div className={styles.tileTop}><h2 className="text-sm font-bold">{title}</h2><span className="text-[10px] text-text-secondary">{status}</span></div>
    {children}
    <p className={styles.foot + " text-text-secondary"}>{note}{href && <> <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{c.methodLink} ↗</a></>}</p>
  </Card>;
}
function Pending({ title, note, href }: { title: string; note: string; href?: string }) {
  return <Tile title={title} status={c.pending} note={note} href={href}><div className="flex h-[245px] items-center justify-center text-3xl text-text-tertiary">—</div></Tile>;
}
function MetricCard({ feed, period, title, options, note, href }: { feed: PulseFeed; period: Period; title: string; options: { value: string; label: string; ids: string[]; format?: (v: number) => string; divisor?: number }[]; note: string; href: string }) {
  const [tab, setTab] = useState(options[0].value);
  const option = options.find(o => o.value === tab)!;
  const trends = option.ids.map(id => metricTrend(feed, period, id));
  const format = option.format ?? numeric;
  const series = trends.map((t, i) => ({ label: t.metric?.label ?? option.label, color: i === 0 ? BLUE : PURPLE, values: t.values.map(v => v === null ? null : v / (option.divisor ?? 1)) }));
  const latest = trends[0]?.metric?.latest;
  const selectedValues = series[0]?.values.filter((v): v is number => v !== null) ?? [];
  const status = trends.every(t => !t.metric || t.metric.status === "unavailable") ? c.pending : trends.some(t => t.metric?.status === "stale") ? "Stale" : c.partial;
  return <Tile title={title} status={status} note={note} href={href}>
    <div className="mt-2"><MetricTabs id={"live-" + title.replaceAll(" ", "-")} label={title} value={tab} options={options} onChange={setTab} /></div>
    <div id={"live-" + title.replaceAll(" ", "-") + "-panel"} role="tabpanel" aria-labelledby={"live-" + title.replaceAll(" ", "-") + "-" + tab}>
      <div className={styles.metric}><strong className="font-number text-2xl">{selectedValues.length ? format(selectedValues.at(-1)!) : "—"}</strong><span className="text-[10px] text-text-secondary">{latest ? dayAt(latest.observedAt) + " · " + (option.divisor ? "%" : trends[0]?.metric?.unit ?? "") : c.pending}</span></div>
      <Plot title={title + ": " + option.label} dates={trends[0]?.dates ?? []} series={series} format={format} />
    </div>
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
      const p = data?.peg.history.find(p => dayAt(p.observedAt) === date);
      return p ? Number(p.quoteOutRaw[id]) / Number(data!.peg.quoteInRaw) * 100 : null;
    }),
  }));
  const current = (data?.rewards.history ?? []).filter(r => r.provisional && r.start <= feed.generatedAt && r.end > feed.generatedAt);
  return <Tile title={c.ylockers} status={!data || data.status === "unavailable" ? c.pending : data.status === "stale" ? "Stale" : c.partial} note={tab === "rewards" ? c.rewardsNote : tab === "peg" ? c.pegNote : c.lockerFlowsNote} href="https://ybs.wavey.info/">
    <div className="mt-2"><MetricTabs id="live-lockers" label={c.ylockers} value={tab} options={[{ value: "rewards", label: c.rewards }, { value: "peg", label: c.peg }, { value: "flows", label: c.lockerFlows }]} onChange={setTab} /></div>
    <div id="live-lockers-panel" role="tabpanel" aria-labelledby={"live-lockers-" + tab}>
      <div className={styles.metric}><span className="text-xs text-text-secondary">{tab === "rewards" ? c.currentWeek + ": " + (current.length ? current.map(r => (r.product === "ycrv" ? "yCRV " : "yYB ") + numeric(Number(r.assetsRaw) / 1e18) + " crvUSD").join(" · ") : "—") : tab === "peg" ? "yCRV / CRV · yYB / YB" : c.pending}</span></div>
      {tab === "flows" ? <div className="flex h-[196px] items-center text-center text-sm text-text-secondary">{c.lockerFlowsNote}</div> : <Plot title={c.ylockers + ": " + tab} dates={dates} series={series} format={tab === "peg" ? percent : numeric} reference={tab === "peg" ? { value: 100, label: "Parity" } : undefined} zero={tab === "rewards"} />}
      <p className="mt-1 text-[10px] text-text-secondary">{c.lockerHistoryNote}</p>
    </div>
  </Tile>;
}
export function XAudience({ feed, period }: { feed: PulseFeed; period: Period }) {
  const [tab, setTab] = useState<XTab>("impressions");
  const data = feed.x;
  const trend = xTrend(feed, period);
  const last = trend.latest;
  const options = [{ value: "impressions", label: c.xImpressions }, { value: "linkClicks", label: c.xClicks }, { value: "followers", label: c.xFollowers }];
  const label = options.find(o => o.value === tab)!.label;
  const status = !data ? c.pending : data.status === "disabled" ? c.xDisabled : data.status === "stale" ? c.xStale : data.status === "unavailable" ? c.pending : c.partial;
  const reason = !data ? c.xNoHistory : data.reason === "x_credentials_missing" ? c.xMissing : data.status === "disabled" ? c.xDisabled : data.reason === "x_budget_limit" ? c.xBudget : data.reason === "x_no_observations" ? c.xNoHistory : data.reason ? c.xFailure : !last ? c.noData : last.intervalStart === null && tab !== "followers" ? (data.history.length === 1 ? c.xBaseline : c.xGap) : null;
  const series: TrendSeries[] = [{ label, color: BLUE, values: trend[tab], kind: tab === "followers" ? "line" : "bar" }];
  if (tab !== "followers") series.push({ label: c.xAverage, color: PURPLE, values: tab === "impressions" ? trend.impressionAverage : trend.clickAverage, dash: true });
  const headline = last?.[tab] ?? null;
  return <Tile title={c.x} status={status} note={tab === "followers" ? c.xFollowNote : c.xNote} href="https://x.com/yearnfi">
    <div className="mt-2"><MetricTabs id="live-x" label={c.x} value={tab} options={options} onChange={value => setTab(value as XTab)} /></div>
    <div id="live-x-panel" role="tabpanel" aria-labelledby={"live-x-" + tab}>
      <div className={styles.metric}><strong className="font-number text-2xl" data-testid="pulse-x-headline">{headline === null ? "—" : numeric(headline)}</strong><span className="text-[10px] text-text-secondary">{last ? dayAt(last.observedAt) + " · " + (tab === "followers" ? c.xFollowerCount : c.xInterval) : c.pending}</span></div>
      <Plot title={c.x + ": " + label} dates={trend.dates} series={series} zero={tab !== "followers"} />
      {reason && <p className="mt-2 text-xs text-text-secondary" role="status">{reason}</p>}
      <details className="mt-2 text-xs" data-testid="pulse-x-details"><summary className="cursor-pointer text-text-secondary">{c.xDetails}</summary><div className="mt-3 space-y-3">
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
        <p className="text-text-secondary">{c.xSnapshotNote}</p>
      </div></details>
    </div>
  </Tile>;
}
export function LivePulsePage() {
  const query = useLivePulse();
  const [period, setPeriod] = useState<Period>(30);
  const [asset, setAsset] = useState("");
  const [flowTab, setFlowTab] = useState("flows");
  const [wall, setWall] = useState(false);
  const feed = query.data;
  const assets = feed ? capitalAssets(coveredDays(feed, period)) : [];
  const selected = assets.some(a => a.id === asset) ? asset : (assets.find(a => a.chainId === 1 && a.asset.symbol === "USDC") ?? assets[0])?.id ?? "";
  const definition = assets.find(a => a.id === selected);
  const capital = feed ? capitalTrend(feed, period, selected) : null;
  const accounts = feed ? accountTrend(feed, period) : null;
  const net = capital?.net.reduce<number>((n, v) => n + (v ?? 0), 0);
  const hasCapital = Boolean(capital?.net.some(v => v !== null));
  return <section aria-label="Pulse dashboard" className={styles.page + (wall ? " " + styles.wall : "")}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold">{c.title}</h1><p className="mt-1 text-sm text-text-secondary">{c.subtitle}</p></div>
      <div className="flex flex-wrap items-center gap-2"><div role="group" aria-label={c.ranges} className="flex rounded-box bg-surface-secondary p-1">{([7, 30, 90, 365] as const).map(p => <button type="button" key={p} aria-pressed={period === p} onClick={() => setPeriod(p)} className={"min-h-8 rounded px-3 text-xs " + (period === p ? "bg-surface font-bold" : "text-text-secondary")}>{p}D</button>)}</div><Button variant="secondary" onClick={() => setWall(!wall)}>{wall ? c.exitWall : c.wall}</Button><Button variant="secondary" onClick={() => void query.refetch()}>{c.retry}</Button></div>
    </div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary"><span>{c.live}</span><span>{feed ? c.updated + " " + new Date(feed.generatedAt * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC" : c.loading}</span></div>
    {(query.stale || query.isError) && <p role="status" className="mb-4 rounded-box border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900 dark:bg-orange-950 dark:text-orange-200">{query.stale ? c.stale : c.failed}</p>}
    {!feed ? <Card><p role="status">{query.isPending ? c.loading : c.unavailable}</p></Card> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex max-w-full flex-wrap items-center gap-2 text-xs text-text-secondary">{c.assets}<select className="h-9 max-w-full rounded-box border border-border bg-surface px-2 text-text-primary" value={selected} onChange={e => setAsset(e.target.value)} disabled={!assets.length}>{!assets.length && <option value="">{c.noAssets}</option>}{assets.map(a => <option key={a.id} value={a.id}>{a.asset.symbol} · {CHAIN_NAMES[a.chainId] ?? a.chainId} · {a.asset.address.slice(0, 8)}</option>)}</select></label>
        <details className="max-w-2xl text-xs text-text-secondary"><summary className="cursor-pointer">{c.coverage}</summary><div className="mt-2 space-y-2"><p>{c.coverageNote}</p><p>{c.native}</p><p>{c.scope}</p><p>{c.liveHistory}</p>{feed.reviewedCapital?.sources.chains.map(s => <p key={s.chainId}>{CHAIN_NAMES[s.chainId]}: {s.status} · {s.coveredThrough ? "through " + dayAt(s.coveredThrough - 1) : "no closed days"}</p>)}</div></details>
      </div>
      <div className={styles.grid}>
        <Pending title={c.tvl} note={c.tvlNote} href="https://yearn.fi/v3" />
        <Tile title={c.flows} status={hasCapital ? feed.reviewedCapital?.sources.chains.find(s => s.chainId === definition?.chainId)?.status === "stale" ? "Stale" : c.partial : c.pending} note={c.flowsNote}>
          <div className="mt-2"><MetricTabs id="live-flows" label={c.flows} value={flowTab} options={[{value:"flows",label:c.flowTab},{value:"products",label:c.productsTab}]} onChange={setFlowTab} /></div>
          <div id="live-flows-panel" role="tabpanel" aria-labelledby={"live-flows-" + flowTab}>
            <div className={styles.metric}><strong className="font-number text-2xl">{hasCapital ? numeric(net!) : "—"}</strong><span className="text-xs text-text-secondary">{definition?.asset.symbol} · {capital?.observed ?? 0}/{period} days</span></div>
            {flowTab === "flows" && capital ? <Plot title={c.net} dates={capital.dates} series={[{label:c.net,color:BLUE,values:capital.net,kind:"bar"}]} zero /> : <div className="min-h-[196px]"><table className="w-full text-left text-xs"><caption className="sr-only">{c.productsTab}</caption><thead><tr><th className="pb-2">{c.product}</th><th className="pb-2 text-right">{c.netAmount}</th><th className="pb-2 pl-2 text-right">{c.actions}</th></tr></thead><tbody>{capital?.products.map(p => <tr key={p.id}><td className="max-w-48 truncate py-2" title={p.name}>{p.name}</td><td className="text-right font-number">{numeric(p.net)}</td><td className="pl-2 text-right font-number">{p.actions}</td></tr>)}</tbody></table><p className="mt-3 text-[10px] text-text-secondary">{c.productsNote}</p></div>}
          </div>
          <p className="mt-2 text-[10px] text-text-secondary">Excluded unresolved capital: +{numeric(capital?.gapIn ?? 0)} / −{numeric(capital?.gapOut ?? 0)} {definition?.asset.symbol}. {capital?.unresolved ?? 0} unresolved events on this chain.</p>
        </Tile>
        <Tile title={c.accounts} note={c.accountsNote}>
          <div className={styles.metric}><span className="text-xs text-text-secondary">{accounts?.chainDays}/{accounts?.expected} chain-days observed</span></div>
          {accounts && <Plot title={c.accounts} dates={accounts.dates} series={[{label:c.depositing,color:BLUE,values:accounts.deposits},{label:c.withdrawing,color:ORANGE,values:accounts.withdrawals}]} zero />}
        </Tile>
        <Lockers feed={feed} period={period} />
        <Pending title={c.harvests} note={c.harvestNote} />
        <XAudience feed={feed} period={period} />
        <MetricCard feed={feed} period={period} title={c.governance} note={c.governanceNote} href="https://styfi.yearn.fi" options={[
          {value:"stake",label:c.stake,ids:["yfi.styfi_direct","yfi.styfix"]},
          {value:"rate",label:c.rate,ids:["yfi.staking_rate_bps"],divisor:100,format:percent},
          {value:"apr",label:c.apr,ids:["yfi.styfix_apr_bps"],divisor:100,format:percent},
          {value:"price",label:c.price,ids:["yfi.price_usd"],format:usd},
          {value:"votes",label:c.turnout,ids:["yfi.turnout_bps"],divisor:100,format:percent},
        ]} />
        <MetricCard feed={feed} period={period} title={c.treasury} note={c.treasuryNote} href="https://treasury.yearn.fi" options={[
          {value:"operating",label:c.operating,ids:["treasury.available_operating_ex_yfi_usd"],format:usd},
          {value:"holdings",label:c.holdings,ids:["treasury.priced_ex_yfi_usd"],format:usd},
        ]} />
        <MetricCard feed={feed} period={period} title={c.recovery} note={c.recoveryNote} href="https://yeth.yearn.fi" options={[
          {value:"gap",label:c.gap,ids:["recovery.target_gap_weth"]},{value:"paid",label:c.paid,ids:["recovery.cash_paid_weth"]},
          {value:"principal",label:c.principal,ids:["recovery.principal_settled_weth"]},{value:"loans",label:c.loans,ids:["loans.resupply_crvusd"]},
        ]} />
      </div>
      <footer className="mt-5 text-xs text-text-secondary">{c.liveHistory} {c.native}</footer>
    </>}
  </section>;
}
