# Proposal tabs — 23 October 2026

The proposal page separates reading, voter inspection, and technical review into three tabs.
New links open Proposal. Status changes do not choose a different tab.

| Before | After |
| --- | --- |
| Proposal content, voters, lifecycle, and technical sections form one long page. | Proposal, Votes, and Details show one content panel at a time. |
| A long proposal separates the header from the voter list. | A sticky tab bar gives direct access to Votes. Its count includes individual voter rows. |
| Lifecycle and full script data add visual weight below the content. | Details contains three expandable sections. Proposal retains a short executable-actions summary and script review link. |
| Section links target an always-visible page. | Existing vote links and Markdown links reveal their panel; script links also expand their section. |

Results and voting remain outside the tab panels. Changing tabs preserves the selected vote and voter search.
Hidden panels remain mounted and leave keyboard navigation. The shared tab control handles arrow keys, Home, and End.
The tab strip measures its height and uses the measured global header height to avoid overlap.
URL fragments support refresh and browser history without changing proposal identity or board-origin query parameters.

The table and tab count use the same mainnet/mock aggregate address resolver.
The proposal summary shows at most three ordered actions and links to the full script.
Original content, contract data, transaction preparation, and execution guards retain their existing behavior.

Source review confirmed that content and integrity warnings remain outside the panels.
Review also checked focus when a native link hides its originating panel. Explicit links now focus the revealed destination.

Integration uses the existing `agent/integration` branch and worktree. No deployment order, dependency, or permission changes are required.
The local review route is `http://localhost:3323/dao/proposals/2`.
See [Proposal navigation](../proposal-navigation.md) for section fragments and behavior.

## Validation

- Production build, typecheck, lint, and diff checks passed.
- Unit tests: 2,328 passed across 209 files.
- Smoke browser tests: 65 passed; one production-only check was skipped by the mock configuration.
- Full browser tests: 63 passed in the complete run. Five assertions needed updates for the new panel locations or selected-control labels; all five passed on the targeted rerun.
- Browser checks cover default selection, retained voting and search state, deep links, history, keyboard focus, sticky offsets, mobile layouts, and 200% text size.
- Manual local review confirmed all three panels and the existing voter summary. Pointer clicks keep the tab strip in place.

No production source changes were required after the final build and unit run. The browser assertion updates preserve the original checks.
