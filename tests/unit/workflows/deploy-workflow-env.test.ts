import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { DAO_PUBLICATION_DEFAULT_LIMITS } from "@/lib/server/dao-publication-policy";

const expectedRuntimeEnv: Record<string, string> = {
  NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY: "${{ vars.NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY || 'false' }}",
  NODE_ENV: "production",
  NEXT_PUBLIC_RUNTIME_MODE: "production",
  NEXT_PUBLIC_USE_MOCKS: '"false"',
  NEXT_PUBLIC_E2E: '"false"',
  NEXT_PUBLIC_ENABLE_DEBUG_UI: '"false"',
  NEXT_PUBLIC_ENABLE_TREASURY: "${{ vars.NEXT_PUBLIC_ENABLE_TREASURY || 'false' }}",
  NEXT_PUBLIC_ENABLE_TEAMS:
    "${{ vars.NEXT_PUBLIC_ENABLE_TEAMS || secrets.NEXT_PUBLIC_ENABLE_TEAMS || 'false' }}",
  NEXT_PUBLIC_ENABLE_YBC:
    "${{ vars.NEXT_PUBLIC_ENABLE_YBC || secrets.NEXT_PUBLIC_ENABLE_YBC || 'false' }}",
  NEXT_PUBLIC_ENABLE_YETH:
    "${{ vars.NEXT_PUBLIC_ENABLE_YETH || secrets.NEXT_PUBLIC_ENABLE_YETH || 'false' }}",
  NEXT_PUBLIC_WC_PROJECT_ID:
    "${{ secrets.NEXT_PUBLIC_WC_PROJECT_ID || vars.NEXT_PUBLIC_WC_PROJECT_ID }}",
  NEXT_PUBLIC_GLOBAL_DATA_URL:
    "${{ vars.NEXT_PUBLIC_GLOBAL_DATA_URL || secrets.NEXT_PUBLIC_GLOBAL_DATA_URL }}",
  NEXT_PUBLIC_TEAMS_DATA_URL:
    "${{ vars.NEXT_PUBLIC_TEAMS_DATA_URL || secrets.NEXT_PUBLIC_TEAMS_DATA_URL }}",
  NEXT_PUBLIC_YBC_DATA_URL:
    "${{ vars.NEXT_PUBLIC_YBC_DATA_URL || secrets.NEXT_PUBLIC_YBC_DATA_URL }}",
  NEXT_PUBLIC_DAO_VOTING_POWER_URL:
    "${{ vars.NEXT_PUBLIC_DAO_VOTING_POWER_URL || secrets.NEXT_PUBLIC_DAO_VOTING_POWER_URL }}",
  NEXT_PUBLIC_YETH_GLOBAL_DATA_URL:
    "${{ secrets.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL || vars.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL }}",
  NEXT_PUBLIC_RPC_URLS:
    "${{ secrets.NEXT_PUBLIC_RPC_URLS || vars.NEXT_PUBLIC_RPC_URLS }}",
};

const preprodDaoFlag =
  "${{ vars.NEXT_PUBLIC_ENABLE_DAO || secrets.NEXT_PUBLIC_ENABLE_DAO || 'false' }}";
const preprodDaoReviewControlsFlag =
  "${{ vars.NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS || secrets.NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS || 'false' }}";

function expectedRuntimeEnvFor(relativePath: string) {
  return {
    ...expectedRuntimeEnv,
    NEXT_PUBLIC_DAO_DEPLOYMENTS: "${{ vars.NEXT_PUBLIC_DAO_DEPLOYMENTS }}",
    NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK: '"false"',
    NEXT_PUBLIC_ENABLE_DAO: relativePath.includes("preprod")
      ? preprodDaoFlag
      : "${{ vars.NEXT_PUBLIC_ENABLE_DAO || 'false' }}",
    NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS: relativePath.includes("preprod")
      ? preprodDaoReviewControlsFlag
      : '"false"',
  };
}

function parseEnvLines(linesBlock: string) {
  const result: Record<string, string> = {};
  const lines = linesBlock.trimEnd().split("\n");
  for (const line of lines) {
    const match = line.match(/^\s{10}([A-Z0-9_]+):\s*(.+)$/);
    if (!match) continue;
    result[match[1]] = match[2].trim();
  }
  return result;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseStepEnvByRun(workflowPath: string, runCommand: string) {
  const content = readFileSync(workflowPath, "utf8");
  const envBlockPattern = new RegExp(
    `^\\s{6}- name: .+\\n\\s{8}env:\\n((?:^\\s{10}[A-Z0-9_]+:.*\\n)+)\\s{8}run:\\s+${escapeRegex(runCommand)}$`,
    "m"
  );
  const envBlock = content.match(envBlockPattern);
  if (!envBlock) {
    throw new Error(`Missing env block for step run command "${runCommand}" in ${workflowPath}`);
  }
  return parseEnvLines(envBlock[1]);
}

describe("deploy workflow env wiring", () => {
  const workflows = [
    ".github/workflows/deploy-preprod.yml",
    ".github/workflows/deploy-production.yml",
  ];

  for (const relativePath of workflows) {
    const workflowPath = path.resolve(process.cwd(), relativePath);
    const deployCommand = relativePath.includes("preprod")
      ? "npm run worker:deploy:preprod"
      : "npm run worker:deploy:prod";

    it(`${relativePath} keeps production runtime env on validation step`, () => {
      expect(parseStepEnvByRun(workflowPath, "npm run validate:prod-env")).toEqual(
        expectedRuntimeEnvFor(relativePath)
      );
    });

    it(`${relativePath} keeps production runtime env on build step`, () => {
      expect(parseStepEnvByRun(workflowPath, "npm run worker:build")).toEqual(
        expectedRuntimeEnvFor(relativePath)
      );
    });

    it(`${relativePath} keeps runtime env and Cloudflare creds on deploy step`, () => {
      expect(parseStepEnvByRun(workflowPath, deployCommand)).toEqual({
        ...expectedRuntimeEnvFor(relativePath),
        CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
        CLOUDFLARE_API_TOKEN: "${{ secrets.CLOUDFLARE_API_TOKEN }}",
      });
    });
  }
});

describe("preprod worker routes", () => {
  it("registers all beta custom domains", () => {
    const wranglerConfig = readFileSync(
      path.resolve(process.cwd(), "wrangler.preprod.jsonc"),
      "utf8"
    );

    for (const host of [
      "styfi-beta.dao-ops.com",
      "veyfi-beta.dao-ops.com",
      "teams-beta.dao-ops.com",
      "yeth-beta.dao-ops.com",
      "ybc-beta.dao-ops.com",
      "dao-beta.dao-ops.com",
    ]) {
      expect(wranglerConfig).toContain(`"pattern": "${host}"`);
    }
  });

  it("does not register the reserved DAO production host", () => {
    const wranglerConfig = readFileSync(
      path.resolve(process.cwd(), "wrangler.jsonc"),
      "utf8"
    );

    expect(wranglerConfig).not.toContain('"pattern": "dao.yearn.fi"');
  });
});

describe("production release safeguards", () => {
  const workflow = readFileSync(".github/workflows/deploy-production.yml", "utf8");
  function readWranglerConfig(file: string) {
    const parsed = ts.parseConfigFileTextToJson(file, readFileSync(file, "utf8"));
    expect(parsed.error).toBeUndefined();
    return parsed.config;
  }
  const production = readWranglerConfig("wrangler.jsonc");
  const preprod = readWranglerConfig("wrangler.preprod.jsonc");

  it("only dispatches manually from master with the existing environment and concurrency controls", () => {
    expect(workflow.match(/^on:\n([\s\S]*?)\njobs:/m)?.[1].trim()).toBe("workflow_dispatch:");
    expect(workflow).toMatch(/^  deploy:\n    name: .+\n    if: github.ref == 'refs\/heads\/master'$/m);
    expect(workflow).toContain("    environment: production\n");
    expect(workflow).toContain("    concurrency:\n      group: deploy-production\n      cancel-in-progress: false\n");
  });

  it("checks out the dispatch SHA and records the checked-out commit without configuration values", () => {
    expect(workflow).toMatch(/uses: actions\/checkout@[^\n]+\n        with:\n          ref: \$\{\{ github.sha \}\}/);
    expect(workflow).not.toMatch(/ref: master/);
    expect(workflow).toContain("run: git log -1 --format='Checked-out source SHA:%x20%H' | tee -a \"$GITHUB_STEP_SUMMARY\"");
  });

  it("preserves OpenNext deployment and dashboard runtime variables", () => {
    const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
    expect(scripts["worker:deploy:prod"]).toBe("opennextjs-cloudflare deploy -c wrangler.jsonc -- --keep-vars");
    expect(scripts["worker:deploy:preprod"]).toBe("opennextjs-cloudflare deploy -c wrangler.preprod.jsonc -- --keep-vars");
    expect(workflow).not.toMatch(/(?:NEXT_PUBLIC_)?DAO_PUBLICATION_ENABLED|DAO_PINATA_JWT/);
    expect(production.vars).not.toHaveProperty("DAO_PUBLICATION_ENABLED");
    expect(production.vars).not.toHaveProperty("DAO_PINATA_JWT");
  });

  it("preserves the production Worker, route, assets, and self reference", () => {
    expect(production.name).toBe("governance-apps");
    expect(preprod.name).toBe("governance-apps-preprod");
    expect(production.routes).toEqual([{ pattern: "app.dao-ops.com", custom_domain: true }]);
    expect(production.assets).toEqual({ directory: ".open-next/assets", binding: "ASSETS" });
    expect(production.services).toEqual([{ binding: "WORKER_SELF_REFERENCE", service: "governance-apps" }]);
    expect(preprod.services).toEqual([{ binding: "WORKER_SELF_REFERENCE", service: "governance-apps-preprod" }]);
    for (const config of [production, preprod]) {
      expect(config.routes.some((route: { pattern: string }) => route.pattern.includes("dao.yearn.fi"))).toBe(false);
    }
  });

  it("preserves the shared database and identical approved publication policy", () => {
    const binding = [{ binding: "DAO_PUBLICATION_DB", database_name: "dao-publication",
      database_id: "66d8bf6b-9b2c-41d2-afa1-19647ea9725e", migrations_dir: "migrations/dao-publication" }];
    expect(production.d1_databases).toEqual(binding);
    expect(preprod.d1_databases).toEqual(binding);
    expect(production.vars.DAO_PUBLICATION_LIMITS).toBe(preprod.vars.DAO_PUBLICATION_LIMITS);
    expect(JSON.parse(production.vars.DAO_PUBLICATION_LIMITS)).toEqual({
      hourlyDocuments: 10, dailyDocuments: 30, monthlyDocuments: 100, documents: 400,
      bytes: 52428800, concurrent: 2, uploadAttempts: 1200, documentUploadAttempts: 3,
      retrievalAttempts: 2400, documentRetrievalAttempts: 6, documentReservations: 6,
    });
    // Deployment overrides must not silently replace the conservative application defaults.
    expect(DAO_PUBLICATION_DEFAULT_LIMITS).toMatchObject({ hourlyDocuments: 2, documents: 300, uploadAttempts: 500 });
  });
});

describe("web worker observability", () => {
  const expectedObservabilityConfig = [
    '  "observability": {',
    '    "enabled": true,',
    '    "head_sampling_rate": 1,',
    '    "logs": {',
    '      "enabled": true,',
    '      "head_sampling_rate": 1,',
    '      "invocation_logs": true,',
    '      "persist": true',
  ].join("\n");

  for (const relativePath of ["wrangler.jsonc", "wrangler.preprod.jsonc"]) {
    it(`${relativePath} persists sampled invocation logs`, () => {
      const wranglerConfig = readFileSync(
        path.resolve(process.cwd(), relativePath),
        "utf8"
      );

      expect(wranglerConfig).toContain(expectedObservabilityConfig);
    });
  }
});
