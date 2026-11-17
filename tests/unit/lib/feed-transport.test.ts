import { afterEach, describe, expect, it, vi } from "vitest";
import { readBoundedJson, withFeedRequest, type FeedTransportPolicy } from "@/lib/feed-transport";
const policy: FeedTransportPolicy = {
  maximumPayloadBytes: 16, requestTimeoutMs: 100,
  createTimeoutError: () => new Error("deadline"),
  createPayloadTooLargeError: () => new Error("size"),
  payloadTooLargeCancelReason: "size", timeoutCancelReason: "deadline",
};
afterEach(() => { vi.useRealTimers(); });

describe("shared feed cancellation", () => {
  it("does not fetch for an already-cancelled caller", async () => {
    const caller = new AbortController();
    const reason = new Error("caller stopped");
    caller.abort(reason);
    const fetcher = vi.fn();
    await expect(withFeedRequest("https://feed.test", policy, async () => null, fetcher, caller.signal)).rejects.toBe(reason);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["fetch", "body"])("settles a cancelled %s even when it ignores the signal", async (phase) => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const reason = new Error("caller stopped");
    const cancel = vi.fn();
    let transportSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_url: string, init: RequestInit) => {
      transportSignal = init.signal as AbortSignal;
      return phase === "fetch" ? new Promise<Response>(() => undefined)
        : Promise.resolve(new Response(new ReadableStream({ cancel })));
    });
    const request = withFeedRequest("https://feed.test", policy,
      (response, context) => readBoundedJson(response, context, policy), fetcher, caller.signal);
    const assertion = expect(request).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    caller.abort(reason);
    await assertion;
    expect(transportSignal?.aborted).toBe(true);
    if (phase === "body") expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("discards a fetch that resolves after its deadline", async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    const handle = vi.fn(async () => "unexpected");
    const request = withFeedRequest("https://feed.test", policy, handle,
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const assertion = expect(request).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    const cancel = vi.fn();
    resolveFetch(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(handle).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("removes caller listeners and timers after success", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, "removeEventListener");
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    await expect(withFeedRequest("https://feed.test", policy,
      (response, context) => readBoundedJson(response, context, policy), fetcher, caller.signal)).resolves.toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
