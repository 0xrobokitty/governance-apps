import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const projectRequire = createRequire(import.meta.url);
const cloudflareRequire = createRequire(projectRequire.resolve("@opennextjs/cloudflare"));
const eslintRequire = createRequire(projectRequire.resolve("eslint"));
const { glob, globStream, globSync } = cloudflareRequire("glob") as typeof import("glob");
const directories: string[] = [];

function fixture(files: string[]) {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "glob-compatibility-"));
  directories.push(directory);
  for (const file of files) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "{}");
  }
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("installed glob and minimatch compatibility", () => {
  it("discovers OpenNext manifests in route groups and parameter directories", async () => {
    const directory = fixture([
      ".next/server/app/(group)/page.js.nft.json",
      ".next/server/app/[id]/page.js.nft.json",
      ".next/server/middleware.js.nft.json",
      ".next/required-server-files.json",
      ".next/server/app/build-manifest.json",
    ]);
    const cwd = path.join(directory, ".next/server");
    const options = { cwd, absolute: true, windowsPathsNoEscape: true, ignore: "middleware.js.nft.json" };
    const expected = ["app/(group)/page.js.nft.json", "app/[id]/page.js.nft.json"];
    expect(globSync("**/*.nft.json", options).map(file => path.relative(cwd, file)).sort()).toEqual(expected);
    expect((await glob("**/*.nft.json", options)).map(file => path.relative(cwd, file)).sort()).toEqual(expected);
    expect(globSync(path.join(directory, ".next/**/{*-manifest,required-server-files}.json"), {
      windowsPathsNoEscape: true, nodir: true,
    }).map(file => path.relative(directory, file)).sort()).toEqual([
      ".next/required-server-files.json", ".next/server/app/build-manifest.json",
    ]);
  });

  it("preserves the Path objects used by OpenNext's cache upload", () => {
    const directory = fixture(["cache/__fetch/build/key with spaces", "cache/build/app/[id].cache"]);
    const entries = globSync(path.join(directory, "cache/**/*"), { withFileTypes: true, windowsPathsNoEscape: true });
    expect(entries.filter(entry => entry.isFile()).map(entry => path.relative(directory, entry.fullpath())).sort()).toEqual([
      "cache/__fetch/build/key with spaces", "cache/build/app/[id].cache",
    ]);
  });

  it.each(["promise", "stream"] as const)("stops filesystem traversal after %s cancellation", async (api) => {
    const directory = fixture(Array.from({ length: 12 }, (_, index) => `branch-${index}/nested/file.txt`));
    const controller = new AbortController();
    let reads = 0;
    const trackedFs = {
      ...fs,
      readdir: ((directory: fs.PathLike, options: { withFileTypes: true }, callback: (error: NodeJS.ErrnoException | null, entries: fs.Dirent[]) => void) => {
        reads++;
        fs.readdir(directory, options, (error, entries) => {
          if (reads === 1) controller.abort(new Error("probe-abort"));
          callback(error, entries);
        });
      }) as typeof fs.readdir,
    };
    const options = { cwd: directory, fs: trackedFs, signal: controller.signal };
    const walk = async () => {
      if (api === "promise") await glob("**/*", options);
      else for await (const entry of globStream("**/*", options)) void entry;
    };
    await expect(walk()).rejects.toThrow("probe-abort");
    const readsAtRejection = reads;
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(readsAtRejection).toBe(1);
    expect(reads).toBe(readsAtRejection);
  });

  it("rejects globstar parent-pattern amplification with the default preprocessing limits", () => {
    const script = `
      const { Minimatch } = require(process.argv[1]);
      try {
        new Minimatch("a/**/../".repeat(18) + "leaf", { optimizationLevel: 2 });
        throw new Error("Unbounded pattern was accepted");
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        process.stdout.write("bounded");
      }
    `;
    expect(execFileSync(process.execPath, ["--max-old-space-size=128", "-e", script, eslintRequire.resolve("minimatch")], {
      encoding: "utf8", timeout: 5000,
    })).toBe("bounded");
  });
});
