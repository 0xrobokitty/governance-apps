# yETH live data map

Status: implementation plan, checked 2 November 2026. The UI still uses mock data.
The owner confirmed Kong as the vault and APY source.

## Source ownership

| UI value | Source | Producer work |
| --- | --- | --- |
| Vault capital, idle balance, strategy debt | Kong snapshot, with source block | Validate units, assets, nested references, completeness, and freshness. |
| Historical strategy APY | Kong historical weekly/monthly net rates | Preserve period and fee basis. Null stays unavailable. |
| Estimated vault APY | Kong oracle netAPY | Label estimated; do not substitute it for realized income. |
| Current recovery, share supply, recovery rate | Same-block RPC contract reads | Extend the isolated GovApps Stats yETH snapshot. |
| Current auction terms and inventory | Same-block RPC wrapper and underlying auction reads | Add typed observations; verify configured links. |
| Recovery timeline and baseline | Finalized RPC history and verified claim/baseline evidence | Backfill daily state and reconcile contributions. |
| Yield and donation allocation | Canonical transfers, vault reports, kick and settlement evidence | Classify new funding once; keep carryover and recycling separate. |
| Hold estimates | Reconciled recurring income received by recovery shares | Use a conditional historical pace, with unavailable states. |
| Previous auction fills | Verified settlement receipts and token transfers | Index rounds, actual share cost, WETH output, and payer/recipient. |
| Holder addresses and balances | Recovery-share Transfer history plus pinned balances | Maintain complete balances and classify protocol custody. |
| Claimed principal exited | Successful claim evidence plus verified exit ledger | Reconcile the original claim cohort; avoid double counting wrapper burns. |
| Wallet exit quote and execution | Fresh RPC reads, simulation, and confirmed receipts | Governance app domain client and shared transaction pipeline. |

Kong supplies the allocation and rate display. It does not replace the recovery accounting ledger.
The browser does not scan historical logs or calculate a live forecast from a headline APY.
The producer may cache Kong observations, but must retain their source block and timestamp.
Kong observations are not necessarily from the same block as the current RPC snapshot.
Do not label them as one atomic observation.

## Checked Kong coverage

The public [Kong source](https://github.com/yearn/kong) was inspected at `4738975b80dd6a2ed73258c86aab280dfa9d9d0c`.
The [Yearn frontend reference](https://github.com/yearn/yearn.fi/tree/a93601f26d1f9a658982214670179b842a39b315) already provides useful selector and strategy-display patterns.
Reuse their data conventions without copying an entire frontend stack.

The [Yield Vault snapshot](https://kong.yearn.fi/api/rest/snapshot/1/0xd7a540ba3626c0aa66e7db4088971d0cd64695b6) returned block 26327630, timestamp 1793628935.
Its total assets were 2438.628903433888534351 WETH, with zero idle assets.
The following rates are point-in-time observations, not values wired into the preview.

| Allocation | WETH debt | Historical monthly net APY |
| --- | ---: | ---: |
| WETH-1 | 1648.426417489077003760 | 2.0952% |
| WETH-2 | 490.124771744467991721 | 2.2576% |
| Flex WETH | 300.077714200343538870 | 0.6542% |

The parent historical rates were null. Its oracle net APY was approximately 2.1678%.
Display that value as estimated APY, with its observation time.
Do not present a weighted strategy rate as a reported parent historical rate.

The Yield Vault PPS endpoint returned 253 rows, ending at timestamp 1793577600 with PPS 1.0.
Its historical APY endpoint returned nine rows, ending at 1772496000 with zero.
That APY history is stale and cannot establish current realized income.
A flat parent PPS does not prove zero income when funds can be distributed elsewhere.

The Recovery Vault snapshot returned HTTP 404. Its PPS endpoint returned an empty array.
Those responses do not establish zero recovery or zero growth.
The producer must supply this history through chain accounting.

Useful endpoint patterns:

- `/api/rest/snapshot/1/{lowercaseAddress}`
- `/api/rest/timeseries/pps/1/{lowercaseAddress}`
- `/api/rest/timeseries/apy-historical/1/{lowercaseAddress}`
- `/api/rest/timeseries/tvl/1/{lowercaseAddress}`

The inspected timeseries route defaults PPS to `humanized`, historical APY to `net`, and TVL to `tvl`.
It drops null gap rows and uses a 900-second cache with a 600-second stale window.
An empty result must remain unavailable. Validate timestamps and gaps explicitly.
Observed values can be decimal strings; normalize them at the adapter boundary.
Use bigint for asset and share base units.
Kong documents limited coverage for some transfer/deposit/withdrawal history.
Do not rely on it alone for a complete claim or holder ledger.

## GovApps Stats extension

The private source review used `c3f00829d9e50e321183ee7d9deaae0a0ec20343` from 30 October.
It covered 15 selected files, not a fresh full checkout or successful Rust build.
Its existing yETH feed provides basic vault and claim values, with no auction or accounting history.
Contract calls are not pinned to the block reported by the response.

Use a separate yETH runtime with explicit acquisition, replay, local validation, and publication modes.
Reuse the repository's DAO and Treasury runtime patterns where applicable.
Preserve the existing v1 `prod/yeth.json` feed and unrelated durable scanner state.
The repository's APY task shows a Kong request pattern; it is not a recovery forecast.

The producer and consumer endpoints returned HTTP 403 from this worker during the 2 November probe.
This is an access result from one environment, not proof of a general outage.
Resolve access and verify payload freshness from the deployment path before live acceptance.

The [data request](recovery-data-request.md) defines calculations, evidence, finality, and failure states.
The [proposed TypeScript schema](recovery-feed-proposal.ts) is a review artifact, not an imported runtime contract.
Implement and validate the matching Rust schema before enabling a consumer.

## What requires configuration

Manual setup should contain verified metadata and policies, not financial totals.

| Configuration | Required evidence |
| --- | --- |
| Contracts, assets, start blocks, deployment relationships | Verified source and same-block onchain reads. |
| Recovery baseline block | Agreed post-claim start, with a reconciled state and prior donations included. |
| Protocol custody addresses | Contract role or explicit governance evidence, versioned over time. |
| Donation or distribution classification | Transfer evidence and a documented source; unknown remains unknown. |
| Recurring-income classification | Verified source and economic meaning; a donor label alone cannot make a payment recurring. |
| Finality, freshness, forecast window and horizon | Accepted consumer policy with tests. |
| Feed endpoints and deployment ownership | Existing producer deployment configuration and explicit publication scope. |

Do not manually enter an APY, recovery percentage, auction allocation split, holder total, or exit amount.
Compute those values from validated observations.
A discretionary donation can increase achieved recovery without increasing the default future pace.

The [manual claims repository](https://github.com/yearn/yeth-manual-recovery-claims) is the FAQ destination.
Its ledger can support a later, separately reconciled manual-settlement total.
Manual claims pay recovered principal; they do not issue recovery shares or accrued yield.
Keep that cohort separate in the first live release.

## Delivery sequence

1. Obtain a complete current producer checkout, lockfile, CI instructions, and repository guidance.
2. Build its existing tests in an isolated Rust environment before changing producer code.
3. Implement current pinned observations and the Kong adapter, with unavailable states.
4. Backfill classified funding, claims, holders, and auction fills into durable finalized history.
5. Reconcile daily changes and publish versioned local fixtures, including missing-data cases.
6. Add forecasts only after at least 30 contiguous complete days pass reconciliation.
7. Validate the governance app against staging payloads and compare independent calculations.
8. Implement fresh wallet reads and exits; test them on a fork and in preproduction.

Current recovery and supported exits need not wait for a complete forecast history.
Show unavailable estimates until the accounting meets its requirements.
No production data fallback should use the mock examples.
