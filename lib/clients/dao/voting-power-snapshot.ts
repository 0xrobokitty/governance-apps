import { z } from "zod";
import { EPOCH_LENGTH, GENESIS, LIQUID_LOCKERS, STYFI_ADDRESS, STYFIX_ADDRESS, VEYFI_REWARD_DISTRIBUTOR_ADDRESS } from "@/lib/constants";
import { STYFI_GOVERNANCE } from "@/lib/clients/styfi/deployment";
import { YBC_MAINNET_DEPLOYMENT } from "@/lib/clients/ybc/deployment";
import { readBoundedJson, withFeedRequest, type FeedTransportPolicy } from "@/lib/feed-transport";

const uint = z.string().regex(/^(0|[1-9][0-9]*)$/).max(78).refine((value) => BigInt(value) < 2n ** 256n);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const weight = z.object({ address, stakedPower: uint, migratedVePower: uint, directPower: uint });
const schema = z.object({
  version: z.literal(1), chainId: z.literal(1),
  block: z.object({ number: uint, hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/), timestamp: z.number().int().positive().safe() }),
  deployment: z.object({ voting: address, measure: address, aggregator: address, delegated: address, ve: address, ybc: address }),
  coverage: z.object({ fromBlock: z.literal("24320000"), throughBlock: uint, complete: z.literal(true), tokens: z.array(address).length(4), candidateCount: z.number().int().nonnegative().max(50_000) }),
  totals: z.object({ stakedPower: uint, migratedVePower: uint, delegatedPower: uint, totalPower: uint }),
  accounts: z.array(weight).max(50_000),
});
export type DaoVotingPowerSnapshot = z.infer<typeof schema>;
export const DAO_VOTING_POWER_MAX_AGE_SECONDS = 300;

export function parseDaoVotingPowerSnapshot(input: unknown): DaoVotingPowerSnapshot {
  const result = schema.parse(input);
  const expected = { voting: STYFI_GOVERNANCE.voting, measure: STYFI_GOVERNANCE.weightMeasure, aggregator: STYFI_GOVERNANCE.weightAggregator, delegated: STYFIX_ADDRESS, ve: VEYFI_REWARD_DISTRIBUTOR_ADDRESS, ybc: YBC_MAINNET_DEPLOYMENT.ybc };
  if (Object.entries(expected).some(([key, value]) => result.deployment[key as keyof typeof expected].toLowerCase() !== value.toLowerCase())) throw new Error("Voting-power index deployment mismatch.");
  const tokens = new Set([STYFI_ADDRESS, ...LIQUID_LOCKERS.map((locker) => locker.depositor)].map((value) => value.toLowerCase()));
  if (new Set(result.coverage.tokens.map((value) => value.toLowerCase())).size !== tokens.size || result.coverage.tokens.some((value) => !tokens.has(value.toLowerCase())) || result.coverage.throughBlock !== result.block.number || BigInt(result.block.number) < BigInt(result.coverage.fromBlock)) throw new Error("Incomplete voting-power index coverage.");
  const seen = new Set<string>();
  let staked = 0n;
  let migrated = 0n;
  for (const account of result.accounts) {
    const key = account.address.toLowerCase();
    if (seen.has(key) || key === STYFIX_ADDRESS.toLowerCase() || key === `0x${"0".repeat(40)}`) throw new Error("Duplicate or pooled account in direct voting-power total.");
    seen.add(key);
    if (BigInt(account.directPower) !== BigInt(account.stakedPower) + BigInt(account.migratedVePower)) throw new Error("Voting-power account sum mismatch.");
    staked += BigInt(account.stakedPower);
    migrated += BigInt(account.migratedVePower);
  }
  if (result.coverage.candidateCount < result.accounts.length || staked !== BigInt(result.totals.stakedPower) || migrated !== BigInt(result.totals.migratedVePower) || staked + migrated + BigInt(result.totals.delegatedPower) !== BigInt(result.totals.totalPower)) throw new Error("Voting-power system sum mismatch.");
  return result;
}

export function assertVotingPowerSnapshotFresh(snapshot: DaoVotingPowerSnapshot, currentTimestamp: number) {
  if (!isVotingPowerTimestampCurrent(snapshot.block.timestamp, currentTimestamp)) throw new Error("The voting-power total needs a fresh snapshot.");
}

export function isVotingPowerTimestampCurrent(timestamp: number, currentTimestamp: number): boolean {
  const age = currentTimestamp - timestamp;
  const epoch = (timestamp: number) => Math.floor((timestamp - Number(GENESIS)) / Number(EPOCH_LENGTH));
  return age >= 0 && age <= DAO_VOTING_POWER_MAX_AGE_SECONDS && epoch(currentTimestamp) === epoch(timestamp);
}

const policy: FeedTransportPolicy = {
  maximumPayloadBytes: 4 * 1024 * 1024,
  requestTimeoutMs: 10_000,
  createPayloadTooLargeError: () => new Error("Voting-power snapshot is too large."),
  createTimeoutError: () => new Error("Voting-power snapshot request timed out."),
  payloadTooLargeCancelReason: "Voting-power snapshot is too large.",
  timeoutCancelReason: "Voting-power snapshot request timed out.",
  fetchOptions: { cache: "no-store" },
};

export async function fetchDaoVotingPowerSnapshot(url: string): Promise<DaoVotingPowerSnapshot> {
  return withFeedRequest(url, policy, async (response, context) => {
    if (!response.ok) throw new Error("The voting-power snapshot is unavailable.");
    return parseDaoVotingPowerSnapshot(await readBoundedJson(response, context, policy));
  });
}
