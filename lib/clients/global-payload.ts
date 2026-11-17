import type { FeedTransportPolicy } from "@/lib/feed-transport";

export const GLOBAL_FEED_REQUEST_TIMEOUT_MS = 10_000;

export class GlobalFeedTimeoutError extends Error {
  constructor() {
    super("The global feed request timed out.");
    this.name = "GlobalFeedTimeoutError";
  }
}

function policy(maximumPayloadBytes: number): FeedTransportPolicy {
  return {
    maximumPayloadBytes,
    requestTimeoutMs: GLOBAL_FEED_REQUEST_TIMEOUT_MS,
    createPayloadTooLargeError: () => new Error("The global feed exceeds its size limit."),
    createTimeoutError: () => new GlobalFeedTimeoutError(),
    payloadTooLargeCancelReason: "Global feed size limit",
    timeoutCancelReason: "Global feed deadline",
  };
}

// These compact aggregate feeds have no unbounded historical series.
export const GLOBAL_FEED_POLICY = policy(1024 * 1024);
export const YETH_GLOBAL_FEED_POLICY = policy(64 * 1024);
