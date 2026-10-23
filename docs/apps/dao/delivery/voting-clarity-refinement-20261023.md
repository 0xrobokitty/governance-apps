# DAO voting clarity — compact controls and YBC detail

This review pass follows the screenshots supplied on 23 October 2026 at 14:44 and 14:47.
The accepted work remains on `agent/integration` in the existing integration worktree.

## Design decisions

| Before | After |
| --- | --- |
| YBC Yea and Nay highlights meet near the middle of the result bar. | YBC Yea starts at the far left; YBC Nay ends at the far right. |
| Each YBC amount repeats “voting weight”. | The labels identify YBC Yea and Nay weight; values contain only numbers. |
| Bar segments do not explain their share on hover. | Segment tooltips identify each share of total votes cast. |
| Hover tooltips remain visible after Escape. | Escape dismisses the tooltip; the existing disclosure also exposes percentages for keyboard and touch users. |
| The wallet area sits to the right of the results. | Compact wallet controls sit to the left, keeping results rightmost. |
| Recorded Yea and Nay both use green checks. | Neutral controls use a check for Yea and a cross for Nay. |
| Every row repeats “Your vote” and may show “No vote recorded”. | The heading is removed, and nonactionable unvoted rows leave that area blank. |

The highlight remains a display option. It does not change canonical weights, percentages, outcomes, or transaction eligibility.
Percentage tooltips use total votes cast as their denominator. Highlighted ordinary segments exclude the separately shown YBC contribution.
The Vote control opens the existing proposal action panel. Recorded controls remain disabled.

## Acceptance criteria

- Place YBC contributions at opposite ends without moving the canonical Yea/Nay boundary.
- Keep zero, invalid, and tiny contributions honest in percentages and segment widths.
- Keep hover information readable within the viewport and accessible without a pointer.
- Preserve proposal row navigation and independent Vote controls.
- Preserve rightmost results alignment when the wallet area is blank.
- Review phone and desktop layouts, keyboard behavior, and recorded-choice icons.
- Update domain documentation and run the required checks.

## Integration and validation

The compact wallet implementation is commit `b9163aa`; YBC results and tooltip dismissal are commit `03a9e69`.
Commit `b405a04` waits for tooltip dismissal before browser screenshots.
Commit `c89ca49` constrains tooltip content at enlarged text sizes and adds a regression check.
Independent review confirmed the empty-area navigation, disabled control behavior, and rightmost results alignment.
Its focused checks passed on phone and desktop, including a 40-pixel click target for the smaller controls.

Independent YBC review found no arithmetic or security blockers.
The bar preserves its canonical boundary and calculates percentage labels from original bigint weights.
Review identified the tooltip's missing Escape behavior. The shared component now dismisses only its displayed tooltip state and cleans up its listener.
No new tooltip implementation or dependency was added.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run test -- --maxWorkers=2` | 2,279 tests passed across 208 files. |
| Optimized mock `npm run build` | Passed, including the final tooltip containment fix. |
| `npm run test:e2e` | 65 passed; one production-only case skipped in the mock runtime. |
| `npm run test:e2e:full -- --workers=2` | Initial run: 56 passed; one text-size containment failure. Fixed and verified in the focused final run. |
| Final compiled browser checks | All five passed: responsive YBC views, touch disclosure, original Markdown containment, and the new 200% tooltip regression. |

The full browser suites use separate local servers for the same compiled mock build.
Focused YBC checks cover all four hover segments, viewport bounds, fixed totals, Escape dismissal, and the keyboard/touch disclosure.
The initial full run found an overflow at 200% text size on a 390-pixel screen.
The hidden tooltip content expanded beyond its parent's width limit. Markdown remained inside its intended scroll regions.
The fix bounds the tooltip content to the available width. Review confirmed that the change preserves text scaling and vote semantics.
The final checks ran against the rebuilt integration demo. Typecheck and focused lint also passed for the containment fix.
Manual review of the compiled demo confirmed the compact board controls and YBC endpoint highlights.
The YBC Yea tooltip displayed 13.64% of total votes cast for proposal 2.
Phone and desktop browser checks cover the same layout and interactions.

## Local review

1. Open `http://localhost:3323/dao` to compare compact neutral Yea and Nay states on proposals 21 and 22.
2. Proposal 2 retains the black **Vote** action. Closed unvoted proposals leave the wallet area blank.
3. Open `http://localhost:3323/dao/proposals/2` and inspect **Vote results**.
4. Hover the bar segments to read percentages. Toggle **Highlight YBC** and confirm the totals remain fixed.

The demo uses deterministic mock data and a test wallet. Existing production flags and transaction checks remain in place.
The milestone is tagged `integration/dao-voting-clarity-refinement-20261023`.
