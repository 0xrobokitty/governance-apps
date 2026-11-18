// Domain tests own preflight and simulation; shared wallet tracking has separate integration coverage.
vi.mock("@/lib/tx/tracked-write", () => ({ trackedContractWrite: (_request: unknown, send: () => Promise<unknown>) => send() }));

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import feedExample from "@/docs/apps/teams/onchain-integration-plan/examples/teams-feed.example.json";
import { TEAMS_MAINNET_DEPLOYMENT } from "@/lib/clients/teams";
import {
  teamsKeys,
  useTeamsState,
} from "@/lib/hooks/useTeams";

const ADVANCED_BLOCK_HASH =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

const { accountState, authorityState, mainnetPublicClient } = vi.hoisted(() => ({
  accountState: {
    current: {
      address: undefined as `0x${string}` | undefined,
      chainId: undefined as number | undefined,
    },
  },
  authorityState: {
    gate: null as Promise<void> | null,
  },
  mainnetPublicClient: {
    chain: { id: 1 },
    getBlock: vi.fn(),
    getBlockNumber: vi.fn(),
    getChainId: vi.fn(),
    readContract: vi.fn(),
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => accountState.current,
}));

vi.mock("@/state/protocol", () => ({
  useOptionalProtocol: () => ({
    mainnetPublicClient,
    publicClient: null,
    teamsUsesMockBackend: false,
  }),
}));

describe("useTeamsState canonical feed trust", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountState.current = {
      address: undefined,
      chainId: undefined,
    };
    authorityState.gate = null;
    mainnetPublicClient.getBlock.mockResolvedValue({
      hash: feedExample.blockHash,
      timestamp: BigInt(Math.floor(Date.now() / 1_000)),
    });
    mainnetPublicClient.getBlockNumber.mockResolvedValue(
      BigInt(feedExample.blockNumber)
    );
    mainnetPublicClient.getChainId.mockResolvedValue(1);
    mainnetPublicClient.readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) => {
        if (authorityState.gate) {
          await authorityState.gate;
        }
        switch (functionName) {
          case "num_teams":
            return BigInt(feedExample.events.teamCount);
          case "implementation":
            return TEAMS_MAINNET_DEPLOYMENT.teamImplementation;
          case "revenue_recipient":
            return TEAMS_MAINNET_DEPLOYMENT.revenueRecipient;
          case "funding_distributor":
            return TEAMS_MAINNET_DEPLOYMENT.fundingDistributor;
          default:
            throw new Error(`Unexpected read: ${functionName}`);
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains verified data and write-time validation after a failed refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okResponse(feedExample))
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
    );
    const queryClient = createTestQueryClient();
    const { result, unmount } = renderHook(() => useTeamsState(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data?.backend).toBe("feed");
      expect(result.current.readStatus).toBe("current");
      expect(result.current.writeFeed).not.toBeNull();
    });
    const trustedFeed = result.current.data?.feed;
    const trustedTeams = result.current.data?.data.teams;
    const trustedActivation = queryClient.getQueryData<{
      activationId: number;
    }>(teamsKeys.feed())?.activationId;

    await act(async () => {
      await queryClient.refetchQueries({
        exact: true,
        queryKey: teamsKeys.feed(),
      });
    });

    await waitFor(() => {
      expect(result.current.readStatus).toBe("stale");
      expect(result.current.warning?.message).toMatch(/status 503/i);
    });
    expect(result.current.data?.feed).toBe(trustedFeed);
    expect(result.current.data?.data.teams).toEqual(trustedTeams);
    expect(
      queryClient.getQueryData<{ activationId: number }>(
        teamsKeys.feed()
      )?.activationId
    ).toBe(trustedActivation);
    expect(
      result.current.data?.data.viewer.actionStateTrusted
    ).toBe(true);
    expect(result.current.writeFeed).toBe(trustedFeed);

    unmount();
  });

  it("accepts an old canonical snapshot without using age as authorization", async () => {
    mainnetPublicClient.getBlock.mockResolvedValue({
      hash: feedExample.blockHash,
      timestamp: BigInt(Math.floor(Date.now() / 1_000) - 86_400),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse(feedExample))
    );
    const { result } = renderHook(() => useTeamsState(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.data.teams).toHaveLength(1);
      expect(result.current.readStatus).toBe("current");
    });
    expect(result.current.warning).toBeNull();
    expect(
      result.current.data?.data.viewer.actionStateTrusted
    ).toBe(true);
    expect(result.current.writeFeed).not.toBeNull();
  });

  it("does not reuse cached authority for same-block mutable feed changes", async () => {
    const mutatedFeed = {
      ...feedExample,
      teams: [
        {
          ...feedExample.teams[0]!,
          owner: "0x9999999999999999999999999999999999999999",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okResponse(feedExample))
        .mockResolvedValueOnce(okResponse(mutatedFeed))
    );
    const { result } = renderHook(() => useTeamsState(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.readStatus).toBe("current");
      expect(result.current.writeFeed).not.toBeNull();
    });

    let releaseAuthority: () => void = () => {};
    authorityState.gate = new Promise<void>((resolve) => {
      releaseAuthority = resolve;
    });
    act(() => {
      void result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data?.feed?.teams[0]?.owner).toBe(
        feedExample.teams[0]!.owner
      );
      expect(result.current.readStatus).toBe("stale");
      expect(result.current.writeFeed).toBeNull();
    });

    releaseAuthority();
    authorityState.gate = null;
  });

  it("pauses actions while a same-URL v1-to-v2 activation is verified", async () => {
    const correctedButUnitlessV1 = {
      ...feedExample,
      version: 1 as const,
      units: undefined,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse(correctedButUnitlessV1))
      .mockResolvedValueOnce(okResponse(feedExample));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useTeamsState(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.readStatus).toBe("current");
      expect(result.current.data?.feed?.version).toBe(1);
      expect(result.current.data?.data.financialData.status).toBe(
        "unavailable"
      );
      expect(result.current.writeFeed).not.toBeNull();
    });

    let releaseAuthority: () => void = () => {};
    authorityState.gate = new Promise<void>((resolve) => {
      releaseAuthority = resolve;
    });
    act(() => {
      void result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data?.feed?.version).toBe(1);
      expect(result.current.data?.data.financialData.status).toBe(
        "unavailable"
      );
      expect(result.current.readStatus).toBe("stale");
      expect(result.current.writeFeed).toBeNull();
    });

    await act(async () => {
      releaseAuthority();
    });
    authorityState.gate = null;
    await waitFor(() => {
      expect(result.current.data?.feed?.version).toBe(2);
      expect(result.current.data?.data.financialData.status).toBe(
        "available"
      );
      expect(result.current.readStatus).toBe("current");
      expect(result.current.writeFeed?.version).toBe(2);
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/teams-data",
      {
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/teams-data",
      {
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }
    );
  });

  it("reverifies every same-block A to B to A to B activation", async () => {
    const originalOwner = feedExample.teams[0]!.owner;
    const mutatedOwner =
      "0x9999999999999999999999999999999999999999";
    const mutatedFeed = {
      ...feedExample,
      teams: [
        {
          ...feedExample.teams[0]!,
          owner: mutatedOwner,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okResponse(feedExample))
        .mockResolvedValueOnce(okResponse(mutatedFeed))
        .mockResolvedValueOnce(okResponse(feedExample))
        .mockResolvedValueOnce(okResponse(mutatedFeed))
    );
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useTeamsState(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.readStatus).toBe("current");
      expect(result.current.data?.feed?.teams[0]?.owner).toBe(
        originalOwner
      );
    });
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => {
      expect(result.current.readStatus).toBe("current");
      expect(result.current.data?.feed?.teams[0]?.owner).toBe(
        mutatedOwner
      );
    });

    await act(async () => {
      await queryClient.refetchQueries({
        exact: true,
        queryKey: teamsKeys.feed(),
      });
    });
    await waitFor(() => {
      expect(result.current.readStatus).toBe("current");
      expect(result.current.data?.feed?.teams[0]?.owner).toBe(
        originalOwner
      );
    });

    const contractReadsBeforeFinalActivation =
      mainnetPublicClient.readContract.mock.calls.length;
    let releaseAuthority: () => void = () => {};
    authorityState.gate = new Promise<void>((resolve) => {
      releaseAuthority = resolve;
    });
    await act(async () => {
      await queryClient.refetchQueries({
        exact: true,
        queryKey: teamsKeys.feed(),
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(
        mainnetPublicClient.readContract.mock.calls.length
      ).toBeGreaterThan(contractReadsBeforeFinalActivation);
      expect(result.current.data?.feed?.teams[0]?.owner).toBe(
        originalOwner
      );
      expect(result.current.readStatus).toBe("stale");
      expect(result.current.writeFeed).toBeNull();
    });

    await act(async () => {
      releaseAuthority();
    });
    authorityState.gate = null;
    await waitFor(() => {
      expect(result.current.readStatus).toBe("current");
      expect(result.current.data?.feed?.teams[0]?.owner).toBe(
        mutatedOwner
      );
      expect(result.current.writeFeed).not.toBeNull();
    });
  });

  it("reverifies A to B to A activation and rejects the deep replay", async () => {
    const advancedFeed = {
      ...feedExample,
      blockNumber: feedExample.blockNumber + 10,
      blockHash: ADVANCED_BLOCK_HASH,
    };
    mainnetPublicClient.getBlock.mockImplementation(
      async ({ blockNumber }: { blockNumber: bigint }) => ({
        hash:
          blockNumber === BigInt(feedExample.blockNumber)
            ? feedExample.blockHash
            : ADVANCED_BLOCK_HASH,
        timestamp: BigInt(Math.floor(Date.now() / 1_000)),
      })
    );
    mainnetPublicClient.getBlockNumber.mockResolvedValue(
      BigInt(advancedFeed.blockNumber)
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okResponse(feedExample))
        .mockResolvedValueOnce(okResponse(advancedFeed))
        .mockResolvedValueOnce(okResponse(feedExample))
    );
    const { result } = renderHook(() => useTeamsState(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.readStatus).toBe("current");
      expect(result.current.data?.feed?.blockNumber).toBe(
        feedExample.blockNumber
      );
    });
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => {
      expect(result.current.readStatus).toBe("current");
      expect(result.current.data?.feed?.blockNumber).toBe(
        advancedFeed.blockNumber
      );
    });

    const blockReadsBeforeReplay =
      mainnetPublicClient.getBlock.mock.calls.length;
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.readStatus).toBe("stale");
      expect(result.current.warning?.message).toMatch(/rolled back/i);
    });
    expect(result.current.data?.feed?.blockNumber).toBe(
      advancedFeed.blockNumber
    );
    expect(result.current.writeFeed).toBeNull();
    expect(mainnetPublicClient.getBlock.mock.calls.length).toBeGreaterThan(
      blockReadsBeforeReplay
    );
  });

  it("retains the rollback baseline after the route remounts", async () => {
    const advanced = { ...feedExample, blockNumber: feedExample.blockNumber + 10, blockHash: ADVANCED_BLOCK_HASH };
    mainnetPublicClient.getBlock.mockImplementation(async ({ blockNumber }: { blockNumber: bigint }) => ({
      hash: blockNumber === BigInt(feedExample.blockNumber) ? feedExample.blockHash : ADVANCED_BLOCK_HASH,
      timestamp: BigInt(Math.floor(Date.now() / 1_000)),
    }));
    mainnetPublicClient.getBlockNumber.mockResolvedValue(BigInt(advanced.blockNumber));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(okResponse(advanced)).mockResolvedValueOnce(okResponse(feedExample)));
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const first = renderHook(useTeamsState, { wrapper });
    await waitFor(() => expect(first.result.current.writeFeed?.blockNumber).toBe(advanced.blockNumber));
    first.unmount();
    const second = renderHook(useTeamsState, { wrapper });
    await act(async () => { await second.result.current.refetch(); });
    await waitFor(() => expect(second.result.current.warning?.message).toMatch(/rolled back/i));
    expect(second.result.current.data?.feed?.blockNumber).toBe(advanced.blockNumber);
    expect(second.result.current.writeFeed).toBeNull();
  });

  it("verifies disconnected viewers with the account-independent mainnet client", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse(feedExample))
    );
    const { result } = renderHook(() => useTeamsState(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.readStatus).toBe("current");
      expect(result.current.data?.data.teams).toHaveLength(1);
    });
    expect(mainnetPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TEAMS_MAINNET_DEPLOYMENT.teamRegistry,
        blockNumber: BigInt(feedExample.blockNumber),
      })
    );
  });
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createQueryWrapper(
  queryClient = createTestQueryClient()
) {

  return function QueryWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

function okResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
