# YBC Planning Spec

This document records the original integration design.
Use the [integration references](README.md) for current contracts, implementation context, and acceptance procedures.
The original assignment sequence remains in Git history.


## 1. Canonical naming

- app name / slug: `ybc`
- route key: `/ybc`
- display label: `Yearn Builder's Collective`
- initial beta exposure: `ybc-beta.dao-ops.com` with mock / dummy data
- production host: `ybc.yearn.fi` (gated until fork smoke, preprod smoke, and production approval)

## 2. MVP scope

Included:
- collective overview
- members roster
- proposal board
- proposal lifecycle visualization
- threshold visualization
- reward visibility and cross-app claim handoff
- scoped operator/admin panel

Out of scope for MVP:
- generic arbitrary-call transaction builder UI
- duplicate staking UX already owned by other routes
- a separate isolated YBC claim engine

## 3. Data strategy

### Mock phase
Use `docs/apps/ybc/mock-data-schema-v1.md` and the example JSON as the source of
truth for seed fixtures and debug presets. After M2, route-local scenario chrome
should be retired in favor of a debug-backed mock store that preserves the production
route shape.

### Feed-backed production phase

Production reads must use the `ybc.json` feed documented in `ybc-feed-schema-v1.md`.
The feed is produced by `gov-apps-stats` and owns historical member, proposal, vote,
weight, and reward display state.

Frontend live overlays may add:

- connected wallet member status
- connected wallet voted status per proposal
- proposal/write eligibility
- post-transaction invalidation while the next feed snapshot is pending

Wallet-specific proposal and vote writes only start after the feed-backed read model is
stable. Shared reward claiming remains in the existing reward path.

## 4. Suggested route and file layout

```text
app/ybc/
  page.tsx
  YbcPageClient.tsx
  messages.ts
  components/
    MockControls.tsx
    YbcHero.tsx
    MembersTable.tsx
    ProposalBoard.tsx
    ProposalCard.tsx
    RewardsCard.tsx
    OperatorPanel.tsx

lib/clients/ybc/
  types.ts
  client.ts
  mock.ts
  onchain.ts
  index.ts

lib/hooks/
  useYbc.ts
```

## 5. Milestone outcomes

### M1
Static mock-backed surface accepted.

### M2
Interactive mock proposal flows accepted.

### M2A
Debug-backed production-parity mock runtime accepted.

### M3A
Shared data contract and `gov-apps-stats` producer handoff accepted.

### M3B
Staging `ybc.json` feed is produced by `gov-apps-stats`.

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

- hiding too much timing detail around proposal lifecycle
- collapsing raw stake and effective weight
- accidentally implying generic arbitrary execution is in MVP
- duplicating rewards UX that belongs in the shared claim path
- letting producer and consumer schemas drift across repos
- treating proposal status as only timestamp-derived instead of reading contract status

## 7. Launch stance

Recommended launch order:
1. shared feed contract accepted
2. staging `ybc.json` produced by `gov-apps-stats`
3. staging feed validated by the frontend consumer
4. feed-backed reads accepted
5. launch writes accepted on fork
6. production green light recorded
7. production exposure on `ybc.yearn.fi` after release checklist approval

Production exposure must stay feature-gated until steps 3 through 6 are complete.
Shared-host path routing on `/ybc` and beta-host routing on `ybc-beta.dao-ops.com` are
the validation targets before production.
