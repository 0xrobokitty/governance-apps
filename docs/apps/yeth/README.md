# yETH Recovery Docs

Scope: yETH recovery experience under `/yeth`.

## Documents

- [Live recovery dashboard and UAT](recovery-live.md)
- [Recovery and auction behavior](recovery-auctions.md)
- [Implementation map](implementation-status.md) and [release checklist](production-readiness-checklist.md)
- [Telegram alerts and deployment](telegram-alerts.md)
- [Recovery and auction message catalogue](alerts-message-catalogue-proposal.md)
- Legacy claim design: [mechanism](mechanism-spec.md) and [UI specification](ui-ux-spec.md)

## Current implementation

The production and preprod workflows select the live recovery dashboard.
`NEXT_PUBLIC_ENABLE_YETH` controls production exposure.
The dashboard combines Stats v3 accounting with live account and auction reads.
Its exit flow supports injected wallets, Safe proposals, and delegated accounts.

The earlier claim page remains available when the live flag is disabled.
A separate mock preview is available outside production.
See the [implementation map](implementation-status.md) for route selection and the [live runbook](recovery-live.md) for acceptance requirements.

## React state compatibility

The page retains the last valid claim deadline across incomplete payloads and closes the risk modal when the deadline passes.
Claim history uses an external-store subscription and updates after storage events from other tabs.
The current session retains successful claim details when browser storage is unavailable.

See the [compiler and linter requirements](../../shared/testing.md#compiler-and-linter-compatibility) for toolchain compatibility.

## Shared app discovery

The shared footer groups links to staking, governance, and contributor apps.
It includes the public governance-apps GitHub repository.
Links stay within the current local, preview, or production environment.
Destination links respect each app's release flag.

The shared voting notice appears below the header during an open DAO decision vote.
It shows the proposal count and the earliest closing time.
A dismissal applies to that deployment and voting period on the current browser origin.
A later voting period can show the notice again.
The notice stays hidden during loading, feed errors, stale data, and closed voting windows.

Both features require `NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY=true` in production.
Development and preview enable them by default.
See [shared discovery delivery notes](../../shared/discovery-20261013.md) for validation and rollout details.

### Rendering and script security

The app route renders for each request so its HTML uses the current CSP nonce.
This prevents cached build output from blocking hydration on hosts with strict script policies.
The root layout retains its existing rendering mode.

## Recovery auction design

The [recovery auction milestone](recovery-auctions.md) records the mock preview, verified contract behavior, data sources, and live integration gates.

- [Recovery statistics producer request](recovery-data-request.md): original accounting, forecast, and account data request for the recovery redesign.

## Live recovery and auction UAT

The [live dashboard runbook](recovery-live.md) defines the Stats v3 integration, transaction limits, and local fork review.
Production and preprod builds set the live-dashboard flag. The exposure flag controls public access.
See the runbook for receipt verification, pending actions, and fork acceptance cases.

## Safe submissions

The shared transaction writer retains unresolved Safe submissions across reloads.
The wallet status panel checks execution without sending another transaction.
See [Safe transaction tracking](../../shared/frontend-architecture.md#safe-transaction-tracking) for receipt checks and recovery limits.
