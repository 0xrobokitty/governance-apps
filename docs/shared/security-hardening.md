# Security Hardening: Production Baseline

Status: Active baseline for production apps (`styfi`, `veyfi`)
Date: 2026-02-12

This document defines the enforced frontend security controls and release invariants.

Operational playbook:

- Runtime mode guide and deploy checklists: `docs/shared/runtime-modes.md`

## 1. Scope and Runtime Split

- `styfi` and `veyfi` are production surfaces.
- `yeth` is treated as non-production and is disabled by default in production runtime.
- Debug routes are disabled by default in production runtime.

## 2. Supply Chain and Dependency Policy

### 2.1 Deterministic Dependencies

- Direct dependencies and devDependencies are pinned to exact versions in `/package.json`.
- Dependency versions must be exact semver specifiers (`x.y.z`, with optional prerelease/build metadata).
- Tags, ranges, git URLs, and protocol aliases are rejected, except for two pinned TypeScript development aliases.
- `@typescript/native` can alias an exact `typescript` release. `typescript` can alias an exact `@typescript/typescript6` release.
- This exception supports the TypeScript 7 CLI alongside the compiler API required by Next.js and ESLint. Other alias names and targets remain rejected.
- `packageManager` is pinned to an exact npm version and CI installs that exact npm version before dependency installation.
- `package-lock.json` is required and must use `lockfileVersion >= 3`.
- GitHub Actions are pinned to full commit SHAs with same-line version comments so Dependabot can update the SHA and human-readable version together.
- Packages that declare npm lifecycle install scripts are rejected unless the exact lockfile path and version are allowlisted in `/scripts/validate-dependency-policy.mjs`.
- Dependabot version updates are enabled for GitHub Actions and npm with a 7-day cooldown.

### 2.2 Local Install Policy

`/.npmrc` enforces:

- `save-exact=true`
- `engine-strict=true`
- `min-release-age=7`
- `audit=false`
- `fund=false`

`ignore-scripts=true` is intentionally not set globally. This app depends on reviewed native/binary packages such as `esbuild`, `sharp`, `workerd`, and `wrangler`, where install scripts perform platform binary selection or validation. New install scripts must be reviewed and allowlisted by exact lockfile path and version instead.

### 2.3 CI Enforcement

CI workflow `/.github/workflows/security-and-quality.yml` enforces:

- `npm run validate:deps`
- configured npm release-age policy
- `npm ci` (no floating installs)
- `npm run validate:prod-env`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build` with production flags and placeholder service URLs

The production build generates and checks Next.js route types. This catches
framework type changes that a fresh checkout's standalone typecheck cannot detect.
The build does not deploy the application.

Deployment workflows apply the same dependency policy before building or deploying workers.

### 2.4 Release-Age Override Path

The default policy rejects package versions published less than 7 days ago. For an urgent security fix that cannot wait for the age window:

1. Manually verify the advisory, upstream release, changelog, and package provenance.
2. Update the dependency and lockfile with the age gate disabled only for the local command:

```bash
env npm_config_min_release_age=0 npm install <package>@<version> --save-exact
```

Use `--save-dev` as well when the override is for a development dependency.

3. Add `.github/npm-release-age-overrides.json` in the same PR:

```json
{
  "overrides": [
    {
      "package": "<package>",
      "version": "<version>",
      "expires": "YYYY-MM-DD",
      "reason": "Urgent fix for <advisory or incident>",
      "reference": "https://..."
    }
  ]
}
```

Rules:

- `expires` must be within 14 days and is checked in UTC.
- The override must reference a package/version present in `package-lock.json`.
- CI disables the npm release-age gate only while a non-expired override exists.
- npm does not currently provide per-package release-age exclusions, so this override disables the age gate for the install run; reviewers must treat the lockfile diff as part of the exception review.
- Remove the override once the package version is older than 7 days or the emergency is resolved.

### 2.5 DAO immutable attachment boundary

DAO proposal content uses one authenticated-manifest model. The onchain
`bytes32` is the SHA-256 digest of the exact fixed-order canonical content JSON,
including its required final LF; the content
CID is its CIDv1/raw/SHA-256/Base32 representation. Each asset digest names and
authenticates one independent raw block. A `./assets/...` target is an exact
relative manifest attachment lookup, never a child path under the content CID.
A direct `ipfs://` target accepts one exact canonical raw asset CID with no
path, slash, query, or fragment and must match one unique manifest digest.
Duplicate normalized paths or digests fail. Both target forms resolve only to
`https://ipfs.io/ipfs/<assetCid>` with no suffix.

The manifest permits at most 16 assets, 512 UTF-8 path bytes, 127 UTF-8 media
type bytes, 2,097,152 bytes per asset, and 33,554,432 aggregate declared bytes.
Image metadata permits at most 8,192 px per dimension and 33,554,432 pixels.
The 2 MiB per-asset limit keeps each attachment in one raw block for the
intended block-exchange and pinning paths. The browser renders cards only and
makes no asset request until the user opens one. A card is accepted only for a
sole image token in a top-level body paragraph after the summary; nested or
mixed image contexts fail. It never renders SVG inline.

## 3. Production Runtime Invariants

Validation script: `/scripts/validate-prod-env.mjs`

Runtime mode contract:

- `NEXT_PUBLIC_RUNTIME_MODE` is the canonical runtime selector (`development`, `preview`, `production`).
- If unset, runtime mode falls back to deployment markers (`VERCEL_ENV`, `CF_PAGES_ENV`, `DEPLOYMENT_ENV`) and then `NODE_ENV`.

Production invariants (enforced when runtime mode resolves to `production`):

- `NEXT_PUBLIC_RUNTIME_MODE` must resolve to `production` for production deployments.
- `NEXT_PUBLIC_USE_MOCKS` must be `false`
- `NEXT_PUBLIC_E2E` must be `false`
- `NEXT_PUBLIC_WC_PROJECT_ID` is required
- `NEXT_PUBLIC_GLOBAL_DATA_URL` is required
- `NEXT_PUBLIC_RPC_URLS` is required and must include at least one URL
- `NEXT_PUBLIC_TEAMS_DATA_URL` is required when `NEXT_PUBLIC_ENABLE_TEAMS=true`
- `NEXT_PUBLIC_YBC_DATA_URL` is required when `NEXT_PUBLIC_ENABLE_YBC=true`

Feature gating in production:

- `NEXT_PUBLIC_ENABLE_DAO=true` is a temporary route-local mock exception for
  the unaccepted internal preproduction review only. Public production
  hardcodes it false; global mocks, E2E, and debug UI remain disabled.
- `NEXT_PUBLIC_ENABLE_TEAMS=true` is required to expose Teams route/host.
- `NEXT_PUBLIC_ENABLE_YBC=true` is required to expose YBC route/host.
- `NEXT_PUBLIC_ENABLE_YETH=true` is required to expose yETH route/host.
- `NEXT_PUBLIC_ENABLE_DEBUG_UI=true` is required to expose `/debug/ui`.
- Teams/YBC production flags are whole-app exposure gates for this launch. Do not add
  separate write-only flags or per-app mock/live switches unless the rollout model
  changes materially. `NEXT_PUBLIC_USE_MOCKS` must stay globally disabled in production.
- `yeth.yearn.fi` host routing always rewrites to `/yeth`; when yETH is disabled, the route gate returns 404 instead of falling through to launcher content.

Canonical discoverability metadata:

- `metadataBase`, `rel=canonical`, and OG URLs come from the production app registry and always use the app's `*.yearn.fi` origin.
- Request host headers do not influence canonical metadata.
- Only approved public production hosts publish sitemap entries. stYFI and veYFI are currently approved; Teams, YBC, and yETH remain excluded until their rollout decisions change.
- Approved hosts publish a concise, host-specific `/llms.txt` generated from the same registry. It contains stable descriptions and canonical links only, avoiding live protocol values that could become stale.
- Non-public, preview, local, and not-yet-approved hosts receive `X-Robots-Tag: noindex, nofollow`.
- The six exact governance beta hosts under `dao-ops.com` remain noncanonical,
  noindex, and absent from sitemap and `llms.txt`. Cloudflare Access must protect
  every path with the approved reusable GitHub organization/team policy. Use
  exact self-hosted applications, not a wildcard. Do not add public bypasses or
  protect `app.dao-ops.com`, shared paths, public `*.yearn.fi`, or unrelated
  hosts. Custom domains and robots metadata are not authentication boundaries.
- `robots.txt` leaves Next.js JavaScript and CSS assets crawlable while excluding API and debug routes.

## 4. Transaction Safety Controls

Mainnet-only write protections:

- All write preparations enforce `chainId === 1`.
- Non-mainnet writes fail fast before signing.

Pre-simulation protections:

- Every on-chain write path performs contract simulation before wallet signing.
- Submitted writes reuse simulation requests to prevent accidental chain drift.
- Predictable reverts are caught pre-signature and flow through normalized tx error handling.

## 5. Blacklist Policy Enforcement

`OnchainStyfiClient` now resolves `isBlacklisted` from `STAKING_MIDDLEWARE` on-chain using function-signature fallback probes:

- `isBlacklisted(address)`
- `is_blacklisted(address)`
- `blacklisted(address)`
- `blocked(address)`

Behavior:

- If a known probe resolves, UI uses `clear` or `blocked`.
- If no probe resolves, fallback is explicit: `unknown`.
- `unknown` is treated as a silent, non-blocking state in UI (no blacklist-status warning copy).
- Only explicit `blocked` status applies blacklist action restrictions.

## 6. Browser Security Headers

### 6.1 CSP and Nonce

Middleware sets a nonce per request and injects CSP with nonce-based script policy.

- App surfaces (`/styfi`, `/veyfi`, `/yeth`, including host-rewritten equivalents) enforce nonce-based script policy.
- Non-app routes use a static-compatible script policy (`'unsafe-inline'`) to avoid global dynamic rendering requirements.
- Theme bootstrap is served as a same-origin external script (`/yearn-theme-init.js`) instead of inline script markup.
- `HEAD` requests preserve original path semantics on shared hosts and apply host-prefix rewrites only for mapped app hosts, keeping `HEAD` and `GET` status behavior aligned.

### 6.2 Additional Browser Hardening

Enforced headers include:

- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `X-Frame-Options` (`DENY`) by default for non-governance surfaces
- `X-Robots-Tag` (`noindex, nofollow`) for non-production runtime modes and non-public hosts
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`
- `Origin-Agent-Cluster`

Policy is tuned to remain wallet-compatible (`same-origin-allow-popups`, broad `connect-src`/`frame-src` wallet domains).

### 6.3 Safe App Compatibility Controls

To support Safe custom app embedding while preserving clickjacking protections, the app uses a scoped policy:

- Non-governance routes keep strict anti-framing controls:
  - `X-Frame-Options: DENY`
  - CSP `frame-ancestors 'none'`
- Governance app requests (`/styfi`, `/veyfi`, `/yeth`, including mapped governance hosts) allow iframe embedding only from Safe origins via CSP `frame-ancestors` allowlist:
  - `https://app.safe.global`
  - `https://*.safe.global`
  - `https://gnosis-safe.io`
  - `https://*.gnosis-safe.io`
- `/manifest.json` is published at the site root with Safe app metadata and route-scoped CORS headers so Safe Wallet can validate app capability.

Security rationale:

- A global removal of framing protections would materially increase clickjacking exposure.
- Keeping `DENY`/`'none'` as defaults preserves defense-in-depth for all non-Safe traffic.
- The Safe exception is constrained to governance app surfaces and a narrow origin allowlist, minimizing blast radius while enabling Safe compatibility.

### 6.4 Middleware Convention Decision

- Next.js 16 emits a deprecation warning recommending the `proxy` convention.
- This repository intentionally keeps the `middleware.ts` convention for now so routing and header logic stay centralized in the current deployment path.
- The warning is expected and currently treated as non-blocking.

## 7. Accepted Risk: Unsigned Off-Chain Global Data

Current accepted risk:

- Global stats (`NEXT_PUBLIC_GLOBAL_DATA_URL`) are schema-validated but not cryptographically signed.

Current impact boundary:

- These payloads drive display-only global stats and inventory previews.
- Transaction arguments and signing flows are sourced from wallet-connected chain reads and explicit user actions, not from remote JSON.

Mitigations in place:

- Zod validation with null-safe fallback behavior.
- Same-origin API proxying for fetch isolation.
- On-chain reads used for account-critical values where available.

Future hardening (recommended):

- Publish signed payloads with key rotation policy.
- Verify signatures in API routes before payload admission.
- Add freshness/rollback guards (timestamp + monotonic version checks).
