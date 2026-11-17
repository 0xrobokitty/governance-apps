import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

async function loadFetcher() {
  vi.resetModules();
  return import("@/lib/clients/global");
}

function createPayload(timestamp: string) {
  return {
    meta: { version: 2, timestamp: Number(timestamp), epoch: 1, blockNumber: 1 },
    global: {
      maxBoostBps: 20_000,
      yfi: { totalSupply: "1", priceCts: "1" },
      veyfi: {
        lockedYfi: "0",
        migratedYfi: "0",
        totalLlyfiStakedBps: 0,
        inventory: { availableYfi: "0", feeBps: 0 },
        tokens: [],
      },
      weight: { current: "0", projected: "0" },
      rewards: { current: "0", projected: "0", pps: "0", apyBps: 0 },
    },
    styfi: {
      staked: "0",
      unstaking: "0",
      current: { weight: "0", rewards: "0", aprBps: 0 },
      projected: { weight: "0", rewards: "0", aprBps: 0 },
    },
    styfix: {
      staked: "0",
      unstaking: "0",
      current: { rewards: "0", aprBps: 0 },
      projected: { rewards: "0", aprBps: 0 },
    },
    veyfi: {
      current: { weight: "0", rewards: "0" },
      projected: { weight: "0", rewards: "0" },
    },
    llyfi: [],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchGlobalData", () => {
  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null when NEXT_PUBLIC_GLOBAL_DATA_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_GLOBAL_DATA_URL;
    const { fetchGlobalData } = await loadFetcher();
    await expect(fetchGlobalData()).resolves.toBeNull();
  });

  it("uses the configured direct data URL", async () => {
    process.env.NEXT_PUBLIC_GLOBAL_DATA_URL = "https://example.invalid/stats.json";
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === process.env.NEXT_PUBLIC_GLOBAL_DATA_URL) {
          return jsonResponse(createPayload("1700000000"));
        }
        return jsonResponse({ error: "unexpected URL" }, 404);
      });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchGlobalData } = await loadFetcher();
    const data = await fetchGlobalData();

    expect(data?.meta.timestamp).toBe(1700000000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://example.invalid/stats.json", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("rejects an oversized direct response", async () => {
    process.env.NEXT_PUBLIC_GLOBAL_DATA_URL = "https://example.invalid/stats.json";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", {
      headers: { "content-length": String(1024 * 1024 + 1) },
    })));
    const { fetchGlobalData } = await loadFetcher();
    await expect(fetchGlobalData()).rejects.toThrow("No valid global data payload");
  });

  it("fails a stalled direct read within the request budget", async () => {
    vi.useFakeTimers();
    process.env.NEXT_PUBLIC_GLOBAL_DATA_URL = "https://example.invalid/stats.json";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const { fetchGlobalData } = await loadFetcher();
    const assertion = expect(fetchGlobalData()).rejects.toThrow("No valid global data payload");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("uses the same-origin proxy URL in browser runtime", async () => {
    process.env.NEXT_PUBLIC_GLOBAL_DATA_URL = "https://example.invalid/stats.json";
    vi.stubGlobal("window", {} as Window);
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/global-data") {
          return jsonResponse(createPayload("1700000001"));
        }
        return jsonResponse({ error: "unexpected URL" }, 404);
      });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchGlobalData } = await loadFetcher();
    const data = await fetchGlobalData();

    expect(data?.meta.timestamp).toBe(1700000001);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/global-data", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
