# Vote results and YBC highlighting

Proposal details show one canonical vote bar. The “Highlight YBC” checkbox is enabled by default when a valid contribution exists.
Patterned sections mark YBC Yea and YBC Nay within that same bar. The legend shows their recorded voting weights.
Turning off the highlight changes only the bar segments and legend. Total weight, percentages, outcome, and threshold remain unchanged.
There is no result that excludes YBC votes.

The “About YBC votes” disclosure gives the recorded update time and configured collective address.
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

## Validation

Domain tests cover exact partition sums, contract rounding, large integers, zero totals, missing data, and oversized contributions.
Component tests verify that toggling cannot change canonical totals or add another bar.
Browser tests cover keyboard controls, source disclosure, fixed segment boundaries, and layouts at 390 and 1280 pixels.
The action panel has the `dao-proposal-actions` anchor for proposal-board Vote links.

This change does not alter transaction checks, feed formats, or deployment flags.
