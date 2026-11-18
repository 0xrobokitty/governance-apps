import { expect, test, type Page } from "@playwright/test";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, parseAbi } from "viem";
import { safeExecTransactionAbi } from "../../../lib/tx/safe-call";

const account = `0x${"44".repeat(20)}` as const;
const target = `0x${"22".repeat(20)}` as const;
const proposal = `0x${"33".repeat(32)}` as const;
const execution = `0x${"66".repeat(32)}` as const;
const blockHash = `0x${"55".repeat(32)}` as const;
const zero = `0x${"00".repeat(20)}` as const;
const childOrigin = "https://app.dao-ops.com";
const key = `yearn:transactions:v1:1:${account}`;
const data = encodeFunctionData({ abi: parseAbi(["function approve(address spender,uint256 amount)"]), functionName: "approve", args: [target, 123n] });
const events = parseAbi(["event ExecutionSuccess(bytes32 txHash,uint256 payment)", "event ExecutionFailure(bytes32 txHash,uint256 payment)"]);
const proxyRequests = new Set<Promise<void>>();
test.afterEach(async ({ page }) => {
  while (proxyRequests.size) await Promise.all(proxyRequests);
  await page.unrouteAll({ behavior: "wait" });
});
async function setup(page: Page, baseURL: string | undefined, outcome: "success" | "inner-failure" | "outer-revert", missingHash = false) {
  page.on("pageerror", error => console.error("Safe fixture page error:", error.message));
  page.on("console", message => { if (message.type() === "error") console.error("Safe fixture console:", message.text()); });
  const record = {
    version: 1, id: "11111111-1111-4111-8111-111111111111", account, chainId: 1, connectorId: "safe",
    kind: "safe", hashKind: "safe-proposal", label: "Approve YFI", createdAt: 1,
    submittedBlock: "100", to: target, data, value: "0", status: "pending",
    ...(!missingHash ? { submissionHash: proposal } : {}),
  };
  await page.addInitScript(({ origin, key, record }) => {
    if (location.origin === origin && !localStorage.getItem("safe-tracker-fixture")) {
      localStorage.setItem(key, JSON.stringify([record]));
      localStorage.setItem("safe-tracker-fixture", "1");
    }
  }, { origin: childOrigin, key, record });
  const event = outcome === "inner-failure" ? "ExecutionFailure" : "ExecutionSuccess";
  const receipt = {
    transactionHash: execution, blockNumber: "0x65", blockHash, transactionIndex: "0x0", from: target, to: account,
    cumulativeGasUsed: "0x5208", gasUsed: "0x5208", effectiveGasPrice: "0x1", contractAddress: null,
    status: outcome === "outer-revert" ? "0x0" : "0x1", type: "0x2", logsBloom: `0x${"00".repeat(256)}`,
    logs: outcome === "outer-revert" ? [] : [{ address: account, blockNumber: "0x65", blockHash, transactionHash: execution, transactionIndex: "0x0", logIndex: "0x0", removed: false,
      topics: encodeEventTopics({ abi: events, eventName: event }),
      data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [proposal, 0n]) }],
  };
  await page.route("http://127.0.0.1:8546/**", async route => {
    const request = route.request().postDataJSON();
    const respond = (call: { id: number; method: string; params?: string[] }) => {
      let result: unknown = null;
      if (call.method === "eth_chainId") result = "0x1";
      if (call.method === "eth_blockNumber") result = "0x65";
      if (call.method === "eth_getBalance") result = "0x0";
      if (call.method === "eth_getBlockByNumber") result = { number: "0x65", hash: blockHash, parentHash: blockHash, timestamp: "0x65", transactions: [] };
      if (call.method === "eth_getTransactionReceipt" && call.params?.[0] === execution) result = receipt;
      if (call.method === "eth_getTransactionByHash" && call.params?.[0] === execution) result = {
        hash: execution, blockNumber: "0x65", blockHash, from: target, to: account, chainId: "0x1", value: "0x0", nonce: "0x0", gas: "0x5208", gasPrice: "0x1", transactionIndex: "0x0", type: "0x0", v: "0x25", r: "0x1", s: "0x1",
        input: encodeFunctionData({ abi: safeExecTransactionAbi, functionName: "execTransaction", args: [target, 0n, data, 0, 0n, 0n, 0n, zero, zero, "0x"] }),
      };
      return { jsonrpc: "2.0", id: call.id, result };
    };
    await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(Array.isArray(request) ? request.map(respond) : respond(request)) });
  });
  await page.route(`${childOrigin}/**`, async route => {
    const request = (async () => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: new URL(url.pathname + url.search, baseURL).href });
      await route.fulfill({ response });
    })();
    proxyRequests.add(request);
    try { await request; } finally { proxyRequests.delete(request); }
  });
  const html = `<!doctype html><html><body><script>
    window.safeRequests = [];
    window.addEventListener("message", function(event) {
      if (event.origin !== "${childOrigin}") return;
      var message = event.data;
      if (!message || typeof message.id !== "string") return;
      window.safeRequests.push(message.method);
      var data;
      if (message.method === "getSafeInfo") data = { safeAddress: "${account}", chainId: 1, owners: [], threshold: 1, isReadOnly: false };
      else if (message.method === "getEnvironmentInfo") data = { origin: "https://app.safe.global" };
      else if (message.method === "rpcCall") data = message.params && message.params.call === "eth_chainId" ? "0x1" : null;
      else return;
      event.source.postMessage({ id: message.id, success: true, data: data, version: "9.1.0" }, event.origin);
    });
  </script><iframe title="Yearn Safe app" src="${childOrigin}/styfi" style="width:100%;height:950px;border:0"></iframe></body></html>`;
  await page.route("https://app.safe.global/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://app.safe.global/");
  const app = page.frameLocator('iframe[title="Yearn Safe app"]');
  await expect(app.getByRole("heading", { name: "Pending wallet transactions" })).toBeVisible({ timeout: 30_000 });
  return app;
}
for (const outcome of ["success", "inner-failure", "outer-revert"] as const) {
  test(`resumes a Safe proposal after reload and verifies ${outcome}`, async ({ page, baseURL }) => {
    const app = await setup(page, baseURL, outcome);
    await expect(app.getByRole("heading", { name: "Pending wallet transactions" })).toBeVisible();
    await expect(app.locator(`a[href="https://etherscan.io/tx/${proposal}"]`)).toHaveCount(0);
    await page.reload();
    await expect(app.getByText(`Safe proposal: ${proposal}`, { exact: true })).toBeVisible();
    await app.getByText("Recover wallet identifiers", { exact: true }).click();
    await app.getByLabel("Execution transaction hash (optional)").fill(execution);
    await app.getByRole("button", { name: "Check execution", exact: true }).click();
    if (outcome === "outer-revert") {
      await expect(app.getByRole("status").filter({ hasText: "does not prove" })).toBeVisible();
      await expect(app.getByRole("heading", { name: "Pending wallet transactions" })).toBeVisible();
    } else {
      await expect(app.getByRole("status").filter({ hasText: outcome === "success" ? "execution confirmed" : "execution failed" })).toBeVisible();
      await expect(app.getByRole("link", { name: "View execution", exact: true })).toHaveAttribute("href", `https://etherscan.io/tx/${execution}`);
      await expect(app.getByRole("heading", { name: "Pending wallet transactions" })).toHaveCount(0);
    }
    expect(await page.evaluate(() => (window as unknown as { safeRequests: string[] }).safeRequests)).not.toContain("sendTransactions");
  });
}
test("requires explicit queue review when the original proposal hash was lost", async ({ page, baseURL }) => {
  const app = await setup(page, baseURL, "success", true);
  await app.getByText("Recover wallet identifiers", { exact: true }).click();
  await app.getByLabel("Wallet submission hash", { exact: true }).fill(proposal);
  await app.getByLabel("Execution transaction hash (optional)").fill(execution);
  await app.getByRole("button", { name: "Check execution", exact: true }).click();
  await expect(app.getByRole("status").filter({ hasText: "cannot identify" })).toBeVisible();
  const finish = app.getByRole("button", { name: "Finish queue reconciliation", exact: true });
  await expect(finish).toBeDisabled();
  await app.getByRole("checkbox", { name: /checked the wallet queue/ }).check();
  await finish.click();
  await expect(app.getByRole("status").filter({ hasText: "original submission outcome remains unknown" })).toBeVisible();
  await expect(app.getByRole("heading", { name: "Pending wallet transactions" })).toHaveCount(0);
});

test("keeps uncertain-call review usable on mobile and permits neutral review without a receipt", async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await setup(page, baseURL, "success", true);
  await app.getByText("Review original call", { exact: true }).click();
  await expect(app.getByText(data, { exact: true })).toBeVisible();
  await app.getByRole("button", { name: "Review uncertain submission", exact: true }).click();
  const finish = app.getByRole("button", { name: "Finish queue reconciliation", exact: true });
  await expect(finish).toBeDisabled();
  expect(await app.locator("body").evaluate(body => body.ownerDocument.documentElement.scrollWidth <= body.ownerDocument.defaultView!.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("safe-recovery-mobile.png"), fullPage: true });
  await app.getByRole("checkbox", { name: /checked the wallet queue/ }).check();
  await finish.click();
  await expect(app.getByRole("status").filter({ hasText: "local retry block was removed" })).toBeVisible();
  await expect(app.getByRole("link", { name: "View execution", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { safeRequests: string[] }).safeRequests)).not.toContain("sendTransactions");
});
