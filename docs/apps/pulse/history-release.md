# Pulse history and daily review

## Work package

Base: PR 154 revision 9e2018520dab56f0d39ba73e8494160c582bf385.
Worktree: shared / pulse / history. Producer work remains in GovApps Stats.
The owner approved a 90-day historical acquisition, mainnet repair, validated TVL,
and a Product movers card in place of Harvests. Deployment remains separate.

## Consumer contract

Keep pulse/v1 and reviewedCapital v3 compatible. Historical acquisition dates are
not evidence of observed coverage. A day contributes only when it exists in the
feed and is not quarantined. Empty days remain gaps. Do not fill old dates from a
current snapshot. X keeps its daily, forward-collected history.

Capital chain selection includes every supported chain, including chains without
observations. Asset selection applies to flows and product movers. Account
trends apply to the selected chain across all assets. Accounts are chain-qualified
beneficiaries, not people or website users.

Product movers defaults to Activity across all supported chains and assets. It
ranks the five products with the most counted deposit and withdrawal actions.
Daily mini charts show actions, with gaps when that chain has no observation.
Each product has a chain label. Identical addresses on different chains remain
separate products. The Net flows tab ranks absolute net flows for the selected
asset and chain. Different token units are never added. Internal and unresolved movements remain
excluded under the producer's reviewed rules. Missing dates break mini charts.

Metric status reports the source's availability, valuation quality and freshness.
The separate observation count reports history completeness. One available
snapshot does not imply a complete 90-day history. Staked YFI uses the total
headline while the chart splits direct stYFI and stYFIx.

## Acceptance

- Nine cards use the approved order. Product movers is visible by default.
- Ethereum remains selectable when its historical day is unavailable.
- No old TVL quarantine warning is presented as a new diagnosis.
- Unknown observations remain gaps in all four ranges.
- Wall view fits nine cards at 1920 × 1080; details remain accessible.
- Mobile has no horizontal overflow.
- Producer output passes the consumer boundary and is checked in the local
  preview before changing production configuration.
- Typecheck, lint, unit tests and browser suites pass.

## TVL source contract

The optional tvlHistory field uses pulse-tvl/v1. It contains a single provider's
Yearn Finance vault series. Never splice Kong values into this history. The
source reports seven chains, including Fantom. Its scope differs from the
six-chain reviewed capital event series and excludes separate Yearn Curating and
yETH pool series.

Each point contains observedAt, value in USD, quality=estimated, sourceSha256 and
provisional. The consumer rejects duplicate dates, future points, inconsistent
latest values and false coverage counts. The maximum history is 740 observations.
Missing closed days remain gaps. Current estimates can appear as provisional.

An accounting annotation marks 15–16 October 2026 in affected ranges. Provider
overlap deductions changed across this boundary. The chart must not present this
change as investor withdrawals. Fixed opening prices remain unavailable.

## Local live acceptance

The captured TVL producer fixture is from the 10 November 2026 Rust acquisition.
It contains 90 closed dates and a provisional quote. The consumer accepts those
bytes without changing field names or values.

Run the local browser test with PULSE_LOCAL_INTEGRATION=true against the prepared
local feed. Add PULSE_HISTORY_INTEGRATION=true for the release history gate.
That gate requires 90 observed capital dates on all six supported chains,
including yesterday, plus 90 observed closed TVL dates. It does not assert that
every route is classified. Route exclusions remain visible.

The test also checks global Product movers, Ethereum selection, the 90D range,
desktop wall view, mobile width and the application's actual soft-dark theme.

## Published capital window

The optional reviewedCapital.coverage.publishedHistory object declares the public capital horizon.
It contains days, inclusive from, exclusive until, durableRetentionDays, and basis.
All dates use closed UTC days relative to generatedAt.
The consumer rejects observations outside those declared bounds.

The current producer publishes 90 closed capital dates while retaining older durable state.
365D still remains available for other series.
For a longer selected range, Pulse names the capital limit in the existing status line.
Coverage details explain that earlier capital dates are outside the feed, not zero activity.
The same limit applies to flows, accounts, and product movers.
Older feeds without this metadata remain accepted and do not acquire an invented limit.
