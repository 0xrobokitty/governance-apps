// Synthetic X observations for tests only. No live account credentials or API results.
import base from "./pulse-live.json";
import type { XDaily, XFeed } from "@/lib/clients/pulse/x";
export function xFixture() {
  const now = base.generatedAt;
  const history: XDaily[] = Array.from({ length: 10 }, (_, i) => ({
    observedAt: now - (9-i) * 86400,
    intervalStart: i ? now - (10-i) * 86400 : null,
    followers: 90000 + 2*i, netFollowers: i ? 2 : null,
    impressions: i ? 1000 + 100*i : null, linkClicks: i ? 10+i : null,
    trackedPosts: 20, measuredPosts: i ? 18 : 0, measuredLinkPosts: i ? 8 : 0,
    baselinedPosts: i ? 2 : 20, missingPosts: 1, counterCorrections: 0, truncated: true,
    medianSevenDayImpressions: 1500, clicksPerThousandImpressions: 12.5,
    performancePosts: 7, performanceLinkPosts: 4, sourceSha256: "a".repeat(64),
  }));
  const x: XFeed = { schema: "pulse-x/v1", account: "yearnfi", status: "partial", reason: null,
    checkedAt: now, observedAt: now,
    basis: "observed-counter-changes-on-tracked-posts-under-30-days",
    performanceBasis: "rolling-7-day-sample-observed-at-age-7-to-8-days", history };
  return { ...structuredClone(base), x };
}
