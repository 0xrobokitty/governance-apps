"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { getLoanView, getRecoveryView, getTreasuryView, type FinanceHistory, type LoanId, type TreasuryScope } from "@/lib/clients/pulse/finance";
import { TrendChart, type ChartDetail, type TrendSeries } from "./TrendChart";
import { MetricTabs } from "./MetricTabs";
import { money, number, percent } from "./format";
import { copy, finance, ui } from "./messages";
import styles from "./pulse.module.css";

const BLUE = "#3478f6", PURPLE = "#9a78e8";
const eth = (value: number) => number(value, 1);
type Props = { data: FinanceHistory; compact?: boolean; onInspect: (detail: ChartDetail) => void };
function Details({ title, onClick }: { title: string; onClick: () => void }) {
  return <button type="button" aria-label={"Details: " + title} onClick={onClick} className="min-h-7 rounded px-1 text-[11px] text-text-tertiary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-yearn-blue">{copy.details} <span aria-hidden="true">↗</span></button>;
}
function Legend({ series }: { series: TrendSeries[] }) {
  return <div className={styles.legend + " text-text-secondary"}>{series.map(item => <span key={item.label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-3 border-t-2" style={{ borderColor: item.color, borderStyle: item.dash ? "dashed" : "solid" }} />{item.label}</span>)}</div>;
}
function SourceLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="rounded underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-yearn-blue">{label} <span aria-hidden="true">↗</span><span className="sr-only">{ui.newTab}</span></a>;
}

export function RecoveryLoansCard({ data, compact = false, onInspect }: Props) {
  const [view, setView] = useState<"recovery" | "loans">("recovery");
  const [loan, setLoan] = useState<LoanId>("all");
  const recovery = getRecoveryView(data), loans = getLoanView(data, loan);
  const isRecovery = view === "recovery";
  const dates = isRecovery ? recovery.dates : loans.dates;
  const series: TrendSeries[] = [{ label: isRecovery ? finance.gap : finance.principal, color: BLUE, kind: "area", values: isRecovery ? recovery.gap : loans.values }];
  const detailSeries: TrendSeries[] = isRecovery ? [
    ...series,
    { label: finance.target, color: PURPLE, values: recovery.target },
    { label: finance.backing, color: BLUE, values: recovery.backing },
  ] : [...series, { label: finance.principalReturned, color: PURPLE, values: loans.dailyReturned }];
  const note = isRecovery ? finance.recoveryNote + " " + finance.periodFunding + ": " + eth(recovery.funding) + " ETH; " + finance.paid + ": " + eth(recovery.paid) + " ETH; " + finance.targetReleased + ": " + eth(recovery.targetReleased) + " ETH." : finance.loanNote;
  return <Card className={styles.tile} data-testid="pulse-recovery">
    <div className={styles.tileTop}><h2 className="text-sm font-bold">{finance.recoveryTitle}</h2><Details title={finance.recoveryTitle} onClick={() => onInspect({ title: finance.recoveryTitle + " · " + (isRecovery ? finance.yeth : finance.loans), note, dates, series: detailSeries, format: isRecovery ? value => eth(value) + " ETH" : money })} /></div>
    <div className={styles.metric + " " + styles.contextMetric}><span className="font-number text-[28px] leading-tight">{isRecovery ? eth(recovery.value) : money(loans.value)}</span><span className="text-xs text-text-secondary">{isRecovery ? finance.ethUnfunded : finance.owedToYearn}</span></div>
    <div className={styles.controls}><MetricTabs id="recovery" label={finance.recoveryMeasure} value={view} onChange={setView} options={[{ value: "recovery", label: finance.yeth }, { value: "loans", label: finance.loans }]} /></div>
    <div role="tabpanel" id="recovery-panel" aria-labelledby={"recovery-" + view}>
      <div className={styles.lockerCaption + " flex-wrap justify-between gap-x-2"}>
        {isRecovery ? <span>{percent(recovery.funded, false, 1)} {finance.funded}</span> : <>
          <span>{finance.openingDollars}</span>
          <select aria-label={finance.loanFilter} value={loan} onChange={event => setLoan(event.target.value as LoanId)} className="h-7 max-w-full rounded border border-border bg-surface px-1 text-[10px] focus-visible:outline-2 focus-visible:outline-yearn-blue">
            <option value="all">{finance.allLoans}</option><option value="resupply">{finance.resupply}</option><option value="other">{finance.otherLoan}</option>
          </select>
        </>}
      </div>
      <TrendChart key={view + loan} label={isRecovery ? finance.recoveryChart : finance.loanChart} dates={dates} series={series} format={isRecovery ? eth : money} height={compact ? 128 : 168} />
    </div>
    <Legend series={series} />
    <div className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>
      <p>{isRecovery ? finance.periodFunding + " +" + eth(recovery.funding) + " ETH · " + finance.paid + " " + eth(recovery.paid) + " ETH" : finance.principalReturned + " " + money(loans.returned) + " · " + finance.interest + " " + money(loans.interest)}</p>
      <p className="mt-1">{isRecovery ? finance.recoveryFoot : finance.loanFoot} <SourceLink href={isRecovery ? "https://yeth.yearn.fi" : "https://treasury.yearn.fi"} label={isRecovery ? finance.yethDetails : finance.treasuryDetails} /></p>
    </div>
  </Card>;
}

export function TreasuryCard({ data, compact = false, onInspect }: Props) {
  const [scope, setScope] = useState<TreasuryScope>("reserves");
  const [includeYfi, setIncludeYfi] = useState(false);
  const value = getTreasuryView(data, scope, includeYfi);
  const series: TrendSeries[] = [
    { label: ui.marketPrices, color: BLUE, kind: "area", values: value.market },
    { label: ui.fixedOpeningPrices, color: PURPLE, dash: true, values: value.fixed },
  ];
  const note = (scope === "reserves" ? finance.reserveNote : finance.totalNote) + " " + finance.treasuryNote + " " +
    finance.periodReceipts + ": " + money(value.receipts) + "; " + finance.interest + ": " + money(value.interest) + "; " +
    finance.spending + ": " + money(value.spending) + "; " + finance.principalReturned + ": " + money(value.principalReturned) + "; " +
    finance.repricing + ": " + money(value.repricing, true) + ". " + finance.bridgeNote;
  return <Card className={styles.tile} data-testid="pulse-treasury">
    <div className={styles.tileTop}><h2 className="text-sm font-bold">{finance.treasuryTitle}</h2><Details title={finance.treasuryTitle} onClick={() => onInspect({ title: finance.treasuryTitle + " · " + (scope === "reserves" ? finance.reserves : finance.total), note, dates: value.dates, series, format: money })} /></div>
    <div className={styles.metric + " " + styles.contextMetric}><span className="font-number text-[28px] leading-tight">{money(value.value)}</span><span className="text-xs text-text-secondary">{percent(value.change, true, 1)} {finance.over} {data.period}D</span></div>
    <div className={styles.controls}>
      <MetricTabs id="treasury" label={finance.treasuryMeasure} value={scope} onChange={setScope} options={[{ value: "reserves", label: finance.reserves }, { value: "total", label: finance.total }]} />
      {scope === "total" && <label className="inline-flex min-h-8 items-center gap-1.5 text-[10px] text-text-secondary"><input type="checkbox" checked={includeYfi} onChange={event => setIncludeYfi(event.target.checked)} className="h-3.5 w-3.5 accent-yearn-blue" />{finance.includeYfi}</label>}
    </div>
    <div role="tabpanel" id="treasury-panel" aria-labelledby={"treasury-" + scope}>
      <p className={styles.lockerCaption}>{scope === "reserves" ? finance.reserveCaption : includeYfi ? finance.totalWithYfi : finance.totalWithoutYfi}</p>
      <TrendChart label={finance.treasuryChart} dates={value.dates} series={series} format={money} height={compact ? 128 : 168} />
    </div>
    <Legend series={series} />
    <div className={styles.foot + " border-t border-border pt-2 text-text-secondary"}>
      <p>{finance.fixedChange} {percent(value.fixedChange, true, 1)} · {finance.spending} {money(value.spending)} {finance.inWindow}</p>
      <p className="mt-1">{scope === "reserves" ? finance.reserveFoot : finance.totalFoot} <SourceLink href="https://treasury.yearn.fi" label={finance.treasuryDetails} /></p>
    </div>
  </Card>;
}
