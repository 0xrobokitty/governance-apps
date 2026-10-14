import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, parseEther } from "viem";
import fixture from "@/tests/fixtures/yeth-manual-recovery-26176531.json";
import { YETH_CLAIM_TOPIC } from "@/workers/alerts-bot/src/abis";
import { YETH_YIELD_VAULT } from "@/workers/alerts-bot/src/contracts";
import {
  applyYethSetClaim,
  createEmptyYethState,
  serializeYethState,
} from "@/workers/alerts-bot/src/domains/yeth/accounting";
import { scanYethBlocks } from "@/workers/alerts-bot/src/domains/yeth/scanner";
import type { RpcBlock, RpcClient, RpcLog } from "@/workers/alerts-bot/src/rpc";

const [before, after] = fixture.checkpoints;
const tx = fixture.transaction;
const payout = 11_362_001_246_718_367_622n;
// The alert supplies rounded debt. All transaction amounts and asset balances are exact.
const remainingDebt = parseEther("2736.68");
const remainingAccount = "0x1111111111111111111111111111111111111111";

function initialYethState() {
  const state = createEmptyYethState();
  applyYethSetClaim(state, remainingAccount, remainingDebt);
  for (const claim of fixture.claims) {
    applyYethSetClaim(state, claim.account, BigInt(claim.snapshotWei));
  }
  return state;
}

function hashOf(block: number) {
  return `0x${block.toString(16).padStart(64, "0")}`;
}

function blockAt(number: number): RpcBlock {
  const checkpoint = fixture.checkpoints.find((item) => item.blockNumber === number);
  return {
    number,
    hash: checkpoint?.hash ?? (number === tx.blockNumber ? tx.blockHash : hashOf(number)),
    parentHash: hashOf(number - 1),
    timestamp: Math.floor(Date.parse(checkpoint?.timestamp ?? tx.timestamp) / 1_000),
  };
}

function matchingLogs(logs: readonly RpcLog[], filter: Parameters<RpcClient["getLogs"]>[0]) {
  const addresses = Array.isArray(filter.address) ? filter.address : [filter.address];
  const topic = filter.topics?.[0];
  const topics = Array.isArray(topic) ? topic : [topic];
  return logs.filter((log) =>
    addresses.some((address) => address?.toLowerCase() === log.address.toLowerCase()) &&
    topics.includes(log.topics[0]) &&
    log.blockNumber! >= filter.fromBlock && log.blockNumber! <= filter.toBlock,
  );
}

function scan(logs: RpcLog[] = structuredClone(fixture.logs), state = initialYethState()) {
  const rpc = {
    getLogs: vi.fn(async (filter) => matchingLogs(logs, filter)),
    getBlockByNumber: vi.fn(async (number: number) => blockAt(number)),
  } as unknown as RpcClient;
  return scanYethBlocks({ rpc, fromBlock: tx.blockNumber, toBlock: tx.blockNumber, state });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("manual yETH recovery payouts", () => {
  it("attributes all three withdrawals in transaction 0x171e78…e6052 exactly once", async () => {
    const result = await scan();
    expect(result.failure).toBeNull();
    expect(result.flow).toEqual({ recoveryNetFlowEth: 0n, yieldNetFlowEth: -payout });
    expect(BigInt(before.yieldAssetsWei) - BigInt(after.yieldAssetsWei)).toBe(payout);
    expect(result.state.snapshotUnclaimedEth).toBe(remainingDebt);
    expect(result.state.accounts.size).toBe(1);
    expect(result.actions).toEqual([]);
  });

  it("supports a payout before its clearance within the same transaction", async () => {
    const logs = structuredClone(fixture.logs);
    [logs[0].logIndex, logs[1].logIndex] = [logs[1].logIndex, logs[0].logIndex];
    expect((await scan(logs)).flow.yieldNetFlowEth).toBe(-payout);
  });

  it.each(["different transaction", "different recipient", "nonzero adjustment", "missing withdrawal", "ambiguous withdrawal"])(
    "does not attribute an unproved payout: %s",
    async (scenario) => {
      const logs = structuredClone(fixture.logs.slice(0, 2));
      if (scenario === "different transaction") logs[1].transactionHash = hashOf(1);
      if (scenario === "different recipient") logs[1].topics[2] = `0x${remainingAccount.slice(2).padStart(64, "0")}`;
      if (scenario === "nonzero adjustment") logs[0].data = `0x${"1".padStart(64, "0")}`;
      if (scenario === "missing withdrawal") logs.pop();
      if (scenario === "ambiguous withdrawal") logs.push({ ...logs[1], logIndex: 900 });
      const result = await scan(logs);
      expect(result.failure).toBeNull();
      expect(result.flow.yieldNetFlowEth).toBe(0n);
    },
  );

  it("does not attribute a clearance with no prior entitlement", async () => {
    const result = await scan(structuredClone(fixture.logs), createEmptyYethState());
    expect(result.failure).toBeNull();
    expect(result.flow.yieldNetFlowEth).toBe(0n);
  });

  it("does not double-count an ordinary Claim and its Yield Vault withdrawal", async () => {
    const logs = structuredClone(fixture.logs.slice(0, 2));
    logs[0].topics[0] = YETH_CLAIM_TOPIC;
    logs[0].data = encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [BigInt(fixture.claims[0].snapshotWei), BigInt(fixture.claims[0].payoutWei), 0n],
    );
    const result = await scan(logs);
    expect(result.failure).toBeNull();
    expect(result.flow.yieldNetFlowEth).toBe(-BigInt(fixture.claims[0].payoutWei));
    expect(result.actions).toHaveLength(1);
  });

  it("discards provisional state and flow when a payout log is malformed", async () => {
    const logs = structuredClone(fixture.logs);
    logs[5].data = "0x01";
    const state = initialYethState();
    const result = await scan(logs, state);
    expect(result.failure?.reason).toBe("monitored_log_undecodable");
    expect(result.flow.yieldNetFlowEth).toBe(0n);
    expect(serializeYethState(result.state)).toEqual(serializeYethState(state));
  });

  it("does not attribute removed payouts", async () => {
    const logs = structuredClone(fixture.logs);
    for (const log of logs) log.removed = true;
    const result = await scan(logs);
    expect(result.failure).toBeNull();
    expect(result.flow.yieldNetFlowEth).toBe(0n);
    expect(result.ignored).toHaveLength(logs.length);
    expect(result.state.accounts.size).toBe(4);
  });
});
