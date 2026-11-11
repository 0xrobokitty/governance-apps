import { z } from "zod";
import type { PulseFeed } from "./feed";

const count = z.number().int().nonnegative();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const address = z.string().regex(/^0x[0-9a-f]{40}$/);
const usd = z.string().regex(/^\d{1,18}\.\d{2}$/).refine(v => Number.isFinite(Number(v)) && Number(v) <= 1e15);
const signedUsd = z.string().regex(/^-?\d{1,18}\.\d{2}$/).refine(v => Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 1e15);
const amounts = { depositsUsd: usd.nullable(), withdrawalsUsd: usd.nullable(), netUsd: signedUsd.nullable() };
const point = z.object({
  day: count, quality: z.literal("estimated"), sourceSha256: digest,
  capital: z.array(z.object({ chainId: count, accountingSha256: digest })).max(12),
  ...amounts, flowBalanceBps: z.number().int().min(-10000).max(10000).nullable(),
  depositingAccounts: count, withdrawingAccounts: count, actionsWithoutAccount: count,
  depositActions: count, withdrawalActions: count, unresolvedEvents: count,
  priceCoverage: z.object({
    assetCount: count, pricedAssetCount: count, actionCount: count, pricedActionCount: count,
    unpricedAssets: z.array(z.object({
      chainId: count, address, symbol: z.string().max(128), decimals: count.max(36),
      depositActions: count, withdrawalActions: count, reason: z.string().max(256),
    })).max(10000),
  }),
  products: z.array(z.object({
    chainId: count, address, name: z.string().max(512), ...amounts,
    depositActions: count, withdrawalActions: count, pricedActions: count,
  })).max(1000),
});
export const globalCapitalSchema = z.object({
  schema: z.literal("pulse-global-capital/v1"), enabled: z.boolean(),
  status: z.enum(["available", "stale", "unavailable"]), checkedAt: count, error: z.string().nullable(),
  source: z.object({
    id: z.literal("defillama-coins"), url: z.literal("https://coins.llama.fi"),
    valuation: z.string().min(1).max(1024), searchWidthSeconds: z.literal(14400), minConfidence: z.literal(0.9),
  }),
  coverage: z.object({
    allYearn: z.literal(false), supportedChains: z.array(count).max(12), publishedDays: z.union([z.literal(90),z.literal(365)]),
    from: count, until: count, observedDays: count.max(365), missingDays: z.array(count).max(365),
    quarantinedDays: z.array(count).max(365).optional(), forwardFilled: z.literal(false), accountMeaning: z.string().max(256), unresolvedRoutesExcluded: z.literal(true),
  }),
  history: z.array(point).max(365),
});
export type GlobalCapital = z.infer<typeof globalCapitalSchema>;
export type GlobalCapitalPoint = z.infer<typeof point>;
const cents = (value: string) => BigInt(value.replace(".", ""));
function validateAmounts(p: z.infer<typeof point> | z.infer<typeof point>["products"][number]) {
  const values = [p.depositsUsd, p.withdrawalsUsd, p.netUsd];
  if (values.some(v => v === null) && !values.every(v => v === null)) throw new Error("Incomplete USD flow amounts.");
  if (p.netUsd !== null) {
    const residual = cents(p.depositsUsd!) - cents(p.withdrawalsUsd!) - cents(p.netUsd);
    // Each published USD amount is independently rounded to cents.
    if (residual < -1n || residual > 1n) throw new Error("USD flow amounts do not reconcile.");
  }
}
export function validateGlobalCapital(data: GlobalCapital, feed: PulseFeed) {
  const end = Math.floor(feed.generatedAt / 86400) * 86400;
  if (data.checkedAt > feed.generatedAt + 60 || data.coverage.until !== end || data.coverage.from !== end - data.coverage.publishedDays * 86400) throw new Error("Invalid global capital window.");
  const chains = [...data.coverage.supportedChains].sort((a, b) => a - b);
  if (JSON.stringify(chains) !== JSON.stringify([1, 10, 137, 8453, 42161, 747474])) throw new Error("Invalid global capital chain scope.");
  if (!feed.reviewedCapital?.enabled && data.history.length) throw new Error("Global capital has no reviewed source.");
  const bad = new Set(feed.reviewedCapital?.coverage.quarantined ?? []);
  const native = new Map(feed.reviewedCapital?.history.map(d => [d.chainId + ":" + d.day, d]));
  let previous = -1;
  for (const p of data.history) {
    if (p.day <= previous || p.day % 86400 || p.day < data.coverage.from || p.day >= end) throw new Error("Invalid global capital day.");
    previous = p.day;
    if (JSON.stringify(p.capital.map(c => c.chainId).sort((a, b) => a - b)) !== JSON.stringify(chains)) throw new Error("Incomplete global capital chains.");
    for (const ref of p.capital) {
      const key = ref.chainId + ":" + p.day;
      if (bad.has(key) || native.get(key)?.accountingSha256 !== ref.accountingSha256) throw new Error("Global capital source mismatch.");
    }
    validateAmounts(p);
    const rows = p.capital.map(ref => native.get(ref.chainId + ":" + p.day)!);
    const assets = rows.flatMap(d => d.totals.assets).filter(a => a.depositActions + a.withdrawalActions > 0);
    const byAsset = new Map(assets.map(a => [a.chainId + ":" + a.asset.address, a]));
    const coverage = p.priceCoverage;
    if (assets.length !== coverage.assetCount || assets.reduce((n,a)=>n+a.depositActions,0) !== p.depositActions || assets.reduce((n,a)=>n+a.withdrawalActions,0) !== p.withdrawalActions || assets.reduce((n,a)=>n+a.actionsWithoutAccount,0) !== p.actionsWithoutAccount || rows.reduce((n,d)=>n+d.totals.unresolvedEvents,0) !== p.unresolvedEvents) throw new Error("Global actions disagree with reviewed capital.");
    for (const a of coverage.unpricedAssets) {
      const expected = byAsset.get(a.chainId + ":" + a.address);
      if (!expected || expected.asset.symbol !== a.symbol || expected.asset.decimals !== a.decimals || expected.depositActions !== a.depositActions || expected.withdrawalActions !== a.withdrawalActions) throw new Error("Global unpriced asset disagrees with reviewed capital.");
    }
    if (coverage.pricedAssetCount > coverage.assetCount || coverage.pricedActionCount > coverage.actionCount || coverage.actionCount !== p.depositActions + p.withdrawalActions) throw new Error("Invalid global price coverage.");
    if (coverage.unpricedAssets.length !== coverage.assetCount - coverage.pricedAssetCount || coverage.unpricedAssets.reduce((n, a) => n + a.depositActions + a.withdrawalActions, 0) !== coverage.actionCount - coverage.pricedActionCount) throw new Error("Global unpriced assets disagree with coverage.");
    if (new Set(coverage.unpricedAssets.map(a => a.chainId + ":" + a.address)).size !== coverage.unpricedAssets.length) throw new Error("Duplicate global unpriced asset.");
    if (coverage.actionCount > 0 && coverage.pricedActionCount === 0 && p.netUsd !== null) throw new Error("Unpriced flows have a USD value.");
    if (p.netUsd === null && p.flowBalanceBps !== null) throw new Error("Unpriced flows have a balance.");
    if (!coverage.actionCount && (p.depositsUsd !== "0.00" || p.withdrawalsUsd !== "0.00" || p.netUsd !== "0.00" || p.flowBalanceBps !== null)) throw new Error("Invalid inactive global capital day.");
    if (p.depositsUsd !== null) {
      const deposits = cents(p.depositsUsd), withdrawals = cents(p.withdrawalsUsd!);
      const gross = deposits + withdrawals;
      if (gross > 0n) {
        if (p.flowBalanceBps === null) throw new Error("Active priced flows have no balance.");
        const expected = Number((deposits - withdrawals) * 10000n / gross);
        const tolerance = Number((20000n + gross - 1n) / gross) + 1;
        if (Math.abs(p.flowBalanceBps - expected) > tolerance) throw new Error("Flow balance does not reconcile.");
      }
    }
    const expectedProducts = new Map(rows.flatMap(d => d.products.map(product => ({
      ...product, chainId:d.chainId,
      depositActions:product.totals.assets.reduce((n,a)=>n+a.depositActions,0),
      withdrawalActions:product.totals.assets.reduce((n,a)=>n+a.withdrawalActions,0),
    }))).filter(p=>p.depositActions+p.withdrawalActions>0).map(p=>[p.chainId+":"+p.address,p]));
    if (p.products.length !== expectedProducts.size) throw new Error("Global product coverage disagrees with reviewed capital.");
    const products = new Set<string>();
    for (const product of p.products) {
      const key = product.chainId + ":" + product.address;
      if (!chains.includes(product.chainId) || products.has(key) || product.pricedActions > product.depositActions + product.withdrawalActions) throw new Error("Invalid global capital product.");
      const expected = expectedProducts.get(key);
      if (!expected || expected.name !== product.name || expected.depositActions !== product.depositActions || expected.withdrawalActions !== product.withdrawalActions) throw new Error("Global product actions disagree with reviewed capital.");
      const unpriced = new Set(coverage.unpricedAssets.map(a=>a.chainId+":"+a.address));
      const pricedActions = expected.totals.assets.filter(a=>!unpriced.has(a.chainId+":"+a.asset.address)).reduce((n,a)=>n+a.depositActions+a.withdrawalActions,0);
      if (product.pricedActions !== pricedActions) throw new Error("Global product priced actions disagree with asset coverage.");
      if ((product.pricedActions === 0) !== (product.netUsd === null)) throw new Error("Global product price availability disagrees with actions.");
      products.add(key); validateAmounts(product);
    }
    if (p.products.reduce((n, product) => n + product.pricedActions, 0) !== coverage.pricedActionCount) throw new Error("Global priced product actions do not reconcile.");
    for (const field of ["depositsUsd", "withdrawalsUsd", "netUsd"] as const) {
      if (p[field] !== null) {
        const total = p.products.reduce((n, product) => n + (product[field] === null ? 0n : cents(product[field]!)), 0n);
        const residual = total - cents(p[field]!);
        const tolerance = BigInt(p.products.length + 1);
        if (residual < -tolerance || residual > tolerance) throw new Error("Global product USD totals do not reconcile.");
      }
    }
    if (rows.reduce((n, d) => n + d.totals.depositingChainAddresses, 0) !== p.depositingAccounts || rows.reduce((n, d) => n + d.totals.withdrawingChainAddresses, 0) !== p.withdrawingAccounts) throw new Error("Global accounts disagree with reviewed capital.");
  }
  const observed = new Set(data.history.map(p => p.day));
  const missing = Array.from({ length: data.coverage.publishedDays }, (_, i) => data.coverage.from + i * 86400).filter(day => !observed.has(day));
  if (data.coverage.observedDays !== data.history.length || JSON.stringify(missing) !== JSON.stringify(data.coverage.missingDays)) throw new Error("Global capital coverage disagrees with history.");
  const quarantined = [...new Set([...bad].map(key=>Number(key.split(":")[1])).filter(day=>day>=data.coverage.from&&day<end))].sort((a,b)=>a-b);
  if (data.coverage.quarantinedDays && JSON.stringify(data.coverage.quarantinedDays) !== JSON.stringify(quarantined)) throw new Error("Global quarantine coverage disagrees with reviewed capital.");
  if (quarantined.some(day=>observed.has(day))) throw new Error("Global capital includes a quarantined date.");
  if (data.status === "available" && (data.error !== null || data.history.at(-1)?.day !== end - 86400)) throw new Error("Global capital freshness disagrees with history.");
  if ((data.status === "unavailable") !== (data.history.length === 0)) throw new Error("Global capital availability disagrees with history.");
}
