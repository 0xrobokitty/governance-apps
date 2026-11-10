# Pulse live MVP

Pulse shows daily trends in nine cards.
It uses the cached GovApps Stats feed through /api/pulse-data.
The browser does not query chains, Envio, Kong, or paid analytics.

## Activation

Use Node 24 and npm 11.14.0 for the local build.

1. Add these values to the ignored `.env.local` file in the repository root:

   ```dotenv
   NEXT_PUBLIC_RUNTIME_MODE=preview
   NEXT_PUBLIC_ENABLE_PULSE=true
   NEXT_PUBLIC_USE_MOCKS=false
   NEXT_PUBLIC_E2E=false
   NEXT_PUBLIC_RPC_URLS=https://ethereum-rpc.publicnode.com
   PULSE_DATA_URL=https://data.dao-ops.com/prod/pulse.json
   ```

2. Install the dependencies:

   ```sh
   npm ci
   ```

3. Build the application:

   ```sh
   npm run build
   ```

4. Start the local server:

   ```sh
   npm run start -- --hostname 127.0.0.1 --port 3000
   ```

5. Open <http://127.0.0.1:3000/pulse>.

For development with automatic reload, use `npm run dev` instead of steps 3 and 4.
The optimized build still uses the preview runtime for this local review.

The shared wallet shell requires `NEXT_PUBLIC_RPC_URLS` during an optimized build, even in preview mode.
This public Ethereum endpoint is sufficient for local Pulse review.
The dashboard reads the Stats feed and does not require a connected wallet.
A missing WalletConnect project ID only disables that connector in this configuration.
X credentials belong to GovApps Stats and are not required in this repository.

The producer must publish the feed first.
The feature remains disabled unless `NEXT_PUBLIC_ENABLE_PULSE` equals `true`.
Changes to `NEXT_PUBLIC_*` values require a new build.

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
One card contains Impressions, Observed link clicks, and Followers tabs.
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

The consumer also tests the actual Rust reducer output in pulse-x-producer.json.
That file contains 14 synthetic observations, not live account measurements.
The integration test checks impressions, clicks, and the seven-day performance sample.

## Partial X click coverage

The click tab shows **Observed link clicks** and the number of posts that contributed comparable counters to the latest interval.
Missing counters remain unknown. The interface does not replace them with zero or estimate a complete account total.
The seven-day average uses observed totals. A different post subset can affect that average even when audience behavior is unchanged.

A baseline needs a second consecutive observation before daily click activity is available.
A later missing counter also needs two comparable observations before its change can contribute.
The performance rate uses impressions and clicks from the same measured link-post sample.
It does not describe every tracked post or verified website visits.

Stats 0.12.0 does not publish current available/missing click-field counts.
The dashboard therefore does not infer a missing count from tracked posts minus contributing posts.
Tracked posts include posts without links and new baselines.
The Ansible acceptance report separately records exact field availability from the retained capture.

This UI change uses the existing 0.12.0 contract and requires no producer release or history rewrite.
Pulse remains opt-in through the existing NEXT_PUBLIC_ENABLE_PULSE flag.

## Local review and rollout

A successful local build does not establish complete data coverage.
The feed header describes publication freshness. Each source has its own coverage and collection history.
A fresh publication can contain stale capital observations.
Missing history remains visible in every range.

For the local acceptance review:

1. Open `/api/pulse-data` and verify that it returns HTTP 200 with `mode: "live"`.
2. Open `/pulse` and verify that all nine cards appear.
3. Select each range and verify that missing dates remain gaps.
4. Open the X Followers tab and compare its value with the latest X observation.
5. Open the X coverage details and review the baseline and sample counts.
6. Open Coverage & methods and review each chain's status.

The first X observation provides a follower count and a baseline for post counters.
Daily activity requires a second consecutive observation.
A missing activity value is not zero.
The seven-day average requires seven consecutive measured observations.

Preprod and production activation remain separate work.
The deployment workflows do not yet pass the Pulse build flag or feed URL.
Pulse also has no dedicated public host mapping.
The rollout must configure the build flag, the runtime feed URL, and the intended route.
A preprod browser review must use the deployed Worker and its actual feed.
Production readiness also requires an explicit decision about incomplete capital history and unavailable series.
