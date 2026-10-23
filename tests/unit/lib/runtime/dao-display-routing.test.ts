import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

describe("DAO display resource routing", () => {
  it.each(["dao.yearn.fi", "dao-beta.dao-ops.com", "app.dao-ops.com"])("serves public corrections without an app rewrite on %s", (hostname) => {
    for (const method of ["GET", "HEAD"]) {
      const response = middleware(new NextRequest(`https://${hostname}/dao-title-overrides.json`, { method }));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("content-security-policy")).toBeTruthy();
    }
  });

  it("leaves only the exact bridge endpoint responsible for its framing policy", () => {
    const response = middleware(new NextRequest("https://ybc.yearn.fi/api/address-labels"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-frame-options")).toBeNull();
    for (const path of ["/api/other", "/api/address-labels/extra", "/"]) {
      expect(middleware(new NextRequest(`https://ybc.yearn.fi${path}`)).headers.get("content-security-policy")).toBeTruthy();
    }
  });
});
