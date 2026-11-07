# Pulse live MVP

Pulse shows daily trends in nine cards.
It uses the cached GovApps Stats feed through /api/pulse-data.
The browser does not query chains, Envio, Kong, or paid analytics.

## Activation

For a local review, set these environment values:

    NEXT_PUBLIC_RUNTIME_MODE=preview
    NEXT_PUBLIC_ENABLE_PULSE=true
    NEXT_PUBLIC_USE_MOCKS=false
    PULSE_DATA_URL=https://data.dao-ops.com/prod/pulse.json

Then run npm run dev and open /pulse.
The producer must publish the feed first.
The feature remains disabled unless NEXT_PUBLIC_ENABLE_PULSE equals true.

The proxy accepts the production or staging Pulse object on data.dao-ops.com.
A nonproduction runtime also accepts a loopback HTTP source.
Credentials, redirects, oversized payloads, future timestamps, and fixture feeds are rejected.
No live failure substitutes illustrative values.

The earlier design preview uses its existing separate flags.
When live mode is enabled, the live route takes priority.
DNS and public host routing remain separate deployment work.

## Card order

| Row | Left | Center | Right |
| --- | --- | --- | --- |
| 1 | TVL | Net external flows and top products | Depositing and withdrawing accounts |
| 2 | yLockers | Harvests and fees | X audience |
| 3 | YFI governance | Treasury reserves | Recovery and loans |

Capital uses reviewedCapital, schema pulse-kong-envio/v3.
The consumer never adds registryCapital or scopedCapital totals.
The asset selector identifies a token and chain together.
Native quantities avoid changes caused only by market prices.
USD totals and percentages of TVL remain unavailable.

Each chart shows missing observations as gaps.
Capital uses completed UTC days.
Snapshot metrics retain the last valid observation in each UTC day.
A single observation appears as a point, not an invented trend.
All four ranges remain available: 7D, 30D, 90D, and 365D.

Top products rank absolute net movements within the selected token and chain.
The table also shows counted deposit and withdrawal actions.
Daily account counts use distinct chain-qualified beneficiaries.
They do not measure people, new users, or verified EOAs.

The yLockers card compares yCRV and yYB.
It shows completed weekly crvUSD allocations and fixed-size peg quotes.
Current-week allocations appear separately.
The staking-flow tab remains unavailable.

Treasury values exclude YFI and include only priced holdings.
Operating holdings do not subtract commitments.
The yETH target gap excludes unclaimed eligibility.
Cash paid and principal settled remain separate.
Resupply is a receivable owed to Yearn.

## Remaining unavailable series

- TVL and normalized USD or TVL-based capital measures.
- Complete harvest fees.
- X metrics until the Stats collector is enabled with read-only credentials.
- Governance turnout.
- Combined direct-staking and compounding flows for yLockers.

Plausible is excluded.
The live feature does not require wallet access.

## Validation

The parser rejects malformed observations, duplicates, fixture mode, and future publications.
The reader rejects older or conflicting publications.
A failed refresh retains the last accepted data and shows an error.
A feed older than one hour shows a stale warning.

Unit tests use a recorded live feed.
Browser tests cover range controls, cards, mobile overflow, errors, and unavailable data.
The optional PULSE_LOCAL_INTEGRATION test reads a real locally served Stats feed through the API proxy.
It requires PULSE_DATA_URL and NEXT_PUBLIC_ENABLE_PULSE=true.

## X audience

GovApps Stats 0.12 adds the optional pulse-x/v1 section.
Older feeds without this section remain usable.
One card contains Impressions, Link clicks, and Followers tabs.
Post performance and coverage stay in collapsed details.
There is no advertising split or product attribution.

Activity charts show observed counter changes on tracked posts under 30 days old.
The first observation establishes a baseline.
Missing days and absent counters remain gaps.
Negative counter corrections are excluded and reported in coverage.
The seven-day average requires seven consecutive measured observations.
Snapshots are approximately daily, not exact UTC calendar-day totals.
Impressions do not measure unique people.
Link clicks do not prove website visits or deposits.

The details show median impressions for posts observed at seven to eight days old.
The sample includes observations from the last seven days.
Link clicks per 1,000 impressions use only link posts with both counters.
Sample sizes, collection limits, new baselines, and missing posts remain visible.

Credentials belong only to the collector deployment.
The browser never calls X or receives credentials.
Disabled collection, missing credentials, budget pauses, and failures have explicit states.
Historical observations remain visible when collection becomes stale or disabled.
Live authentication and actual API billing require a separate deployment check.

The X unit and browser fixtures are synthetic.
They do not claim a successful live API connection.
