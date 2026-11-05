# Recovery auctions: mock design iterations

The live implementation and current UAT procedure are in [recovery-live.md](recovery-live.md).
This document records the earlier design milestone. Its mock-only status is historical.

## Status and acceptance

This package replaces the claim-focused page with an interactive recovery preview.
The preview requires explicit mocks and `NEXT_PUBLIC_YETH_RECOVERY_PREVIEW=true`.
Production runtime always uses the existing page. Live failures never select this preview.

The milestone covers the recovery overview, allocation detail, auction quotes, approval, partial fills, direct redemption, and unavailable states.
The example account does not use a connected wallet. All transactions run through the shared transaction lifecycle as simulations.
The page labels all balances, performance, and transactions as illustrative.
The original claim implementation remains available behind the default route behavior until the new flow passes acceptance.

User acceptance of this design is the next product gate.
Live reads, writes, accounting history, fork validation, preproduction, and production rollout remain separate milestones.
Do not treat the preview as a deployed auction interface.

## Current iteration: concise exits and live-data planning

The page leads with recovery for a fixed example claim.
It separates received proceeds from the amount still available to withdraw.
The original 10 ETH claim does not shrink after simulated exits.

One headline card contains the larger page title, current recovery, claim amounts, and recovery path.
The bar starts at the post-claim baseline: 36% in this example, not zero.
The current marker and future milestones use this same scale.
Milestones at 50%, 75%, and 100% show estimated UTC calendar months.
Hover, keyboard focus, or tap reveals the duration from today at the current 30-day pace.
These are pool milestones for shares still held.
They do not promise further recovery after an account exits.
Flat, missing, stale, or negative growth produces no estimate.

A beneficial auction replaces the lower-value direct exit.
If the auction covers the position, the page offers one complete exit.
If liquidity covers only part, two large option cards state the exit scope.
“Exit fully” is selected by default. It takes the auction, then redeems all remaining shares.
“Take auction only” is optional and states the percentages sold and kept.
The primary figure is the selected recovery percentage; the WETH payout appears beneath it.
The review repeats the choice and its consequence before approval.
The combined amount adds auction proceeds and the vault value of remaining shares.
The combined rate divides that amount by the claim represented by all remaining shares.
The auction-only rate uses the claim represented by shares sold.

The holding comparison estimates time to the selected offer rate at the current pace.
Auction-only compares the portion sold; a combined exit compares the whole remaining position.
The example full auction offers 69.0%, equivalent to about 2.8 years of holding.
The limited combined exit offers 50.7%, equivalent to about 3.7 months.
Neither estimate promises future yield or a guaranteed saving.

Inactive or inferior auctions leave “Exit position” as the primary exit.
Disconnected, stale, and empty accounts have no executable exit offer.
A maximum auction exit can leave one or two wei of shares.
The preview preserves and labels this rounding remainder.

The review captures the auction round, requested output, share cap, and chosen exit mode.
Approval and exits use the shared transaction pipeline.
After an auction succeeds, the combined flow reads the actual remaining balance.
It asks for a separate confirmation before redemption.
Closing the dialog preserves a continuation action within the page session.
A failed redemption preserves the auction payout and retries only the remaining redemption.
The two exits are not atomic.
Reloading resets this illustrative account; persistent receipt recovery belongs to the live client.

Tabs contain auction details and fills, recovery progress, vault allocations, holders, FAQ, and contracts.
Contracts is the last tab and uses the shared contract-link component.
The auction table shows round, date, taker address, recovery rate, WETH received, and receipt.
Example fills have no invented transaction links. The component supports verified Etherscan receipts.
The table remains available when an auction is inactive.
The next price change counts down each second.
No viewer count or activity claim appears.
The holder tab shows illustrative addresses through the shared address-link component, plus balances and distribution.
It shows active balances and the share of claimed principal already exited.
That metric measures principal retired, not WETH paid or unique people.
Late manual settlements remain separate until their receipts are reconciled.
The FAQ explains holding risks, estimates, auction exits, WETH, and missed claims.
It links to the manual recovery claims issue form.
The page no longer repeats the closed-window footer or explanatory holder/contract paragraphs.
Contract badges stay centered within their larger touch targets.

The yield panel distinguishes estimated APY from historical APY.
Its funding chart adds recorded allocations during the last 30 days.
Yield and donations are separate sources; the destinations are the Recovery Vault and auctions.
The pre-auction scenario allocates 100% to the Recovery Vault.
No fixed routing percentage is assumed.
Carried inventory and recycled proceeds are not new yield or new external funding.
One preview banner identifies all data and exits as simulated.

See [the producer data request](recovery-data-request.md) for fields, methods, attribution, and acceptance fixtures.
See [the live data map](live-data-map.md) for confirmed Kong coverage and remaining producer work.
Producer implementation remains a separate work package.

## Verified contract behavior

The supplied [wrapper](https://etherscan.io/address/0x26868F94684dEC5Ea6fF93ccc06aBde1015ce2CE#code) deploys and manages a separate Auction contract.
Read-only mainnet inspection used block 26305784.

| Item | Observed value |
| --- | --- |
| Auction and approval spender | `0x68383672a70Ae3B78e5E2a67D78cf1E379BE3801` |
| Recovery shares | `0xE5387cd454Dcc542421c069C009D915Ab9EFaaFd` |
| Output asset | Mainnet WETH |
| Claim recovery rate | 0.3196079 shares per original ETH |
| Minimum auction price | 0.3196079 shares per WETH |
| Price step | 4 basis points per 225 seconds |
| Maximum duration | Seven days |
| Kick state | Not started at the observed block |
| Redemption destination | `0xbBBBBbbB6B942883EAd4976882C99201108c784d` |
| Vault conversion | Approximately 1.07327028 WETH per share |

These values are observations, not permanent configuration.
The preview intentionally uses a separate illustrative auction and account.

Full recovery does not mean a raw share price of 1 WETH.
Normalized vault recovery equals WETH per share multiplied by the claim recovery rate.
Normalized auction recovery equals the claim recovery rate divided by auction shares per WETH.

The contract lowers share cost in discrete steps.
It stops below the minimum price or strictly after seven days.
A step can cross the floor without offering exactly 100% recovery.
Available liquidity can disappear before the next step.

The `take` amount is maximum WETH output.
The contract limits output to available inventory and charges shares for that output.
The holder receives WETH. Native ETH requires a separate unwrap flow.

The wrapper receives shares and later redeems them.
That redemption removes proportional vault assets and shares.
It does not immediately increase the remaining price per share.
Benefits depend on funding, the configured destination, recycling, and future yield distribution.

## Live transaction requirements

The underlying `take` function has no deadline, minimum-output limit, or maximum-share argument.
The preview uses a local maximum-share check to model bounded approval.
This check is not a new contract guarantee.

Before live wiring:

1. Read wrapper links, token identity, decimals, auction parameters, and inventory at one block.
2. Validate the chain, account, round, allowance, and snapshot freshness.
3. Prepare exact bounded approval to the underlying auction.
4. Address existing unlimited allowance before the user relies on a spend limit.
5. Simulate the take immediately before submission.
6. Explain partial fills and the absence of a guaranteed output amount.
7. Derive the actual result from the receipt and resulting balances.
8. Validate rejection, cancellation, depleted liquidity, restarted rounds, and Safe execution on a fork.

Direct redemption needs its own fresh conversion and liquidity checks.
Do not infer redeemable liquidity from total assets alone.

## Yearn data research

The inspected [yearn.fi source](https://github.com/yearn/yearn.fi/tree/a93601f26d1f9a658982214670179b842a39b315) uses Kong snapshots and timeseries.
Relevant components are `kongVaultSelectors`, `useVaultApyData`, `useVaultChartTimeseries`, and `VaultStrategiesSection`.

The initial 30 October [yield snapshot](https://kong.yearn.fi/api/rest/snapshot/1/0xd7a540ba3626c0aa66e7db4088971d0cd64695b6) returned block 26305578.
Lowercase addresses worked. The mixed-case address returned 404.

| Allocation | WETH debt | 30-day historical APY |
| --- | ---: | ---: |
| WETH-1 | 1648.4264 | 1.9860% |
| WETH-2 | 490.1248 | 2.4316% |
| Flex WETH | 300.0777 | 0.5518% |

The total was 2438.6289 WETH, with no reported idle assets.
These observations do not populate the illustrative preview.

Parent historical APY was unavailable. Parent PPS history remained flat at 1.0.
The parent oracle APY was approximately 2.3912%, which is an estimate.
The recovery-vault snapshot returned 404. Its APY, PPS, and TVL timeseries were empty.
Kong alone cannot support a defensible live recovery date.

A nested strategy had an extreme historical APY outlier.
Do not average nested rates or extrapolate that outlier.

### Consumer mapping

| Display | Source |
| --- | --- |
| Asset and decimals | `asset` and `meta.token` |
| Vault assets and idle | `totalAssets` and `totalIdle` |
| Allocation amount | `composition[].currentDebt`, parsed as bigint |
| Allocation percentage | Current debt divided by parent assets |
| Historical APY | `performance.historical.weeklyNet/monthlyNet` |
| Estimated APY | Linked vault `performance.oracle.netAPY` |
| Freshness | `blockNumber`, `blockTime`, and strategy `lastReport` |
| History | `timeseries/pps`, `timeseries/apy-historical`, and `timeseries/tvl` |

Null rates remain unavailable. Zero is a valid rate.
Nested traversal needs bounded depth, cycle detection, and deduplication.
Idle assets remain separate. USD TVL changes are not ETH recovery.

A dedicated accounting feed must supply actual distributions, outstanding claims, redemptions, donations, and auction settlement attribution.
Recovery forecasts must disclose their assumptions and exclude unknown future auction benefits.
The preview shows a linear scenario from 30 days of invented recovery growth.
It includes half-pace and double-pace cases. It is not an expected recovery date.

## Integration notes

This package starts from `f44361fa310efa333f538cc0f5ac6e525289c09c`.
It adds no dependencies and changes no producer or deployment settings.
The existing claim client, historical evidence, and default production route remain intact.
Remove the legacy claim surface only after the new live route passes the product gates.

Acceptance criteria:

- The user can compare normalized auction recovery with direct redemption.
- WETH output and share input remain distinct.
- The user can approve and take a simulated offer.
- Partial fills charge only the shares for received WETH.
- Expired, empty, disconnected, stale, and zero-position states prevent invalid actions.
- The preview banner identifies invented data; projections state their current-pace assumptions.
- Mobile, keyboard, enlarged-text, and dark-mode checks pass.
- Production cannot enable this mock milestone.
