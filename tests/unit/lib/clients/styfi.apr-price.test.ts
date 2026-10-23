import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import type { GlobalData } from "@/lib/schemas/global";
import { readStyfiAprValuation, styfiFeedValuation, YFI_USD_FEED } from "@/lib/clients/styfi/apr-price";

const NOW = 1_792_761_971;
function feed(overrides: Record<string, unknown> = {}): GlobalData {
  return { meta: { timestamp: NOW }, global: { yfi: {
    priceCts: "218333", priceSource: "chainlink:yfi-usd", priceFeed: YFI_USD_FEED,
    priceUpdatedAt: NOW - 23_712, priceStatus: "stale", priceStale: true, ...overrides,
  } } } as GlobalData;
}
function oracle(overrides: { answer?: bigint; updatedAt?: bigint; decimals?: number; description?: string; roundId?: bigint; answeredInRound?: bigint } = {}) {
  const multicall = vi.fn().mockResolvedValue([
    overrides.decimals ?? 8, overrides.description ?? "YFI / USD",
    [overrides.roundId ?? 2n, overrides.answer ?? 220_000_000_000n, 0n,
      overrides.updatedAt ?? BigInt(NOW - 60), overrides.answeredInRound ?? 2n],
  ]);
  return { multicall, client: { multicall } as unknown as PublicClient };
}

describe("YFI valuation for APR", () => {
  it("uses the latest pinned oracle quote instead of an older stats value", async () => {
    const { client, multicall } = oracle();
    expect(await readStyfiAprValuation(client, 100n, NOW, feed())).toEqual({
      yfiPriceCts: 220_000n, timestamp: NOW - 60, stale: false,
    });
    expect(multicall).toHaveBeenCalledWith(expect.objectContaining({ blockNumber: 100n, allowFailure: false }));
  });

  it("uses the feed's 24-hour heartbeat rather than the producer's three-hour warning", () => {
    expect(styfiFeedValuation(feed(), NOW).stale).toBe(false);
    expect(styfiFeedValuation(feed({ priceUpdatedAt: NOW - 86_400 }), NOW).stale).toBe(false);
    expect(styfiFeedValuation(feed({ priceUpdatedAt: NOW - 86_401 }), NOW).stale).toBe(true);
    expect(styfiFeedValuation(feed({ priceStatus: "cached" }), NOW).stale).toBe(true);
    expect(styfiFeedValuation(feed({ priceSource: "other" }), NOW).stale).toBe(true);
    expect(styfiFeedValuation(feed({ priceFeed: "other" }), NOW).stale).toBe(true);
    expect(styfiFeedValuation(feed({ priceUpdatedAt: undefined }), NOW)).toMatchObject({ timestamp: null, stale: true });
  });

  it.each([
    { answer: 0n }, { answer: -1n }, { decimals: 18 }, { description: "ETH / USD" },
    { updatedAt: 0n }, { updatedAt: BigInt(NOW + 1) }, { roundId: 0n }, { answeredInRound: 1n },
  ])("falls back on an invalid oracle round %#", async (invalid) => {
    const { client } = oracle(invalid);
    expect(await readStyfiAprValuation(client, 100n, NOW, feed())).toEqual(styfiFeedValuation(feed(), NOW));
    expect((await readStyfiAprValuation(client, 100n, NOW, null)).yfiPriceCts).toBeNull();
  });

  it("preserves a real stale oracle timestamp and handles RPC failure without failing rewards", async () => {
    const { client, multicall } = oracle({ updatedAt: BigInt(NOW - 86_401) });
    expect((await readStyfiAprValuation(client, 100n, NOW, feed())).stale).toBe(true);
    multicall.mockRejectedValue(new Error("RPC offline"));
    expect(await readStyfiAprValuation(client, 100n, NOW, feed())).toEqual(styfiFeedValuation(feed(), NOW));
    expect(styfiFeedValuation(feed({ priceUpdatedAt: NOW + 1 }), NOW).stale).toBe(true);
  });
});
