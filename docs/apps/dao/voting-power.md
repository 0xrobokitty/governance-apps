# Wallet voting power

The DAO proposal board shows the connected wallet's current voting power. The summary replaces the voting card on the staking page.

For an ordinary wallet, the amount is its exact `WeightMeasure.weight(account)`. A tooltip separates matured stYFI and liquid-locker weight from migrated, active veYFI. The staking aggregator tracks their combined staking history, so it does not provide a reliable split between individual staking tokens. A wallet's stYFIx balance does not add direct voting power.

For YBC members, the summary shows an estimated combined amount. The tooltip gives direct power, influence over delegated stYFIx, and influence over YBC-held stake. It also shows the member's percentage of the complete roster's current matured weight. This percentage describes YBC membership weight, not all governance power.

The YBC estimate assumes every current member votes. The Voter contract blends only members who vote on each proposal, so actual influence depends on participation. The member must have positive personal voting power and positive YBC member weight. Personal power is shown before any proposal-specific late-vote decay.

## Snapshot and missing data

The reader obtains the active WeightMeasure and Voter from Voting. Membership, personal weights, pool weights, and every roster member's weight use the same mainnet block. A final block-hash check rejects a replacement block.

The YBC feed supplies candidate member addresses. Live membership and `num_members` confirm that the roster is complete. Missing or inconsistent roster data hides the combined estimate and keeps the exact direct amount. A failed personal read shows an unavailable message, not zero. Disconnected and wrong-network wallets have no summary.

Voting and WeightMeasure expose no global current voting-weight total. `WeightAggregator.supply` counts raw stake, while Voting proposal totals count votes cast on that proposal. Neither is a valid denominator for a wallet's share of all governance power. The summary therefore does not show a global percentage.

Polling runs while the DAO route is visible. Stake, migration, and vote actions invalidate the voting-power query after confirmation.

## Local review

DAO mocks use the DAO runtime's wallet, network status, base voting weight, and clock. They do not use the separate staking mock wallet. Fixture weight is modeled as matured stake with no migrated veYFI. The debug panel's **YBC member** control enables a deterministic member scenario. Switching the control updates the summary without changing time or balances.

Tests cover the compact summary, keyboard access to the breakdown, missing roster data, independent DAO wallet states, member scenario changes, same-block reads, and block replacement.
