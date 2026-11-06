"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import type { YLockerHistory, YLockerId, YLockers, Period } from "@/lib/clients/pulse/types";
import { TrendChart, type ChartDetail, type TrendSeries } from "./TrendChart";
import { MetricTabs } from "./MetricTabs";
import { fullDate, percent, number } from "./format";
import { copy, lockers, ui } from "./messages";
import styles from "./pulse.module.css";

const colors: Record<YLockerId, string> = { ycrv: "#3478f6", yyb: "#9a78e8" };
const amount = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const ratio = (value: number) => percent(value, false, 1);
type View = "rewards" | "peg" | "flows";

export function YLockersCard({ data, period, onInspect, compact = false }: { compact?: boolean; data: YLockers; period: Period; onInspect: (detail: ChartDetail) => void }) {
  const [view, setView] = useState<View>("rewards");
  const [visible, setVisible] = useState<YLockerId[]>(["ycrv", "yyb"]);
  const [daily, setDaily] = useState(false);
  const products = data.products.filter(product => visible.includes(product.id));
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
  const title = view === "rewards" ? lockers.rewards : view === "peg" ? lockers.peg : lockers.flows;
  const note = view === "rewards" ? lockers.rewardNote : view === "peg" ? lockers.pegNote : lockers.flowNote;
  const dates = view === "rewards" ? data.rewardDates : data.dates;
  const series = view === "rewards" ? rewardSeries : view === "peg" ? pegSeries : flowSeries;
  const format = view === "rewards" ? amount : view === "peg" ? ratio : (value: number) => percent(Number(value.toFixed(2)), false, 2);
  const value = (product: YLockerHistory) => view === "rewards" ? amount(product.lastReward) : view === "peg" ? ratio(product.days.at(-1)!.peg!) : percent(product.netRate, true);
  const yyb = data.products.find(product => product.id === "yyb")!;
  return <Card className={styles.tile} data-testid="pulse-ylockers">
    <div className={styles.tileTop}><h2 className="text-sm font-bold">{lockers.title}</h2>
      <button type="button" aria-label={"Details: yLockers " + title}
        onClick={() => onInspect({ title: lockers.title + " · " + title, note, dates, series: view === "flows" ? flowDetails : series, format: view === "rewards" ? value => amount(value) + " crvUSD" : format })}
        className="min-h-7 rounded px-1 text-[11px] text-text-tertiary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-yearn-blue">{copy.details} <span aria-hidden="true">↗</span></button>
    </div>
    <div className={styles.lockerMetrics + " " + styles.contextMetric}>{products.map(product => <div key={product.id}>
      <div className="flex items-center gap-1.5 text-[11px] text-text-secondary"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: colors[product.id] }} />{lockers.names[product.id]}</div>
      <span className="font-number text-[24px] leading-tight">{value(product)}</span>
      {view === "rewards" && <span className="ml-2 whitespace-nowrap text-[10px] text-text-secondary" title={lockers.weeklyChange}>{percent(product.rewardChange, true, 1)}</span>}
    </div>)}</div>
    <div className={styles.controls}><MetricTabs id="lockers" label={lockers.measure} value={view} onChange={setView} options={[{ value: "rewards", label: lockers.rewardTab }, { value: "peg", label: lockers.peg }, { value: "flows", label: lockers.flows }]} /></div>
    <div role="tabpanel" id="lockers-panel" aria-labelledby={"lockers-" + view}>
      <div className={styles.lockerCaption + " flex-wrap justify-between gap-x-2"}>
        <span>{view === "rewards" ? lockers.rewardUnits + " · " + fullDate(data.rewardDates.at(-1)!) : view === "peg" ? lockers.pegUnits : lockers.flowUnits + " · " + period + "D"}</span>
        {view === "flows" && <div role="group" aria-label={lockers.flowSmoothing} className="inline-flex gap-2">{[true, false].map(value => <button key={String(value)} type="button" aria-pressed={daily === value} onClick={() => setDaily(value)} className={"min-h-7 rounded px-1 text-[10px] focus-visible:outline-2 focus-visible:outline-yearn-blue " + (daily === value ? "font-bold text-text-primary underline underline-offset-4" : "text-text-secondary")}>{value ? ui.daily : ui.label7DAvg}</button>)}</div>}
      </div>
      <TrendChart key={view} label={view === "rewards" ? lockers.rewardChart : view === "peg" ? lockers.pegChart : lockers.flowChart}
        dates={dates} series={series} format={format} height={compact ? 128 : 168} zero={view !== "peg"} groupBars={view === "rewards"}
        reference={view === "peg" ? { value: 100, label: lockers.parity } : undefined} />
    </div>
    <div className={styles.legend + " text-text-secondary"} role="group" aria-label={lockers.productFilter}>
      {data.products.map(product => <label key={product.id} className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded text-[11px]">
        <input type="checkbox" checked={visible.includes(product.id)} disabled={visible.length === 1 && visible.includes(product.id)}
          onChange={() => setVisible(current => current.includes(product.id) ? current.filter(id => id !== product.id) : [...current, product.id])}
          className="h-3.5 w-3.5 rounded focus-visible:outline-2 focus-visible:outline-yearn-blue" style={{ accentColor: colors[product.id] }} />{lockers.names[product.id]}
      </label>)}
      {view === "rewards" && <span className="ml-auto text-[10px]">{data.rewardDates.length === 1 ? lockers.averagePointHint : lockers.averageHint}</span>}
    </div>
    <div className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>
      {view === "rewards" ? <p title={lockers.currentWeekNote}>{lockers.currentWeek}: {products.map(product => lockers.names[product.id] + " " + amount(product.currentReward)).join(" · ")} crvUSD. {lockers.provisional}</p> : <p>{view === "peg" ? lockers.pegFoot : lockers.flowFoot}</p>}
      {yyb.coverageStart > data.dates[0] && <p className="mt-1" role="status">{lockers.coverage} {fullDate(yyb.coverageStart)}. {lockers.beforeCoverage}</p>}
    </div>
  </Card>;
}
