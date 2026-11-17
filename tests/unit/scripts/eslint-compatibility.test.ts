import { ESLint } from "eslint";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const projectRequire = createRequire(import.meta.url);
const directories: string[] = [];
function fixture(files: string[]) {
  const directory = mkdtempSync(path.join(tmpdir(), "eslint-glob-compatibility-"));
  directories.push(directory);
  for (const file of files) {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "debugger;");
  }
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("ESLint 10 compatibility", () => {
  it("keeps file discovery, dotfiles, and ignore rules consistent", async () => {
    const directory = fixture(["src/main.js", "src/.hidden.js", "src/nested/helper.cjs", "src/drop.skip.js", "generated/drop.js"]);
    const eslint = new ESLint({
      cwd: directory, overrideConfigFile: true,
      overrideConfig: [
        { ignores: ["generated/**", "**/*.skip.js"] },
        { files: ["**/*.{js,cjs}"], rules: { "no-debugger": "error" } },
      ],
    });
    const results = await eslint.lintFiles(["**/*.{js,cjs}"]);
    expect(results.map(result => path.relative(directory, result.filePath)).sort()).toEqual([
      "src/.hidden.js", "src/main.js", "src/nested/helper.cjs",
    ]);
    for (const result of results) expect(result.messages.map(message => message.ruleId)).toEqual(["no-debugger"]);
  });

  it("preserves the TypeScript default-project glob boundary", () => {
    const directory = fixture([".config.ts", "nested/config.ts", "src/included.ts"]);
    writeFileSync(path.join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022" }, include: ["src/**/*.ts"] }));
    const estree = projectRequire("@typescript-eslint/typescript-estree") as typeof import("@typescript-eslint/typescript-estree");
    const options = { tsconfigRootDir: directory, projectService: { allowDefaultProject: ["*.ts"] } };
    try {
      const parsed = estree.parseAndGenerateServices("const value = 1;", { ...options, filePath: path.join(directory, ".config.ts") });
      expect(parsed.ast.type).toBe("Program");
      expect(parsed.services.program).toBeDefined();
      expect(() => estree.parseAndGenerateServices("const value = 1;", { ...options, filePath: path.join(directory, "nested/config.ts") })).toThrow(/not found by the project service/);
    } finally {
      estree.clearCaches();
    }
  });

  it.each(["eslint-plugin-import", "eslint-plugin-jsx-a11y", "eslint-plugin-react"])("preserves %s's legacy callable matcher", (plugin) => {
    const pluginRequire = createRequire(projectRequire.resolve(plugin));
    const match = pluginRequire("minimatch") as (value: string, pattern: string) => boolean;
    expect(match("ActionButton", "*Button")).toBe(true);
    expect(match("ActionLink", "*Button")).toBe(false);
  });

  it("preserves React, hooks, accessibility, and TypeScript diagnostics", async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText(`
      import { useState } from "react";
      export default function Example({ enabled }: { enabled: boolean }) {
        if (enabled) useState(0);
        const unused = 1;
        return <><Unknown /><img src="/example.png" /></>;
      }
    `, { filePath: "app/lint-compatibility-fixture.tsx" });

    expect(result.fatalErrorCount).toBe(0);
    expect(result.messages.map((message) => message.ruleId)).toEqual(
      expect.arrayContaining([
        "react/jsx-no-undef",
        "react-hooks/rules-of-hooks",
        "jsx-a11y/alt-text",
        "@typescript-eslint/no-unused-vars",
      ])
    );
  });
});
