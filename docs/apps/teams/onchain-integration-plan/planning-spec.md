# Team Finances Planning Spec

This document records the original integration design.
Use the [integration references](README.md) for current contracts, implementation context, and acceptance procedures.
The original assignment sequence remains in Git history.


## 1. Canonical naming

- app name / slug: `teams`
- route key: `/teams`
- display label: `Team Finances`
- initial beta exposure: `teams-beta.dao-ops.com` with mock / dummy data
- production host: `teams.yearn.fi` (gated until feed-backed reads, launch writes, fork smoke, and production approval)

## 2. MVP scope

Included:
- team directory
- team workspace overview
- revenue deposit interaction with conversion preview
- funding claim / return interaction
- bonus visibility and claim
- lifecycle state
- admin overview panels

Out of scope for MVP:
- vest claim management after initial funding claim
- exhaustive low-level admin setters as first-class UX
- generic governance transaction builders

## 3. Data strategy

### Mock phase
Use `docs/apps/teams/mock-data-schema-v1.md` and the example JSON as the source of
truth for seed fixtures and debug presets. After M2, route-local scenario chrome
should be retired in favor of a debug-backed mock store that preserves the production
route shape.

### Feed-backed production phase

Production reads must use the `teams.json` feed documented in
`teams-feed-schema-v1.md`. The feed is produced by `gov-apps-stats` and owns historical
team, revenue, funding, bonus, and accounting state.

Frontend live overlays may add:

- connected wallet owner status
- token balances and allowances
- client-derived write eligibility from raw feed state, wallet state, current chain, and
  simulation
- write simulation status
- post-transaction invalidation while the next feed snapshot is pending

Wallet-specific writes only start after the feed-backed read model is stable. Historical
price and accounting rendering must be supplied by the feed or Teams domain client, not
inferred ad hoc in page components.

The feed-level `team.availableActions` block is a compatibility hint, not an
authorization source. Production CTAs must not trust it; WP10 must derive write readiness
from the accepted feed facts and live wallet context.

## 4. Approved route shell and file layout

The initial `/teams` route lands on the team directory. From there, users open a
team workspace whose sections are:

1. Overview
2. Revenue
3. Funding
4. Bonus
5. Ownership & lifecycle
6. Admin, shown only for operator/admin contexts

Approved file layout:

```text
app/teams/
  page.tsx
  TeamsPageClient.tsx
  messages.ts
  components/
    MockControls.tsx
    TeamsDirectory.tsx
    TeamWorkspace.tsx
    TeamOverviewCard.tsx
    RevenueDepositCard.tsx
    FundingApprovalsTable.tsx
    BonusCard.tsx
    TeamLifecycleCard.tsx
    AdminConsole.tsx

lib/clients/teams/
  types.ts
  client.ts
  mock.ts
  onchain.ts
  index.ts

lib/hooks/
  useTeams.ts
```

## 5. Milestone outcomes

### M1
Static mock-backed surface accepted.

### M2
Interactive mock flows accepted.

### M2A
Debug-backed production-parity mock runtime accepted.

### M3A
Shared data contract and `gov-apps-stats` producer handoff accepted.

### M3B
Staging `teams.json` feed is produced by `gov-apps-stats`.

### M3C
Staging feed is validated by `governance-apps`.

### M4
Feed-backed reads work in the app.

### M5
Launch-scope writes work on fork.

### M6
UAT and preprod accepted.

### M7
Controlled production rollout approved.

## 6. Risks

- over-scoping the surface into a full back-office system too early
- confusing funding-claim timing and vesting edge cases
- overwhelming the default user experience with admin detail
- coupling the UI too tightly to historical pricing logic not owned by the frontend
- letting producer and consumer schemas drift across repos
- treating mock-only states as production evidence after real feeds exist

## 7. Launch stance

Required launch order:
1. shared feed contract accepted
2. staging `teams.json` produced by `gov-apps-stats`
3. staging feed validated by the frontend consumer
4. feed-backed reads accepted
5. launch writes accepted on fork
6. production green light recorded
7. production exposure on `teams.yearn.fi` after release checklist approval
