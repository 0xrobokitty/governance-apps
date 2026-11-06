import type { AuctionSnapshot } from "@/workers/alerts-bot/src/domains/yeth/auction-chain";
import type { YethBlockFacts } from "@/workers/alerts-bot/src/domains/yeth/messaging-state";
import type { RpcLog } from "@/workers/alerts-bot/src/rpc";
import {
  TRANSFER,
  addressTopic,
} from "@/workers/alerts-bot/src/domains/yeth/auction-chain";

export const wad = 10n ** 18n;
export const alice = "0x1111111111111111111111111111111111111111";
export const bob = "0x2222222222222222222222222222222222222222";
export const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
export const word = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;
export const started = 1_800_000_000;
export function snapshot(
  overrides: Partial<AuctionSnapshot> = {},
): AuctionSnapshot {
  return {
    block: 26_300_000,
    hash: hash(26_300_000),
    at: started,
    enabled: true,
    kickedAt: started,
    initial: String(10n * wad),
    balance: String(10n * wad),
    startingPrice: String(10n * wad),
    minimumPrice: String((35n * wad) / 100n),
    stepDuration: 225,
    stepDecayBps: 4,
    length: 604800,
    pps: String(wad),
    targetPps: "2857142857142857142",
    recoveryRate: String((35n * wad) / 100n),
    assets: String(100n * wad),
    supply: String(100n * wad),
    yieldAssets: String(1000n * wad),
    destination: bob,
    ...overrides,
  };
}
export function facts(overrides: Partial<YethBlockFacts> = {}): YethBlockFacts {
  return {
    trades: [],
    kick: null,
    stopped: null,
    funding: [],
    retired: 0n,
    holderClaims: 300n * wad,
    actions: [],
    names: {},
    dailyGrowth: null,
    expectedCapitalOutflow: 0n,
    ...overrides,
  };
}
export function transferLog(
  token: string,
  from: string,
  to: string,
  amount: bigint,
  index: number,
  tx = hash(1),
): RpcLog {
  const s = snapshot();
  return {
    address: token,
    topics: [TRANSFER, addressTopic(from), addressTopic(to)],
    data: word(amount),
    blockNumber: s.block,
    blockHash: s.hash,
    transactionHash: tx,
    logIndex: index,
    removed: false,
  };
}
