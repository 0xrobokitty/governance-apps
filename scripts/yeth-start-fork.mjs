// Read-only upstream, isolated chain identity, and a loopback-only transaction node.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
if (process.env.NODE_ENV === "production") throw new Error("Fork UAT is disabled in production.");
const source = process.env.YETH_FORK_SOURCE_RPC ?? process.env.NEXT_PUBLIC_RPC_URLS?.split(",")[0]?.trim();
if (!source) throw new Error("Set YETH_FORK_SOURCE_RPC to an Ethereum RPC with archive reads.");
const port = process.env.YETH_FORK_PORT ?? "18546";
if (!/^[0-9]+$/.test(port)) throw new Error("Invalid fork port.");
const args = ["--host", "127.0.0.1", "--port", port, "--chain-id", "31337", "--block-time", "2", "--fork-url", source, "--silent"];
if (process.env.YETH_FORK_BLOCK) {
  if (!/^[0-9]+$/.test(process.env.YETH_FORK_BLOCK)) throw new Error("Invalid fork block.");
  args.push("--fork-block-number", process.env.YETH_FORK_BLOCK);
}
const child = spawn(process.env.ANVIL ?? "anvil", args, { stdio: ["ignore", "ignore", "pipe"] });
child.stderr.on("data", () => { /* RPC diagnostics can contain private upstream credentials. */ });
child.on("error", () => { console.error("Could not start the disposable yETH fork."); process.exitCode = 1; });
child.on("exit", code => { if (code) { console.error("Disposable yETH fork stopped with exit code " + code); process.exitCode = code; } });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
console.log("Local Ethereum fork · test funds: http://127.0.0.1:" + port + " (chain 31337)");
