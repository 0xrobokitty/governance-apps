# Wallet participation and the YBC vote

The proposal board preserves the existing lifecycle groups and proposal order.
A connected wallet gets a compact action control to the left of results on desktop and above results on mobile.
Results remain in the rightmost desktop column when no wallet control is shown.
The area uses the latest snapshot and local receipt state, not a live eligibility check.

- `Vote`: an unvoted wallet can open the proposal's action section while the voting window is open.
- `✓ Voted Yea` or `× Voted Nay`: the wallet's latest contribution has positive weight and a known choice.
- `Voted split` or `Vote registered`: a recorded vote has a split choice or an unavailable choice.
- `Vote pending`: a locally submitted vote still awaits confirmation or indexing.
- `Vote unavailable`: the contribution cannot be interpreted.

Recorded and pending states are disabled controls. The Vote link opens review; it does not promise eligibility or submit a transaction.
Recorded controls use neutral gray styling; Vote remains a compact black link. All controls retain a 40-pixel hit target.
The wallet area has no heading. Unvoted wallets outside the voting window leave the area blank, with no absence label.
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
