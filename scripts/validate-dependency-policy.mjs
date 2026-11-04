#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const packageJsonPath = path.join(ROOT, "package.json");
const packageLockPath = path.join(ROOT, "package-lock.json");
const npmReleaseAgeOverridePath = path.join(
  ROOT,
  ".github",
  "npm-release-age-overrides.json"
);
const maxReleaseAgeOverrideDays = 14;
const msPerDay = 24 * 60 * 60 * 1000;

const allowedInstallScriptPackages = new Map([
  [
    "node_modules/@opennextjs/aws/node_modules/esbuild@0.28.2",
    "OpenNext AWS adapter uses esbuild's platform binary validation.",
  ],
  [
    "node_modules/esbuild@0.28.1",
    "Wrangler uses esbuild's platform binary validation.",
  ],
  [
    "node_modules/fsevents@2.3.3",
    "Optional macOS file watcher dependency captured in the lockfile.",
  ],
  [
    "node_modules/playwright/node_modules/fsevents@2.3.2",
    "Optional macOS file watcher dependency captured by Playwright.",
  ],
  [
    "node_modules/unrs-resolver@1.11.1",
    "Resolver package validates its native binding selection after install.",
  ],
  [
    "node_modules/workerd@1.20261006.1",
    "Cloudflare worker tooling validates the workerd runtime binary.",
  ],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isExactSemverSpecifier(version) {
  if (typeof version !== "string") return false;
  const normalized = version.trim();
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    normalized
  );
}

function isExactNpmPackageManager(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return /^npm@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    normalized
  );
}

function npmVersionFromPackageManager(value) {
  if (!isExactNpmPackageManager(value)) return null;
  return value.trim().slice("npm@".length);
}

function isAllowedOverrideSpecifier(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return normalized.startsWith("$");
}

// TypeScript 7 supplies the CLI; Next.js and ESLint still need the 6.x API.
// Only these documented development aliases may use an npm protocol specifier.
const typescriptTransitionAliases = new Map([
  ["@typescript/native", "typescript"],
  ["typescript", "@typescript/typescript6"],
]);

function isPinnedTypeScriptAlias(sectionName, name, version) {
  if (sectionName !== "devDependencies" || typeof version !== "string") {
    return false;
  }
  const target = typescriptTransitionAliases.get(name);
  if (!target) return false;
  const prefix = `npm:${target}@`;
  return version.startsWith(prefix) &&
    isExactSemverSpecifier(version.slice(prefix.length));
}

function assertPinnedSection(sectionName, deps = {}) {
  const offenders = Object.entries(deps).filter(([name, version]) =>
    !isExactSemverSpecifier(version) &&
    !isPinnedTypeScriptAlias(sectionName, name, version)
  );
  if (offenders.length === 0) return [];
  return offenders.map(
    ([name, version]) =>
      `${sectionName}:${name}@${version} (must be exact semver)`
  );
}

function assertPinnedOverrides(overrides, pathPrefix = "overrides") {
  if (overrides === null || overrides === undefined) return [];
  if (typeof overrides !== "object") {
    return [`${pathPrefix} must be an object`];
  }

  const violations = [];

  for (const [name, value] of Object.entries(overrides)) {
    const entryPath = `${pathPrefix}:${name}`;

    if (typeof value === "string") {
      if (
        !isExactSemverSpecifier(value) &&
        !isAllowedOverrideSpecifier(value)
      ) {
        violations.push(
          `${entryPath}@${value} (must be exact semver or $reference)`
        );
      }
      continue;
    }

    if (value !== null && typeof value === "object") {
      violations.push(...assertPinnedOverrides(value, entryPath));
      continue;
    }

    violations.push(`${entryPath} has unsupported value type`);
  }

  return violations;
}

function packageNameFromLockPath(lockPath) {
  const marker = "node_modules/";
  const markerIndex = lockPath.lastIndexOf(marker);
  if (markerIndex === -1) return lockPath;

  const packagePath = lockPath.slice(markerIndex + marker.length);
  const parts = packagePath.split("/");

  if (parts[0]?.startsWith("@")) {
    return `${parts[0]}/${parts[1]}`;
  }

  return parts[0];
}

function lockPackageKey(lockPath, packageInfo) {
  return `${lockPath}@${packageInfo.version}`;
}

function assertAllowedInstallScripts(lock) {
  if (!lock?.packages || typeof lock.packages !== "object") return [];

  const violations = [];
  const seenAllowlistedEntries = new Set();

  for (const [lockPath, packageInfo] of Object.entries(lock.packages)) {
    if (!packageInfo?.hasInstallScript) continue;

    const key = lockPackageKey(lockPath, packageInfo);
    if (!allowedInstallScriptPackages.has(key)) {
      const packageName = packageNameFromLockPath(lockPath);
      violations.push(
        `${packageName}@${packageInfo.version} declares an install script at ${lockPath}; add a reviewed allowlist entry before merging`
      );
      continue;
    }

    seenAllowlistedEntries.add(key);
  }

  for (const key of allowedInstallScriptPackages.keys()) {
    if (!seenAllowlistedEntries.has(key)) {
      violations.push(
        `install script allowlist entry is stale or no longer has an install script: ${key}`
      );
    }
  }

  return violations;
}

function getRunningNpmVersion() {
  return execFileSync("npm", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function utcDateStart(date) {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
}

function parseUtcDateStart(dateString) {
  if (typeof dateString !== "string") return Number.NaN;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return Number.NaN;
  const timestamp = Date.parse(`${dateString}T00:00:00.000Z`);
  return Number.isNaN(timestamp) ? Number.NaN : timestamp;
}

function isLockedPackageVersion(lock, packageName, version) {
  if (!lock?.packages || typeof lock.packages !== "object") return false;

  return Object.entries(lock.packages).some(([lockPath, packageInfo]) => {
    if (!lockPath.startsWith("node_modules/")) return false;
    return (
      packageNameFromLockPath(lockPath) === packageName &&
      packageInfo?.version === version
    );
  });
}

function assertNpmReleaseAgeOverrides(lock) {
  if (!fs.existsSync(npmReleaseAgeOverridePath)) return [];

  const violations = [];
  const parsed = readJson(npmReleaseAgeOverridePath);

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.overrides)
  ) {
    return [
      ".github/npm-release-age-overrides.json must contain an overrides array",
    ];
  }

  const today = utcDateStart(new Date());
  const maxExpiry = today + maxReleaseAgeOverrideDays * msPerDay;

  parsed.overrides.forEach((entry, index) => {
    const prefix = `release-age override ${index + 1}`;

    if (entry === null || typeof entry !== "object") {
      violations.push(`${prefix} must be an object`);
      return;
    }

    if (typeof entry.package !== "string" || entry.package.trim() === "") {
      violations.push(`${prefix} must include a package name`);
    }

    if (!isExactSemverSpecifier(entry.version)) {
      violations.push(`${prefix} must include an exact semver version`);
    }

    const expires = parseUtcDateStart(entry.expires);
    if (Number.isNaN(expires)) {
      violations.push(`${prefix} must include expires as YYYY-MM-DD`);
    } else {
      if (expires < today) {
        violations.push(`${prefix} expired on ${entry.expires}`);
      }

      if (expires > maxExpiry) {
        violations.push(
          `${prefix} expires more than ${maxReleaseAgeOverrideDays} days from today`
        );
      }
    }

    if (typeof entry.reason !== "string" || entry.reason.trim().length < 12) {
      violations.push(`${prefix} must include a specific reason`);
    }

    if (
      typeof entry.reference !== "string" ||
      !entry.reference.startsWith("https://")
    ) {
      violations.push(`${prefix} must include an https reference URL`);
    }

    if (
      typeof entry.package === "string" &&
      isExactSemverSpecifier(entry.version) &&
      lock &&
      !isLockedPackageVersion(lock, entry.package, entry.version)
    ) {
      violations.push(
        `${prefix} references ${entry.package}@${entry.version}, which is not present in package-lock.json`
      );
    }
  });

  return violations;
}

const pkg = readJson(packageJsonPath);
const lockExists = fs.existsSync(packageLockPath);
const lock = lockExists ? readJson(packageLockPath) : null;

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const pinViolations = dependencySections.flatMap((sectionName) =>
  assertPinnedSection(sectionName, pkg[sectionName])
);
pinViolations.push(...assertPinnedOverrides(pkg.overrides));

if (!isExactNpmPackageManager(pkg.packageManager)) {
  pinViolations.push(
    "packageManager must be set to an exact npm version (for example: npm@11.14.0)"
  );
} else {
  const expectedNpmVersion = npmVersionFromPackageManager(pkg.packageManager);
  const runningNpmVersion = getRunningNpmVersion();

  if (runningNpmVersion !== expectedNpmVersion) {
    pinViolations.push(
      `running npm version ${runningNpmVersion} does not match packageManager npm@${expectedNpmVersion}`
    );
  }
}

if (!lockExists) {
  pinViolations.push("package-lock.json is required");
}

if (lock && (typeof lock.lockfileVersion !== "number" || lock.lockfileVersion < 3)) {
  pinViolations.push("package-lock.json must use lockfileVersion >= 3");
}

pinViolations.push(...assertAllowedInstallScripts(lock));
pinViolations.push(...assertNpmReleaseAgeOverrides(lock));

if (pinViolations.length > 0) {
  console.error("Dependency policy validation failed:");
  for (const violation of pinViolations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Dependency policy validation passed.");
