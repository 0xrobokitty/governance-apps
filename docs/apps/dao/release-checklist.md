# DAO Release Checklist

Use this checklist with the exact candidate’s validation report and independent review.
The operator owns promotion, publication, deployment, private configuration, and hostname setup.
Historical acceptance does not establish the state of a later deployment.

## Release procedure

Follow the [canonical production procedure](production-release.md) in order:

1. Review the exact candidate and validation report.
2. Identify the deployment repository and current remote master.
3. Promote accepted integration history to master.
4. Push through the existing release process.
5. Supply GitHub production values while preserving existing applications.
6. Record the previous working Worker version and obtain a shared-database backup.
7. Configure production runtime values and install the shared JWT privately.
8. Dispatch the production workflow from master.
9. Check the deployed source SHA and Worker version.
10. Validate `app.dao-ops.com/dao`.
11. Configure `dao.yearn.fi` manually through the existing dashboard procedure.
12. Complete the final hostname checks.

Production publication is approved from launch: GitHub `NEXT_PUBLIC_ENABLE_DAO=true` and Worker `DAO_PUBLICATION_ENABLED=true`.
No disabled-publication stage, new mainnet proposal, upload, transaction, or repeated acceptance campaign is required.
The production Worker remains `governance-apps`, with the existing `app.dao-ops.com` Wrangler route.
The final hostname remains a manual dashboard action. Both application host forms retain support.

The retained acceptance configuration and throwaway wallets are not production inputs.
Both Wrangler files now identify the approved shared database and identical publication policy.
The September 30, 2026 decision supersedes separate-database and placeholder-ID requirements in historical handoffs.
Keep the build flag and server publication switch separate. Publication disablement remains an incident control.
Use [publication operations](pinata-publication.md) for shared policy semantics, key replacement, backup, budget recovery, and rollback.
Do not repeat the completed A/C/B experiment as a normal production procedure.

## Validation requirements

Follow the [shared testing policy](../../shared/testing.md) for unit, component, and browser checks.
Use disposable databases, offline provider fixtures, and the [fork acceptance procedure](local-fork-uat.md) for transaction validation.

Also verify the repository’s generated artifacts and deployment checks:

```sh
npm run generate:dao-feed -- --check
npm run validate:deps
node scripts/check-dao-doc-links.mjs
npm run cf-typegen
git diff --exit-code -- cloudflare-env.d.ts
npm run test:e2e:dao-feed
npm run test:e2e:dao-feed -- --disabled
npm run worker:build
npm run validate:worker-size
git diff --check
```

Run `npm run validate:prod-env` with the selected release configuration.
Keep private values out of reports.
Investigate generated-type changes before committing.
Review any conflict resolution and validate the resulting source SHA.
No routine code validation requires a live Pinata upload.

Verify deployment identities independently of the producer feed.
Confirm canonical block-hash reads and exact-call simulation. Stale or replaced observations must fail closed.
Check disabled publication, retained-content reads, missing bindings, protected-host routing, and public error redaction.
Confirm the stored limits and schema across replicas. Preserve publication counters during release and rollback.
A code rollback retains the same database and spent allowances.
Do not push, deploy, or change production flags without the required authorization.

## Historical acceptance

The [publication acceptance](publication-acceptance-20260923.md) records the completed A/C/B follow-up.
The [historical index](delivery/historical-index.md) links to walkthrough results, review corrections, and dated release handoffs.
The [original checklist](https://github.com/yearn/governance-apps/blob/d0332e0a9ebb99d69085ac8cbbd2a638994bbab7/docs/apps/dao/release-checklist.md) retains the September integration procedure and its source identities.
Do not restart retained acceptance services or repeat those experiments as a routine release step.
