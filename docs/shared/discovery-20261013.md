# DAO app discovery and voting notices

Date: 2026-10-13

## Scope

This work adds a shared footer to the governance apps. It also replaces the stYFI Snapshot link and adds a dismissible DAO voting notice.

The global Yearn menu keeps its existing contents. The stYFI-specific voting link opens the DAO app.

## Acceptance criteria

- Each enabled app has a footer with links to the other enabled governance apps.
- Links preserve local paths, shared hosts, preproduction hosts, and production hosts.
- The footer links to the public `yearn/governance-apps` GitHub repository.
- Team Finances links to `/teams`. The footer does not invent a second Teams app.
- veYFI migration and liquid lockers link to their existing page sections.
- The notice appears on non-DAO app routes only.
- The notice requires a current decision vote in the validated DAO feed.
- Empty, loading, stale, and failed feed states do not show the notice.
- Retracted, flagged, and vetoed proposals do not trigger the notice.
- The notice gives the closing time and opens the DAO app.
- The notice disappears when its voting period ends.
- Dismissal survives a reload on the same origin. A later voting period can show a new notice.
- Browser storage errors do not break the page or the dismiss button.
- Production feature gates apply to the new shared surfaces and each app destination.
- Desktop, mobile, light mode, dark mode, and keyboard controls remain usable.

## Review decisions

The notice advertises decision votes. Some vetoed proposals still accept votes for participation credit; these proposals remain accessible in the DAO app.

Dismissal uses browser storage on the current origin. Separate production subdomains remember their own dismissals. No shared-domain cookie is necessary.

The notice is a navigation aid. It does not grant voting rights, request a wallet connection, or submit transactions.

## Design changes

| Before | After |
| --- | --- |
| App discovery depended on the global menu. | A shared footer groups governance app links by purpose. |
| The stYFI voting link opened Snapshot. | The link opens Voting & Proposals in the DAO app. |
| stYFI requested active Snapshot proposals. | A shared notice uses the validated DAO proposal feed. |
| Other apps had no DAO voting notice. | Non-DAO apps show a dismissible notice during active decision votes. |
| No shared repository link appeared at the page bottom. | A GitHub icon and label link to the public repository. |

## Integration notes

Base: `agent/integration` at `73b3f51`.

Implementation branch: `agent/shared/discovery-20261013/shell`.

Merge the implementation after code review, security review, and the required checks. Record the final commits and check results here.

This work does not authorize a production deployment. The local preview uses deterministic mock data for design review.

## Validation

Pending: typecheck, lint, unit and integration tests, smoke tests, full end-to-end tests, production build, and browser review.

Record any pre-existing failures separately from failures caused by this change.
