# Voting-power and APR coordinated release

This release updates `governance-apps` and `gov-apps-stats` together.
Both review branches are named `codex/styfi-vote-boost-apr`.
The producer change is additive. It does not change the proposal feed V2 contract.

## Data contract

The producer publishes `voting-power.json` under its configured R2 prefix.
The app requires the exact [snapshot contract](voting-power-producer-handoff.md).
Its same-origin endpoint enforces the payload limit, request timeout, deployment identities, and arithmetic checks.
Connected-wallet reads also verify the canonical block, timestamp, epoch, and indexed personal weight.

The consumer expires a snapshot after 300 seconds or at a governance epoch boundary.
A missing or invalid total does not remove independently read personal voting power.
YBC influence allocates existing collective power and does not increase the system total.

## Configuration

| Environment | Producer object | App build variable |
| --- | --- | --- |
| Staging | `staging/voting-power.json` | `NEXT_PUBLIC_DAO_VOTING_POWER_URL=https://data.dao-ops.com/staging/voting-power.json` |
| Production | `prod/voting-power.json` | `NEXT_PUBLIC_DAO_VOTING_POWER_URL=https://data.dao-ops.com/prod/voting-power.json` |

Use the actual approved producer prefix if it differs from this table.
The app workflow passes this variable through validation, build, and deployment.
When DAO is enabled, production validation requires an absolute HTTPS URL without credentials.
Preserve the existing proposal URL, publication configuration, RPC URLs, and other application feeds.

Set `VOTING_POWER_ENABLED=true` on each approved producer environment.
Give `VOTING_POWER_STATE_DIR` a durable path exclusive to that environment.
The defaults are 8 confirmations, 60-second refreshes, and 5,000-block scan windows.
Use `VOTING_POWER_RPC_URL` if the existing HTTP or IPC provider lacks historical code and log support.
The producer's `docs/voting-power.md` contains the full operator runbook.

## Release order

1. Review both repository candidates and their validation records.
2. Record the previous producer binary and app version.
3. Install the producer candidate in staging with voting-power publication enabled.
4. Wait for complete history coverage and a current companion snapshot.
5. Verify oracle metadata reports the 86,400-second freshness threshold.
6. Configure the app's staging feed URL and deploy the app candidate through its existing release process.
7. Verify a wallet's percentage, calculation tooltip, and full breakdown.
8. Repeat the producer-first sequence for production after release approval.

No contract upgrade, migration, mainnet transaction, or proposal publication is required.
The first producer scan needs historical contract code and event logs.
Do not replace a complete feed with partial history during startup or recovery.

## Rollback

The old app ignores the additional object and remains compatible with the corrected price metadata.
An app rollback can leave the new producer running.
If the producer rolls back, the new app expires the old voting total and hides its percentage.
Personal weights remain available through their independent onchain reads.
Retain the new producer's checkpoint for a later forward release.

## Validation record

The [review record](validation/coordinated-release-2026-10-23.md) covers interface and data changes, checks, and review evidence.
The [live Rust-to-app verification](validation/voting-power-rust-mainnet-2026-10-23.json) confirms exact wire compatibility and same-block wallet reads.
No production publish or deployment is performed by this implementation task.
