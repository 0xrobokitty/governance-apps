"use client";
import { useEffect, useId, useRef, useState } from "react";
import { shortDate, fullDate } from "./format";

export interface TrendSeries {
  label: string; color: string; values: (number | null)[];
  kind?: "line" | "area" | "bar" | "points"; dash?: boolean;
  floor?: number[];
}
interface Props {
  label: string; dates: string[]; series: TrendSeries[];
  format: (value: number) => string; height?: number; zero?: boolean;
}
export function TrendChart({ label, dates, series, format, height = 168, zero = false }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(400);
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(180, Math.round(entry.contentRect.width))));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const values = series.flatMap(s => [...s.values, ...(s.floor ?? [])]).filter((v): v is number => v !== null && Number.isFinite(v));
  const low = values.length ? Math.min(...values, zero ? 0 : Infinity) : 0;
  const high = values.length ? Math.max(...values, zero ? 0 : -Infinity) : 1;
  const spread = high - low || Math.max(Math.abs(high) * 0.1, 1);
  const min = zero && low >= 0 ? 0 : low - spread * 0.12;
  const max = high + spread * 0.12;
  const left = 58, right = width - 10, top = 12, bottom = height - 27;
  const x = (index: number) => left + index / Math.max(1, dates.length - 1) * (right - left);
  const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  const path = (items: (number | null)[]) => {
    let connected = false;
    return items.map((value, index) => {
      if (value === null) { connected = false; return ""; }
      const command = connected ? "L" : "M";
      connected = true;
      return command + x(index).toFixed(2) + "," + y(value).toFixed(2);
    }).join(" ");
  };
  const barWidth = Math.max(0.3, Math.min(11, (right - left) / dates.length * 0.66));
  const ticks = [min, (min + max) / 2, max];
  const labels = [0, Math.round((dates.length - 1) / 2), dates.length - 1];
  return <div className="relative" data-testid="pulse-chart">
    <svg ref={ref} role="img" tabIndex={0} aria-label={label + ". Use left and right arrow keys to inspect dates."} aria-describedby={id}
      viewBox={"0 0 " + width + " " + height} style={{ height }} className="block w-full overflow-visible rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yearn-blue"
      onPointerMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const index = Math.round((event.clientX - bounds.left - left) / (right - left) * (dates.length - 1));
        setActive(Math.max(0, Math.min(dates.length - 1, index)));
      }} onPointerLeave={() => setActive(null)} onBlur={() => setActive(null)}
      onKeyDown={event => {
        if (event.key === "Escape") setActive(null);
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setActive(index => Math.max(0, Math.min(dates.length - 1, (index ?? dates.length - 1) + (event.key === "ArrowLeft" ? -1 : 1))));
        }
      }}>
      {ticks.map((tick, index) => <g key={index}>
        <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="currentColor" className="text-border" strokeDasharray="2 5" />
        <text x={left - 9} y={y(tick) + 3} textAnchor="end" fill="currentColor" fontSize="10" className="font-number text-text-secondary">{format(tick)}</text>
      </g>)}
      {min < 0 && max > 0 && <line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-text-tertiary" opacity=".45" />}
      {series.map((s, index) => <g key={s.label}>
        {s.kind === "area" && s.values.every(value => value !== null) && <path d={path(s.values) + " " + [...s.values].reverse().map((_, reverseIndex) => {
          const i = s.values.length - reverseIndex - 1;
          return "L" + x(i).toFixed(2) + "," + y(s.floor?.[i] ?? min).toFixed(2);
        }).join(" ") + " Z"} fill={s.color} opacity={s.floor ? ".32" : ".09"} />}
        {(s.kind === "bar" || s.kind === "points") ? s.values.map((value, i) => value === null ? null : s.kind === "points"
          ? <circle key={i} cx={x(i)} cy={y(value)} r="4" fill={s.color}><title>{fullDate(dates[i]) + ": " + format(value)}</title></circle>
          : <rect key={i} x={x(i) - barWidth / 2} y={value >= 0 ? y(value) : y(0)} width={barWidth} height={Math.max(1, Math.abs(y(value) - y(0)))} rx="1.5" fill={value < 0 ? "#cc7451" : s.color} opacity=".8"><title>{fullDate(dates[i]) + ": " + format(value)}</title></rect>)
          : <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={index === 0 ? 2.2 : 1.9} strokeDasharray={s.dash ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />}
      </g>)}
      {labels.map((i, index) => <text key={index} x={x(i)} y={height - 5} textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"} fill="currentColor" fontSize="10" className="text-text-secondary">{shortDate(dates[i])}</text>)}
      {active !== null && <>
        <line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="currentColor" className="text-text-secondary" opacity=".5" strokeDasharray="3 3" />
        {series.map(s => s.values[active] !== null && <circle key={s.label} cx={x(active)} cy={y(s.values[active]!)} r="3" fill={s.color} stroke="var(--color-surface)" strokeWidth="1.5" />)}
      </>}
    </svg>
    <div id={id} aria-live="polite" className={active === null ? "sr-only" : "pointer-events-none absolute left-16 top-0 z-10 max-w-[calc(100%-4rem)] rounded-box border border-border bg-surface px-3 py-2 text-[11px] shadow-lg"}>
      {active === null ? "Detailed values are available through the chart's Details button." : <>
        <p className="mb-1 font-bold">{fullDate(dates[active])}</p>
        {series.map(s => <p key={s.label} className="flex justify-between gap-4"><span>{s.label}</span><span className="font-number">{s.values[active] === null ? "No observation" : format(s.values[active]! - (s.floor?.[active] ?? 0))}</span></p>)}
      </>}
    </div>
  </div>;
}

export function Sparkline({ values, negative = false }: { values: number[]; negative?: boolean }) {
  const min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1;
  return <svg aria-hidden="true" viewBox="0 0 120 26" className="h-7 w-28" preserveAspectRatio="none">
    <line x1="0" x2="120" y1={24 - (0 - min) / span * 22} y2={24 - (0 - min) / span * 22} stroke="currentColor" className="text-border" />
    <path d={values.map((v, i) => (i ? "L" : "M") + (i / Math.max(1, values.length - 1) * 120).toFixed(1) + "," + (24 - (v - min) / span * 22).toFixed(1)).join(" ")} fill="none" stroke={negative ? "#cc7451" : "#3478f6"} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
  </svg>;
}
