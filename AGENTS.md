# AGENTS.md

This repository is a **TypeScript / Next.js / viem / wagmi** codebase. Treat it as a
frontend product.

## Core stack

- Next.js App Router
- React 19
- TypeScript (`strict: true`)
- Tailwind CSS
- viem + wagmi + app-owned wallet UI
- Vitest + Playwright
- Cloudflare / OpenNext deployment

## Architectural rules

1. **Domain first**
   - New app domains should follow the same layout used by `/styfi`, `/veyfi`, and `/yeth`.
   - Prefer:
     - `app/<domain>/page.tsx`
     - `app/<domain>/<Domain>PageClient.tsx`
     - `app/<domain>/messages.ts`
     - `lib/clients/<domain>/types.ts`
     - `lib/clients/<domain>/client.ts`
     - `lib/clients/<domain>/mock.ts`
     - `lib/clients/<domain>/onchain.ts`
     - `lib/hooks/use<Domain>.ts`

2. **Mock first**
   - Deliver the mocked UI state machine and mock data shapes before onchain reads/writes.
   - The first production of any new surface should be stable mock-backed rendering with deterministic states.

3. **UI never owns protocol math**
   - Render values supplied by domain clients and typed data sources.
   - Keep formatting and lightweight derivation in UI.
   - Put protocol-specific derivation in `lib/clients/<domain>/...` or `lib/format.ts`.

4. **Writes go through the shared transaction pipeline**
   - Prepare writes in domain clients.
   - Execute through the shared `useTx` flow.
   - Do not wire raw wagmi write calls directly inside page components.

5. **Reuse shared UI primitives**
   - Prefer `components/ui/*` and existing patterns from `/styfi`, `/veyfi`, `/yeth`.
   - Only add new primitives when a pattern is clearly cross-domain.

6. **Copy is local**
   - Route-specific copy belongs in `app/<domain>/messages.ts`.
   - Shared components stay copy-agnostic.

7. **Host and rollout safety**
   - New public app surfaces should be routable by path first.
   - Subdomain rollout should stay gated until the route is validated on shared hosts / preprod.
   - Production exposure should be feature-flagged.

## Coding standards

- Keep TypeScript types explicit at the domain boundary.
- Prefer small, composable functions.
- Avoid speculative abstractions.
- Keep file names descriptive and aligned with current repo patterns.
- Follow existing linting and formatting style already present in the repo.
- Do not introduce new dependencies unless necessary.

## Testing standards

Run at minimum for any meaningful change:

```bash
npm run typecheck
npm run lint
npm run test
```

Run e2e when UI flows or route behavior change:

```bash
npm run test:e2e
npm run test:e2e:full
```

## Worktree strategy

Use the supplied scripts in this overlay:

- `./scripts/agent-worktree.sh`
- `./scripts/workpkg-worktree.sh`
- `./scripts/workpkg-sync-env.sh`

Use one long-lived accepted-work lane:

- branch: `agent/integration`
- worktree: `../<repo>.agent.integration`

Create it from the `bootstrap` checkout with `./scripts/agent-worktree.sh create integration --no-install`.
Merge approved work package branches into `agent/integration`, then tag the integration commit when a
milestone finishes, for example `integration/m0`.

Work package worktrees are intentionally **outside** the repo and use dot-suffixed
sibling paths:

- `../<repo>.<track>.<milestone>[.<wp>]`

Create work package worktrees from the integration worktree and pass `--base agent/integration`.
Create only the worktrees you need for the current milestone or work package.

## Required docs updates

If behavior changes, update the corresponding docs in `docs/apps/<domain>/...` as part of
the same change set.

## Done checklist

A work package is only done when:

- acceptance criteria in the work package doc are met
- tests updated for changed behavior
- docs updated
- reviewer checklist passes
- integrator notes are recorded if the package affects merge order or rollout
