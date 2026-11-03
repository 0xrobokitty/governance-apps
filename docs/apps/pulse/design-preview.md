# Pulse: trends before snapshots

Pulse replaces the first Metrics mock at /pulse. Its intended public destination is Pulse.io; no domain or deployment is configured by this work package. It remains explicitly gated mock code.

## Product direction

Use six chart tiles to answer daily executive questions:

1. Is capital growing, and how much comes from market prices?
2. Is new capital arriving or leaving?
3. Are depositing and withdrawing accounts trending differently?
4. Which asset groups are attracting or losing capital?
5. How are harvested results and protocol fees developing?
6. How are YFI staking, stYFIx APR, voting and price changing?

Product movers add cumulative-flow sparklines and rank changes. Focus view keeps the six tiles visible and hides secondary material. Windows are 7, 30, 90 and 365 completed UTC days, defaulting to 30. Every main tile contains history. Current values summarize those histories rather than substituting for them.

The original prototype's inline SVG trend tiles informed this revision. Its static team descriptions and broad financial scorecards are not carried over. Existing Yearn fonts, shell, colors, cards, dialogs and themes remain in use.

## Normalization contract

TVL at market prices is the sum of closing underlying quantities times closing prices. The fixed-price TVL line uses the same quantities at prices at the opening boundary of the selected window. It includes flows and earned assets; it is not a pure measure of deposits or investment performance.

Start = 100 divides each TVL line by its opening value and multiplies by 100. Both lines start at 100. A baseline date is included before the first flow day.

Dollar external flows use movement-time prices. The synthetic ledger uses daily closing prices for its example movements. Price-neutral flows use fixed opening prices. Each daily flow rate divides by the same opening TVL, so daily rates sum to the period rate. The flow headline follows the selected unit; the percentage view pairs its rate with fixed-price dollars, not movement-price dollars. Asset-group and product rates use their own opening capital. Protocol rates are capital-weighted, never sums or simple averages of asset percentages.

The TVL change bridge reconciles opening value + external flows + earned assets + repricing to closing value. Repricing is opening quantity times the daily price change. A live feed must preserve this reconciliation and disclose any unresolved residual instead of calling it yield.

Accounts use chain + address. Daily unique counts, period unique counts and action counts remain separate. Headline daily averages compare with the preceding equal-length window. Seven-day chart averages use warmup history before the displayed window. No human identity, retention or attribution is inferred.

Fees recorded, strategy-reported harvest P&L and report counts are separate views. Auction proceeds remain a separate conversion stage. No fee estimate is labeled team-reported revenue. In production, actual fee events are required; the synthetic fee calculation is not a proposed historical estimator.

YFI stake counts underlying assets once across direct stYFI and stYFIx. Pending unstakes are separate. APR is stated annual percentage rate, not APY. Votes are discrete observations with matched historical eligible-power denominators; missing vote dates are nulls. USD and ETH price histories are alternate views, without a dual-axis chart.

## Coverage and source boundary

Capital and account filters apply to TVL, flows, destinations, accounts and product movers. Fees and governance remain protocol-wide and are labeled accordingly. The partial example excludes Base from the whole displayed window, including comparisons, rather than producing a false cliff when coverage disappears. Unavailable data suppresses all totals.

The fictional ledger spans 740 completed days through 2 November 2026. The mixed-signals example intentionally combines rising dollar TVL with weakening external flows. Broad-inflow, capital-leaving, partial and unavailable examples support review.

No live indexer, RPC, price, vote, analytics, Treasury or Teams feed is wired. The data layer still needs agreed product scope, wrapper and migration deduplication, event completeness, historical prices, freshness and reconciliation. Acquisition and retention metrics remain later candidates once attributable, complete cohorts exist.

## Run and validate

Use explicit local flags: NEXT_PUBLIC_RUNTIME_MODE=development, NEXT_PUBLIC_USE_MOCKS=true, NEXT_PUBLIC_ENABLE_PULSE_PREVIEW=true. The route returns 404 without them or in production runtime mode. The retired /metrics route is absent. No public app registry or host routing is enabled.

The domain model is in lib/clients/pulse; usePulse supplies the UI. No dependency was added. Custom SVG plots provide axes, hover and keyboard inspection, and full data tables through Details.

Unit checks cover price neutrality, reconciled TVL, weighted rates, rolling averages, unique accounts, historical stake/votes, coverage and gating. Opt-in browser checks cover the renamed route, filters, normalization, governance tabs, focus view, missing data and mobile access. Required broad repository checks remain applicable.

The source work package builds on cf67395921ea9c1ad21e92cd7d6205ea3eeb4425; public master was fetched and remained 2b7f39e37364ad541941d0e387492201e79f9c3c. Keep this design branch outside the accepted integration lane until owner approval. Live source integration and publication require later scope.

The 365D view means a rolling 365-day window, not a calendar year. Its comparison uses the preceding 365 days. The extended fixture preserves the original recent history and includes earlier observations for both annual windows and moving-average warmup. Date ranges and inspected values show years where needed.
