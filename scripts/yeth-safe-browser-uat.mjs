// Synthetic Safe Apps host; real Safe 1.4.1 execution and recovery receipts on loopback Anvil.
// Requires an already running yETH fork preview and a partial auction fixture.
// This does not use the hosted Safe service, collect signatures, or submit public-network transactions.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, rename } from "node:fs/promises";
import {
  createPublicClient, createWalletClient, defineChain, http, parseAbi, erc20Abi,
  encodeFunctionData, decodeFunctionData, decodeEventLog, parseEther, toHex,
  concatHex, padHex, zeroAddress, keccak256,
} from "viem";

const baseURL = process.env.YETH_UAT_URL ?? "http://127.0.0.1:3311";
const rpcURL = process.env.YETH_FORK_RPC_URL ?? "http://127.0.0.1:18546";
const flowMode = process.env.YETH_SAFE_FLOW ?? "auto";
if (!["auto", "reload"].includes(flowMode)) throw new Error("Choose YETH_SAFE_FLOW=auto or reload.");
const output = process.env.YETH_UAT_OUTPUT ?? ".local/yeth/safe-browser-" + flowMode;
for (const value of [baseURL, rpcURL]) {
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" || !["http:", "https:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) {
    throw new Error("Safe UAT requires development loopback URLs.");
  }
}
const owner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const coOwner = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const holder = "0xd2ae9df04234e52f7c522af83683e40c8b9d4335";
const vault = "0xE5387cd454Dcc542421c069C009D915Ab9EFaaFd";
const auction = "0x68383672a70Ae3B78e5E2a67D78cf1E379BE3801";
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
// Canonical Ethereum deployments and runtime hashes from safe-global/safe-deployments v1.4.1.
const singleton = "0x41675C099F32341bf84BFc5382aF534df5C7461a";
const factory = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const chain = defineChain({ id: 31337, name: "Local Ethereum fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcURL] } } });
const client = createPublicClient({ chain, transport: http(rpcURL), cacheTime: 0 });
const wallet = address => createWalletClient({ account: address, chain, transport: http(rpcURL) });
const rpc = async (method, params = []) => {
  const response = await fetch(rpcURL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const value = await response.json();
  if (value.error) throw new Error(value.error.message);
  return value.result;
};
const assertFork = async () => {
  if (await rpc("eth_chainId") !== "0x7a69") throw new Error("Refusing a nonfork chain.");
  await rpc("anvil_nodeInfo");
};
const confirm = async hash => {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("A local UAT transaction reverted.");
  return receipt;
};
const json = value => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const safeAbi = parseAbi([
  "function setup(address[],uint256,address,bytes,address,address,uint256,address)",
  "function VERSION() view returns(string)", "function getOwners() view returns(address[])",
  "function getThreshold() view returns(uint256)", "function approveHash(bytes32)", "function nonce() view returns(uint256)",
  "function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns(bytes32)",
  "function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns(bool)",
  "event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)",
]);
const factoryAbi = parseAbi(["function createProxyWithNonce(address,bytes,uint256) returns(address)"]);
const recoveryAbi = parseAbi([
  "function approve(address,uint256) returns(bool)",
  "function redeem(uint256,address,address) returns(uint256)",
  "function take(address,uint256,address) returns(uint256)",
  "function available(address) view returns(uint256)",
]);

await assertFork();
await mkdir(output, { recursive: true });
const before = await rpc("evm_snapshot");
await writeFile(output + "/active-snapshot.json", json({ id: before, rpcURL, restored: false }));
let browser;
let context;
let page;
let safeAddress;
let passed = false;
const proposals = [];
const sdkRequests = [];
const browserErrors = [];
const receipts = [];
const proxyRequests = new Set();
try {
  for (const [address, expected] of [
    [singleton, "0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4"],
    [factory, "0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317"],
  ]) {
    const code = await client.getCode({ address });
    if (!code || keccak256(code) !== expected) throw new Error("Unexpected canonical Safe runtime on the fork.");
  }
  const inventory = await client.readContract({ address: auction, abi: recoveryAbi, functionName: "available", args: [weth] });
  if (inventory <= 0n || inventory >= parseEther("5")) throw new Error("Prepare a limited auction fixture before Safe UAT.");
  await rpc("anvil_setCode", [coOwner, "0x"]);
  await rpc("anvil_setBalance", [coOwner, toHex(parseEther("10"))]);
  const initializer = encodeFunctionData({ abi: safeAbi, functionName: "setup", args: [[owner, coOwner], 2n, zeroAddress, "0x", zeroAddress, zeroAddress, 0n, zeroAddress] });
  const create = await client.simulateContract({ account: owner, address: factory, abi: factoryAbi, functionName: "createProxyWithNonce", args: [singleton, initializer, BigInt(Date.now())] });
  safeAddress = create.result;
  await confirm(await wallet(owner).writeContract(create.request));
  if (await client.readContract({ address: safeAddress, abi: safeAbi, functionName: "VERSION" }) !== "1.4.1") throw new Error("Unexpected Safe version.");
  if (await client.readContract({ address: safeAddress, abi: safeAbi, functionName: "getThreshold" }) !== 2n) throw new Error("Unexpected Safe threshold.");
  const owners = await client.readContract({ address: safeAddress, abi: safeAbi, functionName: "getOwners" });
  if (owners.length !== 2 || ![owner, coOwner].every(address => owners.some(item => same(item, address)))) throw new Error("Unexpected Safe owner.");
  await rpc("anvil_impersonateAccount", [holder]);
  await rpc("anvil_setBalance", [holder, toHex(parseEther("1"))]);
  await confirm(await wallet(holder).writeContract({ address: vault, abi: erc20Abi, functionName: "transfer", args: [safeAddress, parseEther("10")] }));

  async function queue(calls) {
    if (!Array.isArray(calls) || calls.length !== 1) throw new Error("UAT accepts one explicitly reviewed Safe call at a time.");
    if (proposals.some(proposal => !proposal.receipt)) throw new Error("The app attempted a duplicate proposal while one is pending.");
    const call = calls[0];
    if (BigInt(call.value ?? 0) !== 0n || ![vault, auction].some(address => same(address, call.to))) throw new Error("Unexpected Safe call.");
    const decoded = decodeFunctionData({ abi: recoveryAbi, data: call.data });
    if (same(call.to, vault) && decoded.functionName === "approve") {
      if (!same(decoded.args[0], auction)) throw new Error("Unexpected allowance spender.");
    } else if (same(call.to, vault) && decoded.functionName === "redeem") {
      if (!same(decoded.args[1], safeAddress) || !same(decoded.args[2], safeAddress)) throw new Error("Unexpected redemption beneficiary.");
    } else if (same(call.to, auction) && decoded.functionName === "take") {
      if (!same(decoded.args[0], weth) || !same(decoded.args[2], safeAddress)) throw new Error("Unexpected auction beneficiary.");
    } else throw new Error("Unexpected recovery method.");
    const nonce = await client.readContract({ address: safeAddress, abi: safeAbi, functionName: "nonce" });
    const args = [call.to, 0n, call.data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress];
    const safeTxHash = await client.readContract({ address: safeAddress, abi: safeAbi, functionName: "getTransactionHash", args: [...args, nonce] });
    const proposal = { safeTxHash, nonce, method: decoded.functionName, call, args, receipt: null };
    proposals.push(proposal);
    console.log("QUEUED", proposal.method, safeTxHash);
    return { safeTxHash };
  }
  async function execute(index) {
    await assertFork();
    const proposal = proposals[index];
    if (!proposal || proposal.receipt) throw new Error("Unknown or already executed proposal.");
    // Two-owner execution: one owner approves the hash on chain; the other executes it.
    const confirmation = await confirm(await wallet(coOwner).writeContract({ address: safeAddress, abi: safeAbi, functionName: "approveHash", args: [proposal.safeTxHash] }));
    proposal.ownerConfirmationHash = confirmation.transactionHash;
    if (proposal.method === "take") { await rpc("evm_increaseTime", [600]); await rpc("evm_mine"); }
    const signature = concatHex([owner, coOwner].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(address =>
      concatHex([padHex(address, { size: 32 }), padHex("0x00", { size: 32 }), "0x01"]),
    ));
    const receipt = await confirm(await wallet(owner).writeContract({ address: safeAddress, abi: safeAbi, functionName: "execTransaction", args: [...proposal.args, signature] }));
    const success = receipt.logs.some(log => {
      if (!same(log.address, safeAddress)) return false;
      try {
        const event = decodeEventLog({ abi: safeAbi, eventName: "ExecutionSuccess", data: log.data, topics: log.topics });
        return event.args.txHash === proposal.safeTxHash;
      } catch { return false; }
    });
    if (!success || receipt.transactionHash === proposal.safeTxHash) throw new Error("Safe execution did not confirm the intended proposal.");
    proposal.receipt = receipt;
    receipts.push(receipt);
    console.log("EXECUTED", proposal.method, receipt.transactionHash);
    return receipt;
  }

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const childOrigin = "https://app.dao-ops.com";
  const parentOrigin = "https://app.safe.global";
  // A development artifact needs its real HMR channel before Turbopack hydrates.
  // Route only the synthetic child's HMR socket to the already-running local server.
  await context.routeWebSocket("wss://app.dao-ops.com/_next/**", socket => {
    const path = new URL(socket.url());
    const local = new URL(path.pathname + path.search, baseURL);
    local.protocol = local.protocol === "https:" ? "wss:" : "ws:";
    const upstream = new WebSocket(local);
    upstream.binaryType = "arraybuffer";
    let open = true;
    const queued = [];
    socket.onMessage(message => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
      else queued.push(message);
    });
    upstream.addEventListener("open", () => { for (const message of queued.splice(0)) upstream.send(message); });
    upstream.addEventListener("message", event => {
      if (!open) return;
      try { socket.send(typeof event.data === "string" ? event.data : Buffer.from(event.data)); }
      catch (error) { browserErrors.push(error.message); upstream.close(); }
    });
    socket.onClose(() => { open = false; upstream.close(); });
    upstream.addEventListener("close", () => socket.close());
    upstream.addEventListener("error", event => console.log("LOCAL HMR ERROR", event.message));
  });
  await context.exposeBinding("__yethSafeBridge", async ({ frame }, message) => {
    if (new URL(frame.url()).origin !== parentOrigin) throw new Error("Unexpected Safe bridge caller.");
    sdkRequests.push({ method: message.method, params: message.method === "rpcCall" ? { call: message.params?.call } : message.params });
    switch (message.method) {
      case "getSafeInfo": return { safeAddress, chainId: 31337, owners: [owner, coOwner], threshold: 2, isReadOnly: false, version: "1.4.1" };
      case "getEnvironmentInfo": return { origin: parentOrigin };
      case "getChainInfo": return { chainId: "31337", chainName: "Local Ethereum fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } };
      case "getSafeBalances": return [];
      case "wallet_getPermissions":
      case "wallet_requestPermissions": return [{ parentCapability: "eth_accounts" }];
      case "sendTransactions": return queue(message.params?.txs);
      case "getTxBySafeTxHash": {
        const proposal = proposals.find(item => item.safeTxHash === message.params?.safeTxHash);
        if (!proposal) throw new Error("Unknown Safe proposal.");
        return { txStatus: proposal.receipt ? "SUCCESS" : "AWAITING_CONFIRMATIONS", txHash: proposal.receipt?.transactionHash ?? null };
      }
      case "rpcCall": {
        const method = message.params?.call;
        if (method === "eth_accounts") return [safeAddress];
        if (!["eth_call", "eth_estimateGas", "eth_chainId", "eth_blockNumber", "eth_gasPrice", "eth_maxPriorityFeePerGas"].includes(method) && !method?.startsWith("eth_get")) throw new Error("The Safe parent bridge only proxies reads.");
        return rpc(method, message.params.params ?? []);
      }
      default: throw new Error("Unsupported Safe simulator method: " + message.method);
    }
  });
  await context.route(childOrigin + "/**", async route => {
    const request = (async () => {
      const url = new URL(route.request().url());
      const local = new URL(url.pathname + url.search, baseURL);
      const headers = { ...await route.request().allHeaders(), origin: new URL(baseURL).origin, referer: baseURL + "/yeth" };
      delete headers.host;
      const response = await route.fetch({ url: local.href, headers });
      await route.fulfill({ response });
    })();
    proxyRequests.add(request);
    try { await request; } finally { proxyRequests.delete(request); }
  });
  await context.route(rpcURL + "/**", async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Private-Network": "true" } });
    const payload = route.request().postDataJSON();
    const perform = async request => {
      if (request.method.startsWith("anvil_") || request.method.startsWith("evm_") || request.method.startsWith("eth_send")) throw new Error("The browser RPC route must not submit transactions.");
      return { jsonrpc: "2.0", id: request.id, result: await rpc(request.method, request.params ?? []) };
    };
    const result = Array.isArray(payload) ? await Promise.all(payload.map(perform)) : await perform(payload);
    return route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Private-Network": "true" }, body: json(result) });
  });
  const html = `<!doctype html><html><body><script>
    window.addEventListener("message", async function(event) {
      const iframe = document.querySelector("iframe");
      if (event.origin !== ${JSON.stringify(childOrigin)} || event.source !== iframe?.contentWindow) return;
      const message = event.data;
      if (!message || typeof message.id !== "string") return;
      try {
        const data = await window.__yethSafeBridge(message);
        event.source.postMessage({ id: message.id, success: true, data, version: "9.1.0" }, event.origin);
      } catch (error) {
        event.source.postMessage({ id: message.id, success: false, error: error.message, version: "9.1.0" }, event.origin);
      }
    });
  </script><iframe title="Yearn Safe app" src="${childOrigin}/yeth" style="width:100%;height:1200px;border:0"></iframe></body></html>`;
  await context.route(parentOrigin + "/", route => route.fulfill({ contentType: "text/html", body: html }));
  page = await context.newPage();
  page.on("pageerror", error => { browserErrors.push(error.message); console.log("PAGE ERROR", error.message); });
  page.on("console", message => { if (["error", "warning"].includes(message.type())) { browserErrors.push(message.text()); console.log("BROWSER", message.type(), message.text()); } });
  page.on("requestfailed", request => { const error = request.failure()?.errorText + " " + request.url(); browserErrors.push(error); console.log("REQUEST FAILED", error); });
  page.on("response", response => { if (response.status() >= 400) console.log("HTTP", response.status(), response.url()); });
  await page.goto(parentOrigin + "/");
  const app = page.frameLocator('iframe[title="Yearn Safe app"]');
  const dialog = app.getByRole("dialog");
  const pending = app.getByTestId("recovery-safe-pending");
  const checkExecution = () => pending.getByRole("button", { name: "Check Safe execution", exact: true });
  const connectedWallet = () => app.getByRole("banner").getByRole("button", {
    name: new RegExp(safeAddress.slice(0, 6), "i"),
  });
  const exitButton = () => app.getByRole("button", { name: /^Exit via auction/ });
  await expect(app.getByRole("heading", { name: "yETH Recovery", exact: true })).toBeVisible({ timeout: 120000 });
  await expect(connectedWallet()).toBeVisible({ timeout: 60000 });
  await expect(app.getByRole("main").getByRole("button", { name: new RegExp(safeAddress.slice(0, 6), "i") })).toHaveCount(0);
  await expect(app.getByRole("heading", { name:"yETH Recovery", exact:true })).toBeVisible();
  await expect(exitButton()).toBeEnabled({ timeout: 60000 });

  async function assertPending(index, method) {
    await expect.poll(() => proposals.length, { timeout: 60000 }).toBe(index + 1);
    await expect(pending).toBeVisible({ timeout: 60000 });
    if (proposals[index].method !== method) throw new Error("Unexpected proposal method.");
    const hash = proposals[index].safeTxHash;
    if (await rpc("eth_getTransactionReceipt", [hash])) throw new Error("A Safe proposal unexpectedly resolves as a chain receipt.");
    await expect(app.locator('a[href*="etherscan.io/tx/' + hash + '"]')).toHaveCount(0);
    await expect(app.getByText("Exit complete", { exact: true })).toHaveCount(0);
    const details = pending.getByRole("button", { name: "Transaction details", exact: true });
    if (await details.getAttribute("aria-expanded") === "false") await details.click();
    await expect(details).toHaveAttribute("aria-expanded", "true");
    await expect(pending.getByText(hash, { exact: false })).toBeVisible({ timeout: 30000 });
    await checkExecution().click();
    await expect(checkExecution()).toBeEnabled({ timeout: 30000 });
    if (proposals.length !== index + 1) throw new Error("Checking a pending proposal resubmitted it.");
    const exitActions = app.getByRole("button", { name: /^(Exit via auction|Exit position|Take auction offer)/ });
    for (const button of await exitActions.all()) if (await button.isVisible()) await expect(button).toBeDisabled();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await page.screenshot({ path: output + "/" + method + "-pending.png", fullPage: true, animations: "disabled" });
    console.log("PASS pending is not a receipt and status checks do not resubmit", method);
  }
  async function executeAndCheck(index) {
    const receipt = await execute(index);
    // The next pending proposal may replace this one immediately after its
    // canonical receipt resolves. Do not require a transient empty banner.
    if (await pending.isVisible()) {
      try { await checkExecution().click({ timeout: 5000 }); }
      catch (error) { if (!proposals[index + 1] && await pending.isVisible()) throw error; }
    }
    await expect(app.locator('a[href*="etherscan.io/tx/' + receipt.transactionHash + '"]')).toHaveCount(0);
    return receipt;
  }

  await exitButton().click();
  await expect(dialog.getByRole("button", { name: "Confirm exit", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Confirm exit", exact: true }).click();
  await assertPending(0, "approve");
  await executeAndCheck(0);
  // The same in-memory consent automatically proposes the bounded auction call.
  await assertPending(1, "take");
  await expect(dialog.getByTestId("exit-sequence")).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);

  if (flowMode === "reload") {
    // A reload drops automatic consent, but the already submitted take remains
    // pending and must be resolved without a replacement proposal.
    await page.reload();
    await expect(connectedWallet()).toBeVisible({ timeout: 60000 });
    await expect(dialog).toHaveCount(0);
    await assertPending(1, "take");
    if (proposals.length !== 2) throw new Error("Reload resubmitted the pending auction.");
  }

  // execute() deliberately advances the local fork by ten minutes for take.
  await executeAndCheck(1);
  const remaining = await client.readContract({ address: vault, abi: erc20Abi, functionName: "balanceOf", args: [safeAddress] });
  const received = await client.readContract({ address: weth, abi: erc20Abi, functionName: "balanceOf", args: [safeAddress] });
  if (remaining <= 0n || remaining >= parseEther("10") || received !== inventory) throw new Error("The Safe partial take did not produce the expected on-chain balances.");

  if (flowMode === "reload") {
    await expect(pending).toHaveCount(0, { timeout: 60000 });
    const resume = app.getByRole("button", { name: "Continue exit", exact: true });
    await expect(resume).toBeEnabled({ timeout: 60000 });
    await expect(app.getByRole("heading", { name: "Auction received. Finish your exit.", exact: true })).toBeVisible();
    // Cover at least one status-poll interval: restored progress must not sign.
    await page.waitForTimeout(6000);
    if (proposals.length !== 2) throw new Error("Restored progress automatically proposed redemption.");
    await page.screenshot({ path: output + "/remainder-restored.png", fullPage: true, animations: "disabled" });
    await writeFile(output + "/remainder-restored.txt", await app.locator("body").innerText());
    await resume.click();
  }

  // Without a reload this proposal follows the take automatically, under the
  // original full-exit consent. After reload it requires Continue exit above.
  await assertPending(2, "redeem");
  await expect(dialog.getByTestId("exit-sequence")).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  const redemption = decodeFunctionData({ abi: recoveryAbi, data: proposals[2].call.data });
  if (redemption.functionName !== "redeem" || redemption.args[0] !== remaining) {
    throw new Error("The remainder proposal does not match the actual remaining shares.");
  }
  await executeAndCheck(2);
  await expect(dialog.getByTestId("exit-sequence").getByText("Exit complete", { exact: true })).toBeVisible({ timeout: 60000 });
  if (proposals.length !== 3 || proposals.map(proposal => proposal.method).join(",") !== "approve,take,redeem") {
    throw new Error("The consented exit submitted an unexpected Safe proposal sequence.");
  }
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(app.getByRole("status").filter({ hasText: /^Exit complete/ })).toBeVisible();
  if (await client.readContract({ address: vault, abi: erc20Abi, functionName: "balanceOf", args: [safeAddress] }) !== 0n) throw new Error("The Safe full exit left shares.");
  await page.screenshot({ path: output + "/confirmed.png", fullPage: true, animations: "disabled" });
  await writeFile(output + "/confirmed.txt", await app.locator("body").innerText());
  passed = true;
  for (const name of ["failure.png", "failure.txt", "failure-app.txt"]) await rename(output + "/" + name, output + "/earlier-attempt-" + name).catch(() => undefined);
  console.log("PASS real Safe single-consent exit with canonical receipts", flowMode, safeAddress);
} catch (error) {
  if (page) {
    await page.screenshot({ path: output + "/failure.png", fullPage: true, animations: "disabled" }).catch(() => undefined);
    await writeFile(output + "/failure.txt", await page.locator("body").innerText()).catch(() => undefined);
    const frame = page.frames().find(frame => frame.url().startsWith("https://app.dao-ops.com/"));
    if (frame) await writeFile(output + "/failure-app.txt", await frame.locator("body").innerText()).catch(() => undefined);
  }
  throw error;
} finally {
  await writeFile(output + "/evidence.json", json({
    status: passed ? "passed" : "failed", flowMode,
    proof: "Synthetic trusted Safe Apps parent; actual canonical Safe1.4.1 execution on local Anvil; real2of2 on-chain owner confirmation; no hosted Safe service or off-chain signature collection",
    nodeInfo: await rpc("anvil_nodeInfo"), safeAddress, proposals, receipts, sdkRequests, browserErrors,
  }));
  while (proxyRequests.size) await Promise.allSettled([...proxyRequests]);
  await browser?.close();
  await assertFork();
  if (await rpc("evm_revert", [before]) !== true) throw new Error("Failed to restore the fork snapshot.");
  await writeFile(output + "/active-snapshot.json", json({ id: before, rpcURL, restored: true }));
}
