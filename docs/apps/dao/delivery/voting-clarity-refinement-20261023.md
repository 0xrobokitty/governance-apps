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

## Final label review

The follow-up review shortened “Remaining Yea (non-YBC)” and “Remaining Nay (non-YBC)” to “Yea” and “Nay”.
Tooltips and the breakdown disclosure now share the same labels. YBC labels and all calculations remain unchanged.
Typecheck, lint, the optimized build, and all 2,279 unit tests passed.
The four affected browser checks passed on the compiled demo, including mobile, touch, and 200% text scaling.
The first unit run was interrupted after local worker-service failures in the restricted environment; the unrestricted rerun passed.

## Voter table follow-up

The 17:02 screenshot prompted a final pass on the proposal voter table.

| Before | After |
| --- | --- |
| Individual choices use For and Against. | All choices use Yea and Nay. |
| Collective addresses receive generated nicknames. | Known addresses default to YBC vote and stYFIx delegated vote. Saved names and verified ENS take priority. |
| The editable name and address each occupy a separate tall row. | The name sits directly above the address, with a separate pencil control beside them. |
| Split choices occupy two tall lines. | Their percentages share one compact line when space permits. |

The reviewed Voter updates both YBC and stYFIx with the collective split. Individual vote entry points remain binary.
The display preserves recorded fractions instead of converting collective votes into individual choices.
Default names match exact configured mainnet addresses, or the separate mock addresses. They do not classify arbitrary addresses.

Independent review found no trust, identity-priority, or click-target blockers.
Browser checks confirm primary-line alignment, compact row height, and separate edit/address click targets at phone and desktop widths.
Name editing, searching, sorting, and persistence remain covered.

Validation: typecheck, lint, and the optimized mock build passed.
The initial unit run passed 2,279 tests and found one shared YBC hover-class regression.
Restoring YBC's existing pointer rule resolved it; all 40 affected unit checks passed, including live/mock name scoping.
The three focused voter browser checks passed. The final compiled build passed all 58 full browser tests and 65 smoke tests.
One production-only smoke case was skipped in the mock runtime.
Manual review confirmed the shorter rows and collective labels in the demo; an existing saved YBC name remained intact.
The checkpoint is tagged `integration/dao-voter-rows-20261023`.

## Individual voters and collective summary

The next review separates individual voters from the two collective accounts. This replaces the aggregate naming approach above.

| Before | After |
| --- | --- |
| YBC and stYFIx appear as two sortable voter rows. | Individual voters remain in the list; one fixed bottom row combines both collective accounts. |
| The voter count includes both aggregate accounts. | The count includes only individual rows. Individual YBC members remain visible. |
| Collective rows move or disappear during searches. | The YBC summary stays visible during search, sorting, and pagination. |
| An always-visible pencil sits beside the identity block. | Hovering or keyboard-focusing the name reveals the pencil beside it; touch keeps it visible. |
| The address has a small left inset. | Name and address share the same left edge, with separate accessible hit areas. |

The footer says **YBC vote — Includes stYFIx** and links to the appropriate YBC app host.
It adds the latest account weights and preserves each account's contribution rounding.
Proposal 2 shows two individual voters and a combined 6 YFI collective vote: 75% Yea and 25% Nay.
Its share is 54.54% of the 11 YFI total. The separate results chart retains the YBC-only highlight.

Classification uses exact configured addresses and the correct mainnet or mock context. Labels and member status do not affect classification.
Missing fields or inconsistent splits do not produce a fabricated common vote. Contributions above the canonical total suppress the common split and share.
Independent review found that overflow case; the final domain guard and regression test address it.

Integration requires no deployment order changes, new dependencies, contracts, or write permissions.
The local review route remains `http://localhost:3323/dao/proposals/2#dao-proposal-votes`.

Typecheck, lint, and the optimized mock build passed. All 2,307 unit tests passed across 208 files.
The 27 domain checks include missing contributions, exact address matching, rounding, replacement votes, and inconsistent totals.
The first layout check measured an icon container instead of its text. The corrected check compares glyph positions across all four columns.
All three focused phone and desktop voter checks then passed. Manual review also checked name editing and the fixed summary during search.
The final compiled build passed all 59 full browser tests, including keyboard and touch name editing.
The smoke suite passed 65 tests; one production-only test was skipped in the mock runtime.
The integration checkpoint is tagged `integration/dao-individual-voters-20261023`.
