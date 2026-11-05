import { getRecoveryEnvironment } from "./environment";
import { buildRecoverySnapshot } from "./feed-adapter";
import type { RecoveryFeedData } from "./feed-schema";
import { WAD } from "./model";
import type { RecoveryAccountState } from "./onchain";
import type { RecoverySnapshot } from "./types";
import fixture from "./fork-fixture.json";

export const RECOVERY_FORK_ACCOUNT = fixture.account;
export const RECOVERY_FORK_SEEDED_SHARES = BigInt(fixture.seededSharesWei);

export type RecoveryForkFixture = {
  kind: "synthetic-contract-target/v1";
  account: string;
  seededShares: bigint;
  representedClaimEth: bigint;
  targetAssetsPerShare: bigint;
};
export type RecoveryForkSnapshot = RecoverySnapshot & {
  /** Local UAT diagnostics; this is not a production holder attribution. */
  forkFixture?: RecoveryForkFixture;
};
export type RecoveryForkSnapshotOptions = {
  /** Public-feed freshness is always evaluated against wall-clock seconds. */
  now: number;
  address?: string;
  chainId?: number;
  chain?: RecoveryAccountState;
  /** Wall-clock seconds when this successful account query completed. */
  observedAt: number;
};

/**
 * Local UAT has real fork balances but no production ledger row for its seeded
 * wallet. Give only that wallet a synthetic contract-target claim basis.
 * Never alter the public holder ledger, history, programme totals, or forecast.
 */
export function buildRecoveryForkSnapshot(
  data: RecoveryFeedData,
  options: RecoveryForkSnapshotOptions,
): RecoveryForkSnapshot {
  const environment = getRecoveryEnvironment();
  const { now, address, chain, observedAt } = options;
  const localChain = environment.fork &&
    environment.chainId === fixture.chainId &&
    options.chainId === fixture.chainId &&
    chain?.chainId === fixture.chainId;
  if (!localChain || !chain) {
    return buildRecoverySnapshot(data, { now, address, chain });
  }

  // Fork time may intentionally be ahead of real time. Advance its auction
  // clock only by elapsed wall time since this observation. An error-marked
  // block (timestamp 0), missing query time, or failed refresh stays stale.
  const observationValid = Number.isFinite(observedAt) && observedAt > 0 &&
    observedAt <= now + 1 && Number.isSafeInteger(chain.blockTimestamp) &&
    chain.blockTimestamp > 0;
  const chainNow = observationValid
    ? chain.blockTimestamp + Math.max(0, now - observedAt)
    : now;
  const snapshot = buildRecoverySnapshot(data, {
    now,
    chainNow,
    address,
    chain: observationValid ? chain : { ...chain, blockTimestamp: 0 },
  });
  const fixtureAccount = address?.toLowerCase() === fixture.account.toLowerCase() &&
    chain.address.toLowerCase() === fixture.account.toLowerCase();
  if (!fixtureAccount || !snapshot.live?.chainFresh ||
    chain.shares < 0n || chain.shares > RECOVERY_FORK_SEEDED_SHARES ||
    chain.recoveryRate <= 0n || snapshot.live.targetAssetsPerShare <= 0n) {
    return snapshot;
  }

  // Use the verified publication's full-recovery PPS target, not a reciprocal
  // of recoveryRate: that rounded reciprocal can exceed the attainable target.
  // This is synthetic UAT principal, not the donor's historical accounting.
  // Recompute from actual remaining shares after exits and wallet reloads.
  const targetAssetsPerShare = snapshot.live.targetAssetsPerShare;
  const representedClaimEth = chain.shares * targetAssetsPerShare / WAD;
  return {
    ...snapshot,
    originalClaimEth: representedClaimEth,
    live: {
      ...snapshot.live,
      principalKnown: true,
      principalUnavailableReason: null,
    },
    forkFixture: {
      kind: "synthetic-contract-target/v1",
      account: fixture.account,
      seededShares: RECOVERY_FORK_SEEDED_SHARES,
      representedClaimEth,
      targetAssetsPerShare,
    },
  };
}
