import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as globalGet } from "@/app/api/global-data/route";
import { GET as yethGet } from "@/app/api/yeth-global-data/route";
import { GLOBAL_FEED_POLICY, GLOBAL_FEED_REQUEST_TIMEOUT_MS, YETH_GLOBAL_FEED_POLICY } from "@/lib/clients/global-payload";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe.each([
  ["global", globalGet, "NEXT_PUBLIC_GLOBAL_DATA_URL", GLOBAL_FEED_POLICY],
  ["yeth", yethGet, "NEXT_PUBLIC_YETH_GLOBAL_DATA_URL", YETH_GLOBAL_FEED_POLICY],
] as const)("%s feed proxy bounds", (_name, get, environmentVariable, policy) => {
  it.each(["fetch", "body"])("returns an uncached timeout for a stalled %s", async (phase) => {
    vi.useFakeTimers();
    vi.stubEnv(environmentVariable, "https://feed.test/data.json");
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(() => phase === "fetch" ? new Promise(() => undefined)
      : Promise.resolve(new Response(new ReadableStream({ cancel })))));
    const request = get();
    await vi.advanceTimersByTimeAsync(GLOBAL_FEED_REQUEST_TIMEOUT_MS);
    const response = await request;
    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toBe("no-store");
    if (phase === "body") expect(cancel).toHaveBeenCalled();
  });
  it.each(["declared", "streamed"])("rejects %s oversized responses", async (kind) => {
    vi.stubEnv(environmentVariable, "https://feed.test/data.json");
    const cancel = vi.fn();
    const response = kind === "declared"
      ? new Response("{}", { headers: { "content-length": String(policy.maximumPayloadBytes + 1) } })
      : new Response(new ReadableStream({
          start(controller) { controller.enqueue(new Uint8Array(policy.maximumPayloadBytes + 1)); },
          cancel,
        }));
    vi.stubGlobal("fetch", vi.fn(async () => response));
    expect((await get()).status).toBe(500);
    if (kind === "streamed") expect(cancel).toHaveBeenCalled();
  });
  it("cancels failed bodies without waiting for an uncooperative cancellation", async () => {
    vi.stubEnv(environmentVariable, "https://feed.test/data.json");
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 503 })));
    expect((await get()).status).toBe(503);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects malformed JSON without caching the error", async () => {
    vi.stubEnv(environmentVariable, "https://feed.test/data.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{", { headers: { "cache-control": "max-age=3600" } })));
    const response = await get();
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
