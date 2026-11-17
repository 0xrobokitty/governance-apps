"use client";
import { useEffect, useId, useRef, useState } from "react";
import { shortDate, fullDate } from "./format";
import {chartScale} from "@/lib/clients/pulse/chart-scale";

export interface TrendSeries {
  label: string; color: string; values: (number | null)[];
  kind?: "line" | "area" | "bar" | "points"; dash?: boolean; axis?: "left" | "right";
  floor?: (number | null)[];
  format?: (value: number) => string; tooltipOnly?: boolean; connectGaps?:boolean;
}
export interface ChartDetail {
  title: string; note: string; dates: string[]; series: TrendSeries[]; format: (value: number) => string;
}
interface Props {
  label: string; dates: string[]; series: TrendSeries[];
  format: (value: number) => string; height?: number; zero?: boolean;
  detailsHint?: string; groupBars?: boolean; reference?: { value: number; label: string };
  markers?: { date: string; label: string }[]; domain?: [number,number]; integerAxis?:boolean;
  axisLabel?:string; rightAxis?:{label:string;format:(value:number)=>string};
}
export function TrendChart({ label, dates, series, format, height = 168, zero = false, groupBars = false, reference, detailsHint, markers = [], domain, integerAxis=false, axisLabel, rightAxis }: Props) {
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
  const axisOf = (s:TrendSeries) => rightAxis && s.axis==="right" ? "right" : "left";
  const axisValues = (axis:"left"|"right") => series.filter(s=>!s.tooltipOnly&&axisOf(s)===axis).flatMap(s=>[...s.values,...(s.floor??[])]).filter((v):v is number=>v!==null&&Number.isFinite(v));
  const values = axisValues("left");
  if (reference) values.push(reference.value);
  const primary=chartScale(values,zero,domain,integerAxis), secondary=chartScale(axisValues("right"),zero);
  const {min,max,ticks}=primary;
  const axisColor=(axis:"left"|"right")=>series.find(s=>!s.tooltipOnly&&axisOf(s)===axis)?.color??"currentColor";
  const seriesFormat=(s:TrendSeries)=>s.format??(axisOf(s)==="right"?rightAxis!.format:format);
  const left = 58, right = width - (rightAxis?76:10), top = rightAxis?22:12, bottom = height - 27;
  const padding = groupBars ? Math.min(16, (right - left) / Math.max(2, dates.length) / 3) : 0;
  const x = (index: number) => dates.length === 1 ? (left + right) / 2 : left + padding + index / (dates.length - 1) * (right - left - padding * 2);
  const y = (value: number,axis:TrendSeries["axis"]="left") => {const scale=rightAxis&&axis==="right"?secondary:primary;return bottom-(value-scale.min)/(scale.max-scale.min)*(bottom-top);};
  const path = (items: (number | null)[],axis:TrendSeries["axis"]) => {
    let connected = false;
    return items.map((value, index) => {
      if (value === null) { connected = false; return ""; }
      const command = connected ? "L" : "M";
      connected = true;
      return command + x(index).toFixed(2) + "," + y(value,axis).toFixed(2);
    }).join(" ");
  };
  const areaPath = (series: TrendSeries) => {
    const segments: number[][] = [];
    let run: number[] = [];
    for (let i=0;i<series.values.length;i++) {
      if (series.values[i] === null || series.floor?.[i] === null) {
        if (run.length) segments.push(run);
        run=[];
      } else run.push(i);
    }
    if (run.length) segments.push(run);
    return segments.map(indices => indices.map((i,j)=>(j?"L":"M")+x(i).toFixed(2)+","+y(series.values[i]!,series.axis).toFixed(2)).join(" ")+
      " "+[...indices].reverse().map(i=>"L"+x(i).toFixed(2)+","+y(series.floor?.[i]??(axisOf(series)==="right"?secondary.min:min),series.axis).toFixed(2)).join(" ")+" Z").join(" ");
  };
  const bars = series.filter(s => s.kind === "bar");
  const barWidth = Math.max(0.3, Math.min(11, (right - left) / dates.length * 0.66 / (groupBars ? Math.max(1, bars.length) : 1)));
  const barGap = Math.min(2, (right - left) / dates.length * 0.12);
  const labels = [...new Set([0, Math.round((dates.length - 1) / 2), dates.length - 1])];
  const barOffset = (s: TrendSeries) => groupBars ? (bars.indexOf(s) - (bars.length - 1) / 2) * (barWidth + barGap) : 0;
  return <div className="relative" data-testid="pulse-chart">
    <svg ref={ref} role="img" tabIndex={0} aria-label={label + (rightAxis?". "+(axisLabel??"Primary")+" uses the left axis; "+rightAxis.label+" uses the right axis.":"") + ". Use left and right arrow keys to inspect dates."} aria-describedby={id}
      viewBox={"0 0 " + width + " " + height} style={{ height }} className="block w-full overflow-visible rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yearn-blue"
      onPointerMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const index = Math.round((event.clientX - bounds.left - left - padding) / (right - left - padding * 2) * (dates.length - 1));
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
        <text x={left - 9} y={y(tick) + 3} textAnchor="end" fill={rightAxis?axisColor("left"):"currentColor"} fontSize="10" className="font-number text-text-secondary">{format(tick)}</text>
      </g>)}
      {rightAxis&&<g data-testid="pulse-right-axis">
        <text x={left-9} y={10} textAnchor="end" fill={axisColor("left")} fontSize="10">{axisLabel}</text>
        <text x={right+9} y={10} textAnchor="start" fill={axisColor("right")} fontSize="10">{rightAxis.label}</text>
        {secondary.ticks.map((tick,i)=><text key={i} x={right+9} y={y(tick,"right")+3} textAnchor="start" fill={axisColor("right")} fontSize="10" className="font-number">{rightAxis.format(tick)}</text>)}
      </g>}
      {min < 0 && max > 0 && <line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-text-tertiary" opacity=".45" />}
      {reference && <g><line x1={left} x2={right} y1={y(reference.value)} y2={y(reference.value)} stroke="currentColor" className="text-text-tertiary" strokeDasharray="4 4" /><text x={right} y={y(reference.value) - 5} textAnchor="end" fontSize="10" fill="currentColor" className="text-text-secondary">{reference.label}</text></g>}
      {markers.map(marker => { const index = dates.indexOf(marker.date); return index < 0 ? null : <g key={marker.date + marker.label}><line x1={x(index)} x2={x(index)} y1={top} y2={bottom} stroke="#cc7451" strokeDasharray="3 3" /><title>{marker.label}</title></g>; })}
      {series.filter(s=>s.connectGaps&&!s.tooltipOnly).map(s=>{
        let prior:number|null=null;
        return <g key={s.label+"-gaps"}>{s.values.map((value,i)=>{
          if(value===null)return null;
          const previous=prior;prior=i;
          return previous!==null&&i>previous+1?<path key={i} data-testid="pulse-gap-connection" d={"M"+x(previous)+","+y(s.values[previous]!,s.axis)+" L"+x(i)+","+y(value,s.axis)} fill="none" stroke={s.color} strokeWidth="1.5" strokeDasharray="3 4" opacity=".6"/>:null;
        })}</g>;
      })}
      {series.filter(s=>!s.tooltipOnly).map((s, index) => <g key={s.label} data-axis={axisOf(s)}>
        {s.kind === "area" && <path data-testid="pulse-area" d={areaPath(s)} fill={s.color} opacity={s.floor ? ".38" : ".09"} />}
        {(s.kind === "bar" || s.kind === "points") ? s.values.map((value, i) => value === null ? null : s.kind === "points"
          ? <circle key={i} cx={x(i)} cy={y(value,s.axis)} r="4" fill={s.color}><title>{fullDate(dates[i]) + ": " + seriesFormat(s)(value)}</title></circle>
          : <rect key={i} x={x(i) + barOffset(s) - barWidth / 2} y={value >= 0 ? y(value,s.axis) : y(0,s.axis)} width={barWidth} height={Math.max(1, Math.abs(y(value,s.axis) - y(0,s.axis)))} rx="1.5" fill={value < 0 ? "#cc7451" : s.color} opacity=".8"><title>{fullDate(dates[i]) + ": " + seriesFormat(s)(value)}</title></rect>)
          : <path d={path(s.values,s.axis)} fill="none" stroke={s.color} strokeWidth={index === 0 ? 2.2 : 1.9} strokeDasharray={s.dash ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />}
      </g>)}
      {series.filter(s=>!s.tooltipOnly).map(s => s.kind !== "bar" && s.kind !== "points" && s.values.map((v, i) => v !== null && ((s.values[i - 1] == null && s.values[i + 1] == null) || (s.connectGaps && (s.values[i - 1] == null || s.values[i + 1] == null))) && <circle data-testid={s.connectGaps?"pulse-observation-point":"pulse-isolated-point"} key={s.label + i} cx={x(i)} cy={y(v,s.axis)} r="3" fill={s.color} />))}
      {labels.map((i, index) => <text key={index} x={x(i)} y={height - 5} textAnchor={labels.length === 1 ? "middle" : index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"} fill="currentColor" fontSize="10" className="text-text-secondary">{shortDate(dates[i])}</text>)}
      {active !== null && <>
        <line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="currentColor" className="text-text-secondary" opacity=".5" strokeDasharray="3 3" />
        {series.filter(s=>!s.tooltipOnly).map(s => s.values[active] !== null && <circle key={s.label} cx={x(active)} cy={y(s.values[active]!,s.axis)} r="3" fill={s.color} stroke="var(--color-surface)" strokeWidth="1.5" />)}
      </>}
    </svg>
    <div id={id} aria-live="polite" className={active === null ? "sr-only" : "pointer-events-none absolute left-16 top-0 z-10 max-w-[calc(100%-4rem)] rounded-box border border-border bg-surface px-3 py-2 text-[11px] shadow-lg"}>
      {active === null ? (detailsHint ?? "Detailed values are available through the chart's Details button.") : <>
        <p className="mb-1 font-bold">{fullDate(dates[active])}</p>
        {series.map(s => <p key={s.label} className="flex justify-between gap-4"><span>{s.label}</span><span className="font-number">{s.values[active] === null ? "No observation" : seriesFormat(s)(s.values[active]! - (s.floor?.[active] ?? 0))}</span></p>)}
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
