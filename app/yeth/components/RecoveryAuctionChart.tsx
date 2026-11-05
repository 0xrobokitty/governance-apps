"use client";

import { useId, useMemo, useState, type PointerEvent } from "react";
import { buildAuctionTimeline, type AuctionTimelinePoint } from "@/lib/clients/yeth/recovery/auction-timeline";
import type { RecoverySnapshot } from "@/lib/clients/yeth/recovery/types";
import { WAD } from "@/lib/clients/yeth/recovery/model";
import { recoveryAuctionCopy as copy } from "../messages";

// Floor display precision so a last valid offer below 100% never reads as 100%.
const percent = (value: bigint) => (Number(value * 10_000n / WAD) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%";
const date = (at: number) => new Date(at * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC";
const iso = (at: number) => new Date(at * 1000).toISOString();
const duration = (seconds: number) => {
  const value = Math.max(0, Math.floor(Math.abs(seconds)));
  const days = Math.floor(value / 86400), hours = Math.floor(value % 86400 / 3600), minutes = Math.floor(value % 3600 / 60);
  return days ? days + "d " + hours + "h" : hours ? hours + "h " + minutes + "m" : minutes + "m " + value % 60 + "s";
};

export function RecoveryAuctionChart({ snapshot }: { snapshot: RecoverySnapshot }) {
  const data = useMemo(() => buildAuctionTimeline(snapshot), [snapshot]);
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const helpId = useId();
  const basis = data.basis === "personal" ? copy.personalBasis : copy.referenceBasis;
  const defaultPoint = data.current ?? data.last;
  if (!defaultPoint || data.points.length === 0) return <section aria-label={copy.title} className="rounded-box border border-border bg-surface p-5">
    <h2 className="font-bold">{copy.title}</h2>
    <p className="mt-2 text-sm text-text-secondary">{data.status === "empty" ? copy.empty : copy.unavailable}</p>
  </section>;
  const selectedIndex = selectedAt === null
    ? data.points.findIndex(point => point.at === defaultPoint.at)
    : data.points.reduce((best, point, index) => Math.abs(point.at - selectedAt) < Math.abs(data.points[best].at - selectedAt) ? index : best, 0);
  const selected = data.points[selectedIndex];
  const past = data.points.filter(point => point.at <= data.now);
  const future = data.current ? [data.current, ...data.points.filter(point => point.at > data.now)] : [];
  const x = (at: number) => 4 + (at - data.startAt) / Math.max(1, data.endAt - data.startAt) * 592;
  const y = (value: number) => 206 - value / data.maxRecovery * 190;
  const path = (points: AuctionTimelinePoint[]) => points.map((point, index) => index
    ? "H " + x(point.at) + " V " + y(point.recovery)
    : "M " + x(point.at) + " " + y(point.recovery)).join(" ");
  const relative = (at: number) => at === data.now ? copy.now : at > data.now ? copy.inTime(duration(at - data.now)) : copy.ago(duration(data.now - at));
  const description = basis + " · " + percent(selected.recoveryWad) + " · " + date(selected.at) + " · " + relative(selected.at);
  const inspect = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, ((event.clientX - box.left) / box.width * 600 - 4) / 592));
    setSelectedAt(data.startAt + ratio * (data.endAt - data.startAt));
  };
  return <section aria-label={copy.title} data-testid="recovery-auction-chart" className="min-w-0 rounded-box border border-border bg-surface p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="font-bold">{copy.title}</h2><p data-testid="auction-recovery-basis" className="mt-1 text-xs text-text-secondary">{basis}</p></div>
      <div className="sm:text-right"><p className="text-xs text-text-secondary">{data.current ? copy.now : copy.highest}</p><p data-testid="auction-current-rate" className="mt-1 font-number text-2xl font-bold text-tokyo-600 dark:text-tokyo-100">{percent(defaultPoint.recoveryWad)}</p></div>
    </div>
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-secondary">
      <span className="inline-flex items-center gap-2"><span className="w-6 border-t-2 border-tokyo-600 dark:border-tokyo-100" aria-hidden="true" />{copy.elapsed}</span>
      <span className="inline-flex items-center gap-2"><span className="w-6 border-t-2 border-dashed border-tokyo-600 dark:border-tokyo-100" aria-hidden="true" />{copy.scheduled}</span>
    </div>
    <div className="mt-4 grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
      <div className="relative h-52 font-number text-[11px] text-text-secondary" aria-hidden="true">
        {[0, .25, .5, .75, 1].map(fraction => <span key={fraction} className="absolute right-0 -translate-y-1/2" style={{ top: y(data.maxRecovery * fraction) / 220 * 100 + "%" }}>{Math.round(data.maxRecovery * fraction * 100)}%</span>)}
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
        className="h-52 min-w-0 cursor-crosshair rounded outline-none focus-visible:ring-2 focus-visible:ring-tokyo-600" style={{ touchAction: "pan-y" }}>
        <svg viewBox="0 0 600 220" preserveAspectRatio="none" className="h-full w-full overflow-visible text-tokyo-600 dark:text-tokyo-100" aria-hidden="true">
          {[0, .25, .5, .75, 1].map(fraction => <line key={fraction} x1="4" x2="596" y1={y(data.maxRecovery * fraction)} y2={y(data.maxRecovery * fraction)} stroke="currentColor" opacity=".12" vectorEffect="non-scaling-stroke" />)}
          <line data-testid="auction-full-recovery-line" x1="4" x2="596" y1={y(1)} y2={y(1)} stroke="currentColor" strokeDasharray="2 5" opacity=".55" vectorEffect="non-scaling-stroke" />
          <path data-testid="auction-elapsed-line" d={path(past)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {future.length > 1 && <path data-testid="auction-scheduled-line" d={path(future)} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" />}
          {data.current && <line data-testid="auction-now-line" x1={x(data.now)} x2={x(data.now)} y1="10" y2="206" stroke="currentColor" opacity=".4" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
          <line x1={x(selected.at)} x2={x(selected.at)} y1={y(selected.recovery) - 4} y2={y(selected.recovery) + 4} stroke="currentColor" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div /><div className="flex justify-between gap-4 text-[11px] text-text-secondary"><time dateTime={iso(data.startAt)}>{date(data.startAt)}</time><time className="text-right" dateTime={iso(data.endAt)}>{date(data.endAt)}</time></div>
    </div>
    <p id={helpId} className="sr-only">{copy.help}</p>
    <output data-testid="auction-inspection" aria-live="polite" className="mt-4 block min-h-10 rounded bg-surface-secondary px-3 py-2 text-xs leading-relaxed">
      <span className="font-number font-bold">{percent(selected.recoveryWad)}</span>
      <span className="ml-2"><time dateTime={iso(selected.at)}>{date(selected.at)}</time> · {relative(selected.at)}</span>
    </output>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {data.milestones.map(milestone => <div key={milestone.target} data-testid={"auction-milestone-" + milestone.target} className="min-w-0 rounded border border-border p-3">
        <p className="font-number text-lg font-bold">{milestone.target}%</p>
        {milestone.at === null ? <p className="mt-1 text-xs text-text-secondary">{copy.unreachable}</p> : <button type="button" onClick={() => setSelectedAt(milestone.at)} className="mt-1 min-h-10 text-left text-xs leading-relaxed underline decoration-border underline-offset-4 focus-visible:outline-2 focus-visible:outline-tokyo-600">
          <time dateTime={iso(milestone.at)} title={iso(milestone.at)}>{date(milestone.at)}</time>
          <span className="mt-1 block text-text-secondary">{milestone.status === "reached" ? copy.reached : relative(milestone.at)}</span>
        </button>}
      </div>)}
    </div>
    <p className="mt-4 text-xs leading-relaxed text-text-secondary">
      {data.status === "ended" ? copy.ended : <>{copy.ends} <time dateTime={iso(data.endAt)}>{date(data.endAt)}</time> · {relative(data.endAt)}</>}
      {" · "}{copy.highest} <span data-testid="auction-highest-rate" className="font-number">{percent(data.last!.recoveryWad)}</span>
    </p>
    <p className="mt-2 text-xs leading-relaxed text-text-secondary">{copy.constraint}</p>
  </section>;
}
