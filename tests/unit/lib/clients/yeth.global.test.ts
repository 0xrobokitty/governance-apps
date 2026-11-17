import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

async function loadFetcher() {
  vi.resetModules();
  return import("@/lib/clients/yeth/global");
}

function createPayload(generatedAt: number) {
  return {
    version: 1,
    chainId: 1,
    generatedAt,
    blockNumber: 24_700_000,
    claim: { closesAt: 1_774_804_800 },
    yieldVault: { tvlEth: "2134200000000000000000" },
    recoveryVault: {
      pps: "1143200000000000000",
      totalAssetsEth: "512700000000000000000",
      totalShares: "448500000000000000000",
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchYethGlobalData", () => {
  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null when NEXT_PUBLIC_YETH_GLOBAL_DATA_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL;
    const { fetchYethGlobalData } = await loadFetcher();
    await expect(fetchYethGlobalData()).resolves.toBeNull();
  });

  it("uses the configured direct data URL", async () => {
    process.env.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL =
      "https://example.invalid/yeth-global.json";

    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === process.env.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL) {
          return jsonResponse(createPayload(100));
        }
        return jsonResponse({ error: "unexpected URL" }, 404);
      });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchYethGlobalData } = await loadFetcher();
    const data = await fetchYethGlobalData();

    expect(data?.generatedAt).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.invalid/yeth-global.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("uses the same-origin proxy URL in browser runtime", async () => {
    process.env.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL =
      "https://example.invalid/yeth-global.json";
    vi.stubGlobal("window", {} as Window);

    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/yeth-global-data") {
          return jsonResponse(createPayload(200));
        }
        return jsonResponse({ error: "unexpected URL" }, 404);
      });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchYethGlobalData } = await loadFetcher();
    const data = await fetchYethGlobalData();

    expect(data?.generatedAt).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/yeth-global-data", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("retains the last valid value after an oversized or stalled direct read", async () => {
    vi.useFakeTimers();
    process.env.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL = "https://example.invalid/yeth-global.json";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(createPayload(100)))
      .mockResolvedValueOnce(new Response("{}", { headers: { "content-length": String(64 * 1024 + 1) } }))
      .mockImplementationOnce(() => new Promise<Response>(() => undefined)));
    const { fetchYethGlobalData } = await loadFetcher();
    const initial = await fetchYethGlobalData();
    expect(initial?.generatedAt).toBe(100);
    await expect(fetchYethGlobalData()).resolves.toEqual(initial);
    const pending = fetchYethGlobalData();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual(initial);
  });

  it("returns null when the same-origin proxy data is invalid", async () => {
    process.env.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL =
      "https://example.invalid/yeth-global.json";
    vi.stubGlobal("window", {} as Window);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/yeth-global-data") {
          return jsonResponse({ version: 99 }, 200);
        }
        return jsonResponse({ error: "unexpected URL" }, 404);
      });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchYethGlobalData } = await loadFetcher();
    const data = await fetchYethGlobalData();

    expect(data).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
