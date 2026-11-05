import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  parseAbi,
  parseEther,
} from "viem";
import {
  createRecoveryActionQuote,
  RECOVERY_AUCTION,
  RECOVERY_WETH,
  RECOVERY_WRAPPER,
  type RecoveryAccountState,
} from "@/lib/clients/yeth/recovery/onchain";
import {
  getRecoveryPending,
  recoveryPendingKey,
  saveRecoveryPending,
} from "@/lib/clients/yeth/recovery/pending";
import { YETH_RECOVERY_VAULT } from "@/lib/clients/yeth/deployment";
import { useYethRecoveryActions } from "@/lib/hooks/useYethRecoveryActions";
const HASH = ("0x" + "a".repeat(64)) as `0x${string}`;
const PROPOSAL = ("0x" + "b".repeat(64)) as `0x${string}`;
const BLOCK = ("0x" + "c".repeat(64)) as `0x${string}`;
const ADDRESS = "0x1111111111111111111111111111111111111111";
const mocks = vi.hoisted(() => ({
  account: {
    address: "0x1111111111111111111111111111111111111111",
    chainId: 1,
    connector: { id: "injected", getProvider: vi.fn() },
  },
  read: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  wait: vi.fn(),
  readContract: vi.fn(),
  getChainId: vi.fn(),
  getBlock: vi.fn(),
  getReceipt: vi.fn(),
  provider: vi.fn(),
  getTransaction: vi.fn(),
  cancel: vi.fn(),
  capture: vi.fn(),
  replacement: vi.fn(),
  nonce: vi.fn(),
}));
vi.mock("@/web3/wagmi", () => ({ wagmiConfig: {} }));
vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => ({
    waitForTransactionReceipt: mocks.wait,
    readContract: mocks.readContract,
    getChainId: mocks.getChainId,
    getBlock: mocks.getBlock,
    getTransactionReceipt: mocks.getReceipt,
    getTransaction: mocks.getTransaction,
  }),
}));
vi.mock("wagmi/actions", () => ({
  getAccount: () => mocks.account,
  simulateContract: mocks.simulate,
  writeContract: mocks.write,
  waitForTransactionReceipt: mocks.wait,
}));
vi.mock("@/lib/clients/yeth/recovery/safe-cancellation", () => ({
  resolveSafeCancellation: mocks.cancel,
}));
vi.mock("@/lib/clients/yeth/recovery/transaction-replacement", () => ({
  captureRecoveryTransaction: mocks.capture,
  resolveRecoveryReplacement: mocks.replacement,
  resolveRecoveryTransactionNonce: mocks.nonce,
}));
vi.mock("@/state/protocol", () => ({
  useProtocol: () => ({ publicClient: null }),
}));
vi.mock("@/components/ui/Toast", () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));
vi.mock("@/lib/clients/yeth/recovery/onchain", async (original) => ({
  ...(await original<typeof import("@/lib/clients/yeth/recovery/onchain")>()),
  readRecoveryAccount: mocks.read,
}));
const state = (): RecoveryAccountState => ({
  address: ADDRESS,
  chainId: 1,
  blockNumber: 100n,
  blockHash: BLOCK,
  blockTimestamp: 1000,
  shares: parseEther("10"),
  allowance: parseEther("1"),
  wethBalance: 0n,
  maxRedeem: parseEther("10"),
  directAssets: parseEther("10"),
  vaultPps: parseEther("1"),
  recoveryRate: parseEther("0.32"),
  auctionPrice: parseEther("1"),
  auction: {
    kickedAt: 900,
    initialWeth: parseEther("1"),
    remainingWeth: parseEther("1"),
    startingPrice: parseEther("1"),
    minimumPrice: parseEther("0.32"),
    stepDuration: 225,
    stepDecayBps: 4,
    length: 604800,
  },
});
const transfer = (
  address: `0x${string}`,
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
) => ({
  address,
  topics: encodeEventTopics({
    abi: erc20Abi,
    eventName: "Transfer",
    args: { from, to },
  }),
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
});
const executed = (safe = false) => ({
  status: "success",
  from: ADDRESS,
  transactionHash: HASH,
  blockHash: BLOCK,
  blockNumber: 101n,
  logs: [
    transfer(RECOVERY_WETH, RECOVERY_AUCTION, ADDRESS, parseEther("1")),
    transfer(YETH_RECOVERY_VAULT, ADDRESS, RECOVERY_WRAPPER, parseEther("1")),
    ...(safe
      ? [
          {
            address: ADDRESS,
            topics: encodeEventTopics({
              abi: parseAbi([
                "event ExecutionSuccess(bytes32 txHash,uint256 payment)",
              ]),
              eventName: "ExecutionSuccess",
            }),
            data: encodeAbiParameters(
              [{ type: "bytes32" }, { type: "uint256" }],
              [PROPOSAL, 0n],
            ),
          },
        ]
      : []),
  ],
});
function renderActions() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useYethRecoveryActions(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
describe("live yETH wallet execution", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    mocks.account.address = ADDRESS;
    mocks.account.chainId = 1;
    mocks.account.connector.id = "injected";
    mocks.account.connector.getProvider.mockResolvedValue({
      request: mocks.provider,
    });
    mocks.read.mockResolvedValue(state());
    mocks.simulate.mockResolvedValue({ request: { address: "0x1234" } });
    mocks.write.mockResolvedValue(HASH);
    mocks.wait.mockResolvedValue(executed());
    mocks.getReceipt.mockResolvedValue(executed());
    mocks.getChainId.mockResolvedValue(1);
    mocks.getBlock.mockResolvedValue({ hash: BLOCK });
    mocks.readContract.mockResolvedValue(parseEther("9"));
    mocks.getTransaction.mockRejectedValue(new Error("unavailable"));
    mocks.cancel.mockResolvedValue(null);
    mocks.nonce.mockResolvedValue(null);
  });
  it("never submits after strict simulation failure", async () => {
    const { result } = renderActions();
    mocks.simulate.mockRejectedValue(new Error("RPC unavailable"));
    await act(async () => {
      await expect(
        result.current.take(createRecoveryActionQuote(state())),
      ).rejects.toThrow("RPC unavailable");
    });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });
  it("preserves an uncertain submission and blocks a second write", async () => {
    const { result } = renderActions();
    mocks.write.mockRejectedValue(new Error("connection lost"));
    await act(async () => {
      await expect(
        result.current.take(createRecoveryActionQuote(state())),
      ).rejects.toThrow();
    });
    expect(result.current.pending?.status).toBe("attention");
    await act(async () => {
      await expect(
        result.current.take(createRecoveryActionQuote(state())),
      ).rejects.toThrow("pending");
    });
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it("records a canonical reverted transaction as failed, never recovery", async () => {
    const { result } = renderActions();
    mocks.getReceipt.mockResolvedValue({
      ...executed(),
      status: "reverted",
      logs: [],
    });
    await act(async () => {
      await expect(
        result.current.take(createRecoveryActionQuote(state())),
      ).rejects.toThrow("reverted");
    });
    expect(result.current.completion?.status).toBe("failed");
    expect(result.current.receipt).toBeNull();
    expect(result.current.pending).toBeNull();
  });
  it("clears a verified user rejection without a receipt or submission retry", async () => {
    const { result } = renderActions();
    mocks.write.mockRejectedValue(
      Object.assign(new Error("rejected"), { code: 4001 }),
    );
    await act(async () => {
      await expect(
        result.current.take(createRecoveryActionQuote(state())),
      ).rejects.toThrow("rejected");
    });
    expect(result.current.pending).toBeNull();
    expect(mocks.wait).not.toHaveBeenCalled();
  });
  it("detects an account switch between simulation and submission", async () => {
    const { result } = renderActions();
    mocks.simulate.mockImplementation(async () => {
      mocks.account.address = "0x2222222222222222222222222222222222222222";
      return { request: {} };
    });
    await act(async () => {
      await expect(
        result.current.take(createRecoveryActionQuote(state())),
      ).rejects.toThrow("wallet changed");
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("enforces current redemption limits", async () => {
    const { result } = renderActions();
    mocks.read.mockResolvedValue({ ...state(), maxRedeem: 0n });
    await act(async () => {
      await expect(result.current.redeem(parseEther("10"))).rejects.toThrow(
        "cannot redeem",
      );
    });
    expect(mocks.simulate).not.toHaveBeenCalled();
  });
  it("requires an existing allowance reset before a new approval", async () => {
    const { result } = renderActions();
    await act(async () => {
      await expect(
        result.current.approve(createRecoveryActionQuote(state())),
      ).rejects.toThrow("Reset");
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("keeps Safe proposals pending, restores them, isolates accounts, and confirms only canonical execution", async () => {
    mocks.account.connector.id = "safe";
    mocks.write.mockResolvedValue(PROPOSAL);
    mocks.provider.mockResolvedValue({
      id: PROPOSAL,
      chainId: "0x1",
      status: 100,
    });
    const first = renderActions();
    await act(async () => {
      expect(
        await first.result.current.take(
          createRecoveryActionQuote(state()),
          "complete",
        ),
      ).toBeNull();
    });
    expect(first.result.current.pending).toMatchObject({
      kind: "safe",
      status: "awaiting-execution",
      submissionHash: PROPOSAL,
      exitMode: "complete",
    });
    expect(first.result.current.tx.state.hash).toBeUndefined();
    expect(first.result.current.receipt).toBeNull();
    expect(mocks.wait).not.toHaveBeenCalled();
    first.unmount();
    const restored = renderActions();
    await waitFor(() =>
      expect(restored.result.current.pending?.submissionHash).toBe(PROPOSAL),
    );
    mocks.account.address = "0x2222222222222222222222222222222222222222";
    restored.rerender();
    expect(restored.result.current.pending).toBeNull();
    mocks.account.address = ADDRESS;
    restored.rerender();
    expect(restored.result.current.pending?.submissionHash).toBe(PROPOSAL);
    mocks.provider.mockResolvedValue({
      id: PROPOSAL,
      chainId: "0x1",
      status: 200,
      receipts: [{ transactionHash: HASH, logs: [{ forged: true }] }],
    });
    mocks.getReceipt.mockResolvedValue(executed(true));
    await act(async () => {
      expect((await restored.result.current.refreshPending())?.status).toBe(
        "confirmed",
      );
    });
    expect(restored.result.current.receipt).toMatchObject({
      hash: HASH,
      wethReceived: parseEther("1"),
      remainingShares: parseEther("9"),
    });
    expect(restored.result.current.completion?.exitMode).toBe("complete");
    expect(restored.result.current.pending).toBeNull();
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it("keeps pending Safe proposals after provider or RPC errors", async () => {
    mocks.account.connector.id = "safe";
    mocks.write.mockResolvedValue(PROPOSAL);
    mocks.provider.mockRejectedValue(new Error("timeout"));
    const { result } = renderActions();
    await act(async () => {
      expect(
        await result.current.take(createRecoveryActionQuote(state())),
      ).toBeNull();
    });
    expect(result.current.pending?.status).toBe("attention");
    await act(async () => {
      await result.current.refreshPending();
    });
    expect(result.current.pending?.submissionHash).toBe(PROPOSAL);
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it("does not resurrect an older pending record after concurrent completion", async () => {
    mocks.account.connector.id = "safe";
    mocks.write.mockResolvedValue(PROPOSAL);
    let rejectFirst: (error: unknown) => void = () => {};
    mocks.provider.mockResolvedValue({
      id: PROPOSAL,
      chainId: "0x1",
      status: 200,
      receipts: [{ transactionHash: HASH }],
    });
    mocks.getReceipt.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        }),
    );
    const { result } = renderActions();
    let submitting: Promise<unknown>;
    await act(async () => {
      submitting = result.current.take(createRecoveryActionQuote(state()));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(mocks.getReceipt).toHaveBeenCalledTimes(1));
    mocks.provider.mockResolvedValue({
      id: PROPOSAL,
      chainId: "0x1",
      status: 200,
      receipts: [{ transactionHash: HASH }],
    });
    mocks.getReceipt.mockResolvedValue(executed(true));
    await act(async () => {
      await result.current.refreshPending();
    });
    const oldIntent = result.current.completion!.intent;
    await act(async () => {
      saveRecoveryPending({
        ...oldIntent,
        id: "newer-intent",
        submissionHash: undefined,
        status: "submitting",
      });
    });
    await act(async () => {
      rejectFirst(
        Object.assign(new Error("not yet indexed"), {
          name: "TransactionReceiptNotFoundError",
        }),
      );
      await submitting;
    });
    expect(getRecoveryPending(1, ADDRESS)?.id).toBe("newer-intent");
  });
  it("revalidates restored financial amounts instead of trusting edited browser storage", async () => {
    const first = renderActions();
    await act(async () => {
      await first.result.current.take(
        createRecoveryActionQuote(state()),
        "complete",
      );
    });
    first.unmount();
    const key = recoveryPendingKey(1, ADDRESS) + ":completed";
    const saved = JSON.parse(window.localStorage.getItem(key)!);
    saved.receipt.wethReceived = parseEther("999").toString();
    window.localStorage.setItem(key, JSON.stringify(saved));
    const second = renderActions();
    await waitFor(() =>
      expect(second.result.current.receipt?.wethReceived).toBe(parseEther("1")),
    );
    expect(mocks.getReceipt).toHaveBeenCalledTimes(2);
  });
  it("retains an ordinary transaction after an RPC receipt timeout without creating a false Etherscan hash", async () => {
    mocks.wait.mockRejectedValue(new Error("timeout"));
    mocks.getReceipt.mockRejectedValue(
      Object.assign(new Error(), { name: "TransactionReceiptNotFoundError" }),
    );
    mocks.provider.mockResolvedValue(null);
    const { result } = renderActions();
    await act(async () => {
      expect(
        await result.current.take(createRecoveryActionQuote(state())),
      ).toBeNull();
    });
    expect(result.current.pending?.submissionHash).toBe(HASH);
    expect(result.current.tx.state.hash).toBeUndefined();
    mocks.getReceipt.mockResolvedValue(executed());
    await act(async () => {
      await result.current.refreshPending();
    });
    expect(result.current.receipt?.hash).toBe(HASH);
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it("recovers a missing wallet response hash by checking execution without submitting again", async () => {
    const { result } = renderActions();
    mocks.write.mockRejectedValue(new Error("connection lost"));
    await act(async () => {
      await expect(
        result.current.take(createRecoveryActionQuote(state())),
      ).rejects.toThrow();
    });
    await act(async () => {
      expect((await result.current.refreshPending(HASH))?.status).toBe(
        "confirmed",
      );
    });
    expect(result.current.pending).toBeNull();
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it("releases a consumed Safe nonce neutrally, without inventing a transaction or payout", async () => {
    mocks.account.connector.id = "safe";
    mocks.write.mockResolvedValue(PROPOSAL);
    mocks.provider.mockResolvedValue({
      id: PROPOSAL,
      chainId: "0x1",
      status: 100,
    });
    const { result } = renderActions();
    await act(async () => {
      await result.current.take(createRecoveryActionQuote(state()));
    });
    mocks.provider.mockResolvedValue({
      id: PROPOSAL,
      chainId: "0x1",
      status: 400,
    });
    mocks.cancel.mockResolvedValue({
      submissionHash: PROPOSAL,
      proposalNonce: 1n,
      currentNonce: 2n,
      blockNumber: 102n,
      blockHash: BLOCK,
    });
    await act(async () => {
      await result.current.refreshPending();
    });
    expect(result.current.pending).toBeNull();
    expect(result.current.completion).toMatchObject({
      status: "nonce-consumed",
    });
    expect(result.current.completion?.hash).toBeUndefined();
    expect(result.current.completion?.receipt).toBeUndefined();
    expect(result.current.tx.status).not.toBe("success");
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it("waits for asynchronous replacement proof even when viem does not await onReplaced", async () => {
    const replacementHash = ("0x" + "d".repeat(64)) as `0x${string}`;
    mocks.capture.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "0x01";
    });
    mocks.replacement.mockResolvedValue({
      status: "same-call",
      receipt: { ...executed(), transactionHash: replacementHash },
    });
    mocks.wait.mockImplementation(
      async (options: { onReplaced: (event: unknown) => void }) => {
        options.onReplaced({
          replacedTransaction: { hash: HASH },
          transaction: { hash: replacementHash },
        });
        return { ...executed(), transactionHash: replacementHash };
      },
    );
    const { result } = renderActions();
    await act(async () => {
      expect(
        (await result.current.take(createRecoveryActionQuote(state())))?.hash,
      ).toBe(replacementHash);
    });
    expect(result.current.completion?.status).toBe("confirmed");
    expect(result.current.pending).toBeNull();
    expect(mocks.replacement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ replacementHash }),
      "0x01",
      replacementHash,
    );
  });
  it("treats a verified different-call replacement as consumed, without recovery success", async () => {
    const replacementHash = ("0x" + "d".repeat(64)) as `0x${string}`;
    mocks.capture.mockResolvedValue("0x01");
    mocks.replacement.mockResolvedValue({
      status: "nonce-consumed",
      receipt: { ...executed(), transactionHash: replacementHash, logs: [] },
    });
    mocks.wait.mockImplementation(
      async (options: { onReplaced: (event: unknown) => void }) => {
        options.onReplaced({
          replacedTransaction: { hash: HASH },
          transaction: { hash: replacementHash },
        });
        return { ...executed(), transactionHash: replacementHash };
      },
    );
    const { result } = renderActions();
    await act(async () => {
      expect(
        await result.current.take(createRecoveryActionQuote(state())),
      ).toBeNull();
    });
    expect(result.current.completion).toMatchObject({
      status: "nonce-consumed",
      hash: replacementHash,
    });
    expect(result.current.receipt).toBeNull();
    expect(result.current.pending).toBeNull();
  });
  it("marks a proved consumed intent neutrally when its expected token result cannot be verified", async () => {
    mocks.getReceipt.mockResolvedValue({ ...executed(), logs: [] });
    const { result } = renderActions();
    await act(async () => {
      expect(
        await result.current.take(createRecoveryActionQuote(state())),
      ).toBeNull();
    });
    expect(result.current.pending).toBeNull();
    expect(result.current.completion?.status).toBe("nonce-consumed");
    expect(result.current.receipt).toBeNull();
  });
  it("does not use another sender's successful receipt to release an unproved intent", async () => {
    mocks.getReceipt.mockResolvedValue({
      ...executed(),
      from: "0x2222222222222222222222222222222222222222",
      logs: [],
    });
    const { result } = renderActions();
    await act(async () => {
      expect(
        await result.current.take(createRecoveryActionQuote(state())),
      ).toBeNull();
    });
    expect(result.current.pending?.status).toBe("attention");
    expect(result.current.completion).toBeNull();
  });
  it("does not attach a recovery hash while the wallet is still answering the original request", async () => {
    let release: (hash: string) => void = () => {};
    mocks.write.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderActions();
    let submitting: Promise<unknown>;
    await act(async () => {
      submitting = result.current.take(createRecoveryActionQuote(state()));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.pending?.status).toBe("submitting");
    await act(async () => {
      expect(await result.current.refreshPending(HASH)).toBeNull();
    });
    expect(result.current.pending?.submissionHash).toBeUndefined();
    await act(async () => {
      release(HASH);
      await submitting;
    });
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it("does not leave a verified same-call replacement stuck when its financial result is unproved", async () => {
    const replacementHash = ("0x" + "d".repeat(64)) as `0x${string}`;
    mocks.capture.mockResolvedValue("0x01");
    mocks.replacement.mockResolvedValue({
      status: "same-call",
      receipt: { ...executed(), transactionHash: replacementHash, logs: [] },
    });
    mocks.wait.mockImplementation(
      async (options: { onReplaced: (event: unknown) => void }) => {
        options.onReplaced({
          replacedTransaction: { hash: HASH },
          transaction: { hash: replacementHash },
        });
        return { ...executed(), transactionHash: replacementHash };
      },
    );
    const { result } = renderActions();
    await act(async () => {
      expect(
        await result.current.take(createRecoveryActionQuote(state())),
      ).toBeNull();
    });
    expect(result.current.completion?.status).toBe("nonce-consumed");
    expect(result.current.receipt).toBeNull();
    expect(result.current.pending).toBeNull();
  });

  it("keeps the real wallet prompt visible while the persisted intent has no hash", async () => {
    let reject!: (error: unknown) => void;
    mocks.write.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const { result } = renderActions();
    let submission!: Promise<unknown>;
    act(() => { submission = result.current.redeem(parseEther("1")).catch(() => undefined); });
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    expect(result.current.pending?.status).toBe("submitting");
    expect(result.current.pending?.submissionHash).toBeUndefined();
    expect(result.current.walletPromptActive).toBe(true);
    await act(async () => { reject({ code: 4001 }); await submission; });
    expect(result.current.walletPromptActive).toBe(false);
    expect(result.current.pending).toBeNull();
  });

  it("binds a sequence redemption to its reviewed wallet through simulation", async () => {
    const { result } = renderActions();
    const wallet = result.current.getExitWallet();
    mocks.simulate.mockImplementation(async () => {
      mocks.account.address = "0x2222222222222222222222222222222222222222";
      return { request: {} };
    });
    await act(async () => {
      await expect(result.current.submitExitStep({ action: "redeem", maxShares: parseEther("1"), mode: "complete", originalShares: parseEther("10"), sequenceId: "bounded", wallet })).rejects.toThrow("wallet");
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("pausing a sequence while simulation is pending prevents the next signature prompt", async () => {
    const { result } = renderActions();
    let active = true;
    mocks.simulate.mockImplementation(async () => { active = false; return { request: {} }; });
    await act(async () => {
      await expect(result.current.submitExitStep({ action: "redeem", maxShares: parseEther("1"), mode: "complete", originalShares: parseEther("10"), sequenceId: "bounded", wallet: result.current.getExitWallet(), shouldContinue: () => active })).rejects.toThrow("paused");
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("persists the original exit cap and rejects a malformed stored cap", async () => {
    mocks.account.connector.id = "safe";
    mocks.write.mockResolvedValue(PROPOSAL);
    mocks.provider.mockResolvedValue({ id: PROPOSAL, chainId: "0x1", status: 100 });
    const { result, rerender } = renderActions();
    await act(async () => {
      await result.current.submitExitStep({ action: "redeem", maxShares: parseEther("1"), mode: "complete", originalShares: parseEther("10"), sequenceId: "bounded", wallet: result.current.getExitWallet() });
    });
    expect(result.current.pending).toMatchObject({ exitOriginalShares: parseEther("10").toString(), exitSequenceId: "bounded" });
    const key = recoveryPendingKey(1, ADDRESS);
    const raw = JSON.parse(window.localStorage.getItem(key)!);
    window.localStorage.setItem(key, JSON.stringify({ ...raw, exitOriginalShares: "-1" }));
    rerender();
    expect(result.current.pending?.corrupt).toBe(true);
  });

  it("blocks malformed pending storage without crashing or signing", async () => {
    window.localStorage.setItem(recoveryPendingKey(1, ADDRESS), "{broken");
    const { result } = renderActions();
    expect(result.current.pending?.corrupt).toBe(true);
    await act(async () => {
      await expect(
        result.current.take(createRecoveryActionQuote(state())),
      ).rejects.toThrow("pending");
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
