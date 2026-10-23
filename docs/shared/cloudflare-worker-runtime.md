# Cloudflare Worker runtime check

Deployment success confirms that Cloudflare accepted the bundle. It does not confirm that the application can serve requests.

Both release workflows run `validate:worker-runtime` against the built Worker before deployment. The pull request workflow runs this check too.

## Local validation

Build the Worker with the intended release flags. Then run the check with the target configuration and the same DAO flag:

```sh
npm run worker:build
env NEXT_PUBLIC_ENABLE_DAO=true npm run validate:worker-runtime -- wrangler.jsonc
```

For preprod, use `wrangler.preprod.jsonc`. If DAO is disabled in the build, set `NEXT_PUBLIC_ENABLE_DAO=false` for the check.

The check uses local workerd with temporary storage and local bindings. It disables publication and sends only GET requests.
It checks stYFI and veYFI pages, including the stYFI hostname rewrite. With DAO enabled, it also checks DAO paths and hostname rewrites.
Each response must contain complete HTML, the expected title, and no server error marker. Redirects do not count as successful responses.
Requests have a 20-second timeout. The complete check has a 120-second limit.

This check covers Worker startup and server rendering. Wallet transactions, external feeds, and browser interactions require separate checks.

## Next.js 16.4 compatibility

Next.js 16.4 loads `.next/server/preview-props.json` during server startup. OpenNext Cloudflare 1.20.2 omitted this file from its inlined manifest loader.
The resulting Worker compiled successfully but failed on requests with `Unexpected loadManifest(/.next/server/preview-props.json) call!`.

OpenNext Cloudflare 1.20.12 includes the [upstream fix](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356) and requires Wrangler 4.148.0 or later.
The repository pins this compatible pair. A plain Next.js server and a Wrangler deployment dry run do not detect this failure.

## Recovery

If production fails after deployment, inspect the Worker exceptions. Restore a verified working version with `wrangler rollback <version-id> -c wrangler.jsonc`.
Check the application URLs after the rollback. A rollback changes Worker code and bindings, but does not restore database contents.
Rebuild the corrected release and complete the runtime check before deployment.
