import type { PreparedTransaction } from "@/lib/tx/types";

export type AuctionScenario = "active" | "limited" | "redeem-error" | "flat" | "waiting" | "empty" | "ended" | "disconnected" | "no-position" | "stale" | "error";
export type RecoveryAuction = {
  kickedAt: number;
  initialWeth: bigint;
  remainingWeth: bigint;
  startingPrice: bigint;
  minimumPrice: bigint;
  stepDuration: number;
  stepDecayBps: number;
  length: number;
};
export type RecoveryStrategy = {
  id: string;
  name: string;
  asset: string;
  description: string;
  assetsEth: bigint;
  historicalApy: number | null;
  allocationBps: number;
};
export type RecoveryFundingTotals = {
  complete: boolean;
  vault: bigint;
  auctions: bigint;
  yieldReceived: bigint;
  donations: bigint;
  yearnRevenueShare: bigint;
  unclassified: bigint;
  pendingAllocation: bigint;
  pendingSources: Array<{
    id: string;
    amount: bigint;
    destination: "auction" | "recovery_vault";
    transactionHash: string | null;
  }>;
  rounds: number;
};
export type RecoveryLiveMetadata = {
  principalKnown: boolean;
  baselineKnown: boolean;
  principalUnavailableReason: string | null;
  historyCurrent: boolean;
  feedFresh: boolean;
  chainFresh: boolean;
  chainAsOf: number | null;
  feedAsOf: number;
  indexedAt: number | null;
  directAssets: bigint | null;
  maxRedeem: bigint | null;
  targetAssetsPerShare: bigint;
  dailyAssetsPerShareGrowth: bigint | null;
  publicReferenceRecovery: number;
  measuredPerformance: Array<{ windowDays: number; periodReturn: number; annualizedReturn: number | null; asOf: number }>;
  ppsHistory: Array<{ at: number; pps: number }>;
  fundingTotals: RecoveryFundingTotals | null;
  holderDataCurrent: boolean;
  holderPrincipalCurrent: boolean;
  auctionHistoryCurrent: boolean;
  programmeCurrent: boolean;
  producerVersion: string;
};
export type RecoverySnapshot = {
  live?: RecoveryLiveMetadata;
  asOf: number;
  now: number;
  connected: boolean;
  shares: bigint;
  allowance: bigint;
  walletWeth: bigint;
  originalClaimEth: bigint;
  recoveryStart: { at: number; recovery: number };
  progressHistory: Array<{ day: number; recovery: number }>;
  holders: { asOf: number; positions: Array<{ id: string; address: `0x${string}`; kind: "holder" | "system"; shares: bigint; representedClaimEth?: bigint }> } | null;
  auctionHistory: Array<{ id: string; round: number; at: number; recoveryBasis?: "personal" | "reference"; taker: `0x${string}`; recovery: number; weth: bigint; transactionHash: `0x${string}` | null }>;
  recoveryRate: bigint;
  vaultPps: bigint;
  vaultAssetsEth: bigint;
  totalShares: bigint;
  yieldAssetsEth: bigint;
  yieldApy: number | null;
  yieldApyBasis: "historical" | "estimated";
  claimedPrincipalEth: bigint;
  exitedPrincipalEth: bigint;
  funding: Array<{ id: string; at: number; source: "yield" | "donation"; destination: "vault" | "auction"; weth: bigint; round: number | null }>;
  history: Array<{ day: number; recovery: number }>;
  strategies: RecoveryStrategy[];
  auction: RecoveryAuction;
};
export type AuctionQuote = {
  weth: bigint;
  shares: bigint;
  price: bigint;
  recovery: number;
  fullClaimEth: bigint;
  directValueEth: bigint;
};
export interface RecoveryPreviewClient {
  getSnapshot(): RecoverySnapshot;
  prepareApprove(shares: bigint): PreparedTransaction;
  prepareTake(weth: bigint, maxShares: bigint, kickedAt: number): PreparedTransaction;
  prepareRedeem(): PreparedTransaction;
}
