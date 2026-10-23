# Testing Strategy and Workflow

This document defines our testing approach, infrastructure seams, and developer workflow. It is the source of truth for how tests are written and run in this repo.

## Goals

- Flake-free, deterministic tests.
- High signal, low maintenance.
- Confidence for aggressive refactors without breaking core flows.

## The Strategy: Barbell with Programmatic Control

We intentionally avoid a large pyramid of brittle component tests. Instead we use a barbell strategy:

- Unit tests for pure logic and mock correctness.
- A small set of high-value E2E tests for critical user flows.
- Integration and component tests only where wiring or complex UI logic warrants it.

### Test Layers

- Layer A: Unit (Vitest)
- Layer B: Integration (Vitest + Provider Harness)
- Layer C: Components (Vitest + RTL)
- Layer D: E2E Smoke (Playwright)
- Layer E: E2E Full (Playwright)

## Non-Goals (Hard Rules)

- No DOM snapshots (`toMatchSnapshot` is banned).
- No MetaMask automation in E2E. Use MockConnector only.
- No UI debug clicking in E2E. Use the Test Bridge to set state.
- No page-local scenario switchers as the primary QA path for mature mock-backed routes.
- No locale testing in E2E. Use strict decimals with a `.` separator.

## Infrastructure Seams (Required for E2E Stability)

### 1) Test Bridge (`window.__TEST__`)

We expose a typed control surface for E2E tests. It is only injected when `NEXT_PUBLIC_E2E=true` (even in production builds).

- Location: `lib/test-bridge.ts` (interface + implementation helpers).
- Initialization: `components/TestBridgeListener.tsx` rendered inside `state/protocol.tsx`.
- Guard: `if (process.env.NEXT_PUBLIC_E2E === "true")`.
- All state mutations invalidate React Query for deterministic UI updates.
- Each mock-heavy domain adds a typed adapter to this shared seam rather than
  creating a second test bridge.

#### Usage from Playwright (example)

```ts
await page.evaluate(async () => {
  await window.__TEST__?.reset();
  await window.__TEST__?.setBalance(
    "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    "YFI",
    "100"
  );
});
```

#### Bridge API

- `reset()`: clears mock stores, time, and React Query cache.
- `setNow(timestamp)`: sets the fixed mock time (seconds since epoch).
- `getState(address)`: returns a snapshot of mock state (stYFI, veYFI, yETH).
- `setBalance(address, symbol, amount)`: sets wallet or mock token balances.
- `setAllowance(address, symbol, spender, amount)`: sets mock allowances.
- `setScenario(name)`: loads a predefined scenario (resets first).
- `setYethPreset(address, preset)`: applies yETH mock account state (`claimable`, `recovery_position`, `empty`).

Teams, YBC, and DAO adapters show the pattern that new domains must follow:

- `components/TestBridgeListener.tsx` accepts optional `teams`, `ybc`, and `dao`
  adapters
- `lib/test-bridge.ts` exports `TeamsTestBridgeAdapter`, `YbcTestBridgeAdapter`,
  and `DaoTestBridgeAdapter`
- shared domain mutation methods invalidate `teamsKeys.all`, `ybcKeys.all`, or
  `daoKeys.all`
  automatically after the adapter mutation runs
- shared `setNow(timestamp)` also calls adapter `onSetNow(timestamp)` hooks before the
  global query invalidation

Representative adapter methods already reserved by the shared contract:

- Teams: `resetTeams`, `setTeamsViewerRole`, `setTeamsSelectedTeam`,
  `setTeamsLoading`, `setTeamsEmpty`, `setTeamsCurrentPeriod`, `patchTeamsTeam`,
  `patchTeamsFundingApproval`, `patchTeamsBonus`, `patchTeamsAdmin`
- YBC: `resetYbc`, `setYbcPerspective`, `setYbcLoading`, `setYbcEmptyRoster`,
  `setYbcEmptyBoard`, `setYbcEpoch`, `patchYbcMember`, `patchYbcProposal`,
  `patchYbcRewards`, `patchYbcAdmin`
- DAO: `resetDao`, `setDaoFixture`, `setDaoSelectedProposal`, `setDaoPersona`,
  `setDaoRole`, `setDaoContentState`, `setDaoLifecycle`, `setDaoVetoState`,
  `setDaoAnalysisState`, `setDaoAccountState`, `setDaoExecutionState`,
  `setDaoAuthoringState`, `setDaoTransactionOutcome`,
  `indexDaoPendingAction`, `clearDaoPendingAction`, and granular
  proposal/proposer fact setters

DAO bridge mutations wait for the adapter and then invalidate `daoKeys.all`.
This is required because the route client is module-scoped and DAO queries use
infinite stale times.

Amounts passed to the bridge must be human-readable strings without commas (e.g. `\"100.5\"`).

All bridge methods are `async` and should be awaited.
Scenario presets are applied to the default E2E address unless a test overrides state via `setBalance`.
Prefer calling `reset()` at the start of each E2E test to avoid leaked state.
New domains with substantial mock state should add app-specific bridge methods instead of
requiring visible route-local scenario controls for QA.

DAO proposal-content tests pin exact canonical JSON bytes, including the final
LF, plus SHA-256 digest and CIDv1/raw/SHA-256/Base32 vectors. A committed raw
asset fixture must match manifest byte length, digest, media type, dimensions,
and derived CID. Component and Playwright coverage must prove that attachment
cards make zero automatic asset requests and that only a user-activated Open
uses the validated suffix-free raw-CID URL. Creation-flow tests keep transaction
hash, receipt-derived composite identity, awaiting-index, and indexed states
separate and assert that the identity never changes.

Available scenarios:

- `standard`: baseline mock state.
- `active`: seeded stYFI balance for the default address.
- `legacy_user`: legacy veYFI balance pending migration.
- `caps_exhausted`: redemption caps and inventory fully consumed.

### 2) Deterministic Time

All time logic must come from `lib/mocks/time.ts`:

- `nowSeconds()` is the single source of truth.
- `setFixedNow(ts | null)` freezes or clears time.
- In mock mode, UI epoch/cooldown timing is driven by local mock time only (not global-data/chain canonical sources), so debug time travel remains deterministic.
- Debug time travel controls are expected to invalidate identity plus domain query keys and refetch active/inactive observers immediately.
- Each domain exposes one root query-key entry point for shared reset and time
  invalidation. Existing examples are `teamsKeys.all`, `ybcKeys.all`, and
  `daoKeys.all`.
- Shared debug time travel synchronizes the DAO runtime even when a non-DAO route
  owns the mounted panel, then invalidates `daoKeys.all` with the other domain roots.

Any logic that previously called `Date.now()` must use `nowSeconds()` instead.

### 3) Deterministic Wallet

When `NEXT_PUBLIC_E2E=true`, wagmi uses a `mock` connector with a fixed address:

- Default E2E address: `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
- Location: `lib/constants.ts`

This means E2E tests are instantly “connected” and do not rely on wallet UI
flows. The E2E-only wrapper resolves exactly `eth_accounts` from that local
deterministic account and delegates every other provider request to wagmi's mock
connector. Wagmi reconnect reaches the connected account without network fetch;
after an explicit disconnect, reconnect preserves the disconnected state. Do
not disable reconnect-on-mount to hide RPC failures.

The mock connector is for testing only and should never be enabled in real user
environments.

DAO RPC regression coverage deliberately points local E2E at the dead sentinel
`http://127.0.0.1:8546`. Board, detail, and authoring tests wait for hydrated
route state and assert zero `eth_accounts` request bodies, loopback requests,
request failures, page errors, and console errors. Chromium maps
`dao-beta.dao-ops.com` to loopback only when `E2E_BASE_URL` is local; remote and
preproduction runs never receive that resolver rule.

The beta-host navigation smoke uses an HTTPS browser origin with local HTTP
transport. Playwright routes those requests to the isolated server and preserves
the host headers. This keeps production CSP, including `upgrade-insecure-requests`,
active without sending requests to the public beta host.

Local hostname mapping does not test Cloudflare Access. Before beta UAT, verify
all six exact governance beta hosts with an unauthenticated incognito request,
an approved GitHub organization/team member, an unrelated GitHub account, and a
representative nested route. After authentication, repeat noindex/canonical,
cross-beta navigation, wallet connection, and wallet-popup checks. Keep results
sanitized and leave any host without direct evidence marked incomplete.

## Parallelism

Vitest runs in parallel by default.
Playwright smoke runs are intentionally single-worker (`npm run test:e2e` -> `--workers=1`) to avoid cross-flow flake from shared mock-store mutations and time controls.

## Test Locations and Naming

Preferred structure (target layout, not fully migrated yet):

- `tests/unit/*`
- `tests/integration/*`
- `tests/components/*`
- `tests/e2e/smoke/*`
- `tests/e2e/full/*`

Use descriptive filenames:

- `lib/format.test.ts`
- `hooks/useStyfiAccount.test.tsx`
- `components/UnstakePanel.test.tsx`
- `smoke/styfi-flow.spec.ts`

## What to Test (and What to Avoid)

Do:

- Validate math, formatting, and error mapping at the unit level.
- Verify hooks call clients and invalidate queries.
- Test complex disconnected UI logic with plain props.
- Use the Test Bridge to set E2E state.
- Keep default route chrome production-like and place mock-only controls behind debug APIs.
- Prefer granular bridge setters that mutate live route state over scenario-only loading
  once a route has matured past initial prototype mode.
- For each new mock-heavy domain, test its state-machine boundaries, typed bridge
  controls, deterministic time behavior, reset behavior, main components, and
  at least one smoke flow through the production-shaped route.

Do not:

- Assert on implementation details or DOM snapshots.
- Use flakey timers or refetch intervals in tests.
- Click debug UI in E2E to set state.

## Running Tests

Current commands:

- `npm run test` (Vitest)
- `npm run lint`
- `npm run typecheck`
- `npm run test:e2e` (Playwright smoke)
- `npm run test:e2e:full` (Playwright full)

Playwright can also be run directly:

- `npx playwright test --project=smoke`
- `npx playwright test --project=full`

## Dependency migration (2026-10-05)

The combined update replaces the dependency changes in upstream PRs #94–#98:

| Dependency | Version | Original PR |
| --- | --- | --- |
| ESLint | 10.8.0 | [#94](https://github.com/yearn/governance-apps/pull/94) |
| Testing Library user-event | 14.6.3 | [#95](https://github.com/yearn/governance-apps/pull/95) |
| tailwind-merge | 3.6.0 | [#96](https://github.com/yearn/governance-apps/pull/96) |
| Vitest | 4.1.11 | [#97](https://github.com/yearn/governance-apps/pull/97) |
| TypeScript CLI | 7.0.2 | [#98](https://github.com/yearn/governance-apps/pull/98) |

### Compiler compatibility

TypeScript 7 does not provide the compiler API that Next.js and typescript-eslint require.
The package configuration uses [Microsoft's documented side-by-side aliases](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60).
The exact aliases are `@typescript/native: npm:typescript@7.0.2` and `typescript: npm:@typescript/typescript6@6.0.2`.
The lockfile resolves the compatibility API to TypeScript 6.0.3.
`npm run typecheck` runs the native 7.0.2 compiler. Next.js builds and ESLint use the compatibility API.
Both paths retain strict type checking.

### Linter compatibility

The React, import, and accessibility plugins still declare peer ranges that exclude ESLint 10.
Exact plugin-version overrides select the root ESLint version.
The configuration uses [ESLint compatibility utilities](https://eslint.org/blog/2024/05/eslint-compatibility-utilities/) to restore the removed rule APIs.
The regression test checks that React, hooks, accessibility, and TypeScript rules still report invalid code.
No lint rules are disabled for this migration.
The lockfile also updates typescript-eslint and React Hooks to versions that declare ESLint 10 support.

The newer Hooks checks require derived state and form resets to run without synchronous effects.
The app fixes retain default asset selection, Teams navigation, funding-form resets, trade-input resets, and yETH deadline gating.
The shared clock supplies the veYFI lock status and epoch countdown.

### Integrator notes

Merge the dependency changes and React compatibility fixes together.
The lockfile comes from npm 11.14.0 with the seven-day release-age policy enabled.
The native-install-script allowlist is unchanged.
After the combined update merges into upstream master, PRs #94–#98 can close as superseded.
The original PRs remain open during review.
Remove the compatibility aliases and plugin overrides only after the upstream tools support their replacements.

## Environment Flags for Testing

- `NEXT_PUBLIC_E2E=true` enables the Test Bridge and mock wallet.
- `NEXT_PUBLIC_USE_MOCKS=true` ensures the app uses mock clients.
- `NEXT_PUBLIC_E2E=true` also forces mock clients for safety.
- `NEXT_PUBLIC_MOCK_TIME_OFFSET_SECONDS` can offset the clock in dev.
- For manual UI QA of disconnected states while mocks are enabled, use `NEXT_PUBLIC_USE_MOCKS=true` with `NEXT_PUBLIC_E2E=false` (otherwise the mock connector is auto-connected).

## Teams/YBC UX Iteration After Fork Smoke

Once the Teams/YBC baseline fork smoke has passed, local UX iteration should normally use
mock mode plus the mock navigator/debug bridge. This is acceptable for visual hierarchy,
copy, tables, cards, tabs, responsive layout, loading states, empty states, and
state-specific review.

Run the normal local checks before preprod:

- `npm run typecheck -- --incremental false`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run build`

Re-run Teams/YBC fork smoke when a change touches onchain clients, write hooks,
transaction plumbing, token approval handling, amount parsing, deployment/feed address
fields, action gating, wallet or chain handling, or write-button argument threading.
The repeatable launch runbook is
[`teams-ybc-fork-smoke-plan.md`](teams-ybc-fork-smoke-plan.md).

## Common Failure Modes

- Bridge missing: check `NEXT_PUBLIC_E2E=true`.
- UI not updating: ensure bridge mutations are awaited (React Query invalidates).
- Cap tests failing: use `setScenario("caps_exhausted")` to force caps.

## Notes

- `E2E_WEB_SERVER_COMMAND` can override the Playwright web server command if you want to test `next start` instead of `next dev`.
- Typecheck uses `types/next-shim.d.ts` to satisfy Next’s internal type imports under `.next/types`.
- Keep the shim's `Prefetch` and `EnsureStatic` unions aligned with the pinned Next.js declarations. Production builds generate imports for both types.
