import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import type { PublicClient } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobalData } from "@/lib/schemas/global";
import type { YethGlobalData } from "@/lib/schemas/yeth-global";

const { rpcClient, state } = vi.hoisted(() => {
  const rpcClient = {
    chain: { id: 1 },
    getBlock: vi.fn(),
    multicall: vi.fn(),
    readContract: vi.fn(),
  };
  return {
    rpcClient,
    state: {
      rpc: rpcClient,
      wallet: null as { chain: { id: number } } | null,
      globalData: null as GlobalData | null,
      yethGlobalData: null as YethGlobalData | null,
    },
  };
});

vi.mock("wagmi", async (importOriginal) => ({
  ...await importOriginal<typeof import("wagmi")>(),
  usePublicClient: () => state.rpc,
  useWalletClient: () => ({ data: state.wallet }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/ybc",
  useSelectedLayoutSegments: () => ["ybc"],
}));

vi.mock("@/lib/hooks/useHostname", () => ({
  useHostname: () => "ybc.yearn.fi",
}));

vi.mock("@/lib/hooks/useGlobalData", () => ({
  useGlobalData: () => ({ data: state.globalData }),
}));

vi.mock("@/lib/hooks/useYethGlobalData", () => ({
  useYethGlobalData: () => ({ data: state.yethGlobalData }),
}));

vi.mock("@/components/TestBridgeListener", () => ({
  TestBridgeListener: () => null,
}));

const account = "0x1111111111111111111111111111111111111111";
const globalFeed: GlobalData = {
  meta: { version: 2, timestamp: 1_700_000_000, epoch: 1, blockNumber: 1 },
  global: {
    maxBoostBps: 20_000,
    yfi: { totalSupply: "1", priceCts: "1" },
    veyfi: {
      lockedYfi: "0", migratedYfi: "0", totalLlyfiStakedBps: 0,
      inventory: { availableYfi: "0", feeBps: 0 }, tokens: [],
    },
    weight: { current: "0", projected: "0" },
    rewards: { current: "0", projected: "0", pps: "0", apyBps: 0 },
  },
  styfi: {
    staked: "0", unstaking: "0",
    current: { weight: "0", rewards: "0", aprBps: 0 },
    projected: { weight: "0", rewards: "0", aprBps: 0 },
  },
  styfix: {
    staked: "0", unstaking: "0",
    current: { rewards: "0", aprBps: 0 },
    projected: { rewards: "0", aprBps: 0 },
  },
  veyfi: {
    current: { weight: "0", rewards: "0" },
    projected: { weight: "0", rewards: "0" },
  },
  llyfi: [],
};
const yethFeed: YethGlobalData = {
  version: 1, chainId: 1, generatedAt: 1_700_000_000, blockNumber: 1,
  claim: { closesAt: 1_800_000_000 },
  yieldVault: { tvlEth: "1" },
  recoveryVault: { pps: "1", totalAssetsEth: "1", totalShares: "1" },
};

async function renderProtocol() {
  const { ProtocolProvider, useProtocol } = await import("@/state/protocol");
  return renderHook(() => useProtocol(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ProtocolProvider>{children}</ProtocolProvider>
    ),
  });
}

function clients(value: ReturnType<typeof import("@/state/protocol").useProtocol>) {
  return [value.styfi, value.veyfi, value.yeth];
}

describe("ProtocolProvider client lifetime", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    vi.stubEnv("NEXT_PUBLIC_E2E", "false");
    state.rpc = rpcClient;
    state.wallet = { chain: { id: 1 } };
    state.globalData = null;
    state.yethGlobalData = null;
    rpcClient.getBlock.mockReset().mockResolvedValue({ timestamp: 1_700_000_000n });
    rpcClient.multicall.mockReset().mockImplementation(
      async ({ contracts }: { contracts: unknown[] }) => contracts.map(() => 0n)
    );
    rpcClient.readContract.mockReset().mockResolvedValue({ slope: 0n, weight: 0n });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps a mainnet read client for disconnected and wrong-chain viewers", async () => {
    state.wallet = null;
    const { result, rerender } = await renderProtocol();
    expect(result.current.mainnetPublicClient).toBe(rpcClient as unknown as PublicClient);
    expect(result.current.publicClient).toBeNull();

    state.wallet = { chain: { id: 10 } };
    rerender();
    expect(result.current.mainnetPublicClient).toBe(rpcClient as unknown as PublicClient);
    expect(result.current.publicClient).toBeNull();

    state.wallet = { chain: { id: 1 } };
    rerender();
    expect(result.current.publicClient).toBe(rpcClient as unknown as PublicClient);
  });

  it("retains stYFI and veYFI chain-time caches across unrelated yETH feed updates", async () => {
    state.globalData = globalFeed;
    state.yethGlobalData = yethFeed;
    const { result, rerender } = await renderProtocol();
    const initial = result.current;
    const readChainTimes = () => Promise.all([
      result.current.styfi.getEpochInfo(),
      result.current.veyfi.getGlobalStatsFromChain!(),
    ]);
    await readChainTimes();
    expect(rpcClient.getBlock).toHaveBeenCalledTimes(2);

    state.yethGlobalData = { ...yethFeed, generatedAt: yethFeed.generatedAt + 60 };
    rerender();
    expect(result.current.styfi).toBe(initial.styfi);
    expect(result.current.veyfi).toBe(initial.veyfi);
    expect(result.current.yeth).not.toBe(initial.yeth);
    await readChainTimes();
    expect(rpcClient.getBlock).toHaveBeenCalledTimes(2);

    const yeth = result.current.yeth;
    state.globalData = {
      ...globalFeed,
      styfi: { ...globalFeed.styfi, current: { ...globalFeed.styfi.current, aprBps: 123 } },
    };
    rerender();
    expect(result.current.styfi).not.toBe(initial.styfi);
    expect(result.current.veyfi).not.toBe(initial.veyfi);
    expect(result.current.yeth).toBe(yeth);
    await readChainTimes();
    expect(rpcClient.getBlock).toHaveBeenCalledTimes(4);
    expect(await result.current.styfi.getApy()).toBe(123n);
  });

  it("retains yETH fallback balances across stats updates and resets them for a new yETH feed", async () => {
    state.globalData = globalFeed;
    state.yethGlobalData = yethFeed;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rpcClient.multicall.mockResolvedValueOnce([
      { status: "success", result: 100n },
      { status: "success", result: 10n ** 18n },
      { status: "success", result: 50n },
    ]);
    const { result, rerender } = await renderProtocol();
    const yeth = result.current.yeth;
    const lastKnown = await yeth.getAccountState(account);
    expect(lastKnown).toMatchObject({ claimableNowEth: 100n, recoveryVaultShares: 50n });

    rpcClient.multicall.mockRejectedValue(new Error("RPC unavailable"));
    state.globalData = { ...globalFeed, meta: { ...globalFeed.meta, timestamp: globalFeed.meta.timestamp + 60 } };
    rerender();
    expect(result.current.yeth).toBe(yeth);
    expect(await result.current.yeth.getAccountState(account)).toBe(lastKnown);

    state.yethGlobalData = { ...yethFeed, generatedAt: yethFeed.generatedAt + 60 };
    rerender();
    expect(result.current.yeth).not.toBe(yeth);
    expect(await result.current.yeth.getAccountState(account)).toMatchObject({
      snapshotLossEth: 0n, claimableNowEth: 0n, recoveryVaultShares: 0n,
    });
  });

  it("replaces clients only when a wallet or RPC change alters their usable public client", async () => {
    state.wallet = null;
    const { result, rerender } = await renderProtocol();
    const disconnected = clients(result.current);

    state.wallet = { chain: { id: 10 } };
    state.rpc = { ...rpcClient };
    rerender();
    clients(result.current).forEach((client, i) => expect(client).toBe(disconnected[i]));
    expect(result.current.mainnetPublicClient).toBe(state.rpc);

    state.wallet = { chain: { id: 1 } };
    rerender();
    clients(result.current).forEach((client, i) => expect(client).not.toBe(disconnected[i]));
    const connected = clients(result.current);

    state.wallet = { chain: { id: 1 } };
    rerender();
    clients(result.current).forEach((client, i) => expect(client).toBe(connected[i]));

    state.rpc = { ...rpcClient };
    rerender();
    clients(result.current).forEach((client, i) => expect(client).not.toBe(connected[i]));
    const replacedRpc = clients(result.current);

    state.wallet = { chain: { id: 10 } };
    rerender();
    clients(result.current).forEach((client, i) => expect(client).not.toBe(replacedRpc[i]));
    expect(result.current.publicClient).toBeNull();
  });

  it.each(["NEXT_PUBLIC_USE_MOCKS", "NEXT_PUBLIC_E2E"] as const)(
    "keeps mock instances and hides live inputs when %s is enabled",
    async (flag) => {
      vi.stubEnv(flag, "true");
      const { result, rerender } = await renderProtocol();
      const mocks = clients(result.current);

      state.globalData = globalFeed;
      state.yethGlobalData = yethFeed;
      state.rpc = { ...rpcClient };
      state.wallet = { chain: { id: 10 } };
      rerender();
      clients(result.current).forEach((client, i) => expect(client).toBe(mocks[i]));
      expect(result.current).toMatchObject({
        isMock: true, usesMockBackend: true, publicClient: null,
        mainnetPublicClient: null, globalData: null, yethGlobalData: null,
      });

      vi.stubEnv(flag, "false");
      rerender();
      clients(result.current).forEach((client, i) => expect(client).not.toBe(mocks[i]));
      expect(result.current.isMock).toBe(false);

      vi.stubEnv(flag, "true");
      rerender();
      clients(result.current).forEach((client, i) => expect(client).toBe(mocks[i]));
      expect(rpcClient.multicall).not.toHaveBeenCalled();
      expect(rpcClient.getBlock).not.toHaveBeenCalled();
    }
  );
});
