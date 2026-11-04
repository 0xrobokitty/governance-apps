import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve(
  process.cwd(),
  "scripts/validate-dependency-policy.mjs"
);

const createdDirs: string[] = [];
const runningNpmVersion = spawnSync("npm", ["--version"], {
  encoding: "utf8",
}).stdout.trim();
const exactNpmPackageManager = `npm@${runningNpmVersion}`;

const allowlistedInstallScriptLockPackages = {
  "node_modules/@opennextjs/aws/node_modules/esbuild": {
    version: "0.28.2",
    hasInstallScript: true,
  },
  "node_modules/esbuild": {
    version: "0.28.1",
    hasInstallScript: true,
  },
  "node_modules/fsevents": {
    version: "2.3.3",
    hasInstallScript: true,
  },
  "node_modules/playwright/node_modules/fsevents": {
    version: "2.3.2",
    hasInstallScript: true,
  },
  "node_modules/unrs-resolver": {
    version: "1.11.1",
    hasInstallScript: true,
  },
  "node_modules/workerd": {
    version: "1.20261006.1",
    hasInstallScript: true,
  },
};

function createTempRepo(options?: {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
  lockPackages?: Record<string, unknown>;
}) {
  const {
    packageManager = exactNpmPackageManager,
    dependencies = { foo: "1.0.0" },
    devDependencies = { bar: "2.0.0" },
    optionalDependencies = {},
    peerDependencies = {},
    overrides = {},
    lockPackages = {
      "node_modules/foo": { version: "1.0.0" },
      "node_modules/bar": { version: "2.0.0", dev: true },
      ...allowlistedInstallScriptLockPackages,
    },
  } = options ?? {};
  const dir = mkdtempSync(path.join(tmpdir(), "dep-policy-"));
  createdDirs.push(dir);

  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "tmp",
        version: "0.0.0",
        private: true,
        packageManager,
        dependencies,
        devDependencies,
        optionalDependencies,
        peerDependencies,
        overrides,
      },
      null,
      2
    )
  );

  writeFileSync(
    path.join(dir, "package-lock.json"),
    JSON.stringify(
      {
        name: "tmp",
        lockfileVersion: 3,
        packages: lockPackages,
      },
      null,
      2
    )
  );

  return dir;
}

function futureDate(daysFromNow: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function writeReleaseAgeOverrides(cwd: string, overrides: unknown[]) {
  const githubDir = path.join(cwd, ".github");
  mkdirSync(githubDir, { recursive: true });
  writeFileSync(
    path.join(githubDir, "npm-release-age-overrides.json"),
    JSON.stringify({ overrides }, null, 2)
  );
}

function runValidator(cwd: string) {
  return spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd,
    encoding: "utf8",
  });
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("validate-dependency-policy", () => {
  it("passes when packageManager pins an exact npm version", () => {
    const cwd = createTempRepo({ packageManager: exactNpmPackageManager });
    const result = runValidator(cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dependency policy validation passed.");
  });

  it("fails when packageManager does not pin an exact npm version", () => {
    const cwd = createTempRepo({ packageManager: "npm@latest" });
    const result = runValidator(cwd);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "packageManager must be set to an exact npm version"
    );
  });

  it("accepts the pinned TypeScript CLI and API development aliases", () => {
    const cwd = createTempRepo({
      devDependencies: {
        "@typescript/native": "npm:typescript@7.0.2",
        typescript: "npm:@typescript/typescript6@6.0.2",
      },
    });

    expect(runValidator(cwd).status).toBe(0);
  });

  it.each([
    ["@typescript/native", "npm:typescript@^7.0.2"],
    ["@typescript/native", "npm:typescript@latest"],
    ["@typescript/native", "npm:typescript"],
    ["@typescript/native", "npm:unreviewed-compiler@7.0.2"],
    ["typescript", "npm:@typescript/typescript6@~6.0.2"],
    ["typescript", "npm:@typescript/typescript6@next"],
    ["other", "npm:typescript@7.0.2"],
  ])("rejects an unpinned or unreviewed development alias %s@%s", (name, version) => {
    const cwd = createTempRepo({ devDependencies: { [name]: version } });

    expect(runValidator(cwd).status).not.toBe(0);
  });

  it.each(["dependencies", "optionalDependencies", "peerDependencies"])(
    "rejects TypeScript aliases in %s",
    (section) => {
      const cwd = createTempRepo({
        [section]: { "@typescript/native": "npm:typescript@7.0.2" },
      });

      expect(runValidator(cwd).status).not.toBe(0);
    }
  );

  it("fails when dependencies use non-semver tags", () => {
    const cwd = createTempRepo({
      dependencies: {
        foo: "latest",
      },
    });
    const result = runValidator(cwd);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "dependencies:foo@latest (must be exact semver)"
    );
  });

  it("fails when dependencies use git or protocol specifiers", () => {
    const cwd = createTempRepo({
      dependencies: {
        foo: "github:acme/foo#main",
      },
    });
    const result = runValidator(cwd);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "dependencies:foo@github:acme/foo#main (must be exact semver)"
    );
  });

  it("fails when optionalDependencies are not exact semver", () => {
    const cwd = createTempRepo({
      optionalDependencies: {
        baz: "^3.0.0",
      },
    });
    const result = runValidator(cwd);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "optionalDependencies:baz@^3.0.0 (must be exact semver)"
    );
  });

  it("fails when peerDependencies are not exact semver", () => {
    const cwd = createTempRepo({
      peerDependencies: {
        qux: ">=1.2.3",
      },
    });
    const result = runValidator(cwd);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "peerDependencies:qux@>=1.2.3 (must be exact semver)"
    );
  });

  it("fails when overrides use non-pinned specifiers", () => {
    const cwd = createTempRepo({
      overrides: {
        foo: "^1.0.0",
      },
    });
    const result = runValidator(cwd);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "overrides:foo@^1.0.0 (must be exact semver or $reference)"
    );
  });

  it("passes when overrides use dependency references", () => {
    const cwd = createTempRepo({
      dependencies: {
        foo: "1.0.0",
      },
      overrides: {
        foo: "$foo",
      },
    });
    const result = runValidator(cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dependency policy validation passed.");
  });

  it("fails when a locked package declares an unreviewed install script", () => {
    const cwd = createTempRepo({
      lockPackages: {
        "node_modules/foo": { version: "1.0.0" },
        "node_modules/bar": { version: "2.0.0", dev: true },
        ...allowlistedInstallScriptLockPackages,
        "node_modules/surprise-build": {
          version: "1.2.3",
          hasInstallScript: true,
        },
      },
    });
    const result = runValidator(cwd);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "surprise-build@1.2.3 declares an install script"
    );
  });

  it("passes with a non-expired release-age override for a locked package", () => {
    const cwd = createTempRepo();
    writeReleaseAgeOverrides(cwd, [
      {
        package: "foo",
        version: "1.0.0",
        expires: futureDate(7),
        reason: "Urgent security advisory validation",
        reference: "https://github.com/example/advisory",
      },
    ]);
    const result = runValidator(cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dependency policy validation passed.");
  });

  it("fails when a release-age override is expired", () => {
    const cwd = createTempRepo();
    writeReleaseAgeOverrides(cwd, [
      {
        package: "foo",
        version: "1.0.0",
        expires: futureDate(-1),
        reason: "Urgent security advisory validation",
        reference: "https://github.com/example/advisory",
      },
    ]);
    const result = runValidator(cwd);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("expired on");
  });
});
