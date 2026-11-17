# Team Finances

App name / slug: `teams`
Route key: `/teams`
Beta host: `teams-beta.dao-ops.com`
Production host: `teams.yearn.fi` (controlled by `NEXT_PUBLIC_ENABLE_TEAMS`)
Display label: `Team Finances`

## Product summary

A team-centric finance and operations workspace for registered protocol teams.

It covers the team directory and lifecycle, period and lifetime reporting,
permissionless revenue deposits, funding, bonuses, and scoped operator controls.

## Naming stance

- Keep the app key and slug stable as `teams`.
- Keep the path stable as `/teams`.
- Use `Team Finances` in product copy and headers.

This keeps routing, hostnames, and domain client keys durable even if the surface
grows.

## Navigation and presentation

`/teams` opens the directory without selecting a team. Table is the default view and
Cards remain available as a saved preference. A team row or card is one native link,
so click, keyboard, modifier-click, and new-tab behavior remain conventional. Nested
owner and contract links keep their own actions.

Opening a team writes its address and active section to the URL. Refresh, browser
history, and copied links restore the same workspace. The workspace shows
`/teams / <team-id>` as its hierarchy; `/teams` returns to the directory. Unknown or
malformed team addresses return safely to the root.

The team name replaces the generic hero title in a workspace. Overview, Revenue,
Funding, Bonus, and Lifecycle remain stable sections on one page. Admin stays separate
and appears only to an authorized operator.

Owner and contract identities use the shared compact Mainnet explorer treatment.
Pending ownership appears only while a transfer exists. Read-only history rows remain
visually passive. UTC dates and exact decimal formatters are shared with the other
apps. The detailed interaction rules live in
[`ui-spec.md`](ui-spec.md).

## Debug runtime alignment

Teams follows the shared debug model used by `/styfi`, `/veyfi`, and `/yeth`.
Production-like route copy stays visible while named scenarios, time changes, loading,
empty states, viewer roles, and action states live in the floating debug panel and E2E
bridge. An explicit product URL remains the navigation authority when a preset changes.

Financial reporting has explicit scope controls. The directory defaults to current
period values and can switch to a historical period or lifetime values. The workspace
keeps current-period, lifetime, and period-history views separate.

## Live data path

Production consumes one `teams.json` object from the stable
`NEXT_PUBLIC_TEAMS_DATA_URL`. Browsers use the same-origin `/api/teams-data` proxy.
There is no second versioned endpoint or environment variable.

The consumer can parse legacy v1 during the transition, but v1 financial values fail
closed because the payload does not declare compatible USD units. A complete v2
snapshot declares normalized 18-decimal USD units. Financial values become available
only after schema and canonical-block verification. Feed requests and proxy responses
use `no-store`.

The feed is display input, not write authority. Actions use the connected wallet,
Ethereum Mainnet state, exact token units, current protocol bindings, and simulation
through the shared transaction flow. Snapshot age is shown as operational context, not
used as an action cutoff. A refresh failure may leave the last accepted snapshot
visible with a compact warning. Canonical-chain, deployment, or current-state
verification failures keep the affected actions disabled, and a rejected payload must
not replace accepted data.

The feed contract is
[`onchain-integration-plan/teams-feed-schema-v1.md`](onchain-integration-plan/teams-feed-schema-v1.md).
Producer and cutover rules are in
[`../../shared/gov-apps-stats-teams-ybc-feed-brief.md`](../../shared/gov-apps-stats-teams-ybc-feed-brief.md).

## Included docs

- `docs/apps/teams/ui-spec.md`
- `docs/apps/teams/user-stories.md`
- `docs/apps/teams/financial-reporting-scope.md`
- `docs/apps/teams/mock-data-schema-v1.md`
- `docs/apps/teams/examples/mock-data.example.json`
- `docs/apps/teams/onchain-integration-plan/teams-feed-schema-v1.md`
- `docs/apps/teams/onchain-integration-plan/examples/teams-feed.example.json`

## React state compatibility

Unavailable team routes return to the directory after data resolves. URL updates remain browser effects.
Funding forms reset their values and validation state before the changed approval or wallet renders.

See the [compiler and linter requirements](../../shared/testing.md#compiler-and-linter-compatibility) for toolchain compatibility.
