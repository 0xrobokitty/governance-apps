"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import type { YLockerHistory, YLockerId, YLockers, Period } from "@/lib/clients/pulse/types";
import { TrendChart, type ChartDetail, type TrendSeries } from "./TrendChart";
import { fullDate, percent, number } from "./format";
import { copy, lockers, ui } from "./messages";
import styles from "./pulse.module.css";

const colors: Record<YLockerId, string> = { ycrv: "#3478f6", yyb: "#9a78e8" };
const amount = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const ratio = (value: number) => percent(value, false, 1);

export function YLockersSection({ data, period, onInspect, compact = false }: { compact?: boolean; data: YLockers; period: Period; onInspect: (detail: ChartDetail) => void }) {
  const chartHeight = compact ? 128 : 154;
  const [selected, setSelected] = useState<"all" | YLockerId>("all");
  const [daily, setDaily] = useState(false);
  const products = data.products.filter(product => selected === "all" || selected === product.id);
  const rewardSeries: TrendSeries[] = products.flatMap(product => [
    { label: lockers.names[product.id], color: colors[product.id], values: product.rewards, kind: "bar" },
    { label: lockers.names[product.id] + " · " + lockers.average, color: colors[product.id], values: product.rewardAverages, dash: true, kind: data.rewardDates.length === 1 ? "points" : "line" },
  ]);
  const pegSeries: TrendSeries[] = products.map(product => ({ label: lockers.names[product.id] + " / " + lockers.underlying[product.id], color: colors[product.id], values: product.days.map(day => day.peg) }));
  const flowSeries: TrendSeries[] = products.map(product => ({ label: lockers.names[product.id], color: colors[product.id], values: product.days.map(day => daily ? day.netRate : day.averageRate) }));
  const flowDetails: TrendSeries[] = products.flatMap((product, index) => [
    { ...flowSeries[index], label: lockers.names[product.id] + " · " + (daily ? ui.daily : ui.label7DAvg) + " %" },
    { label: lockers.names[product.id] + " · " + lockers.dailyTokens, color: colors[product.id], values: product.days.map(day => day.net), format: value => number(value) + " " + lockers.names[product.id] },
  ]);
  const details = (title: string, note: string, dates: string[], series: TrendSeries[], format: (value: number) => string) =>
    <button type="button" aria-label={"Details: yLockers " + title} onClick={() => onInspect({ title: lockers.title + " · " + title, note, dates, series, format })} className="min-h-7 rounded px-1 text-[11px] text-text-tertiary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-yearn-blue">{copy.details} <span aria-hidden="true">↗</span></button>;
  const metrics = (value: (product: YLockerHistory) => string, change?: boolean) => <div className={styles.lockerMetrics}>{products.map(product => <div key={product.id}>
    <div className="flex items-center gap-1.5 text-[11px] text-text-secondary"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: colors[product.id] }} />{lockers.names[product.id]}</div>
    <span className="font-number text-[24px] leading-tight">{value(product)}</span>
    {change && <span className="ml-2 whitespace-nowrap text-[10px] text-text-secondary" title={lockers.weeklyChange}>{percent(product.rewardChange, true, 1)}</span>}
  </div>)}</div>;
  const yyb = data.products.find(product => product.id === "yyb")!;
  return <section aria-labelledby="ylockers-title" className="mt-5" data-testid="pulse-ylockers">
    <div className={styles.lockerHeader}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 id="ylockers-title" className="text-base font-bold">{lockers.title}</h2><p className="text-xs text-text-secondary">{lockers.subtitle}</p></div>
      <div role="group" aria-label={lockers.productFilter} className="inline-flex flex-wrap gap-1 rounded bg-surface-secondary p-0.5">
        {(["all", "ycrv", "yyb"] as const).map(id => <button key={id} type="button" aria-pressed={selected === id} onClick={() => setSelected(id)} className={"min-h-8 rounded px-2.5 text-[11px] focus-visible:outline-2 focus-visible:outline-yearn-blue " + (selected === id ? "bg-surface font-bold shadow-sm" : "text-text-secondary")}>{id === "all" ? lockers.both : lockers.names[id]}</button>)}
      </div>
    </div>
    <div className={styles.grid}>
      <Card className={styles.tile} data-testid="ylockers-rewards">
        <div className={styles.tileTop}><h3 className="text-sm font-bold">{lockers.rewards}</h3>{details(lockers.rewards, lockers.rewardNote, data.rewardDates, rewardSeries, value => amount(value) + " crvUSD")}</div>
        {metrics(product => amount(product.lastReward), true)}
        <p className={styles.lockerCaption}>{lockers.rewardUnits} · {fullDate(data.rewardDates.at(-1)!)}{compact && " · " + lockers.averageHint}</p>
        <TrendChart label={lockers.rewardChart} dates={data.rewardDates} series={rewardSeries} format={amount} height={chartHeight} zero groupBars />
        <div className={styles.foot + " border-t border-border pt-2 text-text-secondary"}><p>{lockers.rewardFoot}</p><p className="mt-1" title={lockers.currentWeekNote}>{lockers.currentWeek}: {products.map(product => lockers.names[product.id] + " " + amount(product.currentReward)).join(" · ")} crvUSD <span className="text-text-tertiary">({lockers.through} {fullDate(data.dates.at(-1)!)})</span></p></div>
      </Card>
      <Card className={styles.tile} data-testid="ylockers-peg">
        <div className={styles.tileTop}><h3 className="text-sm font-bold">{lockers.peg}</h3>{details(lockers.peg, lockers.pegNote, data.dates, pegSeries, ratio)}</div>
        {metrics(product => ratio(product.days.at(-1)!.peg!))}
        <p className={styles.lockerCaption}>{lockers.pegUnits}</p>
        <TrendChart label={lockers.pegChart} dates={data.dates} series={pegSeries} format={ratio} height={chartHeight} reference={{ value: 100, label: lockers.parity }} />
        <p className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>{lockers.pegFoot}</p>
      </Card>
      <Card className={styles.tile} data-testid="ylockers-flows">
        <div className={styles.tileTop}><h3 className="text-sm font-bold">{lockers.flows}</h3>{details(lockers.flows, lockers.flowNote, data.dates, flowDetails, value => percent(value, true, 3))}</div>
        {metrics(product => percent(product.netRate, true))}
        <div className={styles.lockerCaption + " flex flex-wrap items-center justify-between gap-x-2"}><span>{lockers.flowUnits} · {period}D</span><div role="group" aria-label={lockers.flowSmoothing} className="inline-flex gap-2">{[true, false].map(value => <button key={String(value)} type="button" aria-pressed={daily === value} onClick={() => setDaily(value)} className={"min-h-7 rounded px-1 text-[10px] focus-visible:outline-2 focus-visible:outline-yearn-blue " + (daily === value ? "font-bold text-text-primary underline underline-offset-4" : "text-text-secondary")}>{value ? ui.daily : ui.label7DAvg}</button>)}</div></div>
        <TrendChart label={lockers.flowChart} dates={data.dates} series={flowSeries} format={value => percent(Number(value.toFixed(2)), false, 2)} height={chartHeight} zero />
        <p className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>{lockers.flowFoot}</p>
      </Card>
    </div>
    {yyb.coverageStart > data.dates[0] && <p className="mt-2 text-[11px] text-text-secondary" role="status">{lockers.coverage} {fullDate(yyb.coverageStart)}. {lockers.beforeCoverage}</p>}
  </section>;
}
