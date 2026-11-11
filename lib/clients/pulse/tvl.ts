import { z } from "zod";

const timestamp = z.number().int().nonnegative();
const point = z.object({
  observedAt: timestamp,
  value: z.string().regex(/^\d{1,78}(?:\.\d{1,36})?$/).refine(v => Number.isFinite(Number(v)) && Number(v) <= 1e12),
  quality: z.literal("estimated"),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  provisional: z.boolean(),
  chains: z.array(z.object({ chainId: timestamp, value: z.string().regex(/^\d{1,78}(?:\.\d{1,36})?$/).refine(v => Number.isFinite(Number(v)) && Number(v) <= 1e12) })).max(12).optional(),
});
export const tvlHistorySchema = z.object({
  schema: z.literal("pulse-tvl/v1"), enabled: z.literal(true),
  status: z.enum(["available", "stale", "unavailable"]), checkedAt: timestamp, error: z.string().nullable(), unit: z.literal("USD"),
  source: z.object({
    id: z.literal("defillama-yearn-finance"), url: z.literal("https://api.llama.fi/protocol/yearn-finance"),
    label: z.string().min(1).max(128), scope: z.string().min(1).max(1024),
    chains: z.array(z.object({chainId: timestamp, name: z.string().min(1).max(64)})).max(12),
    reviewedAdapterRevision: z.string().regex(/^[0-9a-f]{40}$/),
  }),
  history: z.array(point).max(740), latest: point.nullable(),
  coverage: z.object({
    requestedClosedDays: z.union([z.literal(90),z.literal(365)]), observedClosedDays: timestamp.max(365), missingDays: z.array(timestamp).max(365),
    forwardFilled: z.literal(false), isDailyClose: z.literal(false),
    historyStart: timestamp.nullable(), historyEnd: timestamp.nullable(),
  }),
  annotations: z.array(z.object({
    at: timestamp, kind: z.literal("methodology"), label: z.string().min(1).max(128), detail: z.string().min(1).max(1024),
  })).max(20),
});
export type TvlHistory = z.infer<typeof tvlHistorySchema>;
export function validateTvlHistory(data: TvlHistory, generatedAt: number) {
  if (data.checkedAt > generatedAt + 60) throw new Error("TVL check is in the future.");
  let previousDay = -1;
  for (const p of data.history) {
    const day = Math.floor(p.observedAt / 86400);
    if (day <= previousDay || p.observedAt > generatedAt + 60) throw new Error("Invalid TVL observation order.");
    if (p.chains) {
      const expected = data.source.chains.map(c => c.chainId).sort((a, b) => a - b);
      const actual = p.chains.map(c => c.chainId).sort((a, b) => a - b);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Incomplete or duplicate TVL chain breakdown.");
      const sum = p.chains.reduce((n, c) => n + Number(c.value), 0);
      if (Math.abs(sum - Number(p.value)) > Math.max(8, Number(p.value) * 1e-8)) throw new Error("TVL chain breakdown does not reconcile.");
    }
    previousDay = day;
  }
  if (JSON.stringify(data.latest) !== JSON.stringify(data.history.at(-1) ?? null)) throw new Error("TVL latest value disagrees with history.");
  if ((data.status === "unavailable") !== (data.history.length === 0)) throw new Error("TVL availability disagrees with history.");
  const chains = data.source.chains.map(c => c.chainId);
  if (JSON.stringify([...chains].sort((a,b)=>a-b)) !== JSON.stringify([1,10,137,250,8453,42161,747474])) throw new Error("Invalid TVL chain scope.");
  const observed = new Set(data.history.map(p => Math.floor(p.observedAt / 86400) * 86400));
  const end = Math.floor(generatedAt / 86400) * 86400;
  const expected = Array.from({length:data.coverage.requestedClosedDays}, (_, i) => end - (data.coverage.requestedClosedDays - i) * 86400);
  const missing = expected.filter(day => !observed.has(day));
  if (JSON.stringify(missing) !== JSON.stringify(data.coverage.missingDays) || data.coverage.observedClosedDays !== data.coverage.requestedClosedDays - missing.length) throw new Error("TVL history coverage disagrees with observations.");
  if (data.coverage.historyStart !== (data.history[0]?.observedAt ?? null) || data.coverage.historyEnd !== (data.history.at(-1)?.observedAt ?? null)) throw new Error("TVL history bounds disagree with observations.");
}
