"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { MetricsSnapshot } from "@/lib/clients/metrics/types";
import { messages, metricsLabels } from "./messages";
import { usd } from "./format";

export function FlowChart({ data }: { data: MetricsSnapshot }) {
  const [mode, setMode] = useState<"net" | "gross">("net");
  const [width, setWidth] = useState(720);
  const chartRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(180, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const max = Math.max(...data.series.flatMap(point => mode === "net" ? [Math.abs(point.net)] : [point.deposits, point.withdrawals]), 1);
  const height = 220, left = 62, right = 12, baseline = 112, amplitude = 80;
  const lastIndex = data.series.length - 1;
  const smallLabels = new Set([0, Math.round(lastIndex / 2), lastIndex]);
  const step = (width - left - right) / data.series.length;
  const bar = Math.min(36, step * 0.58);
  return <Card className="min-w-0 p-5 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold">{messages.flows}</h2><p className="mt-1 text-xs text-text-secondary">{data.period === 1 ? "Four-hour intervals" : "Daily flows"}{metricsLabels.movementPrices}</p></div>
      <div role="group" aria-label="Chart measure" className="flex rounded-box bg-surface-secondary p-1 text-xs">
        {(["net", "gross"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={"min-h-9 rounded px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yearn-blue " + (mode === value ? "bg-surface font-bold shadow-sm" : "text-text-secondary")}>{value === "net" ? "Net flows" : "In / out"}</button>)}
      </div>
    </div>
    <div className="mt-5 flex flex-wrap gap-x-7 gap-y-2 text-xs text-text-secondary">
      <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-yearn-blue" />{metricsLabels.deposits2}<strong className="ml-1 font-number text-text-primary">{usd(data.deposits)}</strong></span>
      <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-slate-400" />{metricsLabels.withdrawals2}<strong className="ml-1 font-number text-text-primary">{usd(data.withdrawals)}</strong></span>
    </div>
    <svg ref={chartRef} role="img" aria-label={(mode === "net" ? "Net flows" : "Deposits and withdrawals") + " for " + data.range + ". Values are available in the data table below."} viewBox={"0 0 " + width + " " + height} className="mt-4 block h-[220px] w-full overflow-visible">
      {[1, 0, -1].map(tick => <g key={tick}>
        <line x1={left} x2={width - right} y1={baseline - tick * amplitude} y2={baseline - tick * amplitude} stroke="currentColor" className={tick === 0 ? "text-border" : "text-border/50"} strokeDasharray={tick === 0 ? undefined : "3 5"} />
        <text x={left - 9} y={baseline - tick * amplitude + 4} textAnchor="end" fontSize="11" fill="currentColor" className="text-text-secondary font-number">{tick === 0 ? "$0" : usd(tick * max)}</text>
      </g>)}
      {data.series.map((point, index) => {
        const x = left + step * (index + 0.5);
        const h = Math.max(1, Math.abs(point.net) / max * amplitude);
        return <g key={point.label}>
          {mode === "net" ? <rect x={x - bar / 2} y={point.net >= 0 ? baseline - h : baseline} width={bar} height={h} rx="3" fill={point.net >= 0 ? "#0657f9" : "#c76a43"}>
            <title>{point.label + ": " + usd(point.net, true)}</title>
          </rect> : <>
            <rect x={x - bar / 2} y={baseline - point.deposits / max * amplitude} width={bar} height={point.deposits / max * amplitude} rx="3" fill="#0657f9"><title>{point.label + " deposits: " + usd(point.deposits)}</title></rect>
            <rect x={x - bar / 2} y={baseline} width={bar} height={point.withdrawals / max * amplitude} rx="3" fill="#94a3b8"><title>{point.label + " withdrawals: " + usd(point.withdrawals)}</title></rect>
          </>}
          {(width < 480 ? smallLabels.has(index) : data.series.length < 10 || index % 5 === 0 || index === lastIndex) && <text x={x} y={height - 5} textAnchor={index === lastIndex ? "end" : "middle"} fontSize="11" fill="currentColor" className="text-text-secondary">{point.label}</text>}
        </g>;
      })}
    </svg>
    <details className="mt-3 border-t border-border pt-3 text-xs text-text-secondary">
      <summary className="w-fit cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-yearn-blue">{metricsLabels.viewChartData}</summary>
      <div className="mt-2 max-h-56 overflow-auto"><table className="w-full text-right font-number">
        <caption className="sr-only">{metricsLabels.capitalFlowsInUSD}{data.range}</caption>
        <thead><tr><th className="py-2 text-left">{metricsLabels.utc}</th><th>{metricsLabels.deposits}</th><th>{metricsLabels.withdrawals}</th><th>{metricsLabels.net}</th></tr></thead>
        <tbody>{data.series.map(point => <tr key={point.label} className="border-t border-border"><th className="py-2 text-left font-normal">{point.label}</th><td>{usd(point.deposits)}</td><td>{usd(point.withdrawals)}</td><td>{usd(point.net, true)}</td></tr>)}</tbody>
      </table></div>
    </details>
  </Card>;
}
