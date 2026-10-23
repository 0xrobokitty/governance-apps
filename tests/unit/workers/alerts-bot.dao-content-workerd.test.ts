import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { daoAction } from "./alerts-bot.dao-fixtures";
import { contentProposal, daoContentFeed } from "./alerts-bot.dao-content-fixtures";

// Use Wrangler's installed build/runtime dependencies. Node fetch mocks accept
// redirect: "error", whereas workerd rejects it before contacting the service.
let script: string;
let runtime: Miniflare | undefined;

beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import { DaoAlertContentReader } from "./workers/alerts-bot/src/domains/dao/content";
        import { renderDaoAlert } from "./workers/alerts-bot/src/domains/dao/renderer";
        export default { async fetch(request, env) {
          const values = new Map();
          const storage = { get: async key => values.get(key), put: async (key, value) => { values.set(key, value); } };
          const reader = new DaoAlertContentReader(env.DAO_APP, storage);
          try {
            const content = await reader.read(${JSON.stringify(contentProposal)});
            return Response.json({ content,
              announcement: renderDaoAlert(${JSON.stringify(daoAction("proposed", contentProposal))}, content),
              vote: renderDaoAlert(${JSON.stringify(daoAction("vote", contentProposal))}, content) });
          } catch (error) { return Response.json({ code: error.code }, { status: 503 }); }
        } };
      `,
      resolveDir: process.cwd(), sourcefile: "dao-content-runtime-test.ts", loader: "ts",
    },
    bundle: true, write: false, platform: "browser", format: "esm",
    conditions: ["workerd", "worker", "browser"], external: ["node:*"], tsconfig: "tsconfig.json",
  });
  script = bundle.outputFiles[0]!.text;
}, 30_000);

afterEach(async () => { await runtime?.dispose(); runtime = undefined; });

async function readInWorkerd(status = 200) {
  // Keep the existing fixture shape through Miniflare's compatibility helper.
  runtime = new Miniflare(convertV4MiniflareOptions({ workers: [
    {
      name: "reader", modules: true, script, compatibilityDate: "2026-09-03",
      compatibilityFlags: ["nodejs_compat"], serviceBindings: { DAO_APP: "website" },
    },
    {
      name: "website", modules: true, compatibilityDate: "2026-01-22",
      bindings: { FEED: JSON.stringify(daoContentFeed()), STATUS: status },
      script: `export default { async fetch(request, env) {
        if (request.url !== "https://dao.yearn.fi/api/dao-data") return new Response(null, { status: 404 });
        if (env.STATUS !== 200) return new Response(null, { status: env.STATUS, headers: { location: "https://must-not-follow.invalid/" } });
        return new Response(env.FEED, { headers: { "content-type": "application/json" } });
      } };`,
    },
  ] }));
  return runtime.dispatchFetch("https://reader.test/");
}

describe("DAO content through a workerd service binding", () => {
  it("verifies proposal #0 and renders its title and summary without a retry", async () => {
    const response = await readInWorkerd();
    expect(response.status).toBe(200);
    const result = await response.json() as { content: { title: string }; announcement: string; vote: string };
    expect(result.content.title).toBe("Fund research");
    expect(result.announcement).toContain("<b>Fund research</b>");
    expect(result.announcement).toContain("Publish the research results.");
    expect(result.vote).toContain("<b>Fund research</b>");
    expect(result.announcement).not.toContain("Proposal title unavailable");
  });

  it("rejects a service redirect without following it", async () => {
    const response = await readInWorkerd(302);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "dao_content_feed_unavailable" });
  });
});
