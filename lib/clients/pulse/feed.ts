import { z } from "zod";
import { readBoundedJson, withFeedRequest, type FeedTransportPolicy } from "@/lib/feed-transport";

const raw = z.string().regex(/^\d{1,78}$/);
const decimal = z.string().regex(/^-?\d{1,78}(?:\.\d{1,36})?$/).refine(v => Number.isFinite(Number(v)));
const timestamp = z.number().int().nonnegative();
const address = z.string().regex(/^0x[0-9a-f]{40}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const asset = z.object({ address, symbol: z.string().min(1).max(128), decimals: z.number().int().min(0).max(36) });
const amounts = z.object({ chainId: timestamp, asset, depositsRaw: raw, withdrawalsRaw: raw, deposits: decimal, withdrawals: decimal });
const counted = amounts.extend({ net: decimal, depositActions: timestamp, withdrawalActions: timestamp, depositingAccounts: timestamp, withdrawingAccounts: timestamp, actionsWithoutAccount: timestamp });
const totals = z.object({
  assets: z.array(counted).max(10000), unresolvedAssets: z.array(amounts).max(10000),
  depositingChainAddresses: timestamp, withdrawingChainAddresses: timestamp, unresolvedEvents: timestamp,
  protocolEvents: timestamp, internalEvents: timestamp, migrationLegs: timestamp, usd: z.null(),
});
const block = z.object({ number: timestamp, timestamp, hash: z.string().regex(/^0x[0-9a-f]{64}$/) });
const point = z.object({ observedAt: timestamp, value: decimal, quality: z.enum(["available", "estimated", "partial"]), sourceSha256: digest });
const metric = z.object({
  id: z.string().max(128), label: z.string().max(256), card: z.string(), unit: z.string(),
  basis: z.string().max(1024), status: z.enum(["available", "estimated", "partial", "stale", "unavailable"]),
  reason: z.string().nullable(), latest: point.nullable(), history: z.array(point).max(740),
});
const day = z.object({
  chainId: timestamp, day: timestamp, accountingSha256: digest, sourceSha256: digest,
  scopedEvents: timestamp, transactions: timestamp, registryProducts: timestamp,
  nativeEventIneligibleProducts: timestamp, metadataGapProducts: timestamp, anchor: block, totals,
  products: z.array(z.object({ address, name: z.string().max(512), totals })).max(10000),
});
const capital = z.object({
  schema: z.literal("pulse-kong-envio/v3"), rules: z.literal("receipt-boundary-rules/3"), enabled: z.boolean(),
  coverage: z.object({ allYearn: z.literal(false), forwardFilled: z.literal(false), openUtcDayIncluded: z.literal(false), supportedChains: z.array(timestamp).max(12), quarantined: z.array(z.string()).max(4440), gaps: z.array(z.string()).max(20) }),
  sources: z.object({ chains: z.array(z.object({ chainId: timestamp, status: z.string(), coveredThrough: timestamp.nullable() })).max(12) }),
  history: z.array(day).max(4440),
  ranges: z.array(z.object({ days: timestamp, totals: totals.nullable(), observedChainDays: timestamp })).length(4),
});
const peg = z.object({ observedAt: timestamp, block, quoteOutRaw: z.object({ ycrv: raw, yyb: raw }), sourceSha256: digest });
const reward = z.object({ product: z.enum(["ycrv", "yyb"]), week: timestamp, start: timestamp, end: timestamp, observedAt: timestamp, sharesRaw: raw, assetsRaw: raw, valuation: block, following: block.nullable(), provisional: z.boolean(), sourceSha256: digest });
const lockers = z.object({
  schema: z.literal("pulse-ylockers/v1"), status: z.enum(["partial", "stale", "unavailable"]), checkedAt: timestamp, error: z.string().nullable(),
  peg: z.object({ method: z.string(), quoteInRaw: raw, history: z.array(peg).max(740) }),
  rewards: z.object({ unit: z.literal("crvUSD"), method: z.string(), history: z.array(reward).max(110) }),
  flows: z.object({ status: z.literal("unavailable"), reason: z.string() }),
});
const schema = z.object({
  schema: z.literal("pulse/v1"), mode: z.literal("live"), generatedAt: timestamp,
  metrics: z.array(metric).max(100), reviewedCapital: capital.optional(), yLockers: lockers.optional(),
});
export type PulseFeed = z.infer<typeof schema>;
export type CapitalDay = z.infer<typeof day>;
export type CapitalTotals = z.infer<typeof totals>;
export type LiveMetric = z.infer<typeof metric>;
export const CHAIN_NAMES: Record<number, string> = { 1: "Ethereum", 10: "Optimism", 137: "Polygon", 8453: "Base", 42161: "Arbitrum", 747474: "Katana" };
export const assetId = (row: {chainId: number; asset: {address: string}}) => row.chainId + ":" + row.asset.address;

export function parsePulseFeed(value: unknown, now = Math.floor(Date.now() / 1000)): PulseFeed {
  const feed = schema.parse(value);
  if (feed.generatedAt > now + 60) throw new Error("Pulse publication is in the future.");
  const ids = new Set<string>();
  for (const m of feed.metrics) {
    if (ids.has(m.id)) throw new Error("Duplicate Pulse metric.");
    ids.add(m.id);
    let previous = -1;
    for (const p of m.history) {
      const day = Math.floor(p.observedAt / 86400);
      if (day <= previous || p.observedAt > feed.generatedAt + 60) throw new Error("Invalid Pulse observation order.");
      previous = day;
    }
    if (JSON.stringify(m.latest) !== JSON.stringify(m.history.at(-1) ?? null)) throw new Error("Pulse latest value disagrees with history.");
    if ((m.status === "unavailable") !== (m.history.length === 0)) throw new Error("Pulse metric availability disagrees with history.");
  }
  const keys = new Set<string>();
  for (const d of feed.reviewedCapital?.history ?? []) {
    const key = d.chainId + ":" + d.day;
    if (keys.has(key) || d.day % 86400 !== 0 || d.day + 86400 > feed.generatedAt || !feed.reviewedCapital?.coverage.supportedChains.includes(d.chainId)) throw new Error("Invalid capital day.");
    keys.add(key);
    for (const t of [d.totals, ...d.products.map(p => p.totals)]) {
      const assets = new Set<string>();
      for (const a of [...t.assets, ...t.unresolvedAssets]) {
        if (a.chainId !== d.chainId) throw new Error("Capital chain mismatch.");
        const prefix = "net" in a ? "counted:" : "gap:";
        const key = prefix + assetId(a);
        if (assets.has(key)) throw new Error("Duplicate capital asset.");
        assets.add(key);
      }
    }
  }
  return feed;
}
export const PULSE_FEED_POLICY: FeedTransportPolicy = {
  maximumPayloadBytes: 8 * 1024 * 1024, fatalUtf8: true, requestTimeoutMs: 15000,
  fetchOptions: { cache: "no-store", redirect: "manual" },
  createPayloadTooLargeError: () => new Error("Pulse feed is too large."),
  createTimeoutError: () => new Error("Pulse request timed out."),
  payloadTooLargeCancelReason: "Pulse payload limit", timeoutCancelReason: "Pulse deadline",
};
export async function fetchPulseFeed() {
  return withFeedRequest("/api/pulse-data", PULSE_FEED_POLICY, async (r, context) => {
    if (!r.ok) { await r.body?.cancel(); throw new Error("Pulse feed is unavailable."); }
    return parsePulseFeed(await readBoundedJson(r, context, PULSE_FEED_POLICY));
  });
}
export class PulseFeedReader {
  private current: PulseFeed | null = null;
  constructor(private readonly fetcher = fetchPulseFeed) {}
  async read() {
    const next = await this.fetcher();
    if (this.current && (next.generatedAt < this.current.generatedAt || (next.generatedAt === this.current.generatedAt && JSON.stringify(next) !== JSON.stringify(this.current)))) throw new Error("Pulse publication regressed or conflicts.");
    this.current = next;
    return next;
  }
}
