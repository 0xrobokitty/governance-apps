# Wallet participation and the YBC vote

The proposal board preserves the existing lifecycle groups and proposal order.
A connected wallet gets a separate action area on each proposal: right on desktop and below the result on mobile.
The area uses the latest snapshot and local receipt state, not a live eligibility check.

- `Vote`: an unvoted wallet can open the proposal's action section while the voting window is open.
- `Voted Yea` or `Voted Nay`: the wallet's latest contribution has positive weight and a known choice.
- `Voted split` or `Vote registered`: a recorded vote has a split choice or an unavailable choice.
- `No vote recorded`: the wallet has no positive contribution and voting is not open.
- `Vote pending`: a locally submitted vote still awaits confirmation or indexing.
- `Vote unavailable`: the contribution cannot be interpreted.

Recorded and pending states are disabled controls. The Vote link opens review; it does not promise eligibility or submit a transaction.
Flags and retractions block the link. A non-retracted veto still allows participation review during the voting window.
Disconnected wallets have no wallet action area. Address comparisons ignore case.
Proposal identity includes the chain, Voting contract, and proposal ID.
A zero-weight replacement removes the previous contribution.
The board uses the existing feed and local receipt store; it adds no RPC request per proposal.
Mock controls retain their separate account-state model.
Historical fixture votes use dedicated addresses. The default voting scenario assigns existing Yea votes on proposals 3 and 21, and the Nay vote on proposal 22, to the demo wallet.
These events supply the mock account's recorded choices. Proposal 2 remains unvoted and available for the voting flow.
Specialized fixtures retain their original unvoted wallets. Resetting the default scenario restores all three examples without changing proposal totals.
The explicit vote-state control releases or changes a sample vote by reassigning its historical contribution. Role and connection changes preserve recorded votes.

The proposal sidebar shows the configured YBC collective's latest contribution.
The app uses its reviewed mainnet YBC deployment address, not feed-supplied labels.
Mock mode uses the fixture's explicit YBC aggregate address.
Other chains show the YBC vote as unavailable.

For and Against show the split of recorded voting weight, not a member count.
The calculation follows `Voting.vote`: For equals weight multiplied by yea basis points, divided by 10,000 with integer rounding.
Against is the remaining weight. A replacement event replaces the earlier contribution; it is never added to it.
The sidebar keeps source information under “Recorded in this snapshot”.
That disclosure includes the latest vote time and collective address.
The Explore YBC link follows the existing shared-host and subdomain routing rules.

These displays never authorize a write. The transaction flow still makes fresh eligibility and simulation checks.

## Integration and review

Merge the shared voter helper package before this package.
Both displays use `getLatestDaoVoteEvents` from `lib/clients/dao/votes.ts`.
No feed schema or deployment flag changes are required.
The existing DAO feature flag continues to gate the surface.

Review covers replacement ordering, zero and malformed weights, contract rounding, pending receipt matching, disconnected wallets, accessible labels, and host-aware links.
Unit coverage is in `dao.participation.test.ts` and `app/dao/participation.test.tsx`.
Browser coverage is in `dao-participation.spec.ts`.
