import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEther, type Address } from "viem";
import type { RecoveryController } from "@/app/yeth/RecoveryPreviewClient";
import type { RecoveryAccountState, RecoveryActionReceipt } from "@/lib/clients/yeth/recovery/onchain";
import type { RecoveryChainObservation } from "@/lib/clients/yeth/recovery/feed-adapter";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import { RecoveryLiveClient } from "@/app/yeth/RecoveryLiveClient";

type Actions = {
  accountQuery: {
    data: RecoveryAccountState; error: Error | null;
    refetch: ReturnType<typeof vi.fn>;
  };
  receipt: RecoveryActionReceipt | null;
  pending: { id: string } | null;
  completion: RecoveryController["completion"];
  refreshPending: ReturnType<typeof vi.fn>;
  wrongChain: boolean;
  environment: { fork: boolean; chainId: number };
  tx: { state: { status: "idle" }; reset: ReturnType<typeof vi.fn> };
  take: ReturnType<typeof vi.fn>;
  redeem: ReturnType<typeof vi.fn>;
  approve: ReturnType<typeof vi.fn>;
  resetAllowance: ReturnType<typeof vi.fn>;
};
const harness = vi.hoisted(() => ({
  account: { address: "0x1111111111111111111111111111111111111111" as Address, chainId: 1 },
  actions: null as Actions | null,
  controller: null as RecoveryController | null,
  build: vi.fn(),
}));
vi.mock("wagmi", () => ({ useAccount: () => harness.account }));
vi.mock("@/web3/wallet-ui", () => ({
  useAccountModal: () => ({}), useChainModal: () => ({}), useConnectModal: () => ({}),
}));
vi.mock("@/lib/hooks/useYethRecovery", () => ({
  useYethRecovery: () => ({
    data: { head: { indexedThrough: { number: "100" } } },
    now: 1800000000, error: null, refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/useYethRecoveryActions", () => ({
  useYethRecoveryActions: () => harness.actions,
}));
vi.mock("@/lib/hooks/useYethRecoveryExit", () => ({
  useYethRecoveryExit: () => ({ state: { phase: "idle" }, start: vi.fn(), continue: vi.fn(), pause: vi.fn() }),
}));
vi.mock("@/lib/clients/yeth/recovery/feed", () => ({
  buildRecoverySnapshot: (...args: unknown[]) => harness.build(...args),
}));
vi.mock("@/app/yeth/RecoveryPreviewClient", () => ({
  RecoveryDashboard: ({ controller }: { controller: RecoveryController }) => {
    harness.controller = controller;
    return null;
  },
}));

const NOW = 1800000000;
const state = (): RecoveryAccountState => ({
  address: harness.account.address, chainId: 1, blockNumber: 100n,
  blockHash: ("0x" + "11".repeat(32)) as `0x${string}`, blockTimestamp: NOW,
  shares: parseEther("10"), allowance: 0n, wethBalance: 0n,
  maxRedeem: parseEther("10"), directAssets: parseEther("5"),
  vaultPps: parseEther(".5"), recoveryRate: parseEther(".32"),
  auctionPrice: parseEther(".8"),
  positionTransfersSinceIndexed: false,
  auction: {
    kickedAt: NOW - 100, initialWeth: parseEther("20"),
    remainingWeth: parseEther("20"), startingPrice: parseEther("20"),
    minimumPrice: parseEther(".32"), stepDuration: 225, stepDecayBps: 4, length: 604800,
  },
});
const receipt = (remainingShares = parseEther("6")): RecoveryActionReceipt => ({
  hash: ("0x" + "22".repeat(32)) as `0x${string}`, blockNumber: 101n,
  wethReceived: parseEther("5"), sharesSpent: parseEther("4"), remainingShares,
});
const controller = () => {
  if (!harness.controller) throw new Error("The dashboard controller was not rendered");
  return harness.controller;
};
const actions = () => {
  if (!harness.actions) throw new Error("The action hooks were not initialized");
  return harness.actions;
};
const review = async () => {
  let result: Awaited<ReturnType<NonNullable<RecoveryController["reviewAuction"]>>> | undefined;
  await act(async () => {
    result = await controller().reviewAuction!(parseEther("10"), parseEther("8"), NOW - 100);
  });
  return result!;
};

beforeEach(() => {
  vi.clearAllMocks();
  harness.account = { address: "0x1111111111111111111111111111111111111111", chainId: 1 };
  harness.controller = null;
  const chain = state();
  harness.actions = {
    accountQuery: { data: chain, error: null, refetch: vi.fn().mockResolvedValue({ data: chain, error: null }) },
    receipt: null, pending: null, completion: null, refreshPending: vi.fn(), wrongChain: false, environment: { fork: false, chainId: 1 },
    tx: { state: { status: "idle" }, reset: vi.fn() },
    take: vi.fn().mockResolvedValue(receipt()), redeem: vi.fn().mockResolvedValue(receipt(0n)),
    approve: vi.fn().mockResolvedValue(undefined), resetAllowance: vi.fn().mockResolvedValue(undefined),
  };
  harness.build.mockImplementation((_data: unknown, options: { now: number; address?: string; chain?: RecoveryChainObservation }) => {
    const base = new MockRecoveryPreviewClient(() => NOW).getSnapshot();
    const chainFresh = !!options.chain && options.chain.blockTimestamp > NOW - 60;
    return {
      ...base, connected: !!options.address, now: options.now,
      shares: options.chain?.shares ?? 0n, asOf: options.chain?.blockTimestamp ?? NOW,
      live: {
        principalKnown: false, principalUnavailableReason: null,
        historyCurrent: true, feedFresh: true, chainFresh,
        chainAsOf: options.chain?.blockTimestamp ?? null, feedAsOf: NOW, indexedAt: NOW - 12,
        directAssets: chainFresh ? options.chain?.directAssets ?? null : null,
        maxRedeem: chainFresh ? options.chain?.maxRedeem ?? null : null,
        targetAssetsPerShare: parseEther("3"), dailyAssetsPerShareGrowth: null,
        publicReferenceRecovery: .34, measuredPerformance: [], ppsHistory: [],
        fundingTotals: null, holderDataCurrent: true, holderPrincipalCurrent: true, programmeCurrent: true, producerVersion: "0.10.0",
      },
    };
  });
});

describe("live recovery controller transaction boundaries", () => {
  it("does not authorize exits from a cached balance after its refresh fails", () => {
    const view = render(<RecoveryLiveClient />);
    expect(controller().canTransact).toBe(true);
    actions().accountQuery.error = new Error("RPC unavailable");
    view.rerender(<RecoveryLiveClient />);
    expect(controller().canTransact).toBe(false);
    expect(controller().snapshot?.live?.chainFresh).toBe(false);
    actions().accountQuery.error = null;
    view.rerender(<RecoveryLiveClient />);
    expect(controller().canTransact).toBe(true);
  });

  it("keeps queued auction execution pending without inventing a payout or redeeming", async () => {
    const view = render(<RecoveryLiveClient />);
    const accepted = await review();
    actions().take.mockResolvedValue(null);
    const result = await controller().take(accepted.weth, accepted.shares, accepted.round, "complete");
    expect(result).toBeNull();
    expect(actions().take).toHaveBeenCalledWith(expect.anything(), "complete");
    expect(actions().redeem).not.toHaveBeenCalled();
    actions().pending = { id: "safe-proposal" };
    view.rerender(<RecoveryLiveClient />);
    expect(controller().canTransact).toBe(false);
  });

  it("does not report a queued redemption as confirmed", async () => {
    render(<RecoveryLiveClient />);
    actions().redeem.mockResolvedValue(null);
    expect(await controller().redeem(parseEther("10"))).toBe(false);
  });


  it("retains the confirmed auction payout and remaining shares when the post-take refresh fails", async () => {
    const view = render(<RecoveryLiveClient />);
    const accepted = await review();
    const confirmed = receipt();
    actions().take.mockResolvedValue(confirmed);
    actions().accountQuery.refetch.mockResolvedValue({ data: actions().accountQuery.data, error: new Error("RPC unavailable") });
    let result: Awaited<ReturnType<RecoveryController["take"]>> = null;
    await act(async () => {
      result = await controller().take(accepted.weth, accepted.shares, accepted.round);
    });
    expect(result).toMatchObject({ received: confirmed.wethReceived, hash: confirmed.hash });
    expect(result!.snapshot.shares).toBe(confirmed.remainingShares);
    expect(result!.snapshot.live?.chainFresh).toBe(false);
    await expect(controller().take(accepted.weth, accepted.shares, accepted.round)).rejects.toThrow();
    expect(actions().take).toHaveBeenCalledTimes(1);
    actions().receipt = confirmed;
    view.rerender(<RecoveryLiveClient />);
    expect(controller().snapshot?.shares).toBe(confirmed.remainingShares);
    expect(controller().canTransact).toBe(false);
  });

  it("does not invent a remaining exit after a full fill followed by a cached pre-receipt read", async () => {
    const view = render(<RecoveryLiveClient />);
    const accepted = await review();
    const confirmed = receipt(0n);
    actions().take.mockResolvedValue(confirmed);
    let result: Awaited<ReturnType<RecoveryController["take"]>> = null;
    await act(async () => {
      result = await controller().take(accepted.weth, accepted.shares, accepted.round);
    });
    expect(result!.snapshot.shares).toBe(0n);
    expect(result!.snapshot.live?.chainFresh).toBe(false);
    actions().receipt = confirmed;
    view.rerender(<RecoveryLiveClient />);
    expect(controller().snapshot?.shares).toBe(0n);
    expect(controller().canTransact).toBe(false);
    actions().accountQuery.data = { ...actions().accountQuery.data, blockNumber: 102n, shares: 0n };
    view.rerender(<RecoveryLiveClient />);
    expect(controller().snapshot?.live?.chainFresh).toBe(true);
  });

  it("submits the final reduced output while preserving the originally reviewed share cap", async () => {
    render(<RecoveryLiveClient />);
    const accepted = await review();
    await act(async () => {
      await controller().approve(accepted.shares);
      await controller().take(parseEther("5"), accepted.shares, accepted.round);
    });
    expect(actions().approve).toHaveBeenCalledWith(expect.objectContaining({ requestedWeth: parseEther("10"), maxShares: parseEther("8") }));
    expect(actions().take).toHaveBeenCalledWith(expect.objectContaining({ requestedWeth: parseEther("5"), maxShares: parseEther("8") }), undefined);
  });

  it("rejects output enlargement, zero output, or a changed approval scope before a wallet action", async () => {
    render(<RecoveryLiveClient />);
    const accepted = await review();
    await expect(controller().take(accepted.weth + 1n, accepted.shares, accepted.round)).rejects.toThrow();
    await expect(controller().take(0n, accepted.shares, accepted.round)).rejects.toThrow();
    await expect(controller().take(accepted.weth, accepted.shares + 1n, accepted.round)).rejects.toThrow();
    expect(() => controller().approve(accepted.shares + 1n)).toThrow();
    expect(actions().take).not.toHaveBeenCalled();
    expect(actions().approve).not.toHaveBeenCalled();
  });

  it.each(["account", "chain"] as const)("discards the reviewed quote after a %s switch", async (changed) => {
    const view = render(<RecoveryLiveClient />);
    const accepted = await review();
    if (changed === "account") harness.account.address = "0x2222222222222222222222222222222222222222";
    else harness.account.chainId = 31337;
    view.rerender(<RecoveryLiveClient />);
    await expect(controller().take(accepted.weth, accepted.shares, accepted.round)).rejects.toThrow();
    expect(() => controller().approve(accepted.shares)).toThrow();
    expect(actions().take).not.toHaveBeenCalled();
    expect(actions().approve).not.toHaveBeenCalled();
  });
  it("hides a cached receipt after switching away from the recovery network", () => {
    const confirmed=receipt(0n);
    actions().completion={status:"confirmed",action:"redeem",hash:confirmed.hash,receipt:confirmed};
    const view=render(<RecoveryLiveClient />);
    expect(controller().completion?.receipt).toEqual(confirmed);
    harness.account.chainId=31337;
    actions().wrongChain=true;
    view.rerender(<RecoveryLiveClient />);
    expect(controller().completion).toBeNull();
    expect(controller().canTransact).toBe(false);
  });

});
