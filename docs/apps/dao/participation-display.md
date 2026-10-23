# Wallet participation and the YBC vote

The proposal board preserves the existing lifecycle groups and proposal order.
A connected wallet gets a small participation badge on each proposal.
The badge uses the latest snapshot, not a live eligibility check.

- `Voted`: the wallet's latest contribution has positive weight.
- `Not voted`: no positive contribution is recorded in the snapshot.
- `Vote pending`: a locally submitted vote still awaits confirmation or indexing.
- `Vote unavailable`: the contribution cannot be interpreted.

Disconnected wallets have no participation badge. Address comparisons ignore case.
Proposal identity includes the chain, Voting contract, and proposal ID.
A zero-weight replacement removes the previous contribution.
The board uses the existing feed and local receipt store; it adds no RPC request per proposal.
Mock controls retain their separate account-state model.
Historical fixture votes use addresses separate from the selectable demo wallets.
Default wallets therefore start unvoted, and indexed demo votes add distinct voter rows with totals that match the proposal.

The proposal's Vote results bar highlights the configured YBC collective's latest contribution.
The app uses its reviewed mainnet YBC deployment address, not feed-supplied labels.
Mock mode uses the fixture's explicit YBC aggregate address.
Other chains show the YBC vote as unavailable.

Yea and Nay show the split of recorded voting weight, not a member count.
The calculation follows `Voting.vote`: Yea equals weight multiplied by yea basis points, divided by 10,000 with integer rounding.
Nay is the remaining weight. A replacement event replaces the earlier contribution; it is never added to it.
The “Highlight YBC” checkbox marks YBC's Yea and Nay weight within the canonical total bar.
Turning it off keeps the same totals, percentages, and Yea/Nay boundary.
The results keep source information under “About YBC votes”.
That disclosure includes the latest vote time and collective address.
The Explore YBC link follows the existing shared-host and subdomain routing rules.
See [Vote results](vote-results.md) for rounding, consistency checks, and browser coverage.

These displays never authorize a write. The transaction flow still makes fresh eligibility and simulation checks.

## Integration and review

Merge the shared voter helper package before this package.
Both displays use `getLatestDaoVoteEvents` from `lib/clients/dao/votes.ts`.
No feed schema or deployment flag changes are required.
The existing DAO feature flag continues to gate the surface.

Review covers replacement ordering, zero and malformed weights, contract rounding, pending receipt matching, disconnected wallets, accessible labels, and host-aware links.
Unit coverage is in `dao.participation.test.ts` and `app/dao/participation.test.tsx`.
Browser coverage is in `dao-participation.spec.ts`.
