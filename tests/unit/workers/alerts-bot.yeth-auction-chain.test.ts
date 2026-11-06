import { describe, expect, it, vi } from "vitest";
import {
  AUCTION,
  WRAPPER,
  VAULT,
  WETH,
  SWEPT,
  addressTopic,
  auctionLogs,
  canonicalLogs,
  readAuctionSnapshot,
  receiptLogs,
  transfer,
} from "@/workers/alerts-bot/src/domains/yeth/auction-chain";
import {
  tradesFromReceipt,
  recoveryForecast,
} from "@/workers/alerts-bot/src/domains/yeth/messaging-scanner";
import type {
  RpcCallRequest,
  RpcBlockReference,
  RpcClient,
  RpcLog,
} from "@/workers/alerts-bot/src/rpc";
import {
  alice,
  bob,
  hash,
  snapshot,
  transferLog,
  wad,
  word,
} from "./alerts-bot.yeth-messaging-fixtures";

const s = snapshot();
const block = {
  number: s.block,
  hash: s.hash,
  parentHash: hash(s.block - 1),
  timestamp: s.at,
};
const sweep = (token: string, index: number): RpcLog => ({
  ...transferLog(token, AUCTION, WRAPPER, wad, index),
  address: AUCTION,
  topics: [SWEPT, addressTopic(token), addressTopic(WRAPPER)],
  data: "0x",
});
const callValues = () =>
  [AUCTION, VAULT, WETH, VAULT, WRAPPER, bob]
    .map(addressTopic)
    .concat([
      word(BigInt(s.kickedAt)) +
        word(1n).slice(2) +
        word(BigInt(s.initial)).slice(2),
      ...[
        s.startingPrice,
        s.minimumPrice,
        s.stepDuration,
        s.stepDecayBps,
        s.length,
        s.balance,
        s.pps,
        s.assets,
        s.supply,
        s.yieldAssets,
        s.recoveryRate,
        s.targetPps,
      ].map((n) => word(BigInt(n))),
    ]);

describe("canonical auction evidence", () => {
  it("pins all auction and vault reads to one canonical block hash", async () => {
    const call = vi.fn<
      (
        _requests: readonly RpcCallRequest[],
        _block: RpcBlockReference,
      ) => Promise<string[]>
    >(async () => callValues());
    const result = await readAuctionSnapshot(
      { call } as unknown as RpcClient,
      block,
    );
    expect(result).toEqual(s);
    expect(call.mock.calls[0]).toEqual([
      expect.any(Array),
      { blockHash: block.hash, requireCanonical: true },
    ]);
    expect(call.mock.calls[0]![0]).toHaveLength(19);
  });

  it.each(["identity", "scaler", "word", "target"])(
    "rejects changed or malformed contract state: %s",
    async (scenario) => {
      const values = callValues();
      if (scenario === "identity") values[4] = addressTopic(alice);
      if (scenario === "scaler")
        values[6] =
          word(BigInt(s.kickedAt)) +
          word(2n).slice(2) +
          word(BigInt(s.initial)).slice(2);
      if (scenario === "word") values[7] = "0x01";
      if (scenario === "target") values[18] = word(0n);
      await expect(
        readAuctionSnapshot(
          { call: async () => values } as unknown as RpcClient,
          block,
        ),
      ).rejects.toThrow();
    },
  );

  it("requires successful canonical receipts and unique log identities", () => {
    const logs = [transferLog(WETH, AUCTION, alice, wad, 1)];
    const receipt = {
      transactionHash: hash(1),
      blockHash: block.hash,
      blockNumber: block.number,
      status: 1,
      logs,
    };
    expect(receiptLogs(receipt, hash(1), block)).toEqual(logs);
    expect(() =>
      receiptLogs({ ...receipt, status: 0 }, hash(1), block),
    ).toThrow();
    expect(() =>
      receiptLogs({ ...receipt, blockHash: hash(100) }, hash(1), block),
    ).toThrow();
    expect(() => canonicalLogs([...logs, ...logs], block)).toThrow();
    expect(() =>
      canonicalLogs([{ ...logs[0]!, blockHash: hash(2) }], block),
    ).toThrow();
    expect(() =>
      transfer({
        ...logs[0]!,
        topics: [logs[0]!.topics[0]!, "0x01", addressTopic(alice)],
      }),
    ).toThrow();
  });

  it("deduplicates overlapping queries but rejects out-of-partition results", async () => {
    const log = transferLog(WETH, AUCTION, WRAPPER, wad, 1);
    const rpc = {
      getLogs: vi.fn(async (f: { address: string[] }) =>
        f.address[0] === AUCTION ? [] : [log],
      ),
    } as unknown as RpcClient;
    expect(await auctionLogs(rpc, block.number, block.number)).toEqual([log]);
    const bad = {
      getLogs: async () => [transferLog(WETH, alice, bob, wad, 1)],
    } as unknown as RpcClient;
    await expect(auctionLogs(bad, block.number, block.number)).rejects.toThrow(
      "partition_invalid",
    );
  });

  it("proves a direct take with a separate recipient", () => {
    const fills = tradesFromReceipt(
      [
        transferLog(WETH, AUCTION, bob, wad, 1),
        transferLog(VAULT, alice, WRAPPER, 2n * wad, 2),
      ],
      2n * wad,
    );
    expect(fills).toEqual([
      { payer: alice, receiver: bob, weth: wad, shares: 2n * wad },
    ]);
  });

  it("handles multiple direct takes without assigning one payer's cost to another", () => {
    const fills = tradesFromReceipt(
      [
        transferLog(WETH, AUCTION, alice, wad, 1),
        transferLog(VAULT, alice, WRAPPER, 2n * wad, 2),
        transferLog(WETH, AUCTION, bob, 2n * wad, 3),
        transferLog(VAULT, bob, WRAPPER, 4n * wad, 4),
      ],
      2n * wad,
    );
    expect(fills).toEqual([
      { payer: alice, receiver: alice, weth: wad, shares: 2n * wad },
      { payer: bob, receiver: bob, weth: 2n * wad, shares: 4n * wad },
    ]);
  });

  it("keeps batched CoW-style transfers with uncertain payer attribution", () => {
    const fills = tradesFromReceipt(
      [
        transferLog(WETH, AUCTION, alice, wad, 1),
        transferLog(WETH, AUCTION, bob, 2n * wad, 2),
        transferLog(VAULT, alice, WRAPPER, 6n * wad, 3),
      ],
      2n * wad,
    );
    expect(fills).toHaveLength(2);
    expect(fills.every((f) => f.payer === null && f.shares === null)).toBe(
      true,
    );
    expect(fills.reduce((n, f) => n + f.weth, 0n)).toBe(3n * wad);
  });

  it("does not count sweeps as takes, including a sweep beside a legitimate take", () => {
    expect(
      tradesFromReceipt(
        [transferLog(WETH, AUCTION, WRAPPER, wad, 1), sweep(WETH, 2)],
        wad,
      ),
    ).toEqual([]);
    const mixed = [
      transferLog(WETH, AUCTION, alice, wad, 1),
      transferLog(VAULT, alice, WRAPPER, wad, 2),
      transferLog(WETH, AUCTION, WRAPPER, wad, 3),
      sweep(WETH, 4),
    ];
    expect(tradesFromReceipt(mixed, wad)).toEqual([
      { payer: alice, receiver: alice, weth: wad, shares: wad },
    ]);
    expect(
      tradesFromReceipt([...mixed.slice(0, 2), sweep(bob, 3)], wad),
    ).toHaveLength(1);
  });

  it("rejects outgoing funds without a proven payment", () => {
    expect(() =>
      tradesFromReceipt([transferLog(WETH, AUCTION, alice, wad, 1)], wad),
    ).toThrow("fill_unproven");
    expect(() =>
      tradesFromReceipt(
        [
          transferLog(WETH, AUCTION, alice, wad, 1),
          transferLog(VAULT, alice, WRAPPER, 1n, 2),
        ],
        wad,
      ),
    ).toThrow("fill_unproven");
  });

  it("omits the optional holding estimate if the app feed is absent or unavailable", async () => {
    expect(await recoveryForecast(undefined, s, s.at)).toBeNull();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(null, { status: 503 }),
    );
    expect(await recoveryForecast({ fetch }, s, s.at)).toBeNull();
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    warn.mockRestore();
  });
});
