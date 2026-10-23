# DAO voting clarity — UI review follow-up

This follow-up addresses the screenshots reviewed on 23 October 2026.
The work continues on `agent/integration` in the existing integration worktree.

## Design decisions

| Before | After |
| --- | --- |
| Wallet participation appears beside lifecycle and proposal-type badges. | A dedicated wallet area shows the voting action or its recorded result. |
| The demo shows only unvoted wallets. | Coherent demo examples show Yea, Nay, and an available voting action. |
| Voter names and other row values have different vertical alignment. | Primary values share an alignment line, with address and transaction details below. |
| The sort control relies on a browser-native arrow. | An inset chevron has reserved space inside the control. |
| YBC has a separate sidebar card and vote graphic. | Vote Results highlights YBC's contribution within the existing total bar. |

The YBC control is a checkbox because it enables one optional display layer.
Switching it off removes the highlight; it does not subtract YBC from the result.
Recorded vote totals, approval thresholds, and transaction eligibility remain independent of this display option.

## Acceptance criteria

- Keep wallet actions separate from proposal status and type.
- Show recorded Yea and Nay choices without guessing missing or split choices.
- Offer a voting link only when the proposal's voting lifecycle permits it.
- Keep the existing proposal order, navigation, and transaction checks.
- Show consistent demo participation in the board, detail, and voter history.
- Align voter information and contain controls on narrow and wide screens.
- Keep YBC within the existing results card and provide a link and source details.
- Reject incoherent YBC segments while preserving the canonical result display.
- Verify keyboard use, responsive layout, and existing app flows.

## Integration and validation

Three work packages were merged into `agent/integration`:

- `6934cee`: aligned voter rows, stacked identities, and an inset sort chevron.
- `2c8d153`: YBC highlighting within canonical vote results and a focusable voting-action anchor.
- `4658d39`: wallet actions, recorded choices, and consistent default demo examples.

The shared participation test was resolved to retain the wallet-action cases.
YBC cases now live in the dedicated vote-results suites. Both sets remain covered.

Independent review found no remaining correctness or security blockers.
Review checked lifecycle windows, replacement votes, pending identities, integer bounds, and unchanged transaction authorization.
It also caught an inconsistency in an explicit demo control. Both vote controls now keep sample events and account choices aligned.
The correction preserves submitted votes and does not change canonical totals.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run test -- --maxWorkers=2` | 208 files and 2,269 tests passed. |
| Optimized mock `npm run build` | Passed. |
| `npm run test:e2e` | 64 passed on the initial run; the remaining applicable case passed after the row-click correction. All 65 applicable cases verified; one production-only case skipped in mock mode. |
| `npm run test:e2e:full -- --workers=2` | 55 passed on the initial run; the remaining case passed after the selector correction. All 56 cases verified. |

The browser suites use separate local servers for the same compiled build.
Smoke uses its standard single worker. Full uses two workers.
Focused browser checks cover the wallet area and YBC controls at 390 and 1280 pixels.
Voter alignment and chevron checks also cover 1920 pixels.

The first full run exposed an outdated selector that assumed one disclosure in Vote Results.
Commit `f89540d` targets **Proposal rules** explicitly. The corrected test passed across all four review viewports, including keyboard navigation and dialog checks.
Type checking and scoped lint also passed after this test-only correction.

The smoke run found that the wallet area's wrapper intercepted row navigation in empty space.
Commit `46a8b78` passes those clicks to the proposal link while keeping Vote and disabled recorded-vote buttons independent.
Independent review approved the correction. The rebuilt demo passed all 16 applicable DAO-shell smoke cases and all four wallet-action browser cases.
The two affected component suites also passed all 19 tests; scoped lint and the rebuilt app's type checks passed.

Manual review of the integrated demo confirmed readable Yea/Nay controls, aligned voter columns, and the contained sort arrow.
Toggling YBC changed its highlighting and legend while preserving all displayed canonical totals.
The existing saved voter name remained visible after rebuilding and reloading.
The completed milestone is tagged `integration/dao-voting-clarity-review-20261023`.

## Local review and rollout

The local demo uses deterministic mock data and a test wallet.

1. Open `http://localhost:3323/dao`. Proposals 21 and 22 show disabled **Voted Yea** and **Voted Nay** controls.
2. Proposal 3 shows **Voted Yea**. Proposal 2 has **Vote**, which opens its voting-action panel.
3. Open `http://localhost:3323/dao/proposals/2`. Toggle **Highlight YBC** in **Vote results**; totals remain unchanged.
4. Select **View votes** to inspect aligned names, choices, dates, weights, and the inset sorting control.

The default mock scenario supplies the recorded-choice examples. Specialized test scenarios retain their original wallet states.
Production displays use recorded snapshot contributions; they do not use these mock examples.
The existing DAO feature flag and transaction checks remain in place. No feed schema, dependency, or deployment change is required.

The public title correction for production proposal 4 remains **Budget Request: vaultsNG**.
Its identity and content digest remain fixed. The proposal body is unchanged.

See [participation display](../participation-display.md), [vote results](../vote-results.md), and [voter identities](../voters-and-address-names.md) for implementation details.
