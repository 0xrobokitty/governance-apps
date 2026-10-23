# Yearn Governance Apps

Next.js applications for Yearn staking, governance, recovery, team finance, and
collective operations.

## Applications

| Route | Product |
| --- | --- |
| `/styfi` | stYFI and stYFIx |
| `/veyfi` | veYFI and liquid-locker YFI |
| `/yeth` | yETH recovery |
| `/teams` | Team Finances |
| `/ybc` | Yearn Builder's Collective |
| `/dao` | DAO Governance, planned and mock-first |

The DAO Governance requirements and delivery plan live in
[`docs/apps/dao`](docs/apps/dao/README.md).

## Local development

The repository requires Node 24 and npm 11.14.

```fish
nvm use
npm ci
npm run dev
```

Open `http://localhost:3000/<route>`. Set `NEXT_PUBLIC_USE_MOCKS=true` for the
deterministic mock clients and shared debug controls.

## Validation

Run these checks for every meaningful change:

```fish
npm run typecheck
npm run lint
npm run test
```

Route and UI-flow changes also require:

```fish
npm run test:e2e
npm run test:e2e:full
```

See [`docs/shared/testing.md`](docs/shared/testing.md) for the full test policy.

## Architecture

- Next.js App Router, React, TypeScript, and Tailwind CSS
- viem, wagmi, and RainbowKit
- Domain clients under `lib/clients/<domain>`
- Prepared writes executed through the shared `useTx` pipeline
- Deterministic mock clients before feed-backed and onchain integration
- Cloudflare/OpenNext deployment with path-first, feature-gated rollout

Read [`AGENTS.md`](AGENTS.md) before changing the repository. The canonical
worktree, review, and integration workflow is
[`docs/shared/codex-usage-guide.md`](docs/shared/codex-usage-guide.md).

## Runtime configuration

The main runtime variables are documented in
[`docs/shared/runtime-modes.md`](docs/shared/runtime-modes.md) and
[`docs/shared/mock-toggles.md`](docs/shared/mock-toggles.md). Do not add a
production route or host without its feature gate, environment validation, and
rollback notes.

## Deployment

- Production Worker: `wrangler.jsonc`
- Preproduction Worker: `wrangler.preprod.jsonc`
- Worker runtime check: [`docs/shared/cloudflare-worker-runtime.md`](docs/shared/cloudflare-worker-runtime.md)
- Worker size policy: [`docs/shared/cloudflare-worker-size.md`](docs/shared/cloudflare-worker-size.md)
- Release checklist: [`docs/shared/release-checklist-template.md`](docs/shared/release-checklist-template.md)

The documentation index is [`docs/README.md`](docs/README.md).
