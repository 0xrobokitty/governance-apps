import { decodeEventLog, erc20Abi, parseAbi, parseAbiItem, type Address, type Hash, type PublicClient, type TransactionReceipt } from "viem";
import { YETH_CLAIM, YETH_RECOVERY_VAULT } from "../deployment";
import type { RecoveryAuction } from "./types";

export const RECOVERY_WRAPPER = "0x26868F94684dEC5Ea6fF93ccc06aBde1015ce2CE" as const;
export const RECOVERY_AUCTION = "0x68383672a70Ae3B78e5E2a67D78cf1E379BE3801" as const;
export const RECOVERY_WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
export const recoveryVaultAbi = parseAbi([
  "function asset() view returns (address)", "function maxRedeem(address) view returns (uint256)",
  "function previewRedeem(uint256) view returns (uint256)", "function previewWithdraw(uint256) view returns (uint256)",
  "function redeem(uint256,address,address) returns (uint256)",
]);
export const recoveryAuctionAbi = parseAbi([
  "function auctions(address) view returns (uint64 kicked,uint64 scaler,uint128 initialAvailable)",
  "function available(address) view returns (uint256)", "function price(address) view returns (uint256)",
  "function getAmountNeeded(address,uint256) view returns (uint256)",
  "function startingPrice() view returns (uint256)", "function minimumPrice() view returns (uint256)",
  "function stepDuration() view returns (uint256)", "function stepDecayRate() view returns (uint256)",
  "function auctionLength() view returns (uint256)", "function receiver() view returns (address)",
  "function want() view returns (address)", "function take(address,uint256,address) returns (uint256)",
]);
const wrapperAbi = parseAbi(["function auction() view returns (address)", "function recoveryVault() view returns (address)", "function weth() view returns (address)"]);
const claimAbi = parseAbi(["function recovery_rate() view returns (uint256)"]);
const WAD = 10n ** 18n;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export type RecoveryAccountState = {
  address: Address; chainId: number; blockNumber: bigint; blockHash: Hash; blockTimestamp: number;
  shares: bigint; allowance: bigint; wethBalance: bigint; maxRedeem: bigint; directAssets: bigint;
  vaultPps: bigint; recoveryRate: bigint; auction: RecoveryAuction | null; auctionPrice: bigint;
  positionTransfersSinceIndexed?: boolean;
};
export type RecoveryActionQuote = {
  address: Address; chainId: number; blockNumber: bigint; quotedAt: number;
  round: string; requestedWeth: bigint; maxShares: bigint; price: bigint;
};
export type RecoveryActionReceipt = { hash: Hash; blockNumber: bigint; wethReceived: bigint; sharesSpent: bigint; remainingShares: bigint };

export function recoveryRound(auction: RecoveryAuction | null) {
  return auction ? [auction.kickedAt, auction.initialWeth, auction.startingPrice, auction.minimumPrice, auction.stepDuration, auction.stepDecayBps, auction.length].join(":") : "inactive";
}
export function createRecoveryActionQuote(state: RecoveryAccountState, options: { requestedWeth?: bigint; maxShares?: bigint; reuseAllowance?: boolean } = {}): RecoveryActionQuote {
  if (!state.auction || state.auctionPrice <= 0n || state.auction.remainingWeth <= 0n) throw new Error("No auction is available.");
  const budget = options.maxShares ?? state.shares;
  const affordable = budget * WAD / state.auctionPrice;
  const available = state.auction.remainingWeth < affordable ? state.auction.remainingWeth : affordable;
  const requestedWeth = options.requestedWeth ?? available;
  const cost = requestedWeth * state.auctionPrice / WAD;
  if (requestedWeth <= 0n || requestedWeth > state.auction.remainingWeth || cost <= 0n || cost > budget || cost > state.shares) throw new Error("The auction amount exceeds your available shares or auction liquidity.");
  // Only a new review may opt into an already approved budget. Keep that full
  // allowance visible as the cap; a smaller current cost does not reduce it.
  const maxShares = options.reuseAllowance && state.allowance > 0n &&
    state.allowance <= state.shares && cost <= state.allowance
    ? state.allowance : cost;
  return { address: state.address, chainId: state.chainId, blockNumber: state.blockNumber, quotedAt: state.blockTimestamp, round: recoveryRound(state.auction), requestedWeth, maxShares, price: state.auctionPrice };
}
export const recoveryAllowanceNeedsReset = (state: RecoveryAccountState, quote: RecoveryActionQuote) => state.allowance > 0n && state.allowance !== quote.maxShares;

/** All required reads share one block. A failed read never falls back to a feed quote. */
export async function readRecoveryAccount(client: PublicClient, address: Address, chainId: number, indexedBlock?: bigint): Promise<RecoveryAccountState> {
  if (await client.getChainId() !== chainId || ![1, 31337].includes(chainId)) throw new Error("Connect to the supported Ethereum network.");
  const block = await client.getBlock({ blockTag: "latest" });
  if (!block.hash) throw new Error("The latest block is not confirmed.");
  if (chainId === 1 && Math.abs(Date.now() / 1000 - Number(block.timestamp)) > 180) throw new Error("Ethereum data is stale. Refresh before continuing.");
  const common = { blockNumber: block.number, allowFailure: false } as const;
  const result = await client.multicall({ ...common, contracts: [
    { address: RECOVERY_WRAPPER, abi: wrapperAbi, functionName: "auction" },
    { address: RECOVERY_WRAPPER, abi: wrapperAbi, functionName: "recoveryVault" },
    { address: RECOVERY_WRAPPER, abi: wrapperAbi, functionName: "weth" },
    { address: RECOVERY_AUCTION, abi: recoveryAuctionAbi, functionName: "want" },
    { address: RECOVERY_AUCTION, abi: recoveryAuctionAbi, functionName: "receiver" },
    { address: YETH_RECOVERY_VAULT, abi: recoveryVaultAbi, functionName: "asset" },
    { address: YETH_RECOVERY_VAULT, abi: erc20Abi, functionName: "decimals" },
    { address: YETH_RECOVERY_VAULT, abi: erc20Abi, functionName: "balanceOf", args: [address] },
    { address: YETH_RECOVERY_VAULT, abi: erc20Abi, functionName: "allowance", args: [address, RECOVERY_AUCTION] },
    { address: RECOVERY_WETH, abi: erc20Abi, functionName: "balanceOf", args: [address] },
    { address: YETH_RECOVERY_VAULT, abi: recoveryVaultAbi, functionName: "maxRedeem", args: [address] },
    { address: YETH_RECOVERY_VAULT, abi: recoveryVaultAbi, functionName: "previewRedeem", args: [WAD] },
    { address: YETH_CLAIM, abi: claimAbi, functionName: "recovery_rate" },
    { address: RECOVERY_AUCTION, abi: recoveryAuctionAbi, functionName: "auctions", args: [RECOVERY_WETH] },
    { address: RECOVERY_AUCTION, abi: recoveryAuctionAbi, functionName: "available", args: [RECOVERY_WETH] },
    { address: RECOVERY_AUCTION, abi: recoveryAuctionAbi, functionName: "price", args: [RECOVERY_WETH] },
    { address: RECOVERY_AUCTION, abi: recoveryAuctionAbi, functionName: "startingPrice" },
    { address: RECOVERY_AUCTION, abi: recoveryAuctionAbi, functionName: "minimumPrice" },
    { address: RECOVERY_AUCTION, abi: recoveryAuctionAbi, functionName: "stepDuration" },
    { address: RECOVERY_AUCTION, abi: recoveryAuctionAbi, functionName: "stepDecayRate" },
    { address: RECOVERY_AUCTION, abi: recoveryAuctionAbi, functionName: "auctionLength" },
  ] });
  const [auctionAddress,vault,weth,want,receiver,asset,decimals,shares,allowance,wethBalance,maxRedeem,vaultPps,recoveryRate,info,remainingWeth,auctionPrice,startingPrice,minimumPrice,stepDuration,stepDecayBps,length] = result;
  if (!same(auctionAddress, RECOVERY_AUCTION) || !same(vault, YETH_RECOVERY_VAULT) || !same(weth, RECOVERY_WETH) || !same(want, YETH_RECOVERY_VAULT) || !same(receiver, RECOVERY_WRAPPER) || !same(asset, RECOVERY_WETH) || decimals !== 18 || (info[1] !== 1n && !(info[1] === 0n && info[0] === 0n)) || recoveryRate <= 0n) throw new Error("The recovery contract configuration has changed. Transactions are unavailable.");
  const directAssets = await client.readContract({
    address: YETH_RECOVERY_VAULT, abi: recoveryVaultAbi, functionName: "previewRedeem",
    args: [shares], blockNumber: block.number,
  });
  let positionTransfersSinceIndexed: boolean | undefined;
  if (indexedBlock !== undefined && indexedBlock <= block.number && block.number - indexedBlock <= 2000n) {
    if (indexedBlock === block.number) positionTransfersSinceIndexed = false;
    else {
      try {
        const event = parseAbiItem("event Transfer(address indexed from,address indexed to,uint256 value)");
        const events = await Promise.all(["from", "to"].map((key) => client.getLogs({ address: YETH_RECOVERY_VAULT, event, args: { [key]: address }, fromBlock: indexedBlock + 1n, toBlock: block.number })));
        positionTransfersSinceIndexed = events.some((logs) => logs.length > 0);
      } catch { /* Missing transfer proof hides personal attribution, not executable chain balances. */ }
    }
  }
  return { address, chainId, blockNumber: block.number, blockHash: block.hash, blockTimestamp: Number(block.timestamp), shares, allowance, wethBalance, maxRedeem, directAssets, vaultPps, recoveryRate, auctionPrice, positionTransfersSinceIndexed,
    auction: info[0] > 0n ? { kickedAt: Number(info[0]), initialWeth: info[2], remainingWeth, startingPrice, minimumPrice, stepDuration: Number(stepDuration), stepDecayBps: Number(stepDecayBps), length: Number(length) } : null };
}

export function validateRecoveryTake(state: RecoveryAccountState, quote: RecoveryActionQuote) {
  if (!same(state.address, quote.address) || state.chainId !== quote.chainId) throw new Error("Your wallet changed. Review the amount again.");
  if (recoveryRound(state.auction) !== quote.round) throw new Error("The auction restarted or changed. Review the new offer.");
  if (!state.auction || state.auctionPrice <= 0n || state.auction.remainingWeth <= 0n) throw new Error("This auction has ended.");
  if (state.blockTimestamp - quote.quotedAt > 180 || state.blockTimestamp < quote.quotedAt) throw new Error("This quote expired. Review the current offer.");
  if (state.auctionPrice > quote.price) throw new Error("The auction rate changed. Review the new offer.");
  if (state.allowance !== quote.maxShares) throw new Error("Approve the exact share amount before taking the auction.");
  if (state.shares < quote.maxShares) throw new Error("Your share balance changed. Review the amount again.");
  const fill = quote.requestedWeth < state.auction.remainingWeth ? quote.requestedWeth : state.auction.remainingWeth;
  const needed = fill * state.auctionPrice / WAD;
  if (needed <= 0n || needed > quote.maxShares) throw new Error("The current auction cost exceeds your approved shares.");
  return { fill, needed };
}

/**
 * An allowance observation alone cannot prove that this transaction approved it.
 * Call only with a receipt obtained from the configured chain RPC, after resolving
 * any wallet-specific identifier to its executed transaction hash.
 */
export function parseRecoveryApprovalReceipt(receipt: TransactionReceipt, address: Address, expectedAllowance: bigint): void {
  if (receipt.status !== "success") throw new Error("The approval transaction reverted.");
  let approved: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.removed || !same(log.address, YETH_RECOVERY_VAULT)) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, eventName: "Approval", data: log.data, topics: log.topics });
      if (same(event.args.owner, address) && same(event.args.spender, RECOVERY_AUCTION)) approved = event.args.value;
    } catch { /* Other or malformed events do not prove this approval. */ }
  }
  if (approved !== expectedAllowance) throw new Error("The receipt does not confirm the expected recovery-share approval.");
}

export function parseRecoveryReceipt(receipt: TransactionReceipt, address: Address, mode: "take" | "redeem", maxShares: bigint, maxWeth?: bigint) {
  if (receipt.status !== "success") throw new Error("The transaction reverted. No recovery was completed.");
  let wethReceived = 0n;
  let sharesSpent = 0n;
  for (const log of receipt.logs) {
    if (log.removed || (!same(log.address, RECOVERY_WETH) && !same(log.address, YETH_RECOVERY_VAULT))) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data, topics: log.topics });
      if (same(log.address, RECOVERY_WETH) && same(event.args.to,address) && same(event.args.from,mode === "take" ? RECOVERY_AUCTION : YETH_RECOVERY_VAULT)) wethReceived += event.args.value;
      if (same(log.address,YETH_RECOVERY_VAULT) && same(event.args.from,address) && same(event.args.to,mode === "take" ? RECOVERY_WRAPPER : "0x0000000000000000000000000000000000000000")) sharesSpent += event.args.value;
    } catch { /* Other token events do not prove a recovery payment. */ }
  }
  if (wethReceived <= 0n || sharesSpent <= 0n || sharesSpent > maxShares || (maxWeth !== undefined && wethReceived > maxWeth) || (mode === "redeem" && sharesSpent !== maxShares)) throw new Error("The receipt does not confirm the expected recovery. Check the transaction before trying again.");
  return { wethReceived, sharesSpent };
}
