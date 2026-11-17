# yETH Implementation Map

The `/yeth` route supports a live recovery dashboard, a mock design preview, and the earlier claim interface.
This document maps the code paths.
Release acceptance belongs to the [live runbook](recovery-live.md) and [release checklist](production-readiness-checklist.md).

## Route selection

`app/yeth/page.tsx` applies the feature flags in `lib/runtime/features.ts`:

| Condition | Result |
| --- | --- |
| Production with `NEXT_PUBLIC_ENABLE_YETH` disabled | Not found |
| Nonproduction with mocks and `NEXT_PUBLIC_YETH_RECOVERY_PREVIEW=true` | `RecoveryPreviewClient` |
| Enabled yETH with `NEXT_PUBLIC_YETH_RECOVERY_LIVE=true` | `RecoveryLiveClient` |
| Other enabled configurations | `YethPageClient`, the legacy claim interface |

Production and preprod workflows build with the live recovery flag enabled.
The exposure flag remains separate.
See the runbook for configuration, dedicated-host checks, and rollout requirements.

## Live recovery dashboard

The Stats v3 publication supplies recovery accounting, history, allocations, and forecasts.
`/api/yeth-recovery-data` serves the validated publication through the application origin.
Live account and auction reads supply balances, allowances, withdrawal limits, and transaction inputs.

The action flow supports reviewed auction exits and bounded redemption of remaining shares.
It verifies receipts before it uses financial outcomes.
Safe proposals and unresolved outcomes remain pending until the application can establish their execution.
Changing the account or chain discards the earlier review scope.

[Recovery and auction behavior](recovery-auctions.md) explains the product.
The [live runbook](recovery-live.md) defines feed validation, transaction limitations, receipt recovery, and fork scenarios.
All live dashboard payouts are WETH.

## Legacy claim interface

`YethPageClient`, `lib/clients/yeth`, and `lib/hooks/useYeth.ts` retain the earlier claim integration.
The client supports claim-and-exit, claim-and-stay, and recovery-share redemption.
Its global feed and account reads are separate from the Stats v3 dashboard.

The [legacy integration references](onchain-integration-plan/README.md) retain its feed contract and fork procedure.
The [mechanism](mechanism-spec.md) and [claim UI specification](ui-ux-spec.md) record its original product design.

## Validation

Use the [shared testing guide](../../shared/testing.md) for required repository checks.
Follow the live runbook for feed, account, auction, Safe, delegated-account, and interrupted-sequence acceptance.
Run checks against the exact release candidate.
Historical passing results do not establish deployment or mainnet acceptance for a later revision.
