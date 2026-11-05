import { recoveryCopy as copy } from "../messages";
type Point = { x: number; y: number; label?: string };
export function RecoveryChart({ points, currentX, label, startLabel = "Start", endLabel = "Last available step", scale = "percent" }: { points: Point[]; currentX?: number; label: string; startLabel?: string; endLabel?: string; scale?: "percent" | "pps" }) {
  const minX = points[0]?.x ?? 0;
  const maxX = points.at(-1)?.x ?? 1;
  const posX = (x: number) => 10 + (x - minX) / Math.max(1, maxX - minX) * 580;
  const values = points.map(point => point.y);
  const low = scale === "pps" ? Math.min(...values, values[0] ?? 0) : 0;
  const high = scale === "pps" ? Math.max(...values, (values[0] ?? 0) + 0.001) : 1;
  const padding = scale === "pps" ? (high - low) * 0.1 : 0;
  const minY = low - padding;
  const maxY = high + padding;
  const posY = (y: number) => 170 - Math.max(0, Math.min(1, (y - minY) / Math.max(0.000001, maxY - minY))) * 150;
  const ticks = scale === "pps" ? [0, 1, 2, 3].map(i => minY + (maxY - minY) * i / 3) : [0.25, 0.5, 0.75, 1];
  const path = points.map((p, i) => `${i ? "L" : "M"} ${posX(p.x)} ${posY(p.y)}`).join(" ");
  return <svg viewBox="0 0 600 195" role="img" aria-label={label} className="w-full overflow-visible [&_text]:text-[20px] sm:[&_text]:text-[11px]">
    <title>{label}</title>
    {ticks.map(y => <g key={y}>
      <line x1="10" x2="590" y1={posY(y)} y2={posY(y)} stroke="currentColor" opacity=".1" />
      <text x="590" y={posY(y) - 5} textAnchor="end" fill="currentColor" opacity=".65" fontSize="11">{scale === "pps" ? y.toFixed(4) : Math.round(y * 100) + "%"}</text>
    </g>)}
    <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    {points.filter(point => point.label).map((point, i) => <circle key={i} cx={posX(point.x)} cy={posY(point.y)} r="6" fill="transparent"><title>{point.label}</title></circle>)}
    {currentX !== undefined && currentX >= minX && currentX <= maxX && <line x1={posX(currentX)} x2={posX(currentX)} y1="12" y2="170" stroke="currentColor" strokeDasharray="4 4" opacity=".65" />}
    <text x="10" y="192" fill="currentColor" opacity=".65" fontSize="11">{startLabel}</text>
    <text x="590" y="192" textAnchor="end" fill="currentColor" opacity=".65" fontSize="11">{endLabel}</text>
  </svg>;
}
export function ChartBoundaryNote() {
  return <p className="text-xs leading-relaxed text-text-secondary">{copy.auction.boundary}</p>;
}
