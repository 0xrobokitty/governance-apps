# Combined governance release — 23 October 2026

This candidate combines the reviewed DAO interface work and stYFI Vote Boost work on `agent/integration`.
The operator deploys `gov-apps-stats` v0.8.0 separately. This integration does not publish or deploy either repository.

## Inputs and merge order

1. Merge local `master` at `8ae00cf3` into the DAO integration candidate at `7f5606e0`.
2. Merge `codex/styfi-vote-boost-apr` at `2955dd95` into that combined branch.
3. Resolve the shared DAO presentation changes and validate the resulting source together.

The master merge was clean. The feature merge required eight file resolutions:

- `app/dao/components/ProposalBoard.tsx`
- `app/dao/components/ProposalTitleCorrection.tsx`
- `app/dao/messages.ts`
- `app/dao/proposals/[id]/ProposalDetail.tsx`
- `docs/apps/dao/README.md`
- `docs/apps/dao/title-overrides.md`
- `docs/shared/testing.md`
- `tests/unit/app/dao/title-correction.test.tsx`

## Resolution and review

| Before combination | Combined behavior |
| --- | --- |
| DAO interface and APR features were reviewed on separate branches. | Proposal tabs, voter identities, wallet actions, YBC results, personal APRs, and the voting-power control work together. |
| Title correction used different presentations in the two branches. | The trailing pencil shows the original title on the board, detail page, and vote confirmation. |
| The compact detail header could clip the new tooltip. | The header permits overflow, and the correction tooltip sits above the tabs but below the global header. |
| The automatic merge selected different demo accounts for connection and participation. | Board participation and detail actions use the same explicit mock account, including its disconnected state. Real-wallet selection is unchanged when no mock runtime exists. |
| The confirmation indicator stood alone at the left edge. | It appears next to the corrected proposal title in the confirmation facts. |

The shared footer retains its half-viewport scroll clearance.
The compact voting-power control retains the order Discussion forum, Your voting power, Create proposal.
The integration keeps the original proposal bytes, transaction checks, title configuration identities, and latest YBC voter alignment.

Independent source review checked the automatic security/routing merges, query invalidation, wallet selection, and title tooltip integration.
The review findings were fixed and reviewed again. No source-review blockers remain.

## Local review

- Mock preview: `http://127.0.0.1:3333/dao` and `/styfi`.
- Live-read preview: `http://127.0.0.1:3334/dao` and `/styfi`.

The mock preview enables the existing test bridge and deterministic scenarios.
The live preview disables mocks and the test bridge. It reads the production DAO and statistics feeds.
Its voting-power source is `https://data.dao-ops.com/prod/voting-power.json`.
Proposal publication is disabled in both local previews.
The previews use separate standalone build directories so rebuilding one does not change the other.

## Validation

| Check | Result |
| --- | --- |
| TypeScript | Passed. |
| ESLint | Passed. |
| Unit and component suite | 225 files, 2,446 tests passed. |
| Browser smoke suite | 71 passed; one expected production-disabled-route case skipped because this preview enables DAO. |
| Full browser suite | 70 passed. |
| Mock standalone build | Passed. |
| Production-mode OpenNext Worker build | Passed. |
| Worker upload-size dry run | 3,400.50 KiB compressed, below the 9,216 KiB repository budget. No upload performed. |
| Conflict markers and whitespace | No unresolved entries or diff-check errors. |

The added regression cases cover mock-account consistency in the board and detail actions, disconnected mock accounts, real-wallet selection, and the title disclosure inside vote confirmation.
The browser suites cover desktop and phone layouts, 200% text scaling, proposal tabs and navigation, voter identities, voting actions, APR calculations, comparison cards, and shared app flows.
The simulated transaction tests use the existing mock bridge; no real transaction was submitted.

Manual browser checks confirmed the combined proposal board, voting-power modal, Votes tab, live corrected-title tooltip, live APR comparison, and footer scroll clearance.
Both standalone previews remain available at the URLs above.
The live launcher supplies the public statistics URL at runtime because the same-origin proxy reads it dynamically.
The live statistics proxy returns 200 and APRs render.

At the final feed check, the production voting-power URL returned 404.
The mock preview covers the percentage and its breakdown; live system-wide voting share needs verification after the operator's separate v0.8.0 deployment.
This is an external release dependency, not an unresolved source merge.

Validation logs are retained locally under `/private/tmp/governance-combined-*.log`.
Browser captures are retained in the APR worktree under `outputs/combined-review-2026-10-23/`.
These local artifacts are not part of the release commit.

## Release dependency

Before releasing the frontend, verify that the operator's v0.8.0 deployment publishes a complete and current voting-power snapshot.
Use the existing [coordinated release procedure](../voting-power-release-2026-10-23.md).
Local previews enable governance discovery explicitly; production needs the same flag for the shared footer.
