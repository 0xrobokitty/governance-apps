# yETH Recovery Docs

Scope: yETH recovery experience under `/yeth`.

## Documents

- Mechanism spec: [`mechanism-spec.md`](mechanism-spec.md)
- UI/UX spec: [`ui-ux-spec.md`](ui-ux-spec.md)
- Implementation status: [`implementation-status.md`](implementation-status.md)
- Production checklist: [`production-readiness-checklist.md`](production-readiness-checklist.md)

## Current Delivery Status

- A full mock-first yETH recovery app is implemented at `/yeth`.
- Tokyo Refresh (v2.0) UI is implemented with de-boxed action-first hierarchy.
- stYFI and veYFI remain independently operable.
- The route has an onchain client, global feed path, and prepared claim/redeem
  writes. Final addresses, production inputs, and rollout checks remain tracked
  in the implementation status and production checklist.

For exact completion details, use the status tracker:
[`implementation-status.md`](implementation-status.md).

## React state compatibility

The page retains the last valid claim deadline across incomplete payloads and closes the risk modal when the deadline passes.
Claim history uses an external-store subscription and updates after storage events from other tabs.
The current session retains successful claim details when browser storage is unavailable.

See the [dependency migration notes](../../shared/testing.md#dependency-migration-2026-10-05) for compiler and linter requirements.

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
