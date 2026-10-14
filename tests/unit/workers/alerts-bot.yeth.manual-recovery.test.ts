import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, parseEther } from "viem";
import fixture from "@/tests/fixtures/yeth-manual-recovery-26176531.json";
import { YETH_CLAIM_TOPIC } from "@/workers/alerts-bot/src/abis";
import { YETH_YIELD_VAULT } from "@/workers/alerts-bot/src/contracts";
import {
  applyYethSetClaim,
  applyYethClaim,
  applyYethShareMintFromClaimStay,
  applyYethTransferLedger,
  buildYethRepaymentMetrics,
  createEmptyYethState,
  serializeYethRepaymentMetrics,
  serializeYethState,
} from "@/workers/alerts-bot/src/domains/yeth/accounting";
import { scanYethBlocks } from "@/workers/alerts-bot/src/domains/yeth/scanner";
import { AlertState } from "@/workers/alerts-bot/src/runtime";
import type { AlertsEnv } from "@/workers/alerts-bot/src/config";
import type { RpcBlock, RpcClient, RpcLog } from "@/workers/alerts-bot/src/rpc";

const [before, after] = fixture.checkpoints;
const tx = fixture.transaction;
const payout = 11_362_001_246_718_367_622n;
// The alert supplies rounded debt. All transaction amounts and asset balances are exact.
const remainingDebt = parseEther("2736.68");
const remainingAccount = "0x1111111111111111111111111111111111111111";
const splitCursor = before.blockNumber + 6_000;

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

class MemoryStorage {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
  }
}

function runtimeFixture() {
  const storage = new MemoryStorage();
  const initial = initialYethState();
  const baseline = serializeYethRepaymentMetrics(buildYethRepaymentMetrics(
    initial, BigInt(before.recoveryAssetsWei), BigInt(before.yieldAssetsWei),
  ));
  const saved = {
    version: 1,
    domainId: "yeth",
    cursorBlock: before.blockNumber,
    cursorHash: before.hash,
    lastObservedHead: before.blockNumber,
    lastRunAt: null,
    lastSuccessAt: null,
    lastErrorCode: null,
    telegramRetryAfterUntil: null,
    yethState: serializeYethState(initial),
    yethMetrics: baseline,
    yethDailyFlow: { recoveryNetFlowEth: "0", yieldNetFlowEth: "0" },
  };
  storage.values.set("state:v1", saved);
  const delivered: string[] = [];
  const control = { failTelegram: false, yieldAssets: BigInt(after.yieldAssetsWei), recoveryAssets: BigInt(after.recoveryAssetsWei) };
  const rpcCalls: Array<{ to: string; blockHash: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("https://api.telegram.org/")) {
      if (control.failTelegram) return Response.json({ ok: false, error_code: 500 }, { status: 500 });
      delivered.push((JSON.parse(String(init?.body)) as { text: string }).text);
      return Response.json({ ok: true });
    }
    type Payload = { id: number; method: string; params: unknown[] };
    const payload = JSON.parse(String(init?.body)) as Payload | Payload[];
    function response(item: Payload) {
      let result: unknown;
      if (item.method === "eth_blockNumber") result = `0x${(after.blockNumber + 6).toString(16)}`;
      else if (item.method === "eth_getBlockByNumber") {
        const block = blockAt(Number(BigInt(String(item.params[0]))));
        result = { ...block, number: `0x${block.number.toString(16)}`, timestamp: `0x${block.timestamp!.toString(16)}` };
      } else if (item.method === "eth_getLogs") {
        const filter = item.params[0] as { address: string[]; topics: string[][]; fromBlock: string; toBlock: string };
        result = matchingLogs(fixture.logs, {
          ...filter, fromBlock: Number(BigInt(filter.fromBlock)), toBlock: Number(BigInt(filter.toBlock)),
        }).map((log) => ({ ...log, blockNumber: `0x${log.blockNumber!.toString(16)}`, logIndex: `0x${log.logIndex!.toString(16)}` }));
      } else if (item.method === "eth_call") {
        const [call, reference] = item.params as [{ to: string; data: string }, { blockHash: string }];
        expect(call.data).toBe("0x01e1d114"); // totalAssets()
        rpcCalls.push({ to: call.to, blockHash: reference.blockHash });
        const assets = call.to.toLowerCase() === YETH_YIELD_VAULT.toLowerCase()
          ? control.yieldAssets : control.recoveryAssets;
        result = `0x${assets.toString(16).padStart(64, "0")}`;
      } else throw new Error(`Unexpected RPC method: ${item.method}`);
      return { jsonrpc: "2.0", id: item.id, result };
    }
    return Response.json(Array.isArray(payload) ? payload.map(response) : response(payload));
  }));
  const env: AlertsEnv = {
    ALERT_STATE: {} as DurableObjectNamespace,
    RPC_URL: "https://rpc.invalid",
    TELEGRAM_BOT_TOKEN: "test-token",
    ADMIN_TOKEN: "test-admin",
    YETH_TELEGRAM_CHAT_ID: "test-chat",
    ALERTS_YETH_ENABLED: "true",
    MAX_RANGES_PER_RUN: "1",
    LOG_RANGE_SIZE: "6000",
  };
  // Recreate the object on every call to exercise persisted state across restarts.
  const run = () => new AlertState({ storage } as unknown as DurableObjectState, env).fetch(
    new Request("https://alerts.internal/run?domain=yeth", { method: "POST" }),
  );
  const current = () => storage.values.get("state:v1") as typeof saved & {
    yethCheckpointMetrics?: typeof baseline | null;
  };
  return { storage, saved, baseline, control, delivered, rpcCalls, run, current };
}

describe("consistent yETH checkpoints", () => {
  it("reconciles the historical transaction across ranges, a restart, and a failed send", async () => {
    const test = runtimeFixture();
    expect(await (await test.run()).json()).toMatchObject({ outcome: "progress", cursorBlock: splitCursor });
    expect(test.current()).toMatchObject({
      yethCheckpointMetrics: test.baseline,
      yethDailyFlow: { recoveryNetFlowEth: "0", yieldNetFlowEth: (-payout).toString() },
      yethMetrics: { outstandingDebtEth: remainingDebt.toString() },
    });
    expect(test.delivered).toEqual([]);
    const beforeFailure = structuredClone(test.current());
    test.control.failTelegram = true;
    expect((await test.run()).status).toBe(500);
    expect(test.current()).toMatchObject({
      cursorBlock: splitCursor,
      yethCheckpointMetrics: test.baseline,
      yethDailyFlow: beforeFailure.yethDailyFlow,
    });
    test.control.failTelegram = false;
    expect(await (await test.run()).json()).toMatchObject({ outcome: "caught_up", cursorBlock: after.blockNumber });
    expect(test.delivered).toHaveLength(1);
    expect(test.delivered[0]).toContain("Yield Vault assets fell by 11.36 ETH");
    expect(test.delivered[0]).toContain("Coverage of outstanding recovery debt: 88.30% → 89.03% · +0.73 pts");
    expect(test.delivered[0]).toContain("Net claim flow: -11.36 ETH");
    expect(test.delivered[0]).not.toContain("Yield and other losses");
    expect(test.current().yethCheckpointMetrics).toEqual(test.current().yethMetrics);
    expect(test.current().yethDailyFlow).toEqual({ recoveryNetFlowEth: "0", yieldNetFlowEth: "0" });
    expect(test.rpcCalls.every((call) => call.blockHash === after.hash)).toBe(true);
    await test.run();
    expect(test.delivered).toHaveLength(1);
  });

  it.each(["legacy mid-interval", "explicitly missing baseline"])("establishes a safe baseline for %s", async (scenario) => {
    const test = runtimeFixture();
    await test.run();
    const saved = test.current();
    if (scenario === "legacy mid-interval") delete saved.yethCheckpointMetrics;
    else saved.yethCheckpointMetrics = null;
    test.storage.values.set("state:v1", saved);
    expect(await (await test.run()).json()).toMatchObject({ outcome: "caught_up" });
    expect(test.delivered).toEqual([]);
    expect(test.current().yethCheckpointMetrics).toEqual(test.current().yethMetrics);
    expect(test.current().yethDailyFlow.yieldNetFlowEth).toBe("0");
  });

  it("keeps a genuine loss separate from the manual payout", async () => {
    const test = runtimeFixture();
    test.control.yieldAssets -= parseEther("1");
    await test.run();
    await test.run();
    expect(test.delivered[0]).toContain("Yield Vault assets fell by 12.36 ETH");
    expect(test.delivered[0]).toContain("Net claim flow: -11.36 ETH");
    expect(test.delivered[0]).toContain("Yield and other losses: -1.00 ETH");
  });

  it("uses the checkpoint stayed debt for Recovery Vault coverage and shortfall", async () => {
    const test = runtimeFixture();
    const state = createEmptyYethState();
    const one = parseEther("1");
    const zero = "0x0000000000000000000000000000000000000000";
    applyYethSetClaim(state, remainingAccount, 100n * one);
    applyYethClaim(state, remainingAccount, false, 100n * one);
    applyYethShareMintFromClaimStay(state, remainingAccount, 100n * one, 100n * one);
    applyYethTransferLedger(state, zero, remainingAccount, 100n * one);
    const baseline = buildYethRepaymentMetrics(state, 50n * one, 200n * one);
    applyYethTransferLedger(state, remainingAccount, zero, 10n * one);
    test.storage.values.set("state:v1", {
      ...test.saved,
      cursorBlock: splitCursor,
      cursorHash: hashOf(splitCursor),
      yethState: serializeYethState(state),
      yethMetrics: serializeYethRepaymentMetrics(buildYethRepaymentMetrics(state, 50n * one, 200n * one)),
      yethCheckpointMetrics: serializeYethRepaymentMetrics(baseline),
      yethDailyFlow: { recoveryNetFlowEth: (-5n * one).toString(), yieldNetFlowEth: "0" },
    });
    test.control.recoveryAssets = 45n * one;
    test.control.yieldAssets = 200n * one;
    await test.run();
    expect(test.delivered).toHaveLength(1);
    expect(test.delivered[0]).toContain("Recovery shortfall narrowed by 5.00 ETH");
    expect(test.delivered[0]).toContain("Coverage: 50.00%");
    expect(test.delivered[0]).not.toContain("55.56%");
    expect(test.delivered[0]).toContain("User withdrawals: -5.00 ETH");
    expect(test.delivered[0]).not.toContain("Yield, fees and losses");
  });
});
