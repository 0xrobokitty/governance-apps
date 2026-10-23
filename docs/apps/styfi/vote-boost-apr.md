# Vote Boost APR and YBC income

The stYFI page shows the actual stYFIx APR in its headline.
The reward card shows one total APR. Its tooltip separates base rewards, personal Vote Boost, delegated rewards, and YBC income.
All APRs annualize the current reward stream at unchanged balances and prices.

## Contract findings

The review uses the contracts in the sibling `styfi` repository and the mainnet deployment recorded in `lib/clients/styfi/deployment.ts`.

| Contract | Relevant behavior |
| --- | --- |
| `RewardDistributor.vy` | Allocates each completed epoch's rewards across scaled component weights |
| `StakingRewardDistributor.vy` | Streams the staking allocation across the current staking weight |
| `governance/VoteBoostRewardDistributor.vy` | Records combined eligible stake multiplied by the rolling vote count |
| `DelegatedStakingRewardClaimer.vy` | Claims staking and Vote Boost rewards for the stYFIx pool |
| `ybc/YBCRewardDistributor.vy` | Redistributes collective income according to each member's eligible staked balance |
| `governance/Voter.vy` | Updates the collective and delegated votes when eligible YBC members vote |

Vote Boost is a separate reward component. It is not a fixed multiplier applied to the old feed APR.
At the reviewed mainnet block `26254830`, the staking component scale was `4/1` and the Vote Boost scale was `6/1`.
The current epoch was `18`. YBC and stYFIx each recorded six votes across six counted proposals.
These observations describe that block. The live reader obtains the current allocations and participation again on refresh.

The [mainnet verification record](validation/vote-boost-mainnet-2026-10-23.json) also checks a public YBC member at block `26254898`.
It records the contract source commit, bound reward sources, native token decimals, and additive portfolio contributions.
The production feed marked its YFI price as stale during this check. The app retains that status.

stYFIx receives full participation when an eligible YBC member votes on every counted proposal.
A single vote in the epoch does not satisfy this condition if that epoch contains multiple proposals.

## Epoch and rate calculation

For current epoch `E`, the current Vote Boost stream uses the completed reward epoch `E - 1`.
The compact Vote Boost multiplier uses participation in `E`. Votes in `E` affect the stream from `E + 1`.
The rolling count covers six epochs. The multiplier tooltip explains this timing and shows the proposal counts.

Let `R` be a component's reward allocation for the completed epoch.
Let `w` and `W` be the account weight and total weight for that component.
The account's epoch income is `R × w / W`, subject to the contract's integer rounding.

Vote Boost uses the packed combined reward weight, not the governance voting weight.
Its stored account weight contains the vote count. Its total packed weight contains the same count factor.
The reader uses those two weights directly for the reward share.
It does not divide the account weight by proposal count a second time.

The stYFIx rate includes the staking and Vote Boost income received by the delegated pool.
That income is divided by the current stYFIx supply.
Historical weights and current balances can make this rate differ from the full-participation estimate.

The reader also obtains each component's current numerator and denominator from `RewardDistributor.components`.
Let `S` be the staking component scale and `B` be the Vote Boost component scale.
The maximum stYFI reward-weight multiplier is `M = 1 + B / S`.
For current rolling votes `v` and counted proposals `p`, the personal multiplier is `1 + (M - 1) × v / p`.
With scales `S = 4` and `B = 6`, full participation gives `2.5×`. Half participation gives `1.75×`, and no votes gives `1×`.
If no proposals count in the rolling window, the personal multiplier is `1×`. The contract reports zero Vote Boost component weight.
This multiplier applies to stYFI reward weight. It does not multiply the total portfolio APR, which also includes legacy and YBC income.

The mode comparison and stake form show estimates at the current base rate and configured component scales.
The stYFI range extends from base APR to `base APR × M`.
The stYFIx full-participation estimate also applies the ratio of its current stYFI backing to its active share supply.
This separate denominator prevents the stYFI estimate from silently replacing the delegated estimate.
Full stYFIx participation requires an eligible YBC member to vote on every counted proposal.
These estimates do not guarantee returns or set an upper bound on existing reward streams.

The interface omits a next-epoch APR prediction.
The feed lacks projected Vote Boost allocations, complete participation weights, and account snapshots needed for that prediction.
Its projected legacy APR fields cannot supply those missing inputs.

APR converts reward shares through the reward vault's `convertToAssets` value and annualizes over a 365-day year.
The calculation uses the actual reward-token and underlying-token decimals.
The YFI price comes from the statistics feed. A stale valuation produces a visible note.
The old `styfi.current.aprBps` and `styfix.current.aprBps` fields do not determine the new displayed rates.

## Account totals and attribution

The portfolio total includes direct staking income, delegated income, liquid-locker income, migrated veYFI income, Vote Boost, and eligible YBC income.
Each contribution uses the same current active balance in YFI equivalents as its denominator.
The APR tooltip lists each contribution and explains the total without adding YBC income twice.

YBC reward shares use eligible staked balances. YBC voting influence uses matured voting weights.
The app keeps these denominators separate.

The historical Vote Boost weight combines stYFI, liquid lockers, and eligible migrated veYFI.
Current token balances cannot always divide that historical weight between assets.
The card uses the total portfolio APR instead of a separate rate for each position.
Its tooltip shows the account-wide Vote Boost contribution and explains historical attribution when needed.
Historical external income remains in the calculation even if its current position is closed.

## Read failures and local review

The chain reads use one pinned block per snapshot.
Unavailable reward or price data does not become a zero APR.
APR read failures do not disable the existing reward claim flow.
An asterisk marks a stale YFI valuation. The APR tooltip explains the stale price.
The calculation tooltips open on hover, keyboard focus, or tap. Escape dismisses a focused tooltip.

Mock controls provide **All votes**, **Some votes**, **No votes**, and **YBC member** scenarios.
These deterministic scenarios use the same calculation functions as the live reader.
The unit coverage includes unavailable data, mixed holdings, YBC income, and historical external rewards.
The stYFI smoke test covers the participation scenarios and the mobile layout.

## Integration notes

The change is read-only for protocol reward and voting data. Existing transaction preparation and the shared claim flow remain in place.
The mainnet staking middleware address now matches the current contract deployment.
The APR reader does not require a statistics-feed schema rollout beyond the optional valuation metadata.
No production deployment is part of this review branch.

See the [implementation and validation report](validation/vote-boost-review-2026-10-23.md) for local previews, test results, and the reproduced baseline failure.
