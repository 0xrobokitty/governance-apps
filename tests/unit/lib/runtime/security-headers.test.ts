import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildPermissionsPolicy,
  buildSecurityHeaders,
  PERMISSIONS_POLICY_HEADER,
  resolveAdditionalConnectSrc,
  SAFE_APP_FRAME_ANCESTORS,
  resolveAddressLabelsFrameSource,
} from "@/lib/runtime/security-headers";

describe("security header policy", () => {
  it("permits only the paired YBC storage document as an additional frame", () => {
    expect(resolveAddressLabelsFrameSource("dao.yearn.fi")).toBe("https://ybc.yearn.fi/api/address-labels");
    expect(resolveAddressLabelsFrameSource("dao-beta.dao-ops.com")).toBe("https://ybc-beta.dao-ops.com/api/address-labels");
    for (const host of ["evil.yearn.fi", "dao.yearn.fi.evil.test", "app.dao-ops.com", "localhost"]) {
      expect(resolveAddressLabelsFrameSource(host)).toBeNull();
    }
    const base = { nonce: "abc", isDevelopment: false, isProduction: true };
    const csp = buildContentSecurityPolicy({ ...base, addressLabelsFrameSource: resolveAddressLabelsFrameSource("dao.yearn.fi") });
    expect(csp).toContain("https://ybc.yearn.fi/api/address-labels");
    expect(csp).not.toContain("ybc-beta.dao-ops.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(buildContentSecurityPolicy({ ...base, addressLabelsFrameSource: "https://evil.test" })).not.toContain("evil.test");
    expect(buildContentSecurityPolicy(base)).not.toContain("ybc.yearn.fi");
  });
  it("uses nonce-based script policy without unsafe-inline scripts", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "abc123",
      isDevelopment: false,
      isProduction: true,
    });

    expect(csp).toContain("script-src 'self' 'nonce-abc123'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows localhost transports in development", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "abc123",
      isDevelopment: true,
      isProduction: false,
    });

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("http://localhost:*");
    expect(csp).toContain("http://127.0.0.1:*");
    expect(csp).toContain("ws://localhost:*");
    expect(csp).toContain("ws://127.0.0.1:*");
  });

  it("allows explicitly configured RPC origins in connect-src", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "abc123",
      isDevelopment: false,
      isProduction: false,
      additionalConnectSrc: ["http://178.63.2.245", "https://rpc.example"],
    });

    expect(csp).toContain("connect-src");
    expect(csp).toContain("http://178.63.2.245");
    expect(csp).toContain("https://rpc.example");
  });

  it("supports unsafe-inline scripts for static-friendly pages", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "abc123",
      isDevelopment: false,
      isProduction: true,
      allowUnsafeInlineScripts: true,
    });

    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'nonce-abc123'");
  });

  it("allows Safe wallet iframe ancestors only when explicitly enabled", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "abc123",
      isDevelopment: false,
      isProduction: true,
      allowSafeFrameEmbedding: true,
    });

    const allowedSafeAncestors = SAFE_APP_FRAME_ANCESTORS.join(" ");
    expect(csp).toContain(`frame-ancestors ${allowedSafeAncestors}`);
    expect(csp).not.toContain("frame-ancestors 'none'");
  });

  it("builds stricter browser security headers", () => {
    const headers = buildSecurityHeaders({
      nonce: "abc123",
      isDevelopment: false,
      isProduction: true,
    });

    expect(headers["Permissions-Policy"]).toBe(buildPermissionsPolicy());
    expect(headers["Cross-Origin-Opener-Policy"]).toBe(
      "same-origin-allow-popups"
    );
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-site");
    expect(headers["Origin-Agent-Cluster"]).toBe("?1");
  });

  it("formats Permissions-Policy with comma-separated directives", () => {
    const policy = buildPermissionsPolicy();
    expect(policy).toBe(PERMISSIONS_POLICY_HEADER);
    expect(policy).not.toContain(";");
    expect(policy).not.toContain("browsing-topics");
  });

  it("resolves additional connect-src origins from env URLs", () => {
    const origins = resolveAdditionalConnectSrc({
      NEXT_PUBLIC_RPC_URLS: "http://127.0.0.1:8545, https://rpc.example/path",
      NEXT_PUBLIC_GLOBAL_DATA_URL: "https://cdn.example/stats.json",
      NEXT_PUBLIC_TEAMS_DATA_URL: "https://teams-data.example/prod/teams.json",
      NEXT_PUBLIC_YETH_GLOBAL_DATA_URL: "https://cdn.example/yeth.json",
      NEXT_PUBLIC_YBC_DATA_URL: "https://ybc-data.example/prod/ybc.json",
      NEXT_PUBLIC_DAO_VOTING_POWER_URL: "https://governance-data.example/voting-power.json",
    });

    expect(origins).toEqual([
      "http://127.0.0.1:8545",
      "https://rpc.example",
      "https://cdn.example",
      "https://teams-data.example",
      "https://ybc-data.example",
      "https://governance-data.example",
    ]);
  });
});

it.each([true, false])("permits the exact SDK verification iframe in development=%s", (isDevelopment) => {
  const csp = buildContentSecurityPolicy({
    nonce: "wallet-test", isDevelopment, isProduction: !isDevelopment,
  });
  const frameSources = csp.split(";").find((directive) => directive.trim().startsWith("frame-src "))!;
  expect(frameSources.split(/\s+/)).toContain("https://verify.walletconnect.org");
  expect(frameSources).not.toContain("https://*.walletconnect.org");
  expect(csp).toContain("frame-ancestors 'none'");
});
