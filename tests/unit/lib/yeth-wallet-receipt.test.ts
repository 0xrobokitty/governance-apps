import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
  type PublicClient,
} from "viem";
import { resolveRecoveryReceipt } from "@/lib/clients/yeth/recovery/wallet-receipt";
import type { RecoveryPending } from "@/lib/clients/yeth/recovery/pending";
const proposal = ("0x" + "b".repeat(64)) as `0x${string}`;
const hashA = ("0x" + "a".repeat(64)) as `0x${string}`;
const hashB = ("0x" + "d".repeat(64)) as `0x${string}`;
const blockHash = ("0x" + "c".repeat(64)) as `0x${string}`;
const account = "0x1111111111111111111111111111111111111111";
const intent = (): RecoveryPending => ({
  version: 1,
  id: "intent-1",
  account,
  chainId: 1,
  connectorId: "safe",
  kind: "safe",
  action: "take",
  status: "awaiting-execution",
  submissionHash: proposal,
  createdAt: 1000,
  submittedBlock: "100",
  maxShares: "10",
  requestedWeth: "20",
});
const safeEvent = (
  eventName: "ExecutionSuccess" | "ExecutionFailure" = "ExecutionSuccess",
  txHash = proposal,
  address = account,
) => ({
  address,
  topics: encodeEventTopics({
    abi: parseAbi([
      "event ExecutionSuccess(bytes32 txHash,uint256 payment)",
      "event ExecutionFailure(bytes32 txHash,uint256 payment)",
    ]),
    eventName,
  }),
  data: encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }],
    [txHash, 0n],
  ),
});
const mined = (hash = hashA, logs = [safeEvent()]) => ({
  status: "success",
  transactionHash: hash,
  blockNumber: 101n,
  blockHash,
  logs,
});
function fixture() {
  const rpc = {
    getChainId: vi.fn().mockResolvedValue(1),
    getBlock: vi.fn().mockResolvedValue({ hash: blockHash }),
    getTransactionReceipt: vi.fn().mockResolvedValue(mined()),
  };
  const provider = {
    request: vi.fn().mockResolvedValue({
      id: proposal,
      chainId: "0x1",
      status: 200,
      receipts: [{ transactionHash: hashA }],
    }),
  };
  return { rpc, client: rpc as unknown as PublicClient, provider };
}
describe("wallet-aware canonical receipt resolution", () => {
  it("times out a disconnected Safe parent and reuses its unfinished read", async () => {
    vi.useFakeTimers();
    try {
      const { client, provider } = fixture();
      provider.request.mockImplementation(() => new Promise(() => {}));
      const first = resolveRecoveryReceipt(client, intent(), provider);
      const firstCheck = expect(first).rejects.toThrow("did not answer");
      await vi.advanceTimersByTimeAsync(5001);
      await firstCheck;
      const second = resolveRecoveryReceipt(client, intent(), provider);
      const secondCheck = expect(second).rejects.toThrow("did not answer");
      await vi.advanceTimersByTimeAsync(5001);
      await secondCheck;
      expect(provider.request).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps Safe signatures/execution pending without querying a proposal as an Ethereum receipt", async () => {
    const { client, rpc, provider } = fixture();
    provider.request.mockResolvedValue({
      id: proposal,
      chainId: "0x1",
      status: 100,
    });
    expect(await resolveRecoveryReceipt(client, intent(), provider)).toEqual({
      status: "pending",
      error: undefined,
    });
    expect(rpc.getTransactionReceipt).not.toHaveBeenCalled();
  });
  it.each(["id", "chainId"])(
    "rejects wallet status for another %s",
    async (field) => {
      const { client, provider } = fixture();
      provider.request.mockResolvedValue({
        id: proposal,
        chainId: "0x1",
        status: 200,
        receipts: [{ transactionHash: hashA }],
        [field]: "wrong",
      });
      await expect(
        resolveRecoveryReceipt(client, intent(), provider),
      ).rejects.toThrow("invalid");
    },
  );
  it("never treats provider-supplied receipt logs as execution proof", async () => {
    const { client, rpc, provider } = fixture();
    rpc.getTransactionReceipt.mockResolvedValue(mined(hashA, []));
    provider.request.mockResolvedValue({
      id: proposal,
      chainId: "0x1",
      status: 200,
      receipts: [{ transactionHash: hashA, logs: [safeEvent()] }],
    });
    expect(
      (await resolveRecoveryReceipt(client, intent(), provider)).status,
    ).toBe("pending");
  });
  it("recognizes matching Safe inner failure despite successful outer receipt", async () => {
    const { client, rpc, provider } = fixture();
    rpc.getTransactionReceipt.mockResolvedValue(
      mined(hashA, [safeEvent("ExecutionFailure")]),
    );
    expect(
      await resolveRecoveryReceipt(client, intent(), provider),
    ).toMatchObject({ status: "mined", failed: true });
  });
  it.each(["ExecutionSuccess", "ExecutionFailure"] as const)(
    "accepts the indexed Safe1.4.1 %s layout",
    async (eventName) => {
      const { client, rpc, provider } = fixture();
      const abi = parseAbi([
        "event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)",
        "event ExecutionFailure(bytes32 indexed txHash,uint256 payment)",
      ]);
      const event = {
        address: account,
        topics: encodeEventTopics({
          abi,
          eventName,
          args: { txHash: proposal },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [0n]),
      };
      rpc.getTransactionReceipt.mockResolvedValue(mined(hashA, [event]));
      expect(
        await resolveRecoveryReceipt(client, intent(), provider),
      ).toMatchObject({
        status: "mined",
        failed: eventName === "ExecutionFailure",
      });
    },
  );
  it("re-resolves a Safe proposal after an outer reverted attempt instead of pinning the old candidate", async () => {
    const { client, rpc, provider } = fixture();
    rpc.getTransactionReceipt
      .mockResolvedValueOnce({ ...mined(hashA, []), status: "reverted" })
      .mockResolvedValueOnce(mined(hashB));
    provider.request
      .mockResolvedValueOnce({
        id: proposal,
        chainId: "0x1",
        status: 200,
        receipts: [{ transactionHash: hashA }],
      })
      .mockResolvedValueOnce({
        id: proposal,
        chainId: "0x1",
        status: 200,
        receipts: [{ transactionHash: hashB }],
      });
    expect(
      (
        await resolveRecoveryReceipt(
          client,
          { ...intent(), transactionHash: hashA },
          provider,
        )
      ).status,
    ).toBe("pending");
    expect(
      await resolveRecoveryReceipt(
        client,
        { ...intent(), transactionHash: hashA },
        provider,
      ),
    ).toMatchObject({
      status: "mined",
      receipt: { transactionHash: hashB },
      failed: false,
    });
    expect(provider.request).toHaveBeenCalledTimes(2);
  });
  it.each([
    safeEvent("ExecutionSuccess", hashB),
    safeEvent(
      "ExecutionSuccess",
      proposal,
      "0x2222222222222222222222222222222222222222",
    ),
  ])("rejects unrelated Safe execution events", async (event) => {
    const { client, rpc, provider } = fixture();
    rpc.getTransactionReceipt.mockResolvedValue(mined(hashA, [event]));
    expect(
      (await resolveRecoveryReceipt(client, intent(), provider)).status,
    ).toBe("pending");
  });
  it("rejects extra Safe event topics even when the account and proposal hash match", async () => {
    const { client, rpc, provider } = fixture();
    const event = safeEvent();
    event.topics.push(hashB);
    rpc.getTransactionReceipt.mockResolvedValue(mined(hashA, [event]));
    expect(
      (await resolveRecoveryReceipt(client, intent(), provider)).status,
    ).toBe("pending");
  });
  it("rejects an orphaned or earlier-than-submission receipt", async () => {
    const { client, rpc, provider } = fixture();
    rpc.getBlock.mockResolvedValue({ hash: hashB });
    await expect(
      resolveRecoveryReceipt(client, intent(), provider),
    ).rejects.toThrow("block changed");
    rpc.getBlock.mockResolvedValue({ hash: blockHash });
    rpc.getTransactionReceipt.mockResolvedValue({
      ...mined(),
      blockNumber: 99n,
    });
    await expect(
      resolveRecoveryReceipt(client, intent(), provider),
    ).rejects.toThrow("submitted");
  });
  it("uses Safe WalletConnect receipt mapping only as a hint and verifies the public Safe event", async () => {
    const { client, rpc, provider } = fixture();
    rpc.getTransactionReceipt
      .mockRejectedValueOnce(
        Object.assign(new Error(), { name: "TransactionReceiptNotFoundError" }),
      )
      .mockResolvedValueOnce(mined());
    provider.request.mockResolvedValue({
      transactionHash: proposal,
      logs: [{ transactionHash: hashA }],
    });
    expect(
      await resolveRecoveryReceipt(
        client,
        { ...intent(), kind: "transaction", connectorId: "walletConnect" },
        provider,
      ),
    ).toMatchObject({ status: "mined", failed: false });
    expect(provider.request).toHaveBeenCalledWith({
      method: "eth_getTransactionReceipt",
      params: [proposal],
    });
  });
  it("supports delegated accounts that return a normal Ethereum transaction hash", async () => {
    const { client, rpc } = fixture();
    rpc.getTransactionReceipt.mockResolvedValue(mined(hashA, []));
    expect(
      await resolveRecoveryReceipt(client, {
        ...intent(),
        kind: "transaction",
        connectorId: "injected",
        submissionHash: hashA,
      }),
    ).toMatchObject({ status: "mined", failed: false });
  });
  it("does not release a pending Safe solely because its SDK reports cancelled", async () => {
    const { client, provider } = fixture();
    provider.request.mockResolvedValue({
      id: proposal,
      chainId: "0x1",
      status: 400,
    });
    expect(
      await resolveRecoveryReceipt(client, intent(), provider),
    ).toMatchObject({
      status: "pending",
      error: expect.stringContaining("not verified"),
    });
  });
});
