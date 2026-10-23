# Proposal navigation

Proposal pages use three tabs: **Proposal**, **Votes**, and **Details**.
New proposal links open Proposal, regardless of voting status. A direct section link opens its matching tab.
Feed updates do not change the selected tab.

Proposal contains the published text. Executable proposals also show a compact summary of their first three actions.
The summary links to the complete script. It does not imply that a matching hash establishes safety.
Votes contains individual voters and the fixed YBC/stYFIx summary. Its tab count excludes the two aggregate accounts.
Details groups Lifecycle, Proposed script, and Technical details into expandable sections.

The title, status, content warnings, results, and action panel remain outside the tabs.
Switching tabs preserves the selected vote and voter search. Hidden panels remain mounted, but their controls leave keyboard navigation.
On desktop, the tab bar spans both columns. Content and vote results start at the same height below it.
On mobile, results and voting stay above the tabs. The active panel follows the tab bar.
The tab bar stays below the measured global header while scrolling through the proposal.
The header and tab heights adjust to screen size and text scaling.

The proposal header groups its number and status badges on one row.
Proposer, timing, and navigation links share a compact metadata section that wraps on smaller screens.

The shared tab control supports arrow keys, Home, and End. Direct links move focus to the revealed section.
The URL fragment records the selected tab. Refresh, Back, and Forward restore the matching panel.
Tab changes preserve proposal identity, chain, voting contract, and board-origin query parameters.

| Fragment | Destination |
| --- | --- |
| `#dao-proposal-content` | Proposal |
| `#dao-proposal-votes` | Votes |
| `#dao-proposal-details` | Details |
| `#dao-proposal-lifecycle` | Details, with Lifecycle expanded |
| `#dao-proposal-script` | Details, with Proposed script expanded |
| `#dao-proposal-technical` | Details, with Technical details expanded |

Existing votes links remain valid. Markdown heading links open Proposal and scroll to the matching heading after content loads.
Links to controls outside the panels, including voting actions, do not change the selected tab.
Incomplete data, execution checks, and transaction permissions retain their existing behavior.
