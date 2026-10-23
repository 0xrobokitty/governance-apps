# Release Checklist Template

Use this template for every governance app surface. Mark items that do not apply
and record why.

## 1. Scope freeze

- [ ] launch scope explicitly frozen
- [ ] non-goals documented
- [ ] open bugs labeled blocker / non-blocker

## 2. Engineering checks

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] targeted e2e passes
- [ ] `npm run worker:build`
- [ ] `npm run validate:worker-size -- <target-config>`
- [ ] `npm run validate:worker-runtime -- <target-config>` with the build's DAO flag
- [ ] docs updated
- [ ] no mock-only affordances exposed in production mode

## 3. Product / design checks

- [ ] copy reviewed
- [ ] responsive review complete
- [ ] accessibility review complete
- [ ] empty, loading, error, and success states all reviewed

## 4. Contract / fork checks

- [ ] fork runbook executed
- [ ] tx hashes recorded
- [ ] failure cases exercised
- [ ] simulation-before-write behavior confirmed
- [ ] configured addresses, deployment blocks, roles, and chain ID verified
- [ ] feed/indexer canonical-block and freshness checks pass, when applicable
- [ ] immutable content remains available from more than one retained source,
      when applicable
- [ ] event payloads needed for later writes are retained and hash-verified
- [ ] proposal-time analysis is distinguished from a fresh execution-time
      simulation, when applicable
- [ ] operator and guardian configuration is recorded, when applicable

## 5. Routing / rollout checks

- [ ] path-based route works on shared host
- [ ] feature flag behavior correct
- [ ] subdomain decision explicit
- [ ] sitemap / discoverability decision explicit
- [ ] header nav inclusion decision explicit
- [ ] legacy-product cutover and archive behavior explicit

## 6. Ops checks

- [ ] env vars present
- [ ] rollback plan written
- [ ] post-deploy smoke steps written
- [ ] owner for incident triage assigned

## 7. Sign-off

- [ ] implementer sign-off
- [ ] reviewer sign-off
- [ ] integrator sign-off
- [ ] product sign-off
- [ ] ops sign-off
