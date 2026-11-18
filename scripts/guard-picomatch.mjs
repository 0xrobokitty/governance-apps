import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { packages } = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const checkOnly = process.argv[2] === "--check";

// Match the parser branches that emit the repeated extglob operators. Only
// apply this edit to exact, reviewed source bytes, including embedded copies.
const repeatBranch = /\b\w+\((['"])(?:plus|star)\1,\s*\w+\);\s*continue\b;?/g;
const guard = "throw new SyntaxError('Repeated extglobs are disabled (GHSA-fc5q-39xc-vjpf)');";
const upstreamParsers = {
  "2.3.2": [
    "3a91656f440069aa8f8e15c9d695b9f6b2209df1eab2be8127c72cbcca45ff5f",
    "079e69ebb39a85615c78b8eb2d3e09d17bd870d0a157e1fbce657ee4cc8ae0f4",
  ],
  "4.0.7": [
    "4e1e05447668aa1e94366c5516a2bcd8f5fff800cc92b1d0cd7d77703b8618c4",
    "627d5dc22bd4f7c9a5467863e576bcc9c36ad45effab451935a1f6cbe7ffdfb2",
  ],
};
const bundledParsers = [
  ["node_modules/next", "16.4.5", "dist/compiled/picomatch/index.js",
    "607dc79784c1161c33076903769dba23e63d9d9ccfe3c4695a32ebe3a5ab892d",
    "34594982883f057cbc79a8f723730c6ad5e7848a245f7d59fc31d9523633d747"],
  ["node_modules/playwright", "1.57.0", "lib/utilsBundleImpl.js",
    "122ed1a77842db055083e61a181813f2887dc786d176b8e820b8444d2b78f7a6",
    "fd21b872fdd6af1345ae8d1a50f06f7fcea020a2c6b209aae09430cbecb738cf"],
  ["node_modules/playwright", "1.57.0", "lib/common/expectBundleImpl.js",
    "f4adea36440589c98c4041ee5fb50f727ab18dcfa122df753193e77ab4f6ad1d",
    "b729957b761afa12261b29f4fc01a34b42a91d591b5422eda8c4360901b8240e"],
  ["node_modules/@dotenvx/primitives", "3.3.1", "dist/index.cjs",
    "e8723d9ae47e53e996685d88d2409a04bad627c755cfd935803b9e3d16d2df09",
    "8c69e82ff51670d37f4889fd276c28ea61a43b314c1f6397e405ab57a6bcc8d6"],
];

const sha256 = (contents) => createHash("sha256").update(contents).digest("hex");

function getEdits(directory, version, entry, originalHash, patchedHash) {
  const location = directory + "/" + entry;
  const installed = path.join(root, directory);
  if (packages[directory]?.version !== version) {
    throw new Error("Review the picomatch guard for the lockfile change at " + directory);
  }
  // npm ci --omit=dev leaves out some of the standalone parsers.
  if (packages[directory].dev && !fs.existsSync(installed)) {
    return [];
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8"));
  if (manifest.version !== version) {
    throw new Error("Unexpected installed version at " + directory + ". Run npm ci.");
  }
  const file = path.join(root, location);
  const original = fs.readFileSync(file);
  const hash = sha256(original);
  if (hash === patchedHash) return [];
  if (hash !== originalHash) {
    throw new Error("Unexpected parser checksum at " + location + ". Review the picomatch guard.");
  }
  if (checkOnly) {
    throw new Error("Missing picomatch guard at " + location + ". Run npm ci with scripts enabled.");
  }
  const patched = original.toString("utf8").replace(repeatBranch, guard);
  if (sha256(patched) !== patchedHash) {
    throw new Error("Unexpected picomatch guard output at " + location);
  }
  return [{ file, patched }];
}

function writeEdit({ file, patched }) {
  const temporary = file + "." + randomUUID();
  try {
    fs.writeFileSync(temporary, patched, { flag: "wx", mode: fs.statSync(file).mode });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

const standaloneParsers = Object.entries(packages).flatMap(([directory, { version }]) => {
  if (!/(?:^|\/)node_modules\/picomatch$/.test(directory)) return [];
  const hashes = upstreamParsers[version];
  if (!hashes) throw new Error("Review the picomatch guard for version " + version);
  return [[directory, version, "lib/parse.js", ...hashes]];
});
// Check every file before writing any changes. A rerun also accepts files
// already patched, including after an interrupted install.
const edits = [...standaloneParsers, ...bundledParsers].flatMap((parser) => getEdits(...parser));
edits.forEach(writeEdit);
if (edits.length) console.log("Applied the picomatch guard to " + edits.length + " files.");
