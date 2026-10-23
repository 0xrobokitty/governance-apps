# proxy-addr advisory assessment

Assessed on 2026-10-23 for [GHSA-jqcg-44mw-7w3h / CVE-2026-90711](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).

## Result

The reviewed Cloudflare production deployment does not expose the affected `proxy-addr` behavior.
The vulnerable package is an installed dependency of an unused OpenNext Express development adapter.
Updating the lockfile to `proxy-addr` 2.0.8 removes this vulnerable dependency as a maintenance precaution.
The update does not require an emergency production deployment.

## Conditions required for exploitation

Affected versions can incorrectly trust arbitrary IPv4 clients when configured with certain IPv6 trust subnets.
For example, `::ffff:10.0.0.0/8` permits spoofed `X-Forwarded-For` values.
Exploitation requires application code to use that trust configuration when determining the client address.
An affected address must then influence authorization, rate limits, or another security decision.

## Deployment evidence

- The Cloudflare deployment listing assigned 100% of production traffic to version `8853165c-92c0-490e-b74c-9a98f2ac7ad6`.
- [Production workflow run 38393013676](https://github.com/yearn/governance-apps/actions/runs/38393013676) records that version and source commit `5c891e1bae64959cb270ccacb914a66f2882eb53`.
- Both that source and reviewed master (`8ae00cf3639763bb4e3218bcb754ab35b2e07170`) deploy `.open-next/worker.js` from `wrangler.jsonc`.
- Both use `defineCloudflareConfig()` with OpenNext Cloudflare 1.20.2 and its AWS adapter dependency 4.1.0.
- That configuration selects the `cloudflare-node` wrapper and `edge` converter. It does not select `express-dev`.
- The Cloudflare wrapper accepts a Web `Request` and invokes the Next.js handler without an Express application.
- Application sources contain no `proxy-addr` imports, Express applications, or `trust proxy` configuration.
- A local build inspection found no `proxy-addr`, `trust proxy`, or `express-dev` references in the generated server handler.
- The final Wrangler dry-run dependency metadata contains no Express, `proxy-addr`, or `express-dev` inputs.

The dependency path is:

```text
@opennextjs/cloudflare@1.20.2
  -> @opennextjs/aws@4.1.0
    -> express@5.2.1
      -> proxy-addr@2.0.7
```

The AWS adapter imports Express in `dist/overrides/wrappers/express-dev.js`.
That development wrapper does not enable `trust proxy`. Express defaults that setting to `false`.
The `edge` converter carries `X-Forwarded-For` into its internal request address, but does not call `proxy-addr`.
The reviewed application does not use that address for IP-based authorization or rate limiting.
This assessment concerns the cited advisory, not every possible forwarded-header risk.

## Remediation and validation

The patch updates only the locked `proxy-addr` version to 2.0.8, within the existing Express dependency range.
It adds no direct dependency or override and retains Wagmi 2 and RainbowKit.
The upstream patch changes IPv4/IPv6 subnet matching and includes regression coverage.

A local reproduction demonstrates the fault in 2.0.7 and verifies the correction in 2.0.8.
The reproduction covers forged forwarding headers, IPv4-mapped client addresses, and valid IPv4 and mapped-subnet controls.

Validation passed for dependency policy, typechecking, lint, all 2,157 tests, and the production OpenNext build.
The final Worker dry run produced a 3,361.17 KiB gzip bundle, within the repository's 9 MiB budget.
The production dependency audit no longer reports `proxy-addr` and reports zero critical findings. Other advisories remain outside this patch.

## Reassessment triggers

Repeat the assessment if the deployment adapter, request wrapper, proxy configuration, or IP-based security decisions change.
For a later deployment, verify its active version and source instead of assuming that these identifiers remain current.
