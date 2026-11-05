import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BaseError, UserRejectedRequestError, parseEther, type Hash } from "viem";
import { createRecoveryActionQuote, type RecoveryAccountState } from "@/lib/clients/yeth/recovery/onchain";
import type { RecoveryCompletion, RecoveryPending } from "@/lib/clients/yeth/recovery/pending";
import type { RecoveryExitStep, RecoveryExitWallet } from "@/lib/hooks/useYethRecoveryActions";
import { useYethRecoveryExit } from "@/lib/hooks/useYethRecoveryExit";

const E = parseEther;
const address = "0x1111111111111111111111111111111111111111";
const hash = ("0x" + "ab".repeat(32)) as Hash;
type Actions = Parameters<typeof useYethRecoveryExit>[0];
function fixture(connectorId = "injected") {
  let wallet: RecoveryExitWallet = { address, chainId: 1, connectorId };
  const chain: RecoveryAccountState = {
    address, chainId: 1, blockNumber: 100n, blockHash: hash, blockTimestamp: 1000,
    shares: E("10"), allowance: 0n, wethBalance: 0n, maxRedeem: E("100"),
    directAssets: E("5"), vaultPps: E(".5"), recoveryRate: E(".32"), auctionPrice: E(".8"),
    auction: { kickedAt: 900, initialWeth: E("1"), remainingWeth: E("1"), startingPrice: E("20"), minimumPrice: E(".32"), stepDuration: 225, stepDecayBps: 4, length: 604800 },
  };
  let pending: RecoveryPending | null = null;
  let completion: RecoveryCompletion | null = null;
  let serial = 0;
  const record = (step: RecoveryExitStep): RecoveryPending => ({
    version: 1, id: "step-" + ++serial, account: step.wallet.address, chainId: 1, connectorId,
    kind: connectorId === "safe" ? "safe" : "transaction", action: step.action,
    status: "mining", submissionHash: hash, createdAt: 1000, submittedBlock: "100",
    maxShares: step.maxShares.toString(), requestedWeth: step.quote?.requestedWeth.toString(),
    exitMode: step.mode, exitOriginalShares: step.originalShares.toString(), exitSequenceId: step.sequenceId,
  });
  const execute = async (step: RecoveryExitStep, prior?: RecoveryPending) => {
    if (!prior && step.shouldContinue && !step.shouldContinue()) throw new Error("paused");
    const intent = prior ?? record(step);
    chain.blockNumber++;
    if (step.action === "reset") chain.allowance = 0n;
    if (step.action === "approve") chain.allowance = step.maxShares;
    const sharesSpent = step.action === "take" ? step.quote!.requestedWeth * chain.auctionPrice / E("1") : step.action === "redeem" ? step.maxShares : 0n;
    const wethReceived = step.action === "take" ? step.quote!.requestedWeth : sharesSpent / 2n;
    chain.shares -= sharesSpent;
    if (step.action === "take") chain.allowance -= sharesSpent;
    completion = {
      id: intent.id, account: address, chainId: 1, action: step.action, status: "confirmed",
      hash, intent, createdAt: 1001, exitMode: step.mode, verified: true,
      receipt: sharesSpent > 0n ? { hash, blockNumber: chain.blockNumber, sharesSpent, wethReceived, remainingShares: chain.shares } : undefined,
    };
    return completion;
  };
  const actions = {
    getExitWallet: vi.fn(() => wallet),
    readExitAccount: vi.fn(async (expected: RecoveryExitWallet, minimumBlock?: bigint) => {
      if (expected.address !== wallet.address || expected.connectorId !== wallet.connectorId || expected.chainId !== wallet.chainId) throw new Error("wallet changed");
      if (minimumBlock && chain.blockNumber < minimumBlock) throw new Error("still updating");
      return { ...chain, auction: chain.auction ? { ...chain.auction } : null };
    }),
    getExitPending: vi.fn(() => pending),
    getExitCompletion: vi.fn(() => completion),
    submitExitStep: vi.fn<(step: RecoveryExitStep) => Promise<RecoveryCompletion | null>>(execute),
    refreshPending: vi.fn(async () => null),
    pending: null as RecoveryPending | null,
    completion: null as RecoveryCompletion | null,
  } satisfies Actions;
  return {
    chain, actions, execute, record,
    request: () => ({ quote: createRecoveryActionQuote(chain), originalShares: E("10"), mode: "complete" as const }),
    wallet: (next: typeof wallet) => { wallet = next; },
    setPending: (value: RecoveryPending | null) => { pending = value; actions.pending = value; },
    setCompletion: (value: RecoveryCompletion | null) => { completion = value; actions.completion = value; },
  };
}
describe("one-consent recovery exit sequence", () => {
  it.each(["injected", "delegated"])("runs approval, auction and bounded remainder with one start (%s)", async connector => {
    const f = fixture(connector);
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(f.actions.submitExitStep.mock.calls.map(([step]) => step.action)).toEqual(["approve", "take", "redeem"]);
    expect(f.actions.submitExitStep.mock.calls[2][0].maxShares).toBe(E("9.2"));
    expect(result.current.state).toMatchObject({ phase: "complete", receivedWeth: E("5.6"), remainingShares: 0n });
  });

  it("cannot resume a completed sequence against later incoming shares", async () => {
    const f = fixture();
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    f.chain.shares += E("5");
    act(() => result.current.pause());
    await act(() => result.current.continue());
    expect(result.current.state.phase).toBe("complete");
    expect(f.actions.submitExitStep).toHaveBeenCalledTimes(3);
    expect(f.chain.shares).toBe(E("5"));
  });

  it("runs a direct vault exit without approval or auction", async () => {
    const f = fixture();
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start({ mode: "complete", originalShares: E("10") }));
    expect(f.actions.submitExitStep.mock.calls.map(([step]) => step.action)).toEqual(["redeem"]);
  });

  it("resets an excessive allowance before bounded approval", async () => {
    const f = fixture();
    f.chain.allowance = E("30");
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(f.actions.submitExitStep.mock.calls.map(([step]) => step.action)).toEqual(["reset", "approve", "take", "redeem"]);
  });

  it("auction-only consent never starts a vault redemption", async () => {
    const f = fixture();
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start({ ...f.request(), mode: "auction" }));
    expect(f.actions.submitExitStep.mock.calls.map(([step]) => step.action)).toEqual(["approve", "take"]);
    expect(result.current.state.phase).toBe("complete");
  });

  it("does not redeem shares received after the original consent", async () => {
    const f = fixture();
    f.actions.submitExitStep.mockImplementation(async step => {
      if (step.action === "take") f.chain.shares += E("5");
      return f.execute(step);
    });
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(f.actions.submitExitStep.mock.calls[2][0].maxShares).toBe(E("9.2"));
    expect(f.chain.shares).toBe(E("5"));
  });

  it("renders a raw viem wallet rejection as a concise cancelled pause", async () => {
    const f = fixture();
    const error = new BaseError("User rejected the request.", {
      cause: new UserRejectedRequestError(new Error("User rejected the request")),
      metaMessages: ["Request Arguments: chain: Ethereum from: " + address, "Contract Call: redeem(uint256,address,address)"],
      docsPath: "/docs/contract/writeContract",
    });
    expect(error.message).toContain("Request Arguments");
    f.actions.submitExitStep.mockImplementation(async step => {
      if (step.action === "redeem") throw error;
      return f.execute(step);
    });
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(result.current.state).toMatchObject({ phase: "paused", error: "Transaction cancelled.", canContinue: true, receivedWeth: E("1") });
    expect(f.actions.submitExitStep.mock.calls.map(([step]) => step.action)).toEqual(["approve", "take", "redeem"]);
  });

  it("preserves a known domain explanation but hides unknown provider diagnostics", async () => {
    const f = fixture();
    f.actions.readExitAccount.mockRejectedValueOnce(new Error("Your wallet or network changed. Continue from the original wallet."));
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(result.current.state.error).toBe("Your wallet or network changed. Continue from the original wallet.");
    f.actions.readExitAccount.mockRejectedValueOnce(new Error("An unknown error occurred.\nRequest Arguments: data: 0x1234\nDocs: provider.example\nVersion: 42"));
    await act(() => result.current.continue());
    expect(result.current.state.error).toBe("Exit paused. Check your wallet before continuing.");
    expect(f.actions.submitExitStep).not.toHaveBeenCalled();
  });

  it("pauses a rejected second signature and resumes without repeating the auction", async () => {
    const f = fixture();
    let rejected = false;
    f.actions.submitExitStep.mockImplementation(async step => {
      if (step.action === "redeem" && !rejected) { rejected = true; throw new Error("User rejected"); }
      return f.execute(step);
    });
    const { result, rerender } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(result.current.state).toMatchObject({ phase: "paused", receivedWeth: E("1"), canContinue: true });
    rerender();
    expect(f.actions.submitExitStep).toHaveBeenCalledTimes(3);
    await act(() => result.current.continue());
    expect(f.actions.submitExitStep.mock.calls.map(([step]) => step.action)).toEqual(["approve", "take", "redeem", "redeem"]);
    expect(result.current.state.phase).toBe("complete");
  });

  it("advances each delayed Safe step only after its matching canonical completion", async () => {
    const f = fixture("safe");
    let waiting: RecoveryExitStep | undefined;
    f.actions.submitExitStep.mockImplementation(async step => {
      waiting = step;
      f.setPending(f.record(step));
      return null;
    });
    const { result, rerender } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(result.current.state.phase).toBe("awaiting");
    expect(f.actions.submitExitStep).toHaveBeenCalledTimes(1);
    for (const action of ["approve", "take", "redeem"]) {
      expect(waiting?.action).toBe(action);
      await act(async () => {
        f.setCompletion(await f.execute(waiting!, f.actions.pending!));
        f.setPending(null);
        rerender();
      });
      await waitFor(() => expect(result.current.state.phase).toBe(action === "redeem" ? "complete" : "awaiting"));
      rerender();
    }
    expect(f.actions.submitExitStep.mock.calls.map(([step]) => step.action)).toEqual(["approve", "take", "redeem"]);
  });

  it("restores verified full-exit progress paused and needs a Continue gesture", async () => {
    const f = fixture("safe");
    const step: RecoveryExitStep = { action: "take", maxShares: E(".8"), quote: f.request().quote, mode: "complete", originalShares: E("10"), sequenceId: "restore", wallet: f.actions.getExitWallet() };
    f.setCompletion(await f.execute(step));
    f.chain.shares += E("4");
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await waitFor(() => expect(result.current.state.phase).toBe("paused"));
    expect(f.actions.submitExitStep).not.toHaveBeenCalled();
    await act(() => result.current.continue());
    expect(f.actions.submitExitStep).toHaveBeenCalledOnce();
    expect(f.actions.submitExitStep.mock.calls[0][0].maxShares).toBe(E("9.2"));
    expect(f.chain.shares).toBe(E("4"));
  });

  it.each(["unverified", "missing-cap"])("does not restore executable consent from %s storage", async invalid => {
    const f = fixture();
    const step: RecoveryExitStep = { action: "take", maxShares: E(".8"), quote: f.request().quote, mode: "complete", originalShares: E("10"), sequenceId: "restore", wallet: f.actions.getExitWallet() };
    const completed = await f.execute(step);
    if (invalid === "unverified") completed.verified = false;
    else delete completed.intent.exitOriginalShares;
    f.setCompletion(completed);
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    expect(result.current.state.phase).toBe("idle");
    expect(f.actions.submitExitStep).not.toHaveBeenCalled();
  });

  it("stops at a changed auction round instead of silently replacing the offer", async () => {
    const f = fixture();
    f.actions.submitExitStep.mockImplementation(async step => {
      const completed = await f.execute(step);
      if (step.action === "approve") f.chain.auction!.kickedAt++;
      return completed;
    });
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(f.actions.submitExitStep).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({ phase: "paused", canContinue: false });
  });

  it("does not redeem a newly selected account after auction confirmation", async () => {
    const f = fixture();
    f.actions.submitExitStep.mockImplementation(async step => {
      const completed = await f.execute(step);
      if (step.action === "take") f.wallet({ address: "0x2222222222222222222222222222222222222222", chainId: 1, connectorId: "injected" });
      return completed;
    });
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(f.actions.submitExitStep.mock.calls.map(([step]) => step.action)).toEqual(["approve", "take"]);
    expect(result.current.state.phase).toBe("paused");
  });

  it("preserves the auction payout while a fresh post-receipt read fails", async () => {
    const f = fixture();
    const read = f.actions.readExitAccount.getMockImplementation()!;
    let failed = false;
    f.actions.readExitAccount.mockImplementation(async (wallet, minimum) => {
      if (minimum && !failed) { failed = true; throw new Error("RPC unavailable"); }
      return read(wallet, minimum);
    });
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(result.current.state).toMatchObject({ phase: "paused", receivedWeth: E("1") });
    expect(f.actions.submitExitStep).toHaveBeenCalledTimes(2);
    await act(() => result.current.continue());
    expect(result.current.state.phase).toBe("complete");
  });

  it("pauses instead of making a partial redemption when maxRedeem is insufficient", async () => {
    const f = fixture();
    f.chain.maxRedeem = E("1");
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(f.actions.submitExitStep.mock.calls.map(([step]) => step.action)).toEqual(["approve", "take"]);
    expect(result.current.state.phase).toBe("paused");
  });


  it("observes an already-pending remainder after reload without proposing it again", async () => {
    const f = fixture("safe");
    const wallet = f.actions.getExitWallet();
    const take: RecoveryExitStep = { action: "take", maxShares: E(".8"), quote: f.request().quote, mode: "complete", originalShares: E("10"), sequenceId: "reload", wallet };
    f.setCompletion(await f.execute(take));
    const redeem: RecoveryExitStep = { ...take, quote: undefined, action: "redeem", maxShares: E("9.2") };
    f.setPending(f.record(redeem));
    const { result, rerender } = renderHook(() => useYethRecoveryExit(f.actions));
    await waitFor(() => expect(result.current.state.phase).toBe("awaiting"));
    expect(f.actions.submitExitStep).not.toHaveBeenCalled();
    await act(async () => {
      f.setCompletion(await f.execute(redeem, f.actions.pending!));
      f.setPending(null);
      rerender();
    });
    await waitFor(() => expect(result.current.state.phase).toBe("complete"));
    expect(f.actions.submitExitStep).not.toHaveBeenCalled();
  });

  it("a paused Safe auction completion records proceeds without requesting the remainder", async () => {
    const f = fixture("safe");
    let waiting: RecoveryExitStep | undefined;
    f.chain.allowance = E(".8");
    f.actions.submitExitStep.mockImplementation(async step => { waiting = step; f.setPending(f.record(step)); return null; });
    const { result, rerender } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    act(() => result.current.pause());
    await act(async () => {
      f.setCompletion(await f.execute(waiting!, f.actions.pending!));
      f.setPending(null);
      rerender();
    });
    expect(result.current.state).toMatchObject({ phase: "paused", receivedWeth: E("1"), canContinue: true });
    expect(f.actions.submitExitStep).toHaveBeenCalledOnce();
  });

  it("unknown submission remains the same pending step when Continue is pressed", async () => {
    const f = fixture();
    f.actions.submitExitStep.mockImplementation(async step => {
      f.setPending({ ...f.record(step), status: "attention", submissionHash: undefined });
      throw new Error("Wallet response lost");
    });
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(result.current.state.phase).toBe("paused");
    await act(() => result.current.continue());
    expect(f.actions.submitExitStep).toHaveBeenCalledOnce();
    expect(f.actions.refreshPending).toHaveBeenCalledOnce();
    expect(result.current.state.phase).toBe("awaiting");
  });

  it("a wallet disconnect while Continue checks status remains paused without an unhandled rejection", async () => {
    const f = fixture();
    f.actions.submitExitStep.mockImplementation(async step => {
      f.setPending({ ...f.record(step), status: "attention", submissionHash: undefined });
      throw new Error("Wallet response lost");
    });
    f.actions.refreshPending.mockRejectedValue(new Error("Connect the original wallet"));
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    await act(() => result.current.continue());
    expect(result.current.state).toMatchObject({ phase: "paused", canContinue: true, error: "Connect the original wallet" });
    expect(f.actions.submitExitStep).toHaveBeenCalledOnce();
  });

  it("a neutral nonce outcome cannot trigger the next financial step", async () => {
    const f = fixture();
    f.chain.allowance = E(".8");
    f.actions.submitExitStep.mockImplementation(async step => {
      const intent = f.record(step);
      return { id: intent.id, account: address, chainId: 1, action: step.action, intent, status: "nonce-consumed", verified: true, createdAt: 1001 };
    });
    const { result } = renderHook(() => useYethRecoveryExit(f.actions));
    await act(() => result.current.start(f.request()));
    expect(result.current.state).toMatchObject({ phase: "paused", canContinue: false, receivedWeth: 0n });
    await act(() => result.current.continue());
    expect(f.actions.submitExitStep).toHaveBeenCalledOnce();
  });

  it("pause or unmount during an awaited read prevents another wallet request", async () => {
    const f = fixture();
    let resolve!: (state: RecoveryAccountState) => void;
    f.actions.readExitAccount.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const { result, unmount } = renderHook(() => useYethRecoveryExit(f.actions));
    let started!: Promise<void>;
    act(() => { started = result.current.start(f.request()); });
    act(() => result.current.pause());
    unmount();
    await act(async () => { resolve(f.chain); await started; });
    expect(f.actions.submitExitStep).not.toHaveBeenCalled();
  });
});
