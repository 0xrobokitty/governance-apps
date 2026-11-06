import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";
import {
  createEmptyYethState,
  applyYethClaim,
  applyYethSetClaim,
  applyYethShareMintFromClaimStay,
  applyYethTransferLedger,
} from "@/workers/alerts-bot/src/domains/yeth/accounting";
import { scanMessagingRange } from "@/workers/alerts-bot/src/domains/yeth/messaging-scanner";
import { initializeMessaging } from "@/workers/alerts-bot/src/domains/yeth/messaging-state";
import {
  AUCTION,
  VAULT,
  WRAPPER,
  WETH,
  addressTopic,
  KICK,
} from "@/workers/alerts-bot/src/domains/yeth/auction-chain";
import type { RpcClient, RpcLog } from "@/workers/alerts-bot/src/rpc";
import {
  alice,
  bob,
  hash,
  snapshot,
  transferLog,
  wad,
  word,
} from "./alerts-bot.yeth-messaging-fixtures";

const zero = "0x0000000000000000000000000000000000000000";
function ledger() {
  const state = createEmptyYethState();
  applyYethSetClaim(state, alice, 3n * wad);
  applyYethClaim(state, alice, false, 3n * wad);
  applyYethTransferLedger(state, zero, alice, wad);
  applyYethShareMintFromClaimStay(state, alice, wad, 3n * wad);
  return state;
}

function fixture(
  logs: RpcLog[],
  overrides: Partial<ReturnType<typeof snapshot>> = {},
) {
  const s = snapshot({ ...overrides });
  const rpc = {
    getLogs: vi.fn(async (filter: Parameters<RpcClient["getLogs"]>[0]) =>
      logs.filter(
        (l) =>
          l.blockNumber! >= filter.fromBlock &&
          l.blockNumber! <= filter.toBlock &&
          (!filter.address ||
            filter.address.some(
              (a) => a.toLowerCase() === l.address.toLowerCase(),
            )) &&
          (!filter.topics ||
            filter.topics.every(
              (t, i) =>
                t === null ||
                (Array.isArray(t)
                  ? t.includes(l.topics[i]!)
                  : t === l.topics[i]),
            )),
      ),
    ),
    getBlockByNumber: vi.fn(async (n: number) => ({
      number: n,
      hash: hash(n),
      parentHash: hash(n - 1),
      timestamp: s.at,
    })),
    getTransactionReceipt: vi.fn(async (tx: string) => ({
      transactionHash: tx,
      blockHash: s.hash,
      blockNumber: s.block,
      status: 1,
      logs: logs.filter((l) => l.transactionHash === tx),
    })),
    call: vi.fn(async (request: unknown) => {
      if (!Array.isArray(request)) return word(0n);
      if (request.length !== 19) throw new Error("Optional ENS not configured");
      return [AUCTION, VAULT, WETH, VAULT, WRAPPER, bob]
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
    }),
  } as unknown as RpcClient;
  const messaging = initializeMessaging(
    snapshot({ block: s.block - 1, hash: hash(s.block - 1) }),
  );
  return {
    rpc,
    s,
    messaging,
    run: () =>
      scanMessagingRange({
        rpc,
        fromBlock: s.block,
        toBlock: s.block,
        ledger: ledger(),
        messaging,
        now: s.at,
      }),
  };
}

describe("auction scanner and share ledger integration", () => {
  it("delivers a verified take while retaining principal in wrapper custody", async () => {
    const f = fixture(
      [
        transferLog(WETH, AUCTION, alice, wad, 1),
        transferLog(VAULT, alice, WRAPPER, wad, 2),
      ],
      { balance: String(9n * wad) },
    );
    const result = await f.run();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.html).toContain("auction · take");
    expect(result.messages[0]!.html).toContain("position closed");
    expect(result.messages[0]!.html).not.toContain("Claims retired");
    expect(result.ledger.snapshotStayedEth).toBe(3n * wad);
    expect(result.ledger.trackedStayedCostBasisByAddress.get(WRAPPER)).toBe(
      3n * wad,
    );
    expect(result.state.paidSinceWeekly).toBe(String(wad));
  });

  it("settles principal only on wrapper redemption and avoids a duplicate holder payout", async () => {
    const withdrawAbi = parseAbi([
      "event Withdraw(address indexed sender,address indexed receiver,address indexed owner,uint256 assets,uint256 shares)",
    ]);
    const withdraw: RpcLog = {
      ...transferLog(VAULT, WRAPPER, zero, wad, 4),
      topics: encodeEventTopics({
        abi: withdrawAbi,
        eventName: "Withdraw",
        args: {
          sender: WRAPPER as `0x${string}`,
          receiver: WRAPPER as `0x${string}`,
          owner: WRAPPER as `0x${string}`,
        },
      }) as string[],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        [wad, wad],
      ),
    };
    const logs = [
      transferLog(WETH, AUCTION, alice, wad, 1),
      transferLog(VAULT, alice, WRAPPER, wad, 2),
      transferLog(VAULT, WRAPPER, zero, wad, 3),
      withdraw,
      transferLog(WETH, VAULT, WRAPPER, wad, 5),
    ];
    const result = await fixture(logs, { balance: String(9n * wad) }).run();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.html).toContain("Claims retired: 3.00 ETH");
    expect(result.messages[0]!.html).not.toContain("vault exit");
    expect(result.ledger.snapshotStayedEth).toBe(0n);
    expect(result.state.paidSinceWeekly).toBe(String(wad));
  });

  it("recognizes an opening and combines its funding without a second funding post", async () => {
    const kick = {
      ...transferLog(WETH, bob, AUCTION, 10n * wad, 2),
      address: AUCTION,
      topics: [KICK, addressTopic(WETH)],
      data: word(10n * wad),
    };
    const f = fixture([transferLog(WETH, bob, AUCTION, 10n * wad, 1), kick]);
    f.messaging.round = null;
    const result = await f.run();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.html).toContain("auction · open");
    expect(result.state.fundingSinceWeekly).toBe(String(10n * wad));
  });

  it("fails closed if the receipt does not prove the queried transfer", async () => {
    const f = fixture([
      transferLog(WETH, AUCTION, alice, wad, 1),
      transferLog(VAULT, alice, WRAPPER, wad, 2),
    ]);
    f.rpc.getTransactionReceipt = (async () => ({
      transactionHash: hash(1),
      blockHash: f.s.hash,
      blockNumber: f.s.block,
      status: 1,
      logs: [],
    })) as unknown as RpcClient["getTransactionReceipt"];
    await expect(f.run()).rejects.toThrow("receipt_query_mismatch");
    expect(f.messaging.round?.takes).toBe(0);
  });
});
