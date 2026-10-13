# Treasury frontend

The treasury app is a read-only route at `/treasury`. It uses the shared Yearn header, controls, surfaces, and theme.

## Views

Portfolio shows balances at configured treasury addresses and attributable Robo Treasury inventory. The producer supplies every displayed valuation.

The portfolio uses compact tables grouped by address. Robo destination and custody addresses share one group. Empty addresses do not create tables.

Rows with known values below $100 stay in a collapsed group. The threshold uses the full value, including YFI. Curated, annotated, and operating positions without prices remain visible. Other unpriced tokens stay in a separate disclosure. Eight reviewed lookalike contracts have their own disclosure. An unknown value does not mean dust or spam.

Each group subtotal includes its collapsed priced balances. Subtotals add producer values with exact decimal arithmetic. The headline remains the producer summary.

Rows show token icons, balances, values, and small purpose pills. Expanded details show custody, withdrawal conditions, valuation sources, and accountable teams. Icons use reviewed Yearn files and token-list image references, keyed by chain and token address. Unlisted assets use the fixed Yearn token service. Vaults can use the supplied underlying asset icon. Image failures show a neutral fallback. Mobile rows use compact balance precision; expanded rows retain the usual six-decimal display.

The value summary covers all addresses. Address and team filters change the list only. The YFI control changes valuations, but retains asset balances.

Purpose and withdrawal conditions are separate. Strategic capital is part of the portfolio, but the app does not describe portfolio value as spendable capital.

Loans & allocations uses a table with position, funding, current amount, team, and reference columns. Pending allocations show planned funding. Unknown amounts show a dash. Expected-return fields remain in the feed contract but do not appear in this view. Additional evidence and notes stay in row disclosures. OTC inventory distinguishes unreconciled funding from unsold st-yCRV shares and liquid yCRV. The UI does not add these token quantities together.

Closed positions appear only in Loans & allocations, in a collapsed list. Snapshot details and the unpriced-holdings count appear only in Portfolio. The count covers the complete snapshot, including collapsed rows, and does not change with account or team filters. The shared headline retains its partial-value label on both tabs. Each item has a disposition, a short note, and an evidence link.

## Data boundary

The domain client reads `/api/treasury-data`. The endpoint reads the fixed server configuration `TREASURY_DATA_URL` and validates the complete feed.

Both transport layers limit each request to ten seconds and two MiB. They reject malformed UTF-8, invalid accounting relationships, and example data.

The endpoint requires HTTPS in production. Preview configuration can use HTTP on exactly `localhost`, `127.0.0.1`, or `[::1]`. Credentials and redirects are not accepted. Both fetches use `redirect: "manual"` and reject non-success responses. The deployed Cloudflare runtime rejects `redirect: "error"` before it sends a request.

Failed requests retain the last valid snapshot. Older publications and conflicting publications cannot replace it. A lower block or a conflicting block hash or timestamp also fails validation. Observations more than one minute ahead are rejected.

The app marks stale snapshots after 45 minutes. It checks publication time and block time. Asset details also show the valuation source and observation time.

The app polls each minute while the route is visible. The producer publishes each 15 minutes.

## Local examples

1. Use Node.js 24.
2. Install the locked dependencies with `npm ci`.
3. Start the app with `env NEXT_PUBLIC_USE_MOCKS=true npm run dev`.
4. Open `/treasury`.

The example banner remains visible. Example balances do not represent current treasury values.

The optional `scenario` query selects deterministic review states:

| Query | State |
| --- | --- |
| `?scenario=ready` | Example portfolio and allocations |
| `?scenario=partial` | Unknown prices with known balances |
| `?scenario=stale` | Old observation |
| `?scenario=empty` | No portfolio holdings |
| `?scenario=error` | No valid snapshot |
| `?scenario=loading` | Loading state |
| `?scenario=long-metadata` | Maximum-length metadata for mobile review |

Scenario queries have no effect in the live client. A failed live request never selects examples.

## Local producer integration

1. Publish a valid `mode: "live"` feed through a local HTTP server.
2. Set `TREASURY_DATA_URL` to that server's loopback URL.
3. Set `NEXT_PUBLIC_USE_MOCKS=false`.
4. Start the frontend.
5. Open `/treasury`.
6. Check the observation time, coverage notes, accounts, and asset balances.
7. Stop the feed server.
8. Refresh the app.
9. Check that the previous snapshot remains visible with the refresh notice.

## Rollout

Production keeps the route, endpoint, and navigation link disabled unless `NEXT_PUBLIC_ENABLE_TREASURY=true`. Mocks remain disabled in production.

Both deployment workflows pass `NEXT_PUBLIC_ENABLE_TREASURY` from their GitHub environment variables to validation, build, and deployment. The flag defaults to `false`. Changing it requires a new build; setting a Worker runtime variable alone does not change client enablement.

The app recognizes `treasury.yearn.fi` and the optional `treasury-beta.dao-ops.com` alias. Shared hosts retain `/treasury`. This routing support does not register either hostname: Wrangler routes remain unchanged. First validate the existing protected preprod Worker URL at `/treasury`. Then validate production at `app.dao-ops.com/treasury`. Full preprod navigation also requires an associated, protected beta alias: other beta applications link to that hostname. The operator associates the final production hostname manually and checks the association after each deployment.

Set `TREASURY_DATA_URL` separately on the target Worker to the approved public HTTPS JSON endpoint. Existing deployment commands preserve dashboard variables with `--keep-vars`. No browser R2 credentials or R2 Worker binding is needed. Release approval remains a separate step.

## Validation

The unit tests cover transport bounds, deadlines, publication ordering, precise amount formatting, filters, and unknown values. Browser tests cover keyboard tabs, mobile layout, enlarged text, and failure states.

Required checks:

```sh
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run test:e2e:full
```

## Integration notes

Merge the feed contract before this frontend package. The example and parser are shared with the producer. No dependency changes are necessary.

The first release includes portfolio and allocation reads. Historical valuation, write actions, and detailed Robo auction tracking remain outside this package.

## dYFI redemption reference

Direct dYFI uses a net redemption reference supplied by the producer. It is included in the portfolio value, even when the redemption contract needs YFI funding. This reference is not an executable sale price. The row identifies the reference and shows funding shortages. The headline states when it includes a redemption reference. Excluding YFI removes the reference value and its valuation labels; the funding status remains visible.

Expanded details show the exact ETH payment, available YFI, and redemption contract. The UI formats these amounts without calculating redemption economics. The funding status describes inventory for this holding at the snapshot, not a reservation or guarantee of execution.

Feed V1 adds optional `valuation.redemption` with `contract`, `ethRequiredRaw`, `yfiAvailableRaw`, and `fundingStatus`. It is required for priced direct Ethereum dYFI and forbidden for unavailable valuations or other assets. The current redemption contract is pinned by semantic validation. ETH payment must be positive; a zero net USD reference remains valid. Funding status must agree with available YFI and the holding balance. Raw amounts retain uint256 bounds.

For an existing live endpoint, update the consumer before the producer emits this field. First-release feed endpoints can be validated before app activation. Existing V1 feeds without priced dYFI remain valid. Older strict consumers reject the new property and retain their last valid snapshot. Regenerate the TypeScript boundary with `node scripts/generate-treasury-contract.mjs`. The shared acceptance corpus covers the additive field and its accounting constraints.

## Release routing validation

Run `npm run test:e2e:treasury-rollout` for the enabled build. Run `npm run test:e2e:treasury-rollout -- --disabled` for the disabled build. Each command copies tracked source and locked dependencies to temporary storage, without local environment files. It builds with explicit fixture inputs and tests the shared path and both recognized treasury hostnames. The enabled browser receives a live-shaped fixture through its same-origin feed request. The real endpoint separately checks missing runtime configuration and disabled-route responses. These checks do not contact R2 or prove deployed configuration.

The deployment workflows run typecheck, lint, unit tests, production environment validation, a fresh OpenNext build, and the Worker size check. Browser rollout checks remain an explicit release gate. Preserve the existing application flags, runtime values, and bindings. No treasury DNS record or Worker custom domain is created by this package.

## Shared app discovery

The shared footer groups links to staking, governance, and contributor apps.
It includes the public governance-apps GitHub repository.
Links stay within the current local, preview, or production environment.
Destination links respect each app's release flag.

The shared voting notice appears below the header during an open DAO decision vote.
It shows the proposal count and the earliest closing time.
A dismissal applies to that deployment and voting period on the current browser origin.
A later voting period can show the notice again.
The notice stays hidden during loading, feed errors, stale data, and closed voting windows.

Both features require `NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY=true` in production.
Development and preview enable them by default.
See [shared discovery delivery notes](../../shared/discovery-20261013.md) for validation and rollout details.
