import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

describe("DAO title correction resource", () => {
  it.each(["dao.yearn.fi", "dao-beta.dao-ops.com", "app.dao-ops.com"])("serves corrections without an app rewrite on %s", (hostname) => {
    for (const method of ["GET", "HEAD"]) {
      const response = middleware(new NextRequest(`https://${hostname}/dao-title-overrides.json`, { method }));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("content-security-policy")).toBeTruthy();
    }
  });
});
