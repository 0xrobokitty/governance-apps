# Metrics design preview

This work package provides a reviewable daily overview in Governance Apps. It does not connect live data or introduce a production dashboard.

## Review scope

- Three capital summaries: net external flows, depositing accounts and withdrawing accounts.
- 1D, 7D and 30D periods; asset filters apply only to capital and product activity.
- Dollar flows at movement prices, plus a separate flow rate at fixed opening prices.
- Product ranking by net inflows, net outflows or depositing accounts; top five expands to all eight examples.
- Fee activity distinguishes fees recorded, auction proceeds and closing inventory.
- YFI participation separates direct stYFI and delegated stYFIx underlying stake, excludes pending unstakes and shows current APR and the last closed vote.
- Links lead to existing apps for financial reporting and deeper detail.
- Normal, outflow, partial-coverage and unavailable examples support design review.

All values, product examples, prices and voting measurements are fictional. The deterministic sample ends on 1 November 2026. It is not suitable for financial or governance decisions.

## Run locally

Set these variables for both build and serve:

```text
NEXT_PUBLIC_RUNTIME_MODE=development
NEXT_PUBLIC_USE_MOCKS=true
NEXT_PUBLIC_ENABLE_METRICS_PREVIEW=true
```

Run the existing Next.js scripts and open /metrics. The route returns 404 without both explicit feature and mock flags, and in production runtime mode. No public subdomain, app registry entry or deployment is added.

## Measurement boundaries

Capital crosses the outer Yearn product boundary. A live pipeline must deduplicate nested vaults, wrapper transfers, internal migrations and strategy reallocations. The example ledger already represents external flows and is not an indexer implementation.

The price-adjusted rate is the sum of native net flows at opening prices, divided by opening capital at those same prices. USD totals use prices at each movement. These answer different questions; neither is investment performance. Asset rates are weighted by capital rather than averaged. Stablecoin native units are not directly combined for display.

Accounts use chain + address identity. They are not people; the same account can appear in both directions or several products. Protocol totals deduplicate the selected period. Contract versus EOA and website attribution remain source-design decisions for later.

A one-day chart divides illustrative daily amounts into six fixed four-hour buckets. Longer periods use daily ledger rows. This is display data, not observed transaction timing.

Fees recorded and auction proceeds are period flows. Awaiting conversion is closing inventory; these values are not additive. The fee panel stays protocol-wide when a capital filter is selected.

Active stake is underlying YFI counted once. StYFIx is a subset of the staking system. APR does not assume compounding. Voting uses a denominator from the same example closed vote and retains its own date. Market prices are snapshot context.

Partial coverage removes Base capital rows and explicitly labels the reduced scope. Unavailable data suppresses totals instead of rendering zeros. The live design will need source-specific freshness, coverage, provenance and historical denominators.

## Architecture and validation

The fixture and measurement selectors live in lib/clients/metrics; useMetrics supplies the view. The route uses shared Card, Button, Modal, header, fonts and theme tokens. The chart is accessible SVG with a data table. No dependency was added.

Unit tests cover deduplication, weighting, price neutrality, reconciliation, filters, scenario semantics and route gating. Opt-in Playwright tests cover the page, interactions, mobile layout and dialog focus. Set NEXT_PUBLIC_ENABLE_METRICS_PREVIEW=true when running those tests.

Do not merge this work package into the accepted integration lane until the design is approved. No RPC, Kong, analytics, auction or governance endpoint is wired by this work package.
