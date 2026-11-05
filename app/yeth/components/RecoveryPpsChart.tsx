"use client";

import { useId, useState, type PointerEvent } from "react";
import type { RecoveryPpsChartData, RecoveryPpsPoint } from "@/lib/clients/yeth/recovery/chart";
import { recoveryPpsCopy as copy, recoveryProductionCopy as live } from "../messages";

const pps = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const date = (at: number) => new Date(at * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const month = (at: number) => new Date(at * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export function RecoveryPpsChart({ data }: { data: RecoveryPpsChartData }) {
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const helpId = useId();
  const currentIndex = data.history.length - 1;
  const selectedIndex = selectedAt === null ? currentIndex : data.points.reduce((best, point, index) =>
    Math.abs(point.at - selectedAt) < Math.abs(data.points[best].at - selectedAt) ? index : best, 0);
  const selected = data.points[selectedIndex];
  const x = (at: number) => 4 + (at - data.startAt) / Math.max(1, data.endAt - data.startAt) * 592;
  const y = (value: number) => 230 - value / Math.max(.000001, data.maxPps) * 220;
  const path = (points: RecoveryPpsPoint[]) => points.map((p, i) => `${i ? "L" : "M"} ${x(p.at)} ${y(p.pps)}`).join(" ");
  const description = `${selected.kind === "observed" ? copy.observed : copy.projected} · ${date(selected.at)} · ${pps(selected.pps)} ${live.ppsUnits}`;
  const inspect = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, ((event.clientX - box.left) / box.width * 600 - 4) / 592));
    setSelectedAt(data.startAt + ratio * (data.endAt - data.startAt));
  };
  return <section aria-label={copy.title} data-testid="recovery-pps-chart" className="rounded-box border border-border bg-surface p-5">
    <div className="flex flex-wrap justify-between gap-4">
      <div><h2 className="font-bold">{live.historyTitle}</h2><p className="mt-1 text-xs text-text-secondary">{live.ppsUnits}</p></div>
      <div className="max-w-full sm:text-right"><p className="text-xs text-text-secondary">{copy.target}</p><p data-testid="pps-target" className="mt-1 whitespace-nowrap font-number text-base font-bold sm:text-lg">{pps(data.targetPps)}</p></div>
    </div>
    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-secondary">
      <span className="inline-flex items-center gap-2"><span className="w-6 border-t-2 border-tokyo-600 dark:border-tokyo-100" aria-hidden="true" />{copy.observed}</span>
      <span className="inline-flex items-center gap-2"><span className="w-6 border-t-2 border-dashed border-tokyo-600 dark:border-tokyo-100" aria-hidden="true" />{copy.projected}</span>
    </div>
    <div className="mt-5 grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
      <div className="relative h-60 font-number text-[11px] text-text-secondary" aria-hidden="true">
        {[0, .25, .5, .75, 1].map(fraction => <span key={fraction} className="absolute right-0 -translate-y-1/2" style={{ top: `${(230 - fraction * 220) / 240 * 100}%` }}>{(data.maxPps * fraction).toFixed(2)}</span>)}
      </div>
      <div role="slider" tabIndex={0} aria-label={copy.inspect} aria-describedby={helpId}
        aria-valuemin={0} aria-valuemax={data.points.length - 1} aria-valuenow={selectedIndex} aria-valuetext={description}
        onPointerMove={event => { if (event.pointerType !== "touch" || event.buttons) inspect(event); }}
        onPointerDown={inspect} onPointerLeave={event => { if (event.pointerType === "mouse") setSelectedAt(null); }} onBlur={() => setSelectedAt(null)}
        onKeyDown={event => {
          const next = event.key === "Home" ? 0 : event.key === "End" ? data.points.length - 1
            : event.key === "ArrowLeft" || event.key === "ArrowDown" ? Math.max(0, selectedIndex - 1)
            : event.key === "ArrowRight" || event.key === "ArrowUp" ? Math.min(data.points.length - 1, selectedIndex + 1) : null;
          if (next !== null) { event.preventDefault(); setSelectedAt(data.points[next].at); }
          if (event.key === "Escape") setSelectedAt(null);
        }}
        className="h-60 min-w-0 cursor-crosshair rounded outline-none focus-visible:ring-2 focus-visible:ring-tokyo-600"
        style={{ touchAction: "pan-y" }}>
        <svg viewBox="0 0 600 240" preserveAspectRatio="none" className="h-full w-full overflow-visible text-tokyo-600 dark:text-tokyo-100" aria-hidden="true">
          {[0, .25, .5, .75, 1].map(fraction => <line key={fraction} x1="4" x2="596" y1={y(data.maxPps * fraction)} y2={y(data.maxPps * fraction)} stroke="currentColor" opacity=".12" vectorEffect="non-scaling-stroke" />)}
          <line data-testid="pps-target-line" x1="4" x2="596" y1={y(data.targetPps)} y2={y(data.targetPps)} stroke="currentColor" strokeDasharray="2 5" opacity=".55" vectorEffect="non-scaling-stroke" />
          <path data-testid="pps-observed-line" d={path(data.history)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {data.projected.length > 0 && <path data-testid="pps-projection-line" d={path([data.current, ...data.projected])} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" />}
          <line x1={x(selected.at)} x2={x(selected.at)} y1="10" y2="230" stroke="currentColor" opacity=".3" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <line x1={x(selected.at)} x2={x(selected.at)} y1={y(selected.pps) - 4} y2={y(selected.pps) + 4} stroke="currentColor" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div />
      <div className="flex justify-between gap-4 text-[11px] text-text-secondary"><span>{month(data.startAt)}</span><span className="hidden sm:block">{new Date((data.startAt + data.endAt) / 2 * 1000).getUTCFullYear()}</span><span className="text-right">{month(data.endAt)}</span></div>
    </div>
    <p id={helpId} className="sr-only">{copy.help}</p>
    <output data-testid="pps-inspection" aria-live="polite" className="mt-4 block min-h-10 rounded bg-surface-secondary px-3 py-2 text-xs leading-relaxed">
      <span>{selected.kind === "observed" ? copy.observed : copy.projected} · {date(selected.at)}</span>
      <span className="mt-1 block font-number font-bold sm:ml-3 sm:mt-0 sm:inline">{pps(selected.pps)} {copy.shortUnits}</span>
    </output>
    <p className="mt-3 text-xs leading-relaxed text-text-secondary">{data.targetReached ? copy.reached : data.estimatedAt === null ? copy.unavailable : copy.estimate(month(data.estimatedAt))}</p>
  </section>;
}
