# Proposal layout balance — 23 October 2026

This follow-up aligns the proposal content and vote results below a shared navigation row.
It also reduces unused vertical space in the proposal header.

| Before | After |
| --- | --- |
| Vote results start beside the tabs, above the content card. | The sticky tab strip spans both desktop columns. Both cards start at the same height below it. |
| The proposal number and status occupy separate rows. | The number and badges share a row and wrap when needed. |
| Large title spacing and separate metadata and link rows make the header tall. | A smaller desktop title, closer summary spacing, and one metadata section shorten the header. |
| Content and results headings use different desktop sizes. | Both use the same desktop heading size. |

Mobile keeps results and voting above the tabs. The sidebar remains mounted once and stays outside the tab panels.
Tab changes return to the content area, rather than scrolling back to the mobile sidebar.
Links to voting controls preserve the selected tab. Existing history, section links, and keyboard behavior remain available.
Title corrections, provenance notices, execution warnings, and all metadata remain visible in the header.

Source review found no functional, security, or accessibility issue.
Manual desktop review confirmed that content and results share the same top position.
The local review route is `http://localhost:3323/dao/proposals/2`.

Integration uses the existing `agent/integration` branch. No deployment order or dependency changes are required.

## Validation

- Build, typecheck, lint, and diff checks passed.
- Unit tests: 2,330 passed across 209 files.
- Full browser coverage: 11 tab/layout cases and all 59 remaining cases passed.
- Smoke browser tests: 65 passed; one production-only check was skipped by the mock configuration.
- Layout checks cover aligned cards at 1280px and 1920px, mobile ordering, readable metadata, sticky navigation, and 200% text scaling.
- Existing voter editing, action confirmations, warnings, history, section links, and theme contrast remain covered.
