# DAO production procedure

This is the canonical production procedure for the October 1, 2026 release.
The launch includes real DAO reads, wallet actions, and content publication.
Set `DAO_PUBLICATION_ENABLED=true` before the first DAO production deployment. No separate publication approval or disabled launch stage is required.

The operator performs every remote action below. Repository preparation does not promote, push, deploy, change private configuration, or submit transactions.
The [release checklist](release-checklist.md) links the candidate, validation, and historical acceptance evidence.

## Release boundaries

- Production Worker: `governance-apps`, configured by [wrangler.jsonc](../../../wrangler.jsonc).
- Existing production route: `app.dao-ops.com`. Initial validation URL: `https://app.dao-ops.com/dao`.
- Final hostname: `dao.yearn.fi`, configured manually through the existing Cloudflare dashboard procedure for the governance applications.
- Preprod Worker: `governance-apps-preprod`, with separate configuration and existing access protection.
- Shared producer: `https://data.dao-ops.com/prod/dao.json`, Ethereum mainnet contracts, Pinata account, public gateway, and upload-only JWT.
- Shared binding: `DAO_PUBLICATION_DB`, database `dao-publication`, ID `66d8bf6b-9b2c-41d2-afa1-19647ea9725e`.
- Shared policy: the identical `DAO_PUBLICATION_LIMITS` strings committed in both Wrangler files.

Existing proposals, publication records, and retained content require no migration or republication.
The producer already contains IDs 0 and 1. Their recorded identities and content remain the production source.
Browser drafts remain origin-specific. A preprod or shared-host draft does not automatically appear on the final hostname.
Both sites share publication accounting, capacity, and retention responsibilities for real proposals.

Do not create another database, apply a migration, change quotas, or reset accounting for this release.
Do not add `dao.yearn.fi` to Wrangler or introduce another routing arrangement.
Keep the existing non-DAO application configuration and preprod access protection.

## Ordered operator procedure

### 1. Review the exact candidate and validation report

Review the complete range in the [production handoff](delivery/production-release-20261001.md).
Record the accepted full SHA and independent review result before promotion.
The command below resolves the commit that adds the final handoff. Compare it with the supplied final SHA.

```fish
cd /Users/hydra/Developer/yearn/governance-apps.agent.integration
set release_base 937784605df3054e489b852cbdb641c76b909b36
set release_candidate (git log --diff-filter=A -1 --format=%H -- docs/apps/dao/delivery/production-release-20261001.md)
git show --no-patch --format=fuller "$release_candidate"
git log --reverse --format='%H %s' "$release_base..$release_candidate"
git diff --check "$release_base" "$release_candidate"
git diff --stat "$release_base" "$release_candidate"
git status --short
```

Preserve the integration worktree's untracked `outputs/` directory. Do not stage it or use cleanup/reset commands.
Manual lifecycle UAT and live Pinata acceptance are complete. Do not repeat those campaigns or restart their retained services.
Automated checks use disposable local databases and offline provider fixtures.

### 2. Identify the deployment repository and current remote master

Inspect both fetch and push identities. Do not assume that `origin` owns production.

```fish
git remote -v
git worktree list
git ls-remote https://github.com/0xPickles/governance-apps.git refs/heads/master
git ls-remote https://github.com/yearn/governance-apps.git refs/heads/master
```

At preparation, `origin` identifies `0xPickles/governance-apps`. Its public master was `2863876b2a06f40fa26f2cbbc9c16b82bcc43d56`.
`upstream` identifies `yearn/governance-apps`. Its public master was `06d9ec46458675e36d72b2165ff80189914efb03`.
Both commits are ancestors of the starting integration commit. These observations do not establish deployment ownership or future branch state.

Select the repository that owns the existing GitHub `production` environment, deployment credentials, approval controls, and production workflow history.
Record its `OWNER/REPOSITORY` and matching remote name. Deployment ownership remains an operator input until checked.

```fish
read -P 'Verified deployment remote name: ' deployment_remote
read -P 'Verified GitHub OWNER/REPOSITORY: ' deployment_repository
git remote get-url "$deployment_remote"
git remote get-url --push "$deployment_remote"
git fetch "$deployment_remote" master
set remote_master (git rev-parse "$deployment_remote/master")
git show --no-patch --format=fuller "$remote_master"
git rev-list --left-right --count "$remote_master...$release_candidate"
git log --oneline "$release_candidate..$remote_master"
```

If remote master contains additional work, review it before promotion. Never discard it with a reset or force push.

### 3. Promote accepted changes to master while preserving history

Use the checkout that owns `master`. The observed checkout is `/Users/hydra/Developer/yearn/governance-apps`.
Check that it is clean before changing it. Resolve any dirty state separately without deleting unrelated files.

```fish
cd /Users/hydra/Developer/yearn/governance-apps
test (git branch --show-current) = master; or exit 1
test (git status --porcelain | count) -eq 0; or exit 1
git diff --check "$remote_master" "$release_candidate"; or exit 1
git log --oneline "$remote_master..master"
```

If local master contains unreviewed commits, stop promotion and review those commits.
If local master is behind the selected remote, update it only with a fast-forward:

```fish
git merge --ff-only "$remote_master"; or exit 1
```

If master is an ancestor of the accepted candidate, promote the exact candidate:

```fish
if git merge-base --is-ancestor master "$release_candidate"
    git merge --ff-only "$release_candidate"; or exit 1
else
    echo 'Master advanced. Review a history-preserving merge and validate its resulting SHA before release.'
    exit 1
end
set release_master (git rev-parse HEAD)
git merge-base --is-ancestor "$release_candidate" "$release_master"; or exit 1
```

A divergent master requires a reviewed merge commit through the existing release process, without squash, rebase, or history replacement.
Validate that resulting source before continuing. Record its SHA separately from the integration candidate.
Keep configured commit signing. If the documented signer failure recurs, record it and use the established per-command `--no-gpg-sign` fallback.
Do not change signing configuration.

### 4. Push through the existing release process

Use the selected deployment repository and its existing branch-protection process.
If direct master pushes are permitted, use this non-forced command:

```fish
git push "$deployment_remote" master:master
git ls-remote "$deployment_remote" refs/heads/master
```

If a pull request is required, use the existing history-preserving release path.
Record the resulting remote master SHA. Review and validate any merge result that differs from the accepted source.
Do not overwrite a concurrent update. Keep the approved source stable until dispatch.

### 5. Supply GitHub production values

Use the existing GitHub `production` environment. Preserve its approval controls and all existing application values.

| Value | Required source |
| --- | --- |
| `NEXT_PUBLIC_ENABLE_DAO` | Environment variable `true` |
| `NEXT_PUBLIC_DAO_DEPLOYMENTS` | Environment variable containing the complete [reviewed JSON](examples/mainnet-deployments.json), including `supportedProposeHooks` |
| `NEXT_PUBLIC_RPC_URLS` | Existing approved public-client mainnet RPC URLs, comma-separated |
| `NEXT_PUBLIC_WC_PROJECT_ID` | Existing approved WalletConnect project ID |
| `NEXT_PUBLIC_GLOBAL_DATA_URL` | Existing approved shared application feed |
| `NEXT_PUBLIC_DAO_VOTING_POWER_URL` | Published companion feed, normally `https://data.dao-ops.com/prod/voting-power.json` |
| Teams, YBC, and yETH flags and feed URLs | Preserve their current production values |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Existing private deployment secrets |

The workflow reads DAO values from GitHub variables. An absent DAO flag defaults to `false`.
The operator must set it to `true` for this approved launch.
Copy the reviewed JSON as one complete array. Do not substitute the synthetic deployment example or remove the proposal hook.

The voting-power release requires the companion producer before the app update.
Follow the [coordinated release procedure](voting-power-release-2026-10-23.md).
Production validation rejects a missing feed URL, a relative URL, HTTP, or URL credentials when DAO is enabled.
The browser reads the validated feed through `/api/dao-voting-power` on the app's own origin.

The workflow fixes `NODE_ENV` and `NEXT_PUBLIC_RUNTIME_MODE` to `production` in validation, build, and deployment.
It fixes mocks, E2E, debugging, DAO review controls, and simulation fallback to `false` in all three steps.
RPCs must support mainnet, canonical block-hash reads, and exact-call simulation.
RPC and WalletConnect restrictions must allow both production hostnames.
`NEXT_PUBLIC_*` values enter browser output, even when supplied through GitHub secrets. Use only values approved for public exposure.

### 6. Record the previous Worker version and obtain a shared-database backup

Before any runtime or secret change, record the current deployment, working version ID, source SHA, and rollback owner.

```fish
npx wrangler deployments list --config wrangler.jsonc
npx wrangler versions list --config wrangler.jsonc
```

Record the selected version's runtime configuration privately. Keep secrets out of the release report.
Obtain a complete shared-database backup in an operator-controlled location:

```fish
read -P 'Private absolute backup filename: ' dao_backup_file
npx wrangler d1 export DAO_PUBLICATION_DB --remote --config wrangler.jsonc --output "$dao_backup_file"
```

Record backup time, integrity, encrypted storage location, and restoration owner privately.
The export includes policy, counters, unsuccessful records, and canonical bytes. A public content download is not a complete backup.
An export temporarily blocks other database requests. Coordinate its timing with preprod use. See [D1 export behavior](https://developers.cloudflare.com/d1/best-practices/import-export-data/#export-an-existing-d1-database).
Publication disablement is not a release prerequisite. This backup is a point-in-time record, not permission to restore over later writes.
Preserve any later accounting and retained content during incident reconciliation.

### 7. Configure the production Worker and privately install the shared JWT

Target `governance-apps`. Preserve all existing non-DAO runtime values and secrets.

| Worker value | Launch configuration |
| --- | --- |
| `DAO_DATA_URL` | `https://data.dao-ops.com/prod/dao.json` |
| `DAO_IPFS_GATEWAY_URL` | The approved preprod public HTTPS gateway ending in `/ipfs/`, without credentials, query, or fragment |
| `DAO_PUBLICATION_ENABLED` | `true` from the first DAO production deployment |
| `DAO_PINATA_JWT` | Private secret containing the same approved upload-only preprod JWT |
| `DAO_PUBLICATION_DB` | The existing shared binding and database identity listed above |
| `DAO_PUBLICATION_LIMITS` | The unchanged committed policy in both Wrangler files |

Check the existing binding, schema, stored policy, and accounting against the setup record. Do not recreate or migrate the database.
If the stored policy differs, stop release and investigate it. Do not replace its row or reset counters.
Do not set local fixture origins or local storage paths in production.
The server-only publication switch is a Worker runtime value, not a public build variable or GitHub build input.

Install the secret through the private interactive prompt:

```fish
npx wrangler secret put DAO_PINATA_JWT --config wrangler.jsonc
```

The JWT must have only the approved `pinning.pinFileToIPFS` authority.
Never paste it into chat, commands, source, public variables, or logs.
Secret installation creates and immediately deploys a Worker version. The previous working version must already be recorded in step 6.
See [Cloudflare secret installation](https://developers.cloudflare.com/workers/configuration/secrets/#via-wrangler).

The existing OpenNext deployment command passes `--keep-vars` to Wrangler.
It preserves dashboard-only runtime values. Explicit Wrangler variables override same-name dashboard values.
For this release, `DAO_PUBLICATION_LIMITS` is the committed variable override. Existing secrets remain Worker bindings.
Wrangler also controls the committed D1 binding, assets, self reference, compatibility settings, observability, and `app.dao-ops.com` route.
GitHub build values do not provision runtime variables. Check effective runtime configuration after deployment.
See [Wrangler's configuration rules](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth).

### 8. Dispatch production from master

In the verified repository, open **Deploy Production** and select `master` in **Use workflow from**.
Alternatively, use the existing GitHub CLI:

```fish
gh workflow run deploy-production.yml --repo "$deployment_repository" --ref master
```

The job requires `refs/heads/master` and the existing `production` environment approval.
Checkout uses `${{ github.sha }}`, so a later master update cannot change that run's source.
GitHub records the selected branch commit for [manual dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).
Keep production concurrency protection. Do not dispatch a competing release.
The workflow runs validation, a fresh OpenNext build, the production size check, and `npm run worker:deploy:prod` with `--keep-vars`.

### 9. Check the deployed source SHA and Worker version

Compare the workflow event SHA and **Checked-out source SHA** summary with the approved remote master SHA.
Record the workflow URL, checked-out SHA, lockfile hash, public configuration, deployment time, and resulting Worker version ID.
Compare the version ID in deployment output with `wrangler deployments list` or the dashboard's active production version.
Check effective runtime values privately, including `DAO_PUBLICATION_ENABLED=true`, the shared binding, unchanged policy, gateway, and secret binding name.
Do not print the secret value. A successful build alone does not prove remote runtime configuration.

### 10. Validate `app.dao-ops.com/dao`

Use existing verified content. No new upload, proposal, or blockchain transaction is required to validate deployment.

- Open `/dao` disconnected. Refresh it and check the current feed timestamp and normal failure handling.
- Open IDs 0 and 1. Check chain 1, Voting address, immutable content, proposer identities, current statuses, and recorded transaction links.
- Follow proposal links and back navigation. Open `/dao/propose` and check authoring access on desktop and mobile.
- Check same-host `/api/dao-data`, `/api/dao-forum`, `/api/dao-content`, assets, and browser errors.
- Read existing verified content by digest. Publication remains enabled during validation.
- Connect an approved mainnet wallet. Inspect eligibility and unsigned action review. Stop before submission or signature confirmation.
- Check canonical reads and simulation through the approved RPC path where eligibility permits unsigned review.
- Check desktop/mobile navigation and existing stYFI, veYFI, Teams, YBC, and yETH production surfaces with their current flags.
- Check the public producer's availability and the effective Worker runtime configuration recorded in step 9.

For origin checks, send empty binary requests only. They fail before content admission and cannot upload or spend publication capacity:

```fish
curl -i https://app.dao-ops.com/api/dao-content -X POST \
  -H 'Origin: https://app.dao-ops.com' -H 'Content-Type: application/octet-stream' --data-binary ''
curl -i https://app.dao-ops.com/api/dao-content -X POST \
  -H 'Origin: https://foreign.invalid' -H 'Content-Type: application/octet-stream' --data-binary ''
```

The exact same-origin request returns `400 invalid_content`. The foreign origin returns `403`.
These responses check enablement and origin handling without proving provider credentials. Offline tests cover provider and D1 interfaces.
The completed live acceptance evidence and private configuration checks support the provider choice. Do not repeat provider acceptance for this release.

### 11. Configure `dao.yearn.fi` through the dashboard

After shared-host validation, use the existing manual Cloudflare dashboard procedure for the other governance applications.
Associate `dao.yearn.fi` with `governance-apps` through that procedure.
Keep `app.dao-ops.com` and the existing application routing intact.
Do not register this hostname in Wrangler or change DNS through tooling.
Do not introduce Cloudflare for SaaS, a proxy, or another arrangement.
Record the dashboard result and operator. Wrangler route management can affect dashboard routes on later deployments.
After every later deployment, check the manual hostname association through the same existing procedure.

### 12. Perform final hostname checks

- Check HTTPS and the certificate at `https://dao.yearn.fi/`.
- Check `/`, `/proposals/0`, `/proposals/1`, and `/propose`, including chain/Voting selection in proposal links.
- Check JavaScript, CSS, fonts, and images. Check root-relative `/api/dao-*` requests and clean internal navigation.
- Repeat disconnected reads, refresh, existing-content checks, mainnet wallet connection, and unsigned review.
- Check desktop/mobile navigation and links to the other production applications.
- Repeat the empty-body origin checks with `https://dao.yearn.fi` as the matching origin.
- Check that `https://app.dao-ops.com` as an Origin is rejected by `dao.yearn.fi`, despite their shared Worker and database.
- Check that preprod remains protected, including API paths and alternative Workers or version-preview entry points.

Record final results, source SHA, Worker version, runtime configuration checks, and operational owners in the release record.

## Incident controls and code rollback

To stop new publication during an incident, set `DAO_PUBLICATION_ENABLED=false` in the affected Worker.
For a shared provider, key, policy, or accounting incident, coordinate that control across both Workers.
Keep DAO reads and the existing D1 binding. Retained verified content remains readable with publication disabled.
Incident disablement does not change this release's enabled launch configuration.

For code rollback, restore the previous working version recorded before runtime changes:

```fish
read -P 'Recorded previous working Worker version ID: ' previous_worker_version
npx wrangler rollback "$previous_worker_version" --config wrangler.jsonc
```

Check runtime values, secret bindings, routes, and all affected applications after rollback.
An older version can predate DAO support. Record that service limitation while retaining all live data.
Rollback must preserve the shared database, counters, policy, retained bytes, and pins referenced by real proposals.
Do not restore a backup over newer accounting or attach an empty database to regain capacity.
Reconcile later work before any incident restoration. Keep both Workers compatible with the shared schema.
Use [publication operations](pinata-publication.md#backup-inventory-and-recovery) for coordinated recovery and retention ownership.

## Remaining private operator inputs

- Deployment repository identity, accepted candidate, resulting remote master SHA, and release operator.
- Existing approved public-client RPC and WalletConnect values, with both production origins allowed.
- Existing non-DAO production configuration and private GitHub deployment credentials.
- Approved public gateway and private interactive installation of the shared upload-only JWT.
- Current Worker version, effective runtime configuration, shared-database backup, and stored policy/accounting check.
- Backup, restoration, retention, monitoring, and rollback owners, plus private backup location and retention duration.
- The existing manual dashboard hostname procedure and its completed result.

No private value is inferred from a test fixture, retained acceptance state, or another deployment run.
