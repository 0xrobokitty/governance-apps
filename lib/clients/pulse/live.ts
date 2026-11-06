import type { Period } from "./types";
import { assetId, type PulseFeed, type CapitalDay } from "./feed";
export const dayAt = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
export function windowDays(now: number, period: Period, closed = false) {
  const end = Math.floor(now / 86400) * 86400 - (closed ? 86400 : 0);
  return Array.from({ length: period }, (_, i) => end - (period - 1 - i) * 86400);
}
export function coveredDays(feed: PulseFeed, period: Period) {
  const dates = windowDays(feed.generatedAt, period, true);
  const bad = new Set(feed.reviewedCapital?.coverage.quarantined ?? []);
  return (feed.reviewedCapital?.enabled ? feed.reviewedCapital.history : []).filter(d => d.day >= dates[0] && d.day <= dates.at(-1)! && !bad.has(d.chainId + ":" + d.day));
}
export function capitalAssets(days: CapitalDay[]) {
  return [...new Map(days.flatMap(d => [...d.totals.assets, ...d.totals.unresolvedAssets]).map(a => [assetId(a), { id: assetId(a), chainId: a.chainId, asset: a.asset }])).values()];
}
export function capitalTrend(feed: PulseFeed, period: Period, selected: string) {
  const days = coveredDays(feed, period);
  const dates = windowDays(feed.generatedAt, period, true);
  const chain = Number(selected.split(":")[0]);
  const selectedDays = days.filter(d => d.chainId === chain);
  const rows = dates.map(t => selectedDays.find(d => d.day === t));
  const read = (d: CapitalDay | undefined, direction: "deposits" | "withdrawals" | "net") => !d ? null : Number(d.totals.assets.find(a => assetId(a) === selected)?.[direction] ?? "0");
  const products = new Map<string, { name: string; netRaw: bigint; decimals: number; actions: number }>();
  for (const d of selectedDays) for (const p of d.products) {
    const a = p.totals.assets.find(a => assetId(a) === selected);
    if (!a) continue;
    const row = products.get(p.address) ?? { name: p.name, netRaw: 0n, decimals: a.asset.decimals, actions: 0 };
    row.netRaw += BigInt(a.depositsRaw) - BigInt(a.withdrawalsRaw);
    row.actions += a.depositActions + a.withdrawalActions;
    products.set(p.address, row);
  }
  const unknown = selectedDays.flatMap(d => d.totals.unresolvedAssets.filter(a => assetId(a) === selected));
  const asset = capitalAssets(days).find(a => a.id === selected);
  const scale = 10 ** (asset?.asset.decimals ?? 18);
  return {
    dates: dates.map(dayAt), net: rows.map(d => read(d, "net")), deposits: rows.map(d => read(d, "deposits")), withdrawals: rows.map(d => read(d, "withdrawals")),
    observed: selectedDays.length,
    gapIn: Number(unknown.reduce((n, a) => n + BigInt(a.depositsRaw), 0n)) / scale,
    gapOut: Number(unknown.reduce((n, a) => n + BigInt(a.withdrawalsRaw), 0n)) / scale,
    unresolved: selectedDays.reduce((n, d) => n + d.totals.unresolvedEvents, 0),
    products: [...products].map(([id, p]) => ({ id, name: p.name, net: Number(p.netRaw) / 10 ** p.decimals, actions: p.actions })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 5),
  };
}
export function accountTrend(feed: PulseFeed, period: Period) {
  const covered = coveredDays(feed, period);
  const dates = windowDays(feed.generatedAt, period, true);
  const rows = dates.map(t => covered.filter(d => d.day === t));
  return {
    dates: dates.map(dayAt),
    deposits: rows.map(ds => ds.length ? ds.reduce((n, d) => n + d.totals.depositingChainAddresses, 0) : null),
    withdrawals: rows.map(ds => ds.length ? ds.reduce((n, d) => n + d.totals.withdrawingChainAddresses, 0) : null),
    chainDays: covered.length, expected: period * (feed.reviewedCapital?.coverage.supportedChains.length ?? 6),
  };
}
export function metricTrend(feed: PulseFeed, period: Period, id: string) {
  const metric = feed.metrics.find(m => m.id === id);
  const days = windowDays(feed.generatedAt, period);
  const points = new Map(metric?.history.map(p => [Math.floor(p.observedAt / 86400) * 86400, Number(p.value)]));
  return { metric, dates: days.map(dayAt), values: days.map(day => points.get(day) ?? null) };
}
