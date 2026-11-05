# yETH recovery: producer data request

Status: proposed contract for design review. No producer implementation or live wiring occurred.

## Build request

Extend GovApps Stats with a versioned recovery snapshot, daily accounting history, and event evidence.
Add a verified post-claim recovery baseline, reconciled holder snapshot, and auction fill history.
Use Kong for strategy allocations and historical or estimated rates.
Add measured funding allocations and claimed-principal exit totals.
The UI needs these feeds to explain current recovery, exit liquidity, and time to fixed recovery milestones.
The proposed shapes are in [recovery-feed-proposal.ts](recovery-feed-proposal.ts).

The mock UI uses a fixed 10 ETH original claim and records only simulated exit proceeds.
It has no ownership changes or imported wallet balance.
Its 30-day history is invented and supplies a linear scenario, not a live forecast.
Before live use, accept an ownership policy or use the represented-claim label described below.

## Source access

The producer is [dao-operations/gov-apps-stats](https://github.com/dao-operations/gov-apps-stats).
Source access is confirmed.
The review inspected its yETH, APY, configuration, publishing, and selected runtime files at commit `c3f00829d9e50e321183ee7d9deaae0a0ec20343`.
It did not compile or execute the producer.

The current object is [prod/yeth.json](https://data.dao-ops.com/prod/yeth.json).
It returned schema version 1, block 26307062, and generatedAt 1793381243 on 30 October 2026.
The response used a 60-second cache policy.
The app also exposes it through [the yETH consumer endpoint](https://yeth.yearn.fi/api/yeth-global-data).
Preserve this existing v1 object.

The current `src/yeth.rs` provides the claim deadline, yield-vault assets, recovery PPS, total assets, and share supply.
It has no auction state, strategy breakdown, payout ledger, or recovery history.
Its contract calls are not pinned to the header reported in the response.
The new snapshot must pin those calls and verify the canonical block hash.

The owner confirmed Kong at kong.yearn.fi as the vault and rate source on 2 November.
See [live-data-map.md](live-data-map.md) for tested coverage and source observations.
The private producer review remains pinned to the source revision above; it is not a fresh full checkout.

## Ownership

| Owner | Responsibility |
| --- | --- |
| GovApps Stats | Canonical chain observations, event ledger, daily recovery accounting, distributions, auction rounds, feed publication |
| Kong | Verified vault/strategy metadata, allocations, historical rates, estimated rates, rate units, fees, source freshness |
| Governance app | Display, wallet-specific reads, live transaction preparation, receipt verification |

The browser does not scan historical logs.
Kong rates do not establish recovery from USD TVL.
A strategy rate does not become a recovery rate without verified capture and routing.

## Implementation map

Use an isolated yETH runtime with durable state.
The existing legacy loop couples yETH publication to the global scan and upload.
History backfills must not delay current auction observations or unrelated feeds.

| Existing source | Extension |
| --- | --- |
| `src/yeth.rs` | Pin reads; add recovery rate, conversions, verified contract links, asset units, auction state and terms. |
| `src/main.rs` | Preserve existing `yeth.json` publication. Add an independent recovery process or explicitly isolated worker. |
| `src/apy.rs` | Use only as a Kong request example. It reads the configured reward token's oracle APY, not yETH recovery performance. |
| `src/config.rs` | Add validated yETH registry, start blocks, chain, finality, limits, state paths, and publication target. |
| `src/dao/runtime.rs` | Reuse durable history, candidate recovery, canonical-header checks, and retry concepts. |
| `src/treasury/runtime.rs` | Reuse separate acquisition/replay modes, atomic local output, locks, and conditional publication concepts. |
| `src/dao/storage.rs` | Use as a reference for bounded requests and conditional writes. Its DAO-only key rules must remain intact. |
| `src/r2.rs` | Keep existing callers intact. Its current uploader has unconditional PUTs; no-store alone does not provide conflict protection. |

Add a separately constrained yETH publisher.
Publish immutable history and evidence before the current snapshot that references their hashes.
Retain the last complete snapshot after an acquisition or publication failure.

The source review covered selected files, not the complete runtime, tests, or release packaging.
Inspect those areas before implementation.
Eight confirmations must not be labeled finalized; use Ethereum's finalized block tag or state the actual confirmation policy.

### Proposed work packages

1. **Contract and fixtures:** accept schema, units, endpoints, finality, claim basis, flow classes, registry, and unavailable states.
2. **Current observations:** implement same-block contract reads and typed strategy/rate observations.
3. **Historical accounting:** add bounded, resumable event acquisition, flow attribution, canonical history, baseline evidence, daily reconciliation, and holder balances.
4. **Forecasts and publication:** calculate recurring growth and target estimates; add immutable history references and conditional publication.
5. **Staging acceptance:** independently reproduce sample calculations and test real consumer payloads, including unavailable states.
6. **Live transactions:** test direct redemption, auction settlement, and interrupted combined exits on a fork. Complete preproduction validation separately.

## Publication

Preserve the existing version 1 feed.
Add yeth-recovery.json with schema yeth-recovery/v2.
Add yeth-recovery-history.json with schema yeth-recovery-history/v1.
Add yeth-recovery-holders.json with schema yeth-recovery-holders/v1.
Add yeth-recovery-auctions.json with schema yeth-recovery-auctions/v1.
Its immutable pages contain verified fills, not submitted orders.
The holder reference identifies an immutable revision and content hash.
The current feed references an immutable history revision and its content hash.

Publish a current snapshot at least once per minute.
The current snapshot uses one identified latest block for all contract reads.
The snapshot declares its finality instead of calling latest data finalized.
Completed daily accounting uses finalized blocks.

A proposed consumer policy expires current auction display data after 90 seconds.
A live quote still requires fresh RPC reads and simulation before submission.
The exact freshness policy remains a rollout decision.
The transaction code never trusts a producer timestamp as execution authority.

Store every amount as a decimal integer string in base units.
Store signed differences as signed integer strings.
Use Unix seconds for timestamps.
Include chain ID, address, asset decimals, share decimals, block number, and block hash.
Use null with a reason for unavailable values.
A measured zero remains zero.

## Required current snapshot fields

| Group | Required fields |
| --- | --- |
| Envelope | schema, generatedAt, observedAt, block.number/hash/timestamp/finality, producer version, indexedThrough.number/hash/timestamp |
| Contracts | claim, recoveryVault, yieldVault, auctionWrapper, underlyingAuction, underlyingAsset |
| Claim basis | recoveryRateWad, source contract and block |
| Recovery vault | assetsWei, sharesWei, assetsPerShareWad from convertToAssets(1e18), idle/liquid assets when verifiable |
| Yield vault | assetsWei, idleWei, share supply, allocator state, source block |
| Strategies | address, parent, name, asset, allocatedAssetsWei, allocation denominator, current debt, lastReport |
| Strategy rates | rate kind APR/APY, period, decimal rate, gross/net basis, fees already included, source, observedAt, source block |
| Routing | observed destinations, effective-from block, verified distribution rule or null |
| Auction | wrapper links, want/from tokens, receiver, destination, kicked timestamp, initialAvailable, current balance, available, price, minimumPrice |
| Auction terms | startingPrice, stepDuration, stepDecayRateBps, auctionLength, disabled/active state |
| Quality | current snapshot age, indexing completeness, missing ranges, source errors, reconciliation result |
| History reference | URL, schema, revision, SHA-256, first/last day |
| Forecast | method version, basis window, assumptions, exclusions, result per target or reason unavailable |

Do not publish a guessed static distribution split.
An observed 30-day split and an authorized future rule are different fields.
A destination address alone does not prove that money benefits the remaining holders.

## Required daily accounting

Each row represents one UTC day.
Include opening and closing block numbers and hashes.
Store opening and closing assets, shares, and convertToAssets(1e18).
Record the effective claim recovery rate for that interval.
Keep days with missing data explicit.
Do not fill a missing day with zero.

The producer records these separate quantities:

- Recognized recurring strategy yield, net of applicable fees and losses.
- Recurring income actually received by the Recovery Vault.
- Recurring income actually paid to auction funding.
- One-off donations received by each destination.
- Direct holder redemptions: shares burned and assets paid.
- Auction takes: shares spent and WETH actually delivered.
- Wrapper redemptions: shares burned, WETH received, WETH forwarded, and destination.
- Recycled auction proceeds received by the Recovery Vault or yield capital.
- Other inflows, outflows, realized losses, revaluations, and unexplained residuals.
- Closing amounts still held by the wrapper and the underlying auction.

Each ledger entry includes transaction hash, log index, block hash, asset, sender, recipient, and classification.
Give related transfers a common economic flow ID.
Link recycling to its original funding or settlement entry.
A transfer appears once in each economic aggregate.
Internal transfers are not new yield.

Use protocol events and verified transfers for classification.
Retain unknown transfers as unknown.
Do not call every balance increase a donation or strategy return.
If classifications or asset conversions are incomplete, withhold the affected forecast.

Ordinary proportional redemptions remove assets and shares.
They do not reduce per-share recovery.
Wrapper redemptions have the same proportional effect.
Auction funding alone does not increase Recovery Vault PPS.

For each day, reconcile the asset change against classified transfers and valuation changes.
Reconcile share supply against mint and burn events.
Report residuals and the accepted tolerance.
A tolerance must not hide a material unknown flow.

## Observed funding allocation

The funding chart uses a selected observation window, initially 30 days.
It does not display a promised future distribution policy.
Keep source recognition, receipt, and allocation timestamps separate.
Yield earned earlier can be allocated to an auction later.
The chart groups allocations by their allocation time; recurring forecasts use verified accrual to recovery shares.

For each original economic amount, identify its source and first recovery destination.
Sources include recurring yield, external donation, recycling, and unknown.
Only the first two belong in the new-funding split.
Retain a unique allocation ID and parent economic flow ID.
Partial allocations need distinct IDs and amounts whose sum cannot exceed the original flow.
Transfers through intermediaries do not create new funding.

For each kick, record opening carried inventory, new yield, new donations, recycled proceeds, and unknown funds.
Reconcile those values to the actual opening auction inventory.
The wrapper kick uses the entire underlying auction WETH balance.
Summing AuctionKicked.available across rounds would count unsold inventory repeatedly.
Wrapper redemption proceeds can also fund another round without becoming new income.

The auction allocation timestamp is the kick that first makes new funds available for takes.
Prefunded amounts waiting for a kick remain pending and outside the allocated total.
Recovery Vault allocations use verified receipt time.
Show the count of rounds funded by those new allocations in the selected window.
Keep total rounds kicked separate; a carryover-only round adds no new funding.

The split is vaultNewFunding / (vaultNewFunding + auctionNewFunding).
Keep yield and donations separate within both destinations.
Before the first funded auction, positive vault receipts produce 100% to the Recovery Vault.
If both destinations have zero new funding, show no funding, not a fabricated percentage.

Returns, sweeps, losses, and later rerouting need separate ledger entries linked to the original allocation.
Do not count a returned amount as new funding when it moves again.
The gross historical allocation and the current amount still available are different measures.
Expose returned amounts beside a gross allocation if material; do not silently net them into current auction liquidity.
Unknown attribution or a failed reconciliation makes the affected aggregate unavailable.
A late backfill produces a new immutable revision with corrected totals.

## Claimed principal that has exited

The holder summary replaces concentration with the share of claimed principal already exited.
Its denominator is original ETH principal successfully claimed during the original claim process.
Include claim-and-exit transactions as both claimed and exited principal.
Do not use all exposed entitlement, current wallet balances, or WETH payouts as that denominator.

Reconstruct the cohort from the full verified claim ABI, initial entitlement evidence, and successful claim receipts.
The frontend's minimal claim ABI does not contain this event history.
A zero claimable balance alone is insufficient: an operator can also zero a manual claim.
Normal claims, direct claim-and-exit, manual zeroing, and failed calls need separate classifications.

Count principal as exited at a verified holder redemption or auction settlement.
For shares S at recovery rate r, represented principal is floor(S * 1e18 / r).
Use the effective claim basis and retain rounding residuals.
An auction take exits those shares from holder ownership before the wrapper later redeems them.
That wrapper redemption must not count the same principal again.
Ordinary transfers do not exit the cohort.
Unverified burns or forfeitures are not confirmed paid exits.

Publish claimed principal, exited principal, remaining holder principal, unsettled custody, and unresolved differences.
Reconcile the cohort through a finalized block and declare completeness.
Withhold the percentage when the denominator or exit classification is incomplete.
The metric describes principal, not the number of people who have recovered or their payout percentage.

Keep late manual claims outside this first cohort.
The public manual-claims ledger supplies issue and payment references, not proof by itself.
A later extension must verify the successful payout transfer, amount, recipient, and claim zeroing evidence.
Store original entitlement separately from the smaller recovered-principal payout.
Manual settlements do not mint Recovery Vault shares or receive accrued yield.
Only combine cohorts under a separately defined denominator and label.

## Forecast methodology

Let r be recovery shares per original ETH, expressed as a WAD.
Let P be assets per share from convertToAssets(1e18), expressed as a WAD.
Normalized recovery, as a WAD, is floor(P * r / 1e18).
The displayed ratio divides this result by 1e18.

Historical progress is the change in normalized recovery over the displayed window.
Report recurring income, donations, recycling, losses, and unexplained effects separately.
Historical total progress is not the default future pace.

The initial hold forecast uses the last 90 complete days of recurring income received by the Recovery Vault.
Require at least 30 complete days.
Use each day's circulating share supply for its per-share contribution.
Exclude one-off donations and unverified future auction benefits.
Require reconciliation before a day contributes to the forecast.

For day d, let I_d be recurring net assets received, in wei.
Let S_d be the share supply used for that receipt.
Only receipts that accrue to existing recovery shares qualify.
Exclude deposits or mints that create matching recovery liabilities.
If income arrives as another token, use a verified contract conversion at the same block.
If that conversion is unavailable, withhold the contribution.
The daily normalized contribution is I_d * r / S_d, in WAD units.
If supply changes materially during a day, calculate contributions per receipt or interval.
Do not use the closing supply for the whole day without an explicit approximation flag.

Let g be the mean normalized recurring contribution per day.
For target T in {0.50, 0.75, 1.00}, estimated days are max(0, (T - currentRecovery) / g).
The calculation uses consistent units.
Include the current recovery observation timestamp as forecastFrom.
Derive the estimated UTC date from forecastFrom plus the rounded-up number of days.
Do not advance that date by replacing the observation time with a page refresh time.
The UI shows a calendar month and the duration from today in a tooltip.
Both remain conditional estimates. Reached and unavailable targets have no invented future date.
If the target is reached, return reached with zero days.
If g is zero or negative, return unavailable.
If history is insufficient, stale, inconsistent, or incomplete, return unavailable.
A forecast horizon can cap the display.
A target outside the horizon returns beyond_horizon instead of an invented date.

Show 30-day and 90-day recurring paces as sensitivity cases.
Do not label those cases confidence intervals.
The estimate assumes unchanged future recurring contributions and share exposure.
It excludes future donations, discretionary routing changes, new losses, and unknown auction participation.
Do not compound this linear rate as though recovery capital reinvests all yield.

An optional current run-rate model uses verified current allocations and net strategy rates.
Convert APR to daily income with APR / 365.
Convert APY to a daily effective rate with (1 + APY)^(1/365) - 1.
Apply the verified share of income captured for recovery and the verified route to the Recovery Vault.
Never apply an unverified 100% capture assumption.
Keep this model separate from the historical recurring-income model.
Publish both model inputs and the selected basis.
Do not blend the two models without a separately reviewed method.

## Account denominator

A wallet balance B represents original claim principal B * 1e18 / r, in wei.
Use convertToAssets(B) for current executable-value estimates.
A wallet transfer changes B without proving a new original loss.
A purchased share does not establish the buyer's cost basis.

Label this denominator "original claim represented by your current shares".
Do not label it the wallet's original loss or lifetime recovery.
Lifetime recovery needs verified claim history, ownership changes, and proceeds.
The producer can expose ledger evidence for that later feature.

The direct-redemption quote must use maxRedeem or maxWithdraw plus fresh simulation.
Total assets alone do not prove available withdrawal liquidity.
The auction section appears only when current inventory and a current price permit an executable offer.
Wallet actions also require balance, allowance, chain, and simulation checks.
An inactive auction can remain in history without a current action card.

## Recovery baseline and holder distribution

The top bar needs a fixed pool baseline and daily history through the latest finalized observation.
Use the agreed first reconciled recovery-vault state after claims closed and the recovery process began.
Include the initial recovery and donations already reflected at that block.
This fixed baseline is the left endpoint of the bar. Zero is not its origin.
Scale later markers as (recovery - baseline) / (1 - baseline).
Publish its block, timestamp, normalized recovery, and evidence.
Do not substitute the deployment time or an arbitrary first chart sample.
If the baseline is unknown, omit growth since the start.

The baseline is global.
A later opt-in date needs separate account evidence and an explicit label.
The pool milestones apply to shares still held.
They do not imply that previously sold claims will recover further.

Publish a versioned holder snapshot with these fields:

- Chain ID, finalized block number, block hash, timestamp, and indexed starting block.
- Snapshot revision, completeness status, missing block ranges, and maximum age.
- Each address, recovery-share balance, and classification.
- The claim recovery rate at that block, plus aggregate account counts, claim totals, and size buckets.
- Total supply, holder shares, protocol-custody shares, and reconciliation residual.
- Classification policy version and evidence for excluded contracts.
- Content hash and immutable references for paginated positions.

Index Transfer events from inception and reconcile balances against the same finalized block.
Include mint, burn, direct redemption, auction acquisition, and wrapper redemption.
Exclude zero balances.
Separate protocol custody from holder accounts.
Unclassified custody must remain explicit. Do not silently classify it as an ordinary holder.
Treat unreconciled or incomplete snapshots as unavailable.

Use original claim represented by current shares as the size measure.
Buckets are below 1 ETH, 1 to below 10 ETH, 10 to below 100 ETH, and at least 100 ETH.
Publish account counts and represented claim totals per bucket.
Return all positions through immutable pagination.
The frontend can shorten addresses and link to a block explorer.

Accounts are not unique people.
Balances do not reveal watchers, selling intent, or transaction priority.
No viewer telemetry is requested.

## Auction fill history

Publish confirmed fills across all indexed auction rounds, newest first.
Use a round identifier tied to the auction address and its verified kick event.
A fill row includes these fields:

- Chain, auction address, round ID, kick evidence, canonical block, transaction hash, and log index.
- Transaction sender, share payer, output recipient, and attribution status.
- Actual recovery shares spent and actual WETH received, in base units.
- The effective claim recovery rate at the fill block and normalized recovery on the shares sold.
- Classification version and references to the verified settlement transfers.

The displayed taker is the share payer when verified. An unknown payer remains unavailable.
Do not substitute the transaction sender for an unverified payer.
For shares spent S, actual output O, and recovery rate r, normalized recovery in WAD is floor(O * r / S).
Use the effective fill-time rate, not the current auction quote.

Only completed fills belong in this table.
Submitted or failed transactions, funding transfers, and wrapper redemptions are separate events.
Deduplicate each fill by chain, transaction hash, and settlement log index.
Store timestamp and block hash so reorgs can replace invalidated entries.
Explorer receipt links require a verified transaction hash on the declared chain.
The mock preview labels illustrative fills and omits receipt links.

Publish immutable revisions with content hashes, indexed ranges, completeness, finality, and paginated positions.
Retain all confirmed rounds from the configured auction start block.
Reference the published page set from the current recovery snapshot.
Test partial fills, different payer and recipient, unknown attribution, duplicate logs, missing pages, and reorg replacement.

## Combined exit quotes and receipts

Use one fresh account and auction snapshot for the first review.
Calculate auction capacity in integer base units.
Calculate the remaining direct-redemption quote from shares not consumed by that auction.
Check maxRedeem, conversion, and available liquidity before presenting a complete exit.

Combined payout equals auction WETH plus direct-redemption assets.
Combined recovery equals that payout divided by the original claim represented by all shares being exited.
Auction-only recovery uses only the original claim represented by shares sold.
Never add the two recovery percentages.

After auction confirmation, derive actual shares spent and WETH received from the receipt.
Refresh the account and direct-redemption quote before the next wallet request in the consented exit sequence.
Bound the remainder by the original reviewed position minus actual auction shares spent. Do not include newly received shares.
Persist the confirmed receipt with chain, account, auction round, and transaction hash.
A rejected, failed, or abandoned redemption must not erase that receipt or resubmit the auction.
A page reload must reconstruct the pending remainder from chain state and confirmed receipts.
No atomic guarantee applies to this sequence.

## Acceptance evidence

The producer handoff needs these fixtures:

- A normal day with recurring income and no donation.
- A large one-off donation with no jump in the default ongoing pace.
- A direct redemption with unchanged PPS.
- A partial auction fill with actual output and share cost.
- A wrapper redemption and a later recycled transfer without double counting.
- A routing change with its effective block.
- First-auction funding, carried inventory, a returned allocation, and recycled proceeds without inflated new funding.
- Claim-and-exit, normal claim, later redemption, and auction take without counting wrapper redemption twice.
- An incomplete claim cohort that withholds the exit percentage.
- A late manual payout retained outside the original share cohort.
- A missing-history interval and an unavailable forecast.
- Missing baseline, later opt-in, and a baseline with a verified source block.
- Reconciled holder snapshots before and after an auction and wrapper redemption.
- Unknown custody, missing transfer ranges, stale pages, and mismatched page hashes.
- A partial auction, an interrupted combined exit, and a failed second transaction.
- A zero or negative recurring pace.
- A reorg that replaces an event and corrects the daily total.
- A mismatched asset or share reconciliation.
- A stale auction snapshot that cannot enable an action.
- A wallet transfer that changes represented principal without inventing lifetime recovery.

This proposal defines the consumer requirements for the producer work package.
Producer implementation and deployment require confirmed source access and ownership.


## Realized payouts and wallet balances

The current WETH wallet balance is not cumulative recovery.
A holder can transfer, wrap, unwrap, swap, or spend proceeds after an exit.
The displayed realized amount comes from verified exit receipts and their actual transfers.

For each exit, record the share owner, share payer, output recipient, shares spent, and actual WETH output.
Separate direct redemption, direct auction take, and supported indirect settlement routes.
A transaction sender alone does not establish the share owner or output recipient.
If a settlement route cannot be attributed, retain it as unknown.

A useful account aggregate is "exit proceeds received by this address".
Another useful aggregate is "shares spent by this address".
These aggregates can differ when the recipient is another address.
They do not establish the holder's original economic loss or trading profit.

Current represented claim principal uses the current share balance.
Original snapshot entitlement, current represented principal, cumulative exit proceeds, and current wallet balance remain separate values.
Transferred or purchased shares do not prove their acquisition cost.
A lifetime recovery percentage needs an explicit ownership and transfer policy.
Until that policy is accepted, the interface omits that percentage.

An optional account evidence payload contains:
- address, chainId, indexedThrough, and incomplete-range flags.
- currentSharesWei and representedOriginalClaimWei, each with its source block.
- receivedExitProceedsWei and spentRecoverySharesWei, grouped by route.
- proceedsSentToOtherRecipientsWei, with recipient and transaction evidence.
- originalSnapshotEntitlementWei or null, with claim evidence.
- inbound/outbound share transfer amounts and their event references.
- attributionMethod, unavailableReason, and the accepted ownership policy version.

The frontend refreshes current balances through RPC after a confirmed transaction.
The producer later supplies cumulative history.
The frontend does not add a pending payment to a confirmed aggregate.

## Mock-to-live conditions

The mock milestone remains separate from producer availability.
A successful mock interaction does not prove live settlement.

Before live consumption:
1. Confirm producer rollout ownership and validate the Kong adapter.
2. Accept the versioned consumer schema and its units.
3. Implement the producer outside the governance-apps worktree.
4. Backfill at least 30 contiguous complete days for the recurring forecast.
5. Reconcile daily assets, shares, classified flows, and source block hashes.
6. Validate real payloads against the consumer schema.
7. Verify the original-claim denominator against the claim contract.
8. Verify current contract links and asset identities against one current block.
9. Preserve unavailable states for missing rates, history, or routing.
10. Compare forecasts with independently calculated accounting examples.
11. Validate each live transaction route on a fork.
12. Verify partial fills, stale quotes, changed rounds, allowance limits, and actual recipient output.
13. Validate the accepted UI and producer payloads in preproduction.
14. Enable production only through its separate rollout gate.

The live client never falls back to invented balances or history.
A producer failure preserves last-known data with its original timestamp.
It never refreshes that timestamp without a new observation.
Stale or inconsistent data cannot enable an auction action.
