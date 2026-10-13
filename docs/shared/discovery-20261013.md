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

The notice advertises decision votes. Some vetoed proposals still accept votes for participation credit. These proposals remain accessible in the DAO app.

Dismissal uses browser storage on the current origin. Separate production subdomains remember their own dismissals. No shared-domain cookie is necessary.

The notice is a navigation aid. It does not grant voting rights, request a wallet connection, or submit transactions.

The footer uses columns that adapt to increased text size. The voting link and footer links use the established light-blue colors in dark mode.

The standalone build exposed an existing CSP nonce problem on static yETH pages. Teams had the same static-rendering risk on dedicated hosts.
Both routes now render per request. Their hydration scripts use the request nonce. The CSP policy remains unchanged.

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

The accepted implementation contains these commits:

| Commit | Change |
| --- | --- |
| `4b5c77b` | Direct stYFI governance access to the DAO app and remove Snapshot reads. |
| `74f9bb2` | Add the shared footer, voting notice, rollout gate, tests, and app documentation. |
| `3585683` | Pass the discovery flag through build and deployment workflows. |
| `e4c6f5f` | Scope navigation assertions to their intended surfaces. |
| `553fe3d` | Correct the new links' dark-mode contrast. |
| `f493cb7` | Adapt footer columns to increased text size and cover the layout with a browser regression. |
| `e68a0b8` | Render yETH and Teams with request nonces and add route regressions. |

A separate documentation commit records the final acceptance evidence. Integration uses a fast-forward merge and the milestone tag `integration/discovery-20261013`.

Code review and security review found no outstanding issues at `e68a0b8`.

## Rollout and local preview

The discovery flag defaults to false in release workflows. `NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY=true` enables the shared footer and voting notice in production.
Each destination still obeys its domain flag. `NEXT_PUBLIC_ENABLE_DAO` independently controls DAO access and the stYFI voting link.

The accepted standalone build serves the local preview at `http://localhost:3318`. It uses deterministic mock data for design review.
The preview uses `NEXT_PUBLIC_RUNTIME_MODE=preview`, `NEXT_PUBLIC_USE_MOCKS=true`, `NEXT_PUBLIC_E2E=true`, and `NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY=true`.

No production deployment or remote push occurred.

## Validation

| Check | Result and scope |
| --- | --- |
| Typecheck | Passed on the final implementation. |
| Lint | Passed on the final implementation. |
| Unit and integration tests | 191 files and 2,134 tests passed on the final implementation. |
| Standalone production build | Passed at `e68a0b8` with the preview configuration. |
| Full end-to-end suite | 46 of 46 passed against the stable build at `f493cb7`. |
| Broad smoke suite | At `f493cb7`: 56 passed, one skipped, and three failed. See the failure analysis below. |
| Final build smoke checks | At `e68a0b8`: 17 of 17 passed. These cover nine discovery checks, seven Teams checks, and the yETH full flow. |
| DAO beta-host guard | One isolated check passed on the HTTP development server. |
| Final visual review | 28 views: seven apps, two themes, and two viewport sizes. All returned HTTP 200 without JavaScript errors or horizontal overflow. |
| Footer interaction sizes | All reviewed footer links measured at least 40 pixels. |

The full end-to-end suite preceded the final yETH and Teams rendering change. The final smoke checks cover both changed routes and all discovery scenarios.

The stable broad smoke run had two yETH failures from the static CSP nonce problem. Commit `e68a0b8` corrected that problem.
Both yETH checks passed in the final build smoke run.

The third failure came from the DAO beta-host test on plain HTTP. Production-style CSP upgraded its script requests to HTTPS on the local HTTP server.
The isolated guard test passed on the HTTP development server. Security review confirmed the transport mismatch. The CSP policy was not relaxed.

Earlier development-server runs also had cold-compilation timeouts and interrupted navigation during hot reload. The stable build checks replaced those results.
