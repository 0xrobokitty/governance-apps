# Vote results and YBC highlighting

Proposal details show one canonical vote bar. The “Highlight YBC” checkbox is enabled by default when a valid contribution exists.
The bar shows YBC Yea, remaining Yea, remaining Nay, then YBC Nay from left to right.
Patterned sections mark the YBC contributions at the outside edges. The legend labels each weight and shows its number without repeated units.
Turning off the highlight changes only the bar segments and legend. Total weight, percentages, outcome, and threshold remain unchanged.
There is no result that excludes YBC votes.

Each visible segment has a hover tooltip with its percentage of total votes cast.
Remaining portions are labeled “non-YBC” while highlighting is enabled.
The “Vote breakdown details” disclosure gives the same percentages for keyboard and touch users, including contributions too small to draw.
It also gives the recorded update time and configured collective address.
The “Explore YBC” link follows the existing host routing rules. Proposal-board summaries keep their compact display.

## Calculation and unavailable data

`lib/clients/dao/vote-results.ts` uses bigint arithmetic for weights and subtraction.
Canonical Yea and Nay weights must be nonnegative and must sum to total weight.
Missing or incoherent totals produce an unavailable message, without a calculated bar.

YBC uses its latest contribution, including replacement and zero-weight events.
Each YBC side must fit within its corresponding canonical side. An invalid contribution disables highlighting while retaining coherent canonical totals.
An absent contribution shows “No recorded YBC voting weight.” Unsupported chains show the YBC vote as unavailable.

The bar uses one million integer units. Each YBC segment is allocated within its canonical side.
Rounding therefore keeps the Yea/Nay boundary fixed. Tiny contributions can have zero visible width; the legend still shows their formatted weight.
All-zero totals produce an empty bar without division by zero.

Percentage labels use the original bigint weights and total votes cast, independently of bar-width rounding.
Labels round to two decimal places. Shares below 0.01% show “<0.01%”; partial shares above 99.99% show “>99.99%”.
Only zero weight shows 0%, and only the full total shows 100%. Independently rounded labels can sum to slightly more or less than 100%.

## Validation

Domain tests cover endpoint order, total-weight percentages, exact partition sums, contract rounding, large integers, zero totals, missing data, and oversized contributions.
Component tests verify that toggling cannot change canonical totals or add another bar.
Browser tests cover unclipped segment tooltips, keyboard and touch disclosure, fixed segment boundaries, and layouts at 390 and 1280 pixels.
Tooltip content stays within its container at 200% text scaling, including when the popup is hidden.
The action panel has the `dao-proposal-actions` anchor for proposal-board Vote links.

This change does not alter transaction checks, feed formats, or deployment flags.
