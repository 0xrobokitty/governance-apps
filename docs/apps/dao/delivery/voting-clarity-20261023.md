# DAO voting clarity — 23 October 2026

The [UI review follow-up](voting-clarity-review-20261023.md) replaces participation badges with wallet actions and integrates YBC into Vote Results.
This record describes the initial delivery; use the follow-up for the current layout and validation.

## Scope

This package adds voter details, shared address names, wallet participation badges, a YBC vote summary, separate authoring fields, and public title corrections.

| Before | After |
| --- | --- |
| Vote events require inspection of technical details. | A searchable, sortable voter table shows identity, choice, date, voting power, and share. A header link opens it directly. |
| Editable names exist only in YBC. | DAO and YBC use the same address identity code and saved names. |
| The proposal list does not identify wallet participation. | A compact badge shows the connected wallet's recorded participation. |
| The YBC contribution is difficult to find. | A compact panel shows the latest recorded YBC split and links to YBC. |
| The Markdown field also contains the proposal title. | A separate title field prevents confusion with the summary heading. |
| The body requires a specific paragraph structure. | The body accepts a plain summary paragraph or a `## Summary` section. |
| An incorrect published title remains the main display title. | A public, versioned JSON file can supply a display title while preserving the original content. |

## Acceptance criteria

- Show the latest contribution for each voting address. Do not sum replaced votes.
- Keep exact addresses available beside names. Verify ENS names in both directions.
- Preserve existing YBC names and share future edits between DAO and YBC.
- Keep unknown wallet state distinct from a recorded absence of votes.
- Show the recorded YBC contribution, its time, and a link to the YBC app.
- Keep protocol calculations in domain code and writes in the shared transaction flow.
- Preserve canonical published content during title corrections and draft recovery.
- Reject title corrections that contain unsupported fields or an incorrect proposal identity.
- Cover changed behavior with unit and browser tests.
- Review the complete changes for correctness, security, and responsive layout.

## Integration notes

The accepted branch is `agent/integration` in the existing integration worktree.
The implementation uses three isolated work packages: votes and identities, participation, and authoring.
The votes package supplies `lib/clients/dao/votes.ts`, which the participation package uses.
The integration package supplies public title corrections and the narrow iframe policy required for shared names.

The bridge uses exact DAO/YBC origin pairs. A local or shared-host route uses local browser storage directly.
Production and preprod use separate storage origins. Names remain specific to the browser profile.
The YBC bridge and DAO changes must ship together for subdomain name sharing.

The existing DAO production flag still controls the DAO routes. This package does not deploy or change production routing.
The title correction file changes production proposal #4 from “Summary” to the user-approved “Budget Request: vaultsNG”.
The entry matches its verified chain, Voting contract, proposal ID, and content digest.

## Implementation references

- [Voters and address names](../voters-and-address-names.md)
- [Participation and the YBC contribution](../participation-display.md)
- [Separate title and body fields](../authoring-title-and-body.md)
- [Public title corrections](../title-overrides.md)
- [Shared YBC names](../../ybc/shared-address-names.md)

## Review

Independent implementation and security reviews found no blocking issues.
Review covered exact message origins and iframe sources, bounded storage operations, verified ENS, replacement votes, pending participation, and immutable content.
Follow-up fixes remove stale ENS names after negative lookups and preserve short proposal text in the content card.
The voter table now appears before lifecycle history and has a keyboard-accessible header link.
Historical mock voters have separate addresses from selectable demo wallets.
The demo's participation badges and vote totals agree before and after indexing a vote.

ENS resolves for each visible page. Search includes all addresses and nicknames, plus ENS names already resolved during the session.
The displayed votes and YBC contribution reflect the accepted snapshot. Wallet action checks remain separate.

## Validation

Validation uses the repository's locked dependencies, including Next.js 16.4.1.
The local installation initially differed from the lockfile. A clean install restored the pinned versions.
The existing Next type shim now includes the two page-export types required by that version.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run test -- --maxWorkers=2` | 204 files and 2,232 tests passed. |
| Optimized mock `npm run build` | Passed. |
| `npm run test:e2e` | 65 tests passed; one production-only check was skipped in mock mode. |
| `npm run test:e2e:full -- --workers=2` | 51 tests passed. |

The browser suites use separate local servers for the same compiled build.
Smoke uses its standard single worker. Full uses two workers.
The beta-host test preserves its HTTPS browser origin and production CSP while routing to the local HTTP server.
Authoring setup waits for the test bridge. Progress tests pause the clock before triggering asynchronous states.

Manual review confirmed the table layout, keyboard shortcut, saved-name persistence, title/body preview, and proposal badges.
The browser suites also cover mobile layouts, enlarged text, keyboard interaction, and cross-origin name sharing.
The milestone is tagged `integration/dao-voting-clarity-20261023` on the integration branch.

## Local review

The local demo uses deterministic mock data and a test wallet. It does not submit live transactions.

1. Open `http://localhost:3323/dao` to review participation badges.
2. Open `http://localhost:3323/dao/proposals/2` and select **View votes**.
3. Search or sort the table. Select a name to edit it, then reload to check persistence.
4. Review the YBC split in the sidebar. **Explore YBC** opens the YBC app.
5. Open `http://localhost:3323/dao/propose` and select **Start proposal**.
6. Enter a title and a plain summary paragraph. Check the preview before publication.
7. Open `http://localhost:3323/dao-title-overrides.json` to inspect the production correction.

The mock proposal #4 has a different identity from production proposal #4.
The production correction deliberately does not affect that mock proposal.
The title correction takes effect when the integrated changes are deployed.

To rebuild and start this mock demo from the integration worktree:

```sh
env NEXT_PUBLIC_E2E=true NEXT_PUBLIC_USE_MOCKS=true NEXT_PUBLIC_RUNTIME_MODE=development NEXT_PUBLIC_RPC_URLS=http://127.0.0.1:8546 npm run build
env NEXT_PUBLIC_E2E=true NEXT_PUBLIC_USE_MOCKS=true NEXT_PUBLIC_RUNTIME_MODE=development NEXT_PUBLIC_RPC_URLS=http://127.0.0.1:8546 npm run start -- --hostname 127.0.0.1 --port 3323
```
