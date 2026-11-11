# Pulse global overview consumer

Base: reviewed source 69d2260. This package changes the local review consumer.
It does not change the running preview or production.

## Public contracts

Existing pulse/v1, native reviewedCapital and legacy governance metrics remain accepted.

TVL points can include `chains: [{chainId, value}]`. Values use USD decimal strings.
Every chain from the source scope must appear exactly once. The sum must match
the provider total within max(8 USD, total × 1e-8). Missing breakdowns remain
unknown. The total series remains usable without a breakdown.

The optional `globalCapital` section uses `pulse-global-capital/v1`.
It publishes the latest 90 closed UTC days. A day requires all six reviewed chains.
Each chain reference must match that day's reviewed accounting hash.
Quarantined or missing native rows cannot support a global observation.

Daily amounts use reference USD prices near UTC opening, not execution prices.
Deposits and withdrawals use the same priced asset set. Price coverage counts
assets and actions; it does not measure the percentage of capital valued.
Unpriced amounts stay null. Partial priced amounts are explicit subtotals.
Flow balance is (deposits − withdrawals) / (deposits + withdrawals), in basis points.
An inactive day has zero USD flows and no balance. This rate is not TVL growth.
USD display amounts are rounded independently. A one-cent residual is allowed.
There is no fixed-price range view until its price coverage is independently supported.

Accounts include counted routes regardless of price coverage. They count distinct
chain-qualified beneficiary addresses. The same address on two chains counts twice.
Missing any required chain makes the global account date unavailable.

## Governance

The new series are `yfi.veyfi_migrated`, `yfi.liquid_lockers_backing`,
`yfi.participating` and `yfi.participation_rate_bps`.
The existing direct stYFI and stYFIx series form the other two components.
Their total matches the staking app: active stYFI + migrated veYFI + locker backing.
stYFI includes stYFIx. Direct stYFI therefore subtracts stYFIx; cooldown is excluded.
These metrics do not reinterpret the older stYFI-only total and rate history.

Producer and consumer must pass a real-feed validation before preview replacement.

## Dashboard behavior

The page has no chain or asset dropdowns. The only global data control is the
history window. TVL includes a chain breakdown inside its chart.
Capital and account charts cover all supported chains.

Net vault flows offers USD and Flow balance views. Hover values include gross
deposits and withdrawals. The window balance uses total deposits and withdrawals,
not an average of daily percentages. Its axis stays between −100% and +100%.
The rate does not measure capital growth. No TVL denominator is used.
The measurements capture capital crossing covered vault boundaries. Integrations
can reallocate between vaults in separate transactions. This increases both sides
without proving new customer inflows. The dashboard does not present these
measurements as whole-Yearn customer inflows or customer growth.

Product movers ranks all supported products by action count or priced net USD.
A priced subtotal can exclude assets without prices. Its coverage counts actions,
not the fraction of capital priced.

Each card has one Details drawer for source, scope and calculation notes.
Visible statuses still distinguish stale data, unavailable data and priced subtotals.
The treasury badge describes priced holdings. It does not imply complete holdings.
The yLockers tabs show rewards and peg. Net deposits remain in Details until their
shared accounting boundary is defined.

Area charts break at missing observations. Stacked values never fill unknown
components with zero. The source accounting-change annotation remains visible.
