import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";

// Resolve through OpenNext so these checks exercise its installed dependency chain.
const projectRequire = createRequire(import.meta.url);
const cloudflareRequire = createRequire(projectRequire.resolve("@opennextjs/cloudflare"));
const minifyModule = cloudflareRequire.resolve("@opennextjs/aws/minimize-js.js");
const awsRequire = createRequire(minifyModule);
const directories: string[] = [];

function fixtureDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "opennext-minifier-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("OpenNext minifier dependency compatibility", () => {
  it("minifies nested JavaScript through OpenNext's actual wrapper", async () => {
    const directory = fixtureDirectory();
    const nested = path.join(directory, "nested");
    mkdirSync(nested);
    writeFileSync(path.join(directory, "package.json"), '{"type":"module"}');
    const filename = path.join(nested, "bundle.js");
    const original = "/* minifier fixture */ export function answer(value) { const doubled = value * 2; return doubled + 2; }";
    writeFileSync(filename, original);

    const { minifyAll } = await import(pathToFileURL(minifyModule).href) as {
      minifyAll(directory: string, options: { module: boolean; mangle: boolean }): Promise<void>;
    };
    await minifyAll(directory, { module: true, mangle: false });

    expect(readFileSync(filename, "utf8")).not.toBe(original);
    expect(readFileSync(filename, "utf8")).not.toContain("minifier fixture");
    const output = await import(pathToFileURL(filename).href) as {
      answer(value: number): number;
    };
    expect(output.answer(20)).toBe(42);
  });

  it.each(["string", "array"] as const)(
    "expands %s wildcard inputs through node-minify and terser",
    async (inputType) => {
      const directory = fixtureDirectory();
      const inputs = path.join(directory, "inputs");
      mkdirSync(inputs);
      for (const [filename, value] of [["first file.js", 20], ["second.js", 22]] as const) {
        writeFileSync(path.join(inputs, filename),
          `globalThis.values = (globalThis.values || []).concat(${value});`);
      }
      writeFileSync(path.join(inputs, "ignored.txt"), "not JavaScript");
      const pattern = path.join(inputs, "*.js");
      const output = path.join(directory, "result.js");
      const minify = awsRequire("@node-minify/core") as (options: {
        compressor: unknown; input: string | string[]; output: string;
      }) => Promise<unknown>;

      await minify({
        compressor: awsRequire("@node-minify/terser"),
        input: inputType === "array" ? [pattern] : pattern,
        output,
      });

      const context: { values?: number[] } = {};
      runInNewContext(readFileSync(output, "utf8"), context, { timeout: 1000 });
      expect(Array.from(context.values ?? []).sort()).toEqual([20, 22]);
    }
  );

  it("minifies a command-substitution filename without shell evaluation", () => {
    const directory = fixtureDirectory();
    const inputs = path.join(directory, "inputs");
    mkdirSync(inputs);
    writeFileSync(path.join(inputs, "$(touch injected).js"), "globalThis.answer = 6 * 7;");
    const output = path.join(directory, "result.js");
    const script = `
      const { createRequire } = require("node:module");
      const fromAws = createRequire(process.argv[1]);
      fromAws("@node-minify/core")({
        compressor: fromAws("@node-minify/terser"), input: process.argv[2], output: process.argv[3],
      }).catch(error => { console.error(error); process.exitCode = 1; });
    `;
    execFileSync(process.execPath, ["-e", script, minifyModule, path.join(inputs, "*.js"), output], {
      cwd: directory, timeout: 5000,
    });

    const context: { answer?: number } = {};
    runInNewContext(readFileSync(output, "utf8"), context, { timeout: 1000 });
    expect(context.answer).toBe(42);
    expect(existsSync(path.join(directory, "injected"))).toBe(false);
    expect(existsSync(path.join(inputs, "injected"))).toBe(false);
  });
});
