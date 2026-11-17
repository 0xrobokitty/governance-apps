# Frontend Architecture

This document defines the current shared frontend boundaries for every app in
this repository. App-specific behavior belongs in `docs/apps/<domain>`.

## 1. Domain-first layout

New domains use this structure unless an existing route proves a smaller shape
is enough:

```text
app/<domain>/
  page.tsx
  <Domain>PageClient.tsx
  messages.ts
  components/

lib/clients/<domain>/
  types.ts
  client.ts
  mock.ts
  onchain.ts
  index.ts

lib/hooks/
  use<Domain>.ts
```

- `page.tsx` is the App Router server entry and owns metadata and the route shell.
- The page client owns interactive composition and consumes domain hooks.
- Route components render typed values and lightweight formatting only.
- Protocol math, status derivation, capability derivation, and transaction
  preparation belong in the domain layer.
- Route copy stays in `messages.ts`; shared components remain copy-agnostic.

## 2. Data source boundaries

Use the smallest authoritative source for each class of data.

### Global history and aggregates

Large historical lists, event reductions, global snapshots, and expensive
analysis come from versioned static feeds produced by `gov-apps-stats`. Browser
code does not scan full historical logs.

### Connected-wallet state

Current balances, allowances, voted state, roles, network, and write eligibility
come from bounded live reads. Feed action labels may help presentation but do not
authorize a wallet action.

### Immutable external content

Fetch IPFS or other immutable content through a same-origin server boundary with
timeouts, size limits, schema validation, integrity checks, and a last-good
cache. Never render remote HTML as trusted application markup.

### Backend analysis

Contract decoding, event reconstruction, and stored simulations belong in the
producer when they can be computed once for all users. Results carry provenance,
reference block, timestamp, and failure state.

## 3. Client contract

Each domain exposes explicit types and an interface that can be implemented by
both mock and live clients. The UI should not branch throughout the component
tree on backend mode.

Recommended separation:

```ts
type DomainClient = {
  getGlobalState(): Promise<GlobalState>;
  getAccountState(address: Address): Promise<AccountState>;
  prepareAction(input: ActionInput): Promise<PreparedTransaction>;
};
```

Not every domain needs these exact methods. Preserve the boundary:

- global and account data are explicit;
- capability and blocked-reason values come from the client or pure domain
  helpers;
- prepared writes contain the exact request to be passed to the shared
  transaction pipeline;
- components do not call raw wagmi writes.

## 4. Query and invalidation rules

- Each domain owns a query-key factory with one root key.
- Shared reset and time travel invalidate the domain root.
- Mutations invalidate the smallest affected keys, then allow feed refresh to
  reconcile global history.
- Live account facts may override a stale feed for immediate action safety.
- Keep loading, stale, unavailable, incompatible, and last-good states distinct.

## 5. Mock-first runtime

Every new app starts with deterministic mock-backed rendering.

- The mock client implements the production domain interface.
- Time comes from the shared mock clock.
- App-specific controls mount inside the shared floating debug panel.
- The typed E2E bridge mutates the same mock store.
- Default routes stay production-shaped; mock badges and route-local scenario
  bars are transitional and must not survive acceptance.
- Reset and time travel include every registered domain.
- The unaccepted DAO M2 beta is a temporary, explicitly approved exception that
  may mount only its route-local mock client in a production-runtime preprod
  build. It does not enable global mocks, E2E, debug UI, or a general per-app
  mock/live pattern.

See [`debug-runtime-contract.md`](debug-runtime-contract.md),
[`mock-toggles.md`](mock-toggles.md), and [`testing.md`](testing.md).

## 6. Transaction pipeline

All writes follow:

```text
domain eligibility -> useTx -> prepare/simulate -> receipt -> query invalidation
```

- Domain clients encode arguments and preserve protocol-specific checks.
- `useTx` owns signing, submitted/mining state, receipt, normalized errors, and
  completion.
- One hook instance accepts one execution at a time, including preparation and refresh.
- Reset hides the current status. It does not cancel a submitted transaction or allow another execution before settlement.
- Success requires a successful receipt for the original call or its repriced replacement.
- A cancelled or changed replacement fails. Receipt links use the canonical transaction hash.
- Refresh and observer errors do not change a confirmed transaction into a failed transaction.
- Independent query refreshes run concurrently after confirmation.
- Custom receipt handlers own their domain validation and pending-wallet behavior.
- Approval and primary actions remain separate unless the protocol itself offers
  one atomic operation.
- Wrong-network and simulation failures block normal submission.
- UI code never fabricates canonical history while a producer feed catches up.

### Safe transaction boundary

The default receipt path expects an Ethereum transaction hash.
The Safe Apps provider can return a Safe proposal hash instead.
Generic stYFI, veYFI, Teams, YBC, and legacy yETH writes do not resolve that proposal to its execution receipt.
A timeout does not prove failure. Check the Safe queue before another submission.

The live yETH recovery flow has separate persisted intents and canonical Safe execution verification.
Those guarantees do not apply to the generic transaction hook.
DAO also requires direct sender and call checks that need separate Safe inner-call validation.

Shared Safe support requires persisted submission ownership, duplicate prevention, resume controls, and execution-event verification.
Acceptance must cover queued approval, reload, cancellation, account changes, and inner failure despite a successful outer receipt.
Embedding policy and wallet connection alone do not establish transaction compatibility.

### Query lifetime and independent reads

stYFI and veYFI account hooks accept an optional `enabled` argument. Live APR and voting-power hooks disable their mock-only account subscriptions.
Independent account, reward, metadata, and statistics reads run concurrently. Epoch-dependent reads still wait for their epoch.
APR reads share one pinned block and retain the final canonical-block check. Chain validation precedes YBC snapshot reads.
Post-confirmation refreshes run concurrently. stYFI, veYFI, and legacy yETH preparation runs inside the transaction lifecycle.
Polling resolves custom app hostnames through the shared route map.

Pulse and recovery readers retain accepted publications for the lifetime of their query cache. Teams retains its accepted canonical baseline for that lifetime.
A route or wallet-session remount cannot reset those rollback guards. Separate query clients keep separate acceptance state.
Pulse compares compact accepted publications, including tuple metadata, and reuses unchanged feed objects. The query does not repeat a deep structural comparison.

Theme and nudge preferences tolerate unavailable browser storage. Nudge dismissal still applies to the current mounted view.
Trade forms clear input when a new trade succeeds. A previous trade's success does not clear a later rejected attempt.

## 7. Server endpoints

Use route handlers for server-owned credentials, same-origin remote fetches, and
bounded validation. A handler must define:

- accepted methods and input schema;
- target allowlist or fixed upstream;
- timeout and response-size limit;
- cache behavior;
- error model;
- secret handling;
- tests for hostile URLs and malformed upstream data when user input influences
  the request.

Do not turn the Next.js route into a historical indexer. Persistent producer work
belongs in `gov-apps-stats`.

## 8. UI composition

Reuse `components/ui/*` and established route patterns before creating new
primitives. Shared controls own behavior, not app copy.

- Keep status and action capability separate.
- Put persistent blocked reasons next to disabled actions.
- Preserve at least 40-pixel hit areas.
- Use tabular numerals for changing financial, timing, and governance values.
- Avoid page overflow from addresses, scripts, and tables.
- Respect reduced motion and visible focus.

The root `PRODUCT.md` and `DESIGN.md` define product and visual principles.

## 9. Runtime and rollout

- `NEXT_PUBLIC_USE_MOCKS` is global and forbidden in production.
- The temporary DAO review exception is controlled by
  `NEXT_PUBLIC_ENABLE_DAO`, remains mock-only and nonpublic, and is hard-disabled
  by the production workflow.
- New public surfaces are path-routable before subdomain exposure.
- Production app exposure is feature-gated.
- Environment validation fails closed when a production-enabled app lacks
  required feed, RPC, or deployment inputs.
- A release package owns sitemap, discovery, host, monitoring, and rollback
  decisions.

## 10. Cross-repository order

For a new feed-backed app:

1. Accept mock product behavior.
2. Define the consumer schema in `governance-apps`.
3. Implement the producer in `gov-apps-stats`.
4. Validate a real staging payload in `governance-apps`.
5. Wire production reads.
6. Add onchain writes through the shared pipeline.
7. Prove the complete system on a fork.

Do not reverse the consumer/producer contract order because the frontend owns the
data needed to render accepted product states.
