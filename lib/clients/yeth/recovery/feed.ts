import { readBoundedJson, withFeedRequest } from "@/lib/feed-transport";
import { parseRecoveryFeed, type RecoveryFeedData } from "./feed-schema";
export { parseRecoveryFeed } from "./feed-schema";
export type { RecoveryFeedData } from "./feed-schema";
export { buildRecoverySnapshot } from "./feed-adapter";

export class RecoveryFeedReader {
  private previous?: RecoveryFeedData;
  async read(fetcher: typeof fetch = fetch): Promise<RecoveryFeedData> {
    const policy = {
      maximumPayloadBytes: 12 * 1024 * 1024, requestTimeoutMs: 25000, fatalUtf8: true,
      createPayloadTooLargeError: () => new Error("Recovery response exceeds limits"),
      createTimeoutError: () => new Error("Recovery data request timed out"),
      payloadTooLargeCancelReason: "Recovery size limit", timeoutCancelReason: "Recovery deadline",
      fetchOptions: { cache: "no-store" as const, redirect: "error" as const },
    };
    const next = await withFeedRequest("/api/yeth-recovery-data", policy, async (response, context) => {
      if (!response.ok) { await response.body?.cancel(); throw new Error("Recovery data is unavailable"); }
      return parseRecoveryFeed(await readBoundedJson(response, context, policy));
    }, fetcher);
    if (this.previous) {
      const prior = this.previous.head;
      const head = next.head;
      if (head.generatedAt < prior.generatedAt || head.observedAt < prior.observedAt || BigInt(head.block.number) < BigInt(prior.block.number) ||
        (head.block.number === prior.block.number && head.block.hash !== prior.block.hash) ||
        (head.indexedThrough && prior.indexedThrough && BigInt(head.indexedThrough.number) < BigInt(prior.indexedThrough.number))) throw new Error("Recovery publication moved backwards");
    }
    this.previous = next;
    return next;
  }
}
