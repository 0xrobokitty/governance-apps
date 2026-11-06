import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertState } from "@/workers/alerts-bot/src/runtime";
import type { AlertsEnv } from "@/workers/alerts-bot/src/config";
import {
  createEmptyYethState,
  serializeYethState,
  buildYethRepaymentMetrics,
} from "@/workers/alerts-bot/src/domains/yeth/accounting";
import {
  initializeMessaging,
  planYethMessages,
  type YethMessagingState,
} from "@/workers/alerts-bot/src/domains/yeth/messaging-state";
import { scanMessagingRange } from "@/workers/alerts-bot/src/domains/yeth/messaging-scanner";
import { readAuctionSnapshot } from "@/workers/alerts-bot/src/domains/yeth/auction-chain";
import { sendMessage } from "@/workers/alerts-bot/src/telegram";
import { createRpcClient } from "@/workers/alerts-bot/src/rpc";
import {
  alice,
  facts,
  hash,
  snapshot,
  started,
  wad,
} from "./alerts-bot.yeth-messaging-fixtures";

vi.mock("@/workers/alerts-bot/src/rpc", async (original) => ({
  ...(await original<typeof import("@/workers/alerts-bot/src/rpc")>()),
  createRpcClient: vi.fn(),
}));
vi.mock(
  "@/workers/alerts-bot/src/domains/yeth/auction-chain",
  async (original) => ({
    ...(await original<
      typeof import("@/workers/alerts-bot/src/domains/yeth/auction-chain")
    >()),
    readAuctionSnapshot: vi.fn(),
  }),
);
vi.mock("@/workers/alerts-bot/src/domains/yeth/messaging-scanner", () => ({
  scanMessagingRange: vi.fn(),
}));
vi.mock("@/workers/alerts-bot/src/telegram", async (original) => ({
  ...(await original<typeof import("@/workers/alerts-bot/src/telegram")>()),
  sendMessage: vi.fn(),
}));

class MemoryStorage {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string) {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
  }
}
const base = snapshot().block;
const env: AlertsEnv = {
  ALERT_STATE: {} as DurableObjectNamespace,
  RPC_URL: "https://rpc.invalid",
  TELEGRAM_BOT_TOKEN: "test",
  ADMIN_TOKEN: "test",
  YETH_TELEGRAM_CHAT_ID: "test-yeth",
  ALERTS_YETH_ENABLED: "true",
  YETH_UPGRADED_MESSAGES_ENABLED: "true",
};
let storage: MemoryStorage;
let head: number;
let clock: number;
const run = (overrides: Partial<AlertsEnv> = {}) =>
  new AlertState({ storage } as unknown as DurableObjectState, {
    ...env,
    ...overrides,
  }).fetch(
    new Request("https://alerts.internal/run?domain=yeth", { method: "POST" }),
  );
const saved = () =>
  storage.values.get("state:v1") as {
    cursorBlock: number;
    yethMessaging: YethMessagingState;
  };

beforeEach(() => {
  vi.clearAllMocks();
  storage = new MemoryStorage();
  head = base;
  clock = started;
  vi.spyOn(Date, "now").mockImplementation(() => {
    clock += 2;
    return clock * 1000;
  });
  const ledger = createEmptyYethState();
  storage.values.set("state:v1", {
    version: 1,
    domainId: "yeth",
    cursorBlock: base,
    cursorHash: hash(base),
    lastObservedHead: base,
    lastRunAt: null,
    lastSuccessAt: null,
    lastErrorCode: null,
    telegramRetryAfterUntil: null,
    yethState: serializeYethState(ledger),
    yethMetrics: null,
    yethCheckpointMetrics: null,
    yethDailyFlow: { recoveryNetFlowEth: "0", yieldNetFlowEth: "0" },
    teamsState: null,
    ybcState: null,
  });
  storage.values.set("sent:historical-yeth-message", true);
  vi.mocked(createRpcClient).mockReturnValue({
    getBlockNumber: async () => head + 6,
    getBlockByNumber: async (n: number) => ({
      number: n,
      hash: hash(n),
      parentHash: hash(n - 1),
      timestamp: started,
    }),
    getLogs: async () => [],
    call: async () => ["0x" + "0".repeat(64), "0x" + "0".repeat(64)],
  } as unknown as ReturnType<typeof createRpcClient>);
  vi.mocked(readAuctionSnapshot).mockImplementation(async (_rpc, b) =>
    snapshot({ block: b.number, hash: b.hash }),
  );
  vi.mocked(sendMessage).mockResolvedValue(undefined);
  vi.mocked(scanMessagingRange).mockImplementation(async (p) => {
    const s = snapshot({ block: p.fromBlock, hash: hash(p.fromBlock) });
    const trades = Array.from({ length: 6 }, (_, i) => ({
      tx: hash(i + 1),
      index: i,
      final: false,
      fills: [{ payer: alice, receiver: alice, weth: wad, shares: wad }],
    }));
    const result = planYethMessages(p.messaging, s, facts({ trades }), clock);
    return {
      ...result,
      terminalBlock: s.block,
      terminalHash: s.hash,
      ledger,
      metrics: buildYethRepaymentMetrics(ledger, 0n, 0n),
    };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("forward-only yETH messaging activation and delivery", () => {
  it("pins an unfinished range even as the chain head advances", async () => {
    await run();
    head++;
    await run();
    expect(storage.values.get("state:v1")).toMatchObject({
      yethPendingBlock: base + 1,
      yethPendingHash: hash(base + 1),
    });
    head++;
    vi.mocked(scanMessagingRange).mockClear();
    await run({ MAX_RANGES_PER_RUN: "1" });
    expect(vi.mocked(scanMessagingRange).mock.calls[0]![0].toBlock).toBe(
      base + 1,
    );
    expect(saved().cursorBlock).toBe(base + 1);
    expect(storage.values.get("state:v1")).toMatchObject({
      yethPendingBlock: undefined,
    });
    expect(sendMessage).toHaveBeenCalledTimes(6);
  });
  it("persists a silent cutover in the existing object without replacing messages or resetting receipts", async () => {
    expect(await (await run()).json()).toMatchObject({
      outcome: "caught_up",
      cursorBlock: base,
    });
    expect(saved().yethMessaging.cutoverBlock).toBe(base);
    expect(storage.values.get("sent:historical-yeth-message")).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(scanMessagingRange).not.toHaveBeenCalled();
    const object = new AlertState(
      { storage } as unknown as DurableObjectState,
      env,
    );
    const status = await object.fetch(
      new Request("https://alerts.internal/status?domain=yeth"),
    );
    expect(await status.json()).toMatchObject({
      messagingVersion: 2,
      messagingCutoverBlock: base,
      caughtUp: true,
    });
  });

  it("preserves every take across the five-message cap and a Durable Object restart", async () => {
    await run();
    head++;
    expect(await (await run()).json()).toMatchObject({
      outcome: "message_cap",
      messagesSent: 5,
    });
    expect(saved().cursorBlock).toBe(base);
    expect(saved().yethMessaging.round?.takes).toBe(0);
    expect(await (await run()).json()).toMatchObject({
      outcome: "caught_up",
      messagesSent: 1,
    });
    expect(sendMessage).toHaveBeenCalledTimes(6);
    expect(
      new Set(vi.mocked(sendMessage).mock.calls.map((c) => c[1])).size,
    ).toBe(6);
    expect(saved().cursorBlock).toBe(base + 1);
    expect(saved().yethMessaging.round?.takes).toBe(6);
    expect(saved().yethMessaging.round?.paid).toBe(String(6n * wad));
    await run();
    expect(sendMessage).toHaveBeenCalledTimes(6);
    expect(storage.values.get("sent:historical-yeth-message")).toBe(true);
  });

  it("retries a failed send without repeating accepted messages or double-counting payouts", async () => {
    await run();
    head++;
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("offline"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await run()).status).toBe(500);
    expect(saved().cursorBlock).toBe(base);
    expect(await (await run()).json()).toMatchObject({
      outcome: "caught_up",
      messagesSent: 5,
    });
    expect(sendMessage).toHaveBeenCalledTimes(7); // six accepted, one failed
    expect(saved().yethMessaging.paidSinceWeekly).toBe(String(6n * wad));
    error.mockRestore();
  });

  it("pauses after activation when the upgrade flag is disabled, retaining the cursor", async () => {
    await run();
    head++;
    expect(
      await (await run({ YETH_UPGRADED_MESSAGES_ENABLED: "false" })).json(),
    ).toMatchObject({ outcome: "messaging_paused", cursorBlock: base });
    expect(scanMessagingRange).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("finishes existing legacy backlog before the fixed upgrade boundary", async () => {
    storage.values.set("state:v1", {
      ...saved(),
      cursorBlock: base - 2,
      cursorHash: hash(base - 2),
    });
    expect(await (await run()).json()).toMatchObject({
      outcome: "caught_up",
      cursorBlock: base,
    });
    expect(scanMessagingRange).not.toHaveBeenCalled();
    expect(saved().yethMessaging.cutoverBlock).toBe(base);
    expect(saved().yethMessaging.round?.complete).toBe(false);
  });

  it("rejects a changed cutover block while legacy backlog is catching up", async () => {
    storage.values.set("state:v1", {
      ...saved(),
      cursorBlock: base - 2,
      cursorHash: hash(base - 2),
      yethMessaging: initializeMessaging(snapshot({ hash: hash(99) })),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await (await run()).json()).toMatchObject({
      code: "yeth_cutover_reorg_detected",
    });
    expect(saved().cursorBlock).toBe(base - 2);
    expect(sendMessage).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
