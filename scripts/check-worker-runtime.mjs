#!/usr/bin/env node
import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unstable_dev } from "wrangler";

// Exercise the deployed artifact in workerd. A Next.js server or a Wrangler
// deploy dry run does not execute OpenNext's manifest loader.
const config = process.argv[2] || "wrangler.preprod.jsonc";
const root = process.cwd();
const workerPath = path.join(root, ".open-next/worker.js");
await access(workerPath);

process.env.WRANGLER_SEND_METRICS = "false";
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";

const probes = [
  ["https://app.dao-ops.com/styfi", "stYFI | Yearn Finance"],
  ["https://styfi.yearn.fi/", "stYFI | Yearn Finance"],
  ["https://app.dao-ops.com/veyfi", "veYFI"],
];
// Deployment workflows pass the same DAO flag used for their build. The PR
// verification build keeps DAO gated off and still exercises dynamic stYFI SSR.
if (process.env.NEXT_PUBLIC_ENABLE_DAO === "true") {
  probes.push(
    ["https://app.dao-ops.com/dao", "DAO Governance"],
    ["https://dao.yearn.fi/", "DAO Governance"],
  );
}

let worker;
const envDirectory = await mkdtemp(path.join(tmpdir(), "worker-runtime-check-"));
const envFile = path.join(envDirectory, "empty.env");
await writeFile(envFile, "");
let cleanupPromise;
function cleanup() {
  return cleanupPromise ??= (async () => {
    try {
      await worker?.stop();
    } finally {
      await rm(envDirectory, { recursive: true, force: true });
    }
  })();
}

const timeout = setTimeout(async () => {
  console.error("Worker runtime check exceeded 120 seconds.");
  const forceExit = setTimeout(() => process.exit(1), 5_000);
  try {
    await cleanup();
  } finally {
    clearTimeout(forceExit);
    process.exit(1);
  }
}, 120_000);

try {
  worker = await unstable_dev(workerPath, {
    config,
    // An explicit file also prevents Wrangler from loading local .dev.vars.
    envFiles: [envFile],
    local: true,
    port: 0,
    persist: false,
    logLevel: "error",
    vars: { DAO_PUBLICATION_ENABLED: "false" },
    experimental: {
      forceLocal: true,
      disableDevRegistry: true,
      disableExperimentalWarning: true,
      watch: false,
    },
  });

  for (const [url, title] of probes) {
    const response = await worker.fetch(url, {
      // Wrangler's local proxy rewrites Host; preserve the intended app host.
      headers: { "x-forwarded-host": new URL(url).host },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    // Consume streamed HTML so a later SSR failure cannot pass on headers alone.
    const html = await response.text();
    assert.equal(response.status, 200, `${url} returned HTTP ${response.status}`);
    assert.match(response.headers.get("content-type") || "", /text\/html/i);
    assert.ok(html.includes(`<title>${title}`), `${url} did not render its page title: ${html.match(/<title>(.*?)<\/title>/)?.[1] || "missing"}`);
    assert.ok(html.includes("</html>"), `${url} returned incomplete HTML`);
    assert.doesNotMatch(html, /id="__next_error__"|NEXT_HTTP_ERROR_FALLBACK;500|Unexpected loadManifest/);
    console.log(`PASS ${url}: HTTP 200 and complete server-rendered HTML`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await cleanup();
  clearTimeout(timeout);
}
