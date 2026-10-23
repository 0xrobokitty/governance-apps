# DAO voting-power producer contract

The frontend consumes one companion feed. The existing proposal feed V2 stays unchanged. The implemented schema is `DaoVotingPowerSnapshot` in `lib/clients/dao/voting-power-snapshot.ts`. The Rust producer is `gov-apps-stats/src/voting_power.rs`; `scripts/build-dao-voting-power.mjs` remains the executable development reference.

## Why a companion feed is required

Read-only inspection of `gov-apps-stats/src/stats.rs` found raw token supply and balance reads, not a complete matured-weight total. `src/veyfi.rs` indexes SetSnapshot accounts and cumulative migrated amounts. That cumulative amount does not remove expired or exited locks and is unsuitable as a governance denominator. `src/dao/acquire.rs` reads proposal totals, which count votes cast rather than all current voting power.

The new module has a separate persisted cursor and refresh task. It reuses bounded RPC and atomic storage helpers, validates canonical blocks, and recovers from reorgs. The frontend's total does not use raw supply or cumulative migration fields.

## Complete candidate index

1. Start at block `24320000`. Verify that all indexed contracts had no code at the preceding block. This proves the scan starts before their deployment.
2. Scan `Transfer(address,address,uint256)` from stYFI and all three liquid-locker depositor contracts, including mint and burn events. Add both nonzero endpoints to a persistent set. Never remove former holders from this set.
3. Scan `Migrate(address,uint256,uint256)` from the veYFI reward distributor. Migrate is the only path that initializes positive `last_claimed`; WeightMeasure requires that flag. SetSnapshot alone does not grant voting power.
4. Scan all WeightAggregator `AddComponent` events. Every historical depositor must be among the fully indexed source contracts. Reject unknown additions until their entire holder history has been indexed. Verify all four known components were observed.
5. Add the YBC pool address. Exclude the zero address and delegated stYFIx address from the ordinary account set.
6. Persist the complete candidate set, observed component set, covered-through block, and block hash atomically. Validate the checkpoint hash before continuing. Rebuild on a canonical replacement.

Use the addresses in the reference producer's `INDEX_DEPLOYMENT` and `INDEX_TOKENS`. Liquid-locker depositor shares already use YFI units. Do not divide their governance weights by the liquid-locker asset scale again.

## Canonical snapshot

At one confirmed mainnet block, verify Voting's current WeightMeasure and supported Voter. Verify the aggregator, delegated pool, ve distributor, and YBC identities. Read both `WeightMeasure.weight(account)` and `WeightAggregator.weight(account)` for every candidate. Their difference is active migrated veYFI. The contracts enforce maturity, migration, expiry, exit, and rounding rules; do not approximate them from balances or reward weights.

Read `WeightMeasure.weight(stYFIx)` separately. This is its delegated epoch snapshot. Replace the underlying pooled stake with this value. Do not add the delegated holders' ERC20 balances or YBC members' proportional influence to the total.

Read all values at the selected block. Reject any failed call, incomplete history, unexpected deployment, negative component difference, or final block-hash mismatch. Publish only a complete valid result. Keep the prior feed on failure and let consumers expire it.

## Required payload fields

| Field | Required value |
| --- | --- |
| `version`, `chainId` | `1`, `1` |
| `block` | Decimal block number, canonical hash, actual Unix timestamp |
| `deployment` | Voting, WeightMeasure, aggregator, delegated pool, ve distributor, YBC addresses |
| `coverage` | Start and covered-through blocks, `complete: true`, all four source token addresses, candidate count |
| `accounts[]` | Unique positive-weight ordinary accounts with decimal `stakedPower`, `migratedVePower`, and `directPower` |
| `totals` | Decimal sums for `stakedPower`, `migratedVePower`, `delegatedPower`, and `totalPower` |

Each direct amount must equal its two components. System component sums must equal the account sums. `totalPower` must equal staked plus migrated plus delegated. Coverage must end at `block.number`. Preserve full integer precision in decimal strings.

Publish frequently enough that confirmed block age plus refresh delay stays under 300 seconds. The Rust producer defaults to 8 confirmations and 60-second refreshes. It checks a 240-second publication limit again after canonical RPC validation and uploads with `Cache-Control: no-store`. A snapshot from a previous governance epoch is rejected even if its age is otherwise acceptable.

The producer's `docs/voting-power.md` covers `VOTING_POWER_ENABLED`, the durable state directory, and an optional archive RPC override. See the [coordinated release runbook](voting-power-release-2026-10-23.md) for the producer-first rollout.

Configure the frontend's `NEXT_PUBLIC_DAO_VOTING_POWER_URL` to the approved public feed. The existing transport permits at most 4 MiB and 10 seconds. The producer is a trusted data source; arithmetic and canonical-block checks do not independently prove that a malicious producer enumerated every holder. Its source coverage and checkpoint handling therefore belong in producer review and monitoring.
