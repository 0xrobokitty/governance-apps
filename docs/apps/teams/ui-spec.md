# Team Finances UI Spec

Status: implemented
Applies to: `/teams` route, `teams-beta.dao-ops.com` beta host, and gated
production host `teams.yearn.fi`
App key / slug: `teams`
Route key: `/teams`
Display label: `Team Finances`

## 1. Why `teams` is the app key

`teams` is the best durable app key because the surface is team-centric and lifecycle-centric.

Rejected as primary route keys:

- `accounting` — too narrow once registry, funding, bonus, and admin views exist
- `budget` — too narrow because revenue and bonus are first-class
- `pnl` — too narrow and too jargon-heavy

## 2. Primary personas

### Team owner
Needs:
- team overview
- claim funding
- return funding visibility
- claim bonus
- owner transfer visibility

### Team contributor / finance operator
Needs:
- deposit revenue on behalf of a team
- understand conversion / credited USD value
- inspect recent reporting history

### Protocol operator / admin
Needs:
- registry overview
- approval / funding operations
- revenue bucket operations
- bonus period finalization
- oracle / converter / split configuration visibility

## 3. Route structure

Approved initial route structure:

```text
/teams
  page.tsx
  TeamsPageClient.tsx
  messages.ts
  components/
    TeamsDirectory.tsx
    TeamWorkspace.tsx
    TeamOverviewCard.tsx
    RevenueDepositCard.tsx
    FundingApprovalsTable.tsx
    BonusCard.tsx
    TeamLifecycleCard.tsx
    AdminConsole.tsx
```

## 4. Information architecture

The default landing state is a table-first directory. It prioritizes fast comparison
across teams, while keeping a Cards view behind an explicit view toggle. The selected
view is saved in local storage.

Design alignment follows the root `DESIGN.md` product baseline. Teams should feel like
the same governance app family as `/styfi`, `/veyfi`, and `/yeth`: restrained neutral
surfaces, 8px cards and controls, compact tabular numbers, persistent blocked-state
copy, and no decorative dashboard tropes. The command-center layout is domain-specific;
the visual language is shared.

Approved top-level structure:

1. Directory table by default, with Cards available as a saved preference.
2. Team workspace rendered as the next hierarchy level and one command center.
3. Admin, shown only for operator/admin contexts and kept outside the team workspace.

The workspace does not hide core workflows behind peer tabs. The team name replaces the
generic hero title. A `/teams / <team-id>` breadcrumb shows the hierarchy and returns
to the directory. Existing section links remain reachable.

## 4.1 Directory layer

Landing directory cards should show:

- team name
- address
- owner
- status: active / retiring / retired
- scoped revenue
- scoped cost
- scoped profit / loss
- all-time revenue, cost, and net context
- secondary context: whether revenue, funding, bonus, or lifecycle work needs attention

The Table view remains available.
The team-name link stretches across its row or card so the whole surface opens the
workspace with native link and keyboard behavior. Nested explorer and copy controls
remain independent.

### Financial scope controls

The directory must make the financial scope explicit because protocol accounting spans
multiple budget periods and all-time lifetime state.

Approved directory financial scopes:

- **Current period**: default. Shows `team.currentPeriod` values for current operations.
- **Historical period**: shows one selected historical period across all teams. Historical
  periods render as direct period tabs populated from `team.financialPeriods[].period`
  and should default to the most recent non-current period when one exists.
- **All-time**: shows `team.lifetime` cumulative values.

Rules:

- Revenue, cost, and net must always use the same selected scope within a row/card.
- Current-period values must remain the default so launch operations do not lose the
  period-sensitive funding and bonus context.
- Scope selection must use one tabbed control: current period on the left, historical
  period tabs in the horizontally scrollable middle, and all-time pinned on the right.
- Cards and Table must use the same selected scope.
- Cards should also retain compact all-time context so a current-period loss does
  not hide lifetime performance.
- Historical period tabs should be hidden when no non-current periods are available.
- Missing values for a selected historical period should render as unavailable, not as
  real zero financials.
- Labels must include the active scope, for example `Current period #2 financials`,
  `Period #1 financials`, or `All-time financials`.
- The frontend must not reconstruct history from browser-side log scans. Feed-backed
  history comes from `teams.json`; mock-backed history comes from the mock data contract
  and runtime normalization.

## 4.2 Team workspace

The URL is the workspace authority. `team` contains the normalized team contract
address and `section` contains the active area. A missing team opens the directory
without choosing a default. Refresh and browser history restore both values. Invalid or
unknown addresses return to `/teams`.

The workspace should render:

1. Team details with aligned owner, team id, and contract identities, followed by
   current-period and lifetime context.
2. Financial history table with period, dates, revenue, cost, and profit/loss rows.
3. Action deck that makes the next useful actions obvious.
4. Revenue section, including the permissionless deposit flow and revenue ledger.
5. Outflows & Yield section that groups funding and bonus actions without blending their
   protocol meanings.
6. Lifecycle section with ownership, retirement, and migration visibility.
7. Ledgers for revenue, funding, bonus, and lifecycle, each reachable by stable ids.

Admin is intentionally not nested inside the workspace. It remains a separate
operator/admin surface so privileged controls do not compete with team-owner tasks.

The financial history table is passive accounting context, with no hover or pointer cue.
Each row represents one
`TeamFinancialPeriod` entry from the domain model:

- `period`
- `startsAt` / `endsAt`, shown as a UTC date range when available
- `financials.revenueUsd`
- `financials.costUsd`
- profit/loss derived from `financials.profitUsd` / `financials.lossUsd`

The current period row may be marked, but historical and all-time values must not alter
write eligibility. Funding, revenue deposit, return, and bonus write readiness continue
to derive from raw protocol state, wallet state, current chain, and simulation.

## 4.3 Debug-backed route coverage

The route-local prototype controls used during the early mock phase are retired. Teams
now seeds debug states through the shared floating debug panel and the shared E2E
bridge so the default `/teams` route can keep production-like copy and navigation.

Debug mode covers:

- populated directory with multiple teams
- selected team overview with current-period and lifetime cards
- revenue deposit preview, validation, and recent history
- funding approvals table with claim and return selection state
- claim and return validation plus success feedback
- bonus summary with period drilldown and hidden math detail
- ownership and status state with the owner, a conditional pending-transfer warning,
  retirement, and migration visibility
- operator/admin console loading and empty states once operator/admin access is active
- loading state
- empty state

The debug-backed controls should apply coherently across the whole route:

- loading and empty controls blank the stat strip as well as the directory/workspace panes
- preset changes do not replace an explicit URL-selected team
- preset changes also reset any staged mock bonus action to the target fixture default
- bonus math stays out of the default view until the period drilldown or tooltip is opened
- bonus math stays inside its card and viewport at narrow widths
- bonus and ownership/lifecycle section anchors remain present across selected, loading, empty, and no-team states
- admin navigation and the admin console appear only in the operator/admin runtime
- when operator/admin access is active, loading and empty controls keep the admin section mounted with explicit state copy
- the floating debug panel must be viewport-bounded and scrollable, with long Teams
  control groups hidden behind disclosures so UAT controls do not clip or dominate the
  product route

## 5. Must-show interactions

All blocked action CTAs must explain the blocked state in the button text and in
persistent accessible copy next to the action. Tooltip-only explanations are not enough.

## 5.1 Deposit Revenue

Key UX rules:
- permissionless action
- show a non-zero converter as a linked protocol contract, not an output token
- keep a null converter labelled as the direct route
- do not promise a live pre-submit USD quote
- explain that protocol accounting records the final credit after conversion and pricing
- keep token symbols and the amount-input suffix on one line

### Suggested UI block

- token selector
- amount input
- deposit path
- optional fixture-backed reference credit in mock mode
- submit CTA
- recent deposits list

## 5.2 Funding Claim

Per approval row, show:

- `Approval #<index>`; internal fixture ids are not user-facing
- approved period
- token
- total approved
- used
- unclaimed allocation
- current claimability
- recipient
- settlement rule for a current-period claim

Statuses to visualize:
- claimable this period
- partially claimed
- expired and archived
- scheduled for a future period
- unavailable for an inactive current team
- fully used

Only a current-period approval can enter the claim flow. Duration decides whether that
current claim vests or transfers immediately; it never reopens a past approval. Raw
token units, not rounded display text or inferred USD values, determine action bounds.

## 5.3 Return Funding

This should be described as a return flow, not as an owner-only reverse claim flow.

Expose:
- token amount input
- refund estimate in USD
- note that refund accounting uses the current aggregate team/period/token cost

Keep return funding separate from claiming. Returns use the current period's aggregate
cost bucket and remain permissionless where the contract allows them.

## 5.4 Bonus

Keep the default presentation simple:

- total claimable bonus
- period count included
- primary CTA
- short detail rows

`Claim Bonus` is available only when the verified current state supports it. Mock mode
keeps deterministic claimable and blocked states for debugging.

Hide the heavier math in expandable details or tooltip copy:
- team profit
- spot price
- adjusted bonus price
- growth factor / cap note
- YBC split

The tooltip must remain inside the viewport and wrap long values.

## 5.5 Lifecycle

Show:
- owner
- one pending-transfer warning with a linked pending owner, only while a transfer exists
- retirement state
- migration readiness
- successor registry if relevant

Do not repeat pending-owner state in a second drawer or lifecycle summary.

## 6. Admin console

Admin is a separate surface within the app, not the default landing state.

In debug mode, the admin console unlocks only in the
`Operator/admin view` preset or equivalent operator/admin runtime state and remains
hidden from the default team-owner, observer, and contributor workspaces. The
unlocked view should keep four groups distinct:

- registry state with lifecycle, retirement, migration, and workspace-readiness context
- revenue ops with bucket usage and whitelisted token wiring
- funding ops with approval queue summaries and operator-attention markers
- bonus ops with finalization readiness and historical period visibility

Approved admin groups:

### Registry
- teams list
- retirements
- successor / migration state

### Revenue ops
- whitelisted tokens
- price oracles
- converters
- rewards / treasury / recovery bucket budgets and usage

### Funding ops
- approvals list
- claim/refund history
- token pricing / vesting metadata

### Bonus ops
- period finalization queue
- growth cap / smoothing / split config
- price source visibility

## 7. Mock-first scenario set

These scenarios remain the seed contract for the mock data model, but the debug-backed
runtime now exposes them as hidden debug presets and granular bridge setters instead
of page-local hero controls.

Required mock scenarios:

1. active team with no approvals yet
2. active team with partially used approval
3. expired past-period approval retained in history
4. team with bonus available
5. retiring / retired team in read-only view
6. admin view with bucket usage near limits

## 8. Copy posture

Prefer:
- `Team Finances`
- `Deposit Revenue`
- `Claim Funding`
- `Return Funding`
- `Claim Bonus`
- `Current Budget Period`

Avoid:
- overly accounting-heavy jargon as the only terminology
- implying vest claim management is handled in this app
- implying revenue deposits are owner-only

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

### Rendering and script security

The app route renders for each request so its HTML uses the current CSP nonce.
This prevents cached build output from blocking hydration on hosts with strict script policies.
The root layout retains its existing rendering mode.
