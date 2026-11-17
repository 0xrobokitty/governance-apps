import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { GOVERNANCE_APP_PATHS, GOVERNANCE_APP_PROD_HOSTS, GOVERNANCE_APP_PREPROD_HOSTS, type GovernanceApp } from "@/lib/runtime/governance-hosts";
describe("app security policy parity", () => {
  it.each(Object.keys(GOVERNANCE_APP_PATHS) as GovernanceApp[])("applies the same script and frame policy to %s paths and hosts", (app) => {
    for (const url of [
      "https://app.dao-ops.com" + GOVERNANCE_APP_PATHS[app],
      "https://app.dao-ops.com" + GOVERNANCE_APP_PATHS[app] + "/detail",
      "https://" + GOVERNANCE_APP_PROD_HOSTS[app] + "/",
      "https://" + GOVERNANCE_APP_PREPROD_HOSTS[app] + "/",
    ]) {
      const response = middleware(new NextRequest(url));
      const policy = response.headers.get("content-security-policy")!;
      expect(policy).toContain("'nonce-");
      expect(policy.split(";").find((part) => part.trim().startsWith("script-src "))).not.toContain("'unsafe-inline'");
      expect(response.headers.get("x-frame-options")).toBe(app === "pulse" ? "DENY" : null);
      expect(policy).toContain(app === "pulse" ? "frame-ancestors 'none'" : "frame-ancestors https://app.safe.global");
    }
  });
});
