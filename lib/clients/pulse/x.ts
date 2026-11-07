import { z } from "zod";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const finite = z.number().finite().nonnegative();
const daily = z.object({
  observedAt: count.positive(), intervalStart: count.positive().nullable(),
  followers: count, netFollowers: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullable(),
  impressions: count.nullable(), linkClicks: count.nullable(),
  trackedPosts: count.max(500), measuredPosts: count.max(500), measuredLinkPosts: count.max(500),
  baselinedPosts: count.max(500), missingPosts: count.max(500), counterCorrections: count.max(1000),
  truncated: z.boolean(), medianSevenDayImpressions: finite.nullable(),
  clicksPerThousandImpressions: finite.nullable(), performancePosts: count.max(3500), performanceLinkPosts: count.max(3500),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const xSchema = z.object({
  schema: z.literal("pulse-x/v1"), account: z.literal("yearnfi"),
  status: z.enum(["disabled", "unavailable", "stale", "partial"]), reason: z.string().max(128).nullable(),
  checkedAt: count, observedAt: count.positive().nullable(),
  basis: z.literal("observed-counter-changes-on-tracked-posts-under-30-days"),
  performanceBasis: z.literal("rolling-7-day-sample-observed-at-age-7-to-8-days"),
  history: z.array(daily).max(740),
});
export type XFeed = z.infer<typeof xSchema>;
export type XDaily = z.infer<typeof daily>;
export type XTab = "impressions" | "linkClicks" | "followers";

export function validateX(x: XFeed, generatedAt: number) {
  if (x.checkedAt > generatedAt || x.observedAt !== (x.history.at(-1)?.observedAt ?? null)) throw new Error("X observation time disagrees with history.");
  if (x.status === "unavailable" && x.history.length || ["partial", "stale"].includes(x.status) && !x.history.length) throw new Error("X availability disagrees with history.");
  let previous: XDaily | undefined;
  for (const p of x.history) {
    const day = Math.floor(p.observedAt / 86400);
    if (day <= Math.floor((previous?.observedAt ?? -86400) / 86400) || p.observedAt > generatedAt || day < Math.floor(generatedAt / 86400) - 739) throw new Error("Invalid X history order.");
    if (p.measuredPosts > p.trackedPosts || p.measuredLinkPosts > p.trackedPosts || p.baselinedPosts > p.trackedPosts || p.performanceLinkPosts > p.performancePosts) throw new Error("Invalid X measurement coverage.");
    if ((p.impressions === null) !== (p.measuredPosts === 0) || (p.linkClicks === null) !== (p.measuredLinkPosts === 0)) throw new Error("X counters disagree with coverage.");
    if ((p.medianSevenDayImpressions === null) !== (p.performancePosts === 0) || p.performanceLinkPosts === 0 && p.clicksPerThousandImpressions !== null) throw new Error("X performance disagrees with coverage.");
    if (p.intervalStart === null) {
      if (p.netFollowers !== null || p.impressions !== null || p.linkClicks !== null) throw new Error("X baseline contains interval activity.");
    } else {
      if (p.intervalStart >= p.observedAt || Math.floor(p.intervalStart / 86400) + 1 !== day || p.netFollowers === null) throw new Error("Invalid X measurement interval.");
      if (previous && (p.intervalStart !== previous.observedAt || p.netFollowers !== p.followers - previous.followers)) throw new Error("X interval disagrees with previous observation.");
    }
    previous = p;
  }
}

export function validateXTransition(previous: XFeed | undefined, next: XFeed | undefined, generatedAt: number) {
  if (!previous) return;
  const minimumDay = Math.floor(generatedAt / 86400) - 739;
  const retained = previous.history.filter(p => Math.floor(p.observedAt / 86400) >= minimumDay);
  if (!retained.length) return;
  if (!next || next.checkedAt < previous.checkedAt) throw new Error("X collection regressed.");
  const points = new Map(next.history.map(p => [p.observedAt, p]));
  for (const old of retained) if (JSON.stringify(points.get(old.observedAt)) !== JSON.stringify(old)) throw new Error("X retained history changed.");
}
