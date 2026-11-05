// Run the normal injected-wallet browser flow from an EIP-7702-designated account.
// The local state fixture installs the delegation marker directly; this does not test authorization signing.
const rpcURL = process.env.YETH_FORK_RPC_URL ?? "http://127.0.0.1:18546";
const url = new URL(rpcURL);
if (process.env.NODE_ENV === "production" || !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) {
  throw new Error("Delegated UAT requires a development loopback RPC.");
}
const rpc = async (method, params = []) => {
  const response = await fetch(rpcURL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
};
const assertFork = async () => {
  if (await rpc("eth_chainId") !== "0x7a69") throw new Error("Refusing a nonfork chain.");
  await rpc("anvil_nodeInfo");
};
await assertFork();
const before = await rpc("evm_snapshot");
const account = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const delegate = "0x000000000000000000000000000000000000d1e6";
const designation = "0xef0100" + delegate.slice(2);
process.env.YETH_UAT_OUTPUT = ".local/yeth/delegated-browser";
try {
  await rpc("anvil_setCode", [delegate, "0x00"]);
  await rpc("anvil_setCode", [account, designation]);
  if (await rpc("eth_getCode", [account, "latest"]) !== designation) throw new Error("Delegation fixture was not installed.");
  await import("./yeth-browser-uat.mjs");
  if (await rpc("eth_getCode", [account, "latest"]) !== designation) throw new Error("The account lost its delegation during UAT.");
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(process.env.YETH_UAT_OUTPUT, { recursive: true });
  await writeFile(process.env.YETH_UAT_OUTPUT + "/delegation.json", JSON.stringify({
    status: "passed", account, delegate, designation,
    proof: "Normal injected connector and actual outgoing transactions from a designated EOA on Anvil; designation installed as a local fixture, authorization signing not tested",
  }, null, 2));
  console.log("PASS delegated account retained EIP7702 code through the injected-wallet browser flow");
} finally {
  await assertFork();
  if (await rpc("evm_revert", [before]) !== true) throw new Error("Failed to restore delegated UAT fork snapshot.");
}
