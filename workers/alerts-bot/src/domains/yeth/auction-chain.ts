import {
  decodeEventLog,
  encodeFunctionData,
  parseAbi,
  toEventSelector,
  type Hex,
} from "viem";
import {
  auctionEnd,
  auctionPrice,
} from "../../../../../lib/clients/yeth/recovery/model";
import {
  RECOVERY_AUCTION,
  RECOVERY_WRAPPER,
  RECOVERY_WETH,
} from "../../../../../lib/clients/yeth/recovery/onchain";
import type { RecoveryAuction } from "../../../../../lib/clients/yeth/recovery/types";
import {
  YETH_CLAIM,
  YETH_RECOVERY_VAULT,
  YETH_YIELD_VAULT,
} from "../../contracts";
import type {
  RpcBlock,
  RpcClient,
  RpcLog,
  RpcTransactionReceipt,
} from "../../rpc";
import { WAD } from "./messages";

export const AUCTION = RECOVERY_AUCTION.toLowerCase();
export const WRAPPER = RECOVERY_WRAPPER.toLowerCase();
export const WETH = RECOVERY_WETH.toLowerCase();
export const VAULT = YETH_RECOVERY_VAULT.toLowerCase();
export const YIELD = YETH_YIELD_VAULT.toLowerCase();
export const TRANSFER = toEventSelector("Transfer(address,address,uint256)");
export const KICK = toEventSelector("AuctionKicked(address,uint256)");
export const DISABLED = toEventSelector("AuctionDisabled(address,address)");
export const SWEPT = toEventSelector("AuctionSwept(address,address)");
export const addressTopic = (address: string) =>
  "0x" + address.slice(2).toLowerCase().padStart(64, "0");
export const isWethAuctionEvent = (log: RpcLog, topic: string) =>
  log.address.toLowerCase() === AUCTION &&
  log.topics[0] === topic &&
  log.topics[1]?.toLowerCase() === addressTopic(WETH);
const abi = parseAbi([
  "function auction() view returns(address)",
  "function recoveryVault() view returns(address)",
  "function weth() view returns(address)",
  "function destination() view returns(address)",
  "function want() view returns(address)",
  "function receiver() view returns(address)",
  "function auctions(address) view returns(uint64,uint64,uint128)",
  "function startingPrice() view returns(uint256)",
  "function minimumPrice() view returns(uint256)",
  "function stepDuration() view returns(uint256)",
  "function stepDecayRate() view returns(uint256)",
  "function auctionLength() view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
  "function totalAssets() view returns(uint256)",
  "function totalSupply() view returns(uint256)",
  "function convertToAssets(uint256) view returns(uint256)",
  "function recovery_rate() view returns(uint256)",
  "function TARGET_PPS() view returns(uint256)",
]);
const transferAbi = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

export interface AuctionSnapshot {
  block: number;
  hash: string;
  at: number;
  enabled: boolean;
  kickedAt: number;
  initial: string;
  balance: string;
  startingPrice: string;
  minimumPrice: string;
  stepDuration: number;
  stepDecayBps: number;
  length: number;
  pps: string;
  targetPps: string;
  assets: string;
  supply: string;
  yieldAssets: string;
  recoveryRate: string;
  destination: string;
}

export function auctionModel(s: AuctionSnapshot): RecoveryAuction {
  return {
    kickedAt: s.kickedAt,
    initialWeth: BigInt(s.initial),
    remainingWeth: BigInt(s.balance),
    startingPrice: BigInt(s.startingPrice),
    minimumPrice: BigInt(s.minimumPrice),
    stepDuration: s.stepDuration,
    stepDecayBps: s.stepDecayBps,
    length: s.length,
  };
}
export const referenceRate = (s: AuctionSnapshot) =>
  (BigInt(s.pps) * BigInt(s.recoveryRate)) / WAD;
export function offer(s: AuctionSnapshot, now = s.at) {
  const model = auctionModel(s),
    price = auctionPrice(model, now);
  const end = s.kickedAt > 0 ? auctionEnd(model) : 0;
  const openingPrice = auctionPrice(model, s.kickedAt);
  const available =
    BigInt(s.balance) < BigInt(s.initial)
      ? BigInt(s.balance)
      : BigInt(s.initial);
  return {
    price,
    end,
    available,
    active: s.enabled && available > 0n && price > 0n,
    rate: price > 0n ? (BigInt(s.recoveryRate) * WAD) / price : 0n,
    opening:
      openingPrice > 0n ? (BigInt(s.recoveryRate) * WAD) / openingPrice : 0n,
  };
}
const word = (s: string) => {
  if (!/^0x[0-9a-f]{64}$/i.test(s))
    throw new Error("yeth_auction_read_invalid");
  return BigInt(s);
};
const integer = (s: string) => {
  const n = Number(word(s));
  if (!Number.isSafeInteger(n)) throw new Error("yeth_auction_integer_invalid");
  return n;
};
const address = (s: string) => {
  if (!/^0x0{24}[0-9a-f]{40}$/i.test(s))
    throw new Error("yeth_auction_address_invalid");
  return "0x" + s.slice(-40).toLowerCase();
};

export async function readAuctionSnapshot(
  rpc: RpcClient,
  block: RpcBlock,
): Promise<AuctionSnapshot> {
  if (block.timestamp === null)
    throw new Error("yeth_auction_timestamp_missing");
  const request = (
    to: string,
    functionName:
      | "auction"
      | "recoveryVault"
      | "weth"
      | "destination"
      | "want"
      | "receiver"
      | "startingPrice"
      | "minimumPrice"
      | "stepDuration"
      | "stepDecayRate"
      | "auctionLength"
      | "totalAssets"
      | "totalSupply"
      | "recovery_rate"
      | "TARGET_PPS",
  ) => ({ to, data: encodeFunctionData({ abi, functionName }) });
  const values = await rpc.call(
    [
      request(WRAPPER, "auction"),
      request(WRAPPER, "recoveryVault"),
      request(WRAPPER, "weth"),
      request(AUCTION, "want"),
      request(AUCTION, "receiver"),
      request(WRAPPER, "destination"),
      {
        to: AUCTION,
        data: encodeFunctionData({
          abi,
          functionName: "auctions",
          args: [RECOVERY_WETH],
        }),
      },
      request(AUCTION, "startingPrice"),
      request(AUCTION, "minimumPrice"),
      request(AUCTION, "stepDuration"),
      request(AUCTION, "stepDecayRate"),
      request(AUCTION, "auctionLength"),
      {
        to: WETH,
        data: encodeFunctionData({
          abi,
          functionName: "balanceOf",
          args: [RECOVERY_AUCTION],
        }),
      },
      {
        to: VAULT,
        data: encodeFunctionData({
          abi,
          functionName: "convertToAssets",
          args: [WAD],
        }),
      },
      request(VAULT, "totalAssets"),
      request(VAULT, "totalSupply"),
      request(YIELD, "totalAssets"),
      request(YETH_CLAIM, "recovery_rate"),
      request(VAULT, "TARGET_PPS"),
    ],
    { blockHash: block.hash, requireCanonical: true },
  );
  if (
    values.length !== 19 ||
    [AUCTION, VAULT, WETH, VAULT, WRAPPER].some(
      (v, i) => address(values[i]!) !== v,
    )
  )
    throw new Error("yeth_auction_identity_changed");
  if (!/^0x[0-9a-f]{192}$/i.test(values[6]!))
    throw new Error("yeth_auction_info_invalid");
  const parts = [0, 1, 2].map(
    (i) => "0x" + values[6]!.slice(2 + i * 64, 2 + (i + 1) * 64),
  );
  const scaler = word(parts[1]!);
  if (scaler !== 0n && scaler !== 1n)
    throw new Error("yeth_auction_scaler_invalid");
  const snapshot: AuctionSnapshot = {
    block: block.number,
    hash: block.hash,
    at: block.timestamp,
    enabled: scaler === 1n,
    kickedAt: integer(parts[0]!),
    initial: word(parts[2]!).toString(),
    destination: address(values[5]!),
    startingPrice: word(values[7]!).toString(),
    minimumPrice: word(values[8]!).toString(),
    stepDuration: integer(values[9]!),
    stepDecayBps: integer(values[10]!),
    length: integer(values[11]!),
    balance: word(values[12]!).toString(),
    pps: word(values[13]!).toString(),
    assets: word(values[14]!).toString(),
    supply: word(values[15]!).toString(),
    yieldAssets: word(values[16]!).toString(),
    recoveryRate: word(values[17]!).toString(),
    targetPps: word(values[18]!).toString(),
  };
  if (
    snapshot.stepDuration <= 0 ||
    snapshot.length > 604800 ||
    snapshot.stepDecayBps <= 0 ||
    snapshot.stepDecayBps >= 10000 ||
    snapshot.length / snapshot.stepDuration > 10000 ||
    BigInt(snapshot.recoveryRate) <= 0n ||
    BigInt(snapshot.targetPps) <= 0n
  )
    throw new Error("yeth_auction_terms_invalid");
  return snapshot;
}

export function canonicalLogs(
  logs: readonly RpcLog[],
  block: RpcBlock,
): RpcLog[] {
  const seen = new Set<number>();
  return [...logs]
    .filter((log) => !log.removed)
    .sort((a, b) => a.logIndex! - b.logIndex!)
    .map((log) => {
      if (
        log.blockNumber !== block.number ||
        log.blockHash?.toLowerCase() !== block.hash ||
        !Number.isSafeInteger(log.logIndex) ||
        log.logIndex! < 0 ||
        seen.has(log.logIndex!) ||
        !/^0x[0-9a-f]{64}$/i.test(log.transactionHash ?? "")
      )
        throw new Error("yeth_auction_log_invalid");
      seen.add(log.logIndex!);
      return log;
    });
}

export async function auctionLogs(
  rpc: RpcClient,
  fromBlock: number,
  toBlock: number,
): Promise<RpcLog[]> {
  const filters = [
    { address: [AUCTION], fromBlock, toBlock },
    {
      address: [WETH],
      topics: [TRANSFER, addressTopic(AUCTION)],
      fromBlock,
      toBlock,
    },
    {
      address: [WETH],
      topics: [TRANSFER, null, [AUCTION, WRAPPER, VAULT].map(addressTopic)],
      fromBlock,
      toBlock,
    },
  ];
  const batches = await Promise.all(filters.map((f) => rpc.getLogs(f)));
  const unique = new Map<string, RpcLog>();
  for (let i = 0; i < batches.length; i++)
    for (const log of batches[i]!) {
      const filter = filters[i]!;
      if (log.removed) continue;
      if (
        !filter.address.includes(log.address.toLowerCase()) ||
        log.blockNumber === null ||
        log.blockNumber < fromBlock ||
        log.blockNumber > toBlock ||
        (i > 0 && log.topics[0] !== TRANSFER) ||
        (i === 1 && log.topics[1]?.toLowerCase() !== addressTopic(AUCTION)) ||
        (i === 2 &&
          ![AUCTION, WRAPPER, VAULT]
            .map(addressTopic)
            .includes(log.topics[2]?.toLowerCase() ?? ""))
      )
        throw new Error("yeth_auction_partition_invalid");
      const id = `${log.blockNumber}:${log.logIndex}`;
      const prior = unique.get(id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(log))
        throw new Error("yeth_auction_duplicate_conflict");
      unique.set(id, log);
    }
  return [...unique.values()].sort(
    (a, b) => a.blockNumber! - b.blockNumber! || a.logIndex! - b.logIndex!,
  );
}

export function transfer(log: RpcLog) {
  if (log.topics[0] !== TRANSFER) return null;
  if (log.topics.length !== 3 || !/^0x[0-9a-f]{64}$/i.test(log.data))
    throw new Error("yeth_transfer_invalid");
  address(log.topics[1]!);
  address(log.topics[2]!);
  const decoded = decodeEventLog({
    abi: transferAbi,
    data: log.data as Hex,
    topics: log.topics as [Hex, ...Hex[]],
    strict: true,
  });
  return {
    from: decoded.args.from.toLowerCase(),
    to: decoded.args.to.toLowerCase(),
    value: decoded.args.value,
    log,
  };
}

export function receiptLogs(
  receipt: RpcTransactionReceipt | null,
  tx: string,
  block: RpcBlock,
): RpcLog[] {
  if (
    !receipt ||
    receipt.status !== 1 ||
    receipt.transactionHash.toLowerCase() !== tx ||
    receipt.blockNumber !== block.number ||
    receipt.blockHash?.toLowerCase() !== block.hash
  )
    throw new Error("yeth_auction_receipt_invalid");
  if (
    receipt.logs.some(
      (l) => l.transactionHash?.toLowerCase() !== tx || l.removed,
    )
  )
    throw new Error("yeth_auction_receipt_log_invalid");
  return canonicalLogs(receipt.logs, block);
}
