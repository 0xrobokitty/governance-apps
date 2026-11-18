import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const root = process.cwd();
const matchers = [
  "node_modules/picomatch",
  "node_modules/tinyglobby/node_modules/picomatch",
  "node_modules/vite/node_modules/picomatch",
  "node_modules/vitest/node_modules/picomatch",
  "node_modules/next/dist/compiled/picomatch",
];

describe("locally guarded picomatch", () => {
  it("verifies every installed parser, including embedded copies", () => {
    execFileSync(process.execPath, ["scripts/guard-picomatch.mjs", "--check"], {
      cwd: root,
      timeout: 5_000,
    });
  });

  it.each(matchers)("%s rejects repetition and retains ordinary matching", (location) => {
    const matcher = require(path.join(root, location));
    expect(() => matcher.parse("+(blue)")).toThrow(/Repeated extglobs are disabled/);
    expect(() => matcher.makeRe("src/*(blue).ts")).toThrow(/Repeated extglobs are disabled/);
    const matches = matcher("src/**/file.{ts,tsx}");
    expect(matches("src/file.ts")).toBe(true);
    expect(matches("src/nested/file.tsx")).toBe(true);
    expect(matches("src/nested/file.js")).toBe(false);
    expect(matcher("src/!(index).ts")("src/file.ts")).toBe(true);
    expect(matcher("src/!(index).ts")("src/index.ts")).toBe(false);
  });
});
