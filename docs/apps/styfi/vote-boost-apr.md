# Vote Boost APR and YBC income

The stYFI page shows the actual stYFIx APR in its headline.
The reward card separates base rewards, personal Vote Boost, delegated rewards, and YBC income.
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
The current participation count is shown separately because votes in `E` affect the stream from `E + 1`.
The rolling count covers six epochs.

Let `R` be a component's reward allocation for the completed epoch.
Let `w` and `W` be the account weight and total weight for that component.
The account's epoch income is `R × w / W`, subject to the contract's integer rounding.

Vote Boost uses the packed combined reward weight, not the governance voting weight.
Its stored account weight contains the vote count. Its total packed weight contains the same count factor.
The reader uses those two weights directly for the reward share.
It does not divide the account weight by proposal count a second time.

The stYFIx rate includes the staking and Vote Boost income received by the delegated pool.
That income is divided by the current stYFIx supply.
Historical weights and current balances can make this rate differ slightly from the full-participation stYFI estimate.

The full-participation estimate applies the completed epoch's proposal count to one YFI at the observed pool rates.
It describes a hypothetical position. It is not a guaranteed rate or an upper bound on existing reward streams.

APR converts reward shares through the reward vault's `convertToAssets` value and annualizes over a 365-day year.
The calculation uses the actual reward-token and underlying-token decimals.
The YFI price comes from the statistics feed. A stale valuation produces a visible note.
The old `styfi.current.aprBps` and `styfix.current.aprBps` fields do not determine the new displayed rates.

## Account totals and attribution

The portfolio total includes direct staking income, delegated income, liquid-locker income, migrated veYFI income, Vote Boost, and eligible YBC income.
Each contribution uses the same current active balance in YFI equivalents as its denominator.
The contribution list therefore explains the total without adding YBC income twice.

YBC reward shares use eligible staked balances. YBC voting influence uses matured voting weights.
The app keeps these denominators separate.

The historical Vote Boost weight combines stYFI, liquid lockers, and eligible migrated veYFI.
Current token balances cannot always divide that historical weight between assets.
The card shows a personal stYFI position APR only when the domain can attribute that reward weight to stYFI.
Otherwise, it shows the account-wide Vote Boost contribution and an explanation.
Historical external income remains visible even if its current position is closed.

## Read failures and local review

The chain reads use one pinned block per snapshot.
Unavailable reward or price data does not become a zero APR.
APR read failures do not disable the existing reward claim flow.

Mock controls provide **All votes**, **Some votes**, **No votes**, and **YBC member** scenarios.
These deterministic scenarios use the same calculation functions as the live reader.
The unit coverage includes unavailable data, mixed holdings, YBC income, and historical external rewards.
The stYFI smoke test covers the participation scenarios and the mobile layout.

## Integration notes

The change is read-only for protocol reward and voting data. Existing transaction preparation and the shared claim flow remain in place.
The mainnet staking middleware address now matches the current contract deployment.
The APR reader does not require a statistics-feed schema rollout beyond the optional valuation metadata.
No production deployment is part of this review branch.
