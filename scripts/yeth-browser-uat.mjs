import { chromium, expect } from "@playwright/test";
import { toFunctionSelector } from "viem";
import { writeFile, mkdir } from "node:fs/promises";
import fixture from "../lib/clients/yeth/recovery/fork-fixture.json" with { type: "json" };
const baseURL = process.env.YETH_UAT_URL ?? "http://127.0.0.1:3311";
const rpcURL = process.env.YETH_FORK_RPC_URL ?? "http://127.0.0.1:18546";
const scenario = process.argv[2] ?? "partial";
const outputDirectory = process.env.YETH_UAT_OUTPUT ?? ".local/yeth/browser";
const account = fixture.account;
const approveSelector = toFunctionSelector("approve(address,uint256)");
const takeSelector = toFunctionSelector("take(address,uint256,address)");
const redeemSelector = toFunctionSelector("redeem(uint256,address,address)");
if (!["empty", "partial", "full"].includes(scenario)) throw new Error("Choose empty, partial, or full.");
for (const value of [baseURL,rpcURL]) {
  const url=new URL(value);
  if (process.env.NODE_ENV === "production" || !["http:", "https:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) {
    throw new Error("UAT requires development loopback URLs.");
  }
}
const rpc = async (method, params=[]) => {
  const data=await (await fetch(rpcURL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})})).json();
  if (data.error) throw Object.assign(new Error(data.error.message),{code:data.error.code});
  return data.result;
};
if (await rpc("eth_chainId") !== "0x7a69") throw new Error("UAT requires chain 31337.");
await rpc("anvil_nodeInfo");
await mkdir(outputDirectory,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100}});
const transactions=[];
const submittedCalls=[];
await context.exposeBinding("__yethForkRpc",async (_source,{method,params}) => {
  if (method==="eth_sendTransaction") {
    if (await rpc("eth_chainId")!=="0x7a69") throw new Error("Fork identity changed.");
    if (params[0].from?.toLowerCase()!==account.toLowerCase()) throw new Error("Unexpected transaction signer.");
  }
  const result=await rpc(method,params);
  if (method==="eth_sendTransaction") {
    transactions.push(result);
    submittedCalls.push({ hash: result, selector: params[0].data?.slice(0, 10).toLowerCase(), to: params[0].to });
  }
  return result;
});
await context.addInitScript(({account}) => {
  const listeners=new Map();
  let authorized=false;
  window.__yethRejectSelectors = [];
  window.__yethWalletRequests = [];
  const provider={
    isMetaMask:true,
    isConnected:()=>true,
    on(event,handler){const list=listeners.get(event)||[];list.push(handler);listeners.set(event,list);return provider;},
    removeListener(event,handler){listeners.set(event,(listeners.get(event)||[]).filter(fn=>fn!==handler));return provider;},
    async request({method,params=[]}){
      if (method==="eth_accounts") return authorized ? [account] : [];
      if (method==="eth_requestAccounts") { authorized=true; return [account]; }
      if (method==="eth_chainId") return "0x7a69";
      if (method==="wallet_requestPermissions"||method==="wallet_getPermissions") return [{parentCapability:"eth_accounts"}];
      if (method==="wallet_switchEthereumChain"||method==="wallet_addEthereumChain") {
        if (params[0].chainId!=="0x7a69") throw new Error("Only the local fork is available.");
        return null;
      }
      if (method === "eth_sendTransaction") {
        const selector = params[0]?.data?.slice(0, 10).toLowerCase();
        const rejected = window.__yethRejectSelectors[0] === selector;
        window.__yethWalletRequests.push({ selector, rejected });
        if (rejected) {
          window.__yethRejectSelectors.shift();
          throw Object.assign(new Error("User rejected the request"), { code: 4001 });
        }
      }
      return window.__yethForkRpc({method,params});
    },
  };
  window.ethereum=provider;
  window.dispatchEvent(new Event("ethereum#initialized"));
},{account});
const page=await context.newPage();
page.on("pageerror",e=>console.log("PAGE ERROR",e.message));
try {
  await page.goto(baseURL+"/yeth",{waitUntil:"domcontentloaded",timeout:120000});
  await expect(page.getByRole("heading",{name:"yETH Recovery",exact:true})).toBeVisible({timeout:120000});
  await expect(page.getByText("Loading recovery data",{exact:true})).toHaveCount(0,{timeout:60000});
  await expect(page.getByRole("heading", {name:"yETH Recovery",exact:true})).toBeVisible({timeout:60000});
  await page.screenshot({path:outputDirectory+"/disconnected-desktop.png",fullPage:true});
  await writeFile(outputDirectory+"/disconnected.txt",await page.locator("body").innerText());
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:outputDirectory+"/disconnected-mobile.png",fullPage:true});
  await page.setViewportSize({width:1440,height:1100});
  for (const [name,slug] of [["Recovery progress","progress"],["Vaults & yield","vaults"],["Holders","holders"],["Contracts","contracts"]]) {
    await page.getByRole("tab",{name,exact:true}).click();
    await page.screenshot({path:outputDirectory+"/disconnected-"+slug+".png",fullPage:true});
  }
  await page.getByRole("tab",{name:"Recovery progress",exact:true}).click();
  await page.getByRole("main").getByRole("button",{name:"Connect wallet",exact:true}).click();
  console.log("CONNECT DIALOG",await page.getByRole("dialog").innerText());
  await page.getByRole("button",{name:/Browser wallet/i}).click();
  await expect(page.getByRole("banner").getByRole("button", { name: /0xf39F/i })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("main").getByRole("button", { name: /0xf39F/i })).toHaveCount(0);
  await expect(page.getByTestId("exit-rate")).toContainText(/[0-9]+([.][0-9]+)?%/, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({path:outputDirectory+"/connected-"+scenario+".png",fullPage:true});
  await writeFile(outputDirectory+"/connected-"+scenario+".txt",await page.locator("body").innerText());
  console.log("CONNECTED",scenario);
  const dialog=page.getByRole("dialog");
  const exitButton = page.getByRole("button", {
    name: scenario === "empty" ? /^Exit position/ : /^(Exit via auction|Take auction offer)/,
  });
  await expect(exitButton).toBeEnabled({ timeout: 60000 });
  await exitButton.click();
  await expect(dialog).toBeVisible({timeout:60000});
  await expect(dialog.getByRole("button", { name: "Confirm exit", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  if (scenario === "partial") {
    // Reject only these actual wallet requests, not an app button or RPC result.
    // The next approval retry succeeds; the following take succeeds; redemption
    // is then rejected so the UI must retain the already confirmed auction.
    await page.evaluate(selectors => { window.__yethRejectSelectors = selectors; }, [approveSelector, redeemSelector]);
  }
  await dialog.getByRole("button", { name: "Confirm exit", exact: true }).click();
  const sequence = dialog.getByTestId("exit-sequence");
  await expect(sequence).toBeVisible({ timeout: 60000 });
  if (scenario === "partial") {
    await expect(sequence.getByTestId("exit-phase")).toHaveText("Exit paused", { timeout: 60000 });
    await expect(sequence.getByRole("alert").first()).toContainText(/reject/i);
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    if (transactions.length !== 0) throw new Error("Rejected approval submitted a transaction.");
    console.log("PASS rejected approval pauses with no transaction");

    await sequence.getByRole("button", { name: "Continue exit", exact: true }).click();
    await expect.poll(() => transactions.length, { timeout: 90000 }).toBe(2);
    await expect(sequence.getByTestId("exit-phase")).toHaveText("Exit paused", { timeout: 60000 });
    await expect(sequence.getByRole("alert").first()).toContainText(/reject/i);
    await expect(sequence.getByText("received", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    const rejected = await page.evaluate(() => window.__yethWalletRequests.filter(item => item.rejected));
    if (rejected.length !== 2 || rejected[0].selector !== approveSelector || rejected[1].selector !== redeemSelector) {
      throw new Error("The expected approval and redemption wallet rejections were not observed.");
    }
    if (submittedCalls[0]?.selector !== approveSelector || submittedCalls[1]?.selector !== takeSelector) {
      throw new Error("The paused exit did not submit approval then auction in order.");
    }
    const takeReceipt = await rpc("eth_getTransactionReceipt", [transactions[1]]);
    if (takeReceipt?.status !== "0x1") throw new Error("The retained auction has no successful canonical receipt.");
    await page.screenshot({path:outputDirectory+"/partial-remainder-review.png",fullPage:true});
    await writeFile(outputDirectory+"/partial-remainder-review.txt",await page.locator("body").innerText());
    console.log("PASS rejected redemption preserves the confirmed auction and needs only Continue exit");
    await sequence.getByRole("button", { name: "Continue exit", exact: true }).click();
  }
  await expect(sequence.getByTestId("exit-phase")).toHaveText("Exit complete", { timeout: 90000 });
  const expectedCalls = scenario === "empty" ? [redeemSelector]
    : scenario === "full" ? [approveSelector, takeSelector]
    : [approveSelector, takeSelector, redeemSelector];
  if (JSON.stringify(submittedCalls.map(call => call.selector)) !== JSON.stringify(expectedCalls)) {
    throw new Error("The single-consent exit submitted an unexpected transaction sequence.");
  }
  await sequence.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0,{timeout:60000});
  await expect(page.getByRole("status").filter({ hasText: /^Exit complete/ })).toBeVisible({timeout:60000});
  const receipts=[];
  for(const hash of transactions) {
    const receipt=await rpc("eth_getTransactionReceipt",[hash]);
    receipts.push(receipt);
    if(receipt.status!=="0x1") throw new Error("A displayed success has a reverted receipt.");
    await expect(page.locator('a[href*="'+hash+'"]')).toHaveCount(0);
  }
  await writeFile(outputDirectory+"/"+scenario+"-receipts.json",JSON.stringify(receipts,null,2));
  const shares=BigInt(await rpc("eth_call",[{to:"0xE5387cd454Dcc542421c069C009D915Ab9EFaaFd",data:"0x70a08231"+account.slice(2).toLowerCase().padStart(64,"0")},"latest"]));
  if(shares>2n) throw new Error("The completed full exit left more than share rounding dust.");
  await page.screenshot({path:outputDirectory+"/"+scenario+"-confirmed.png",fullPage:true});
  await writeFile(outputDirectory+"/"+scenario+"-confirmed.txt",await page.locator("body").innerText());
  console.log("PASS",scenario,"real fork receipts",transactions,"remainingShares",shares.toString());
} catch (error) {
  await writeFile(outputDirectory+"/failure.txt",await page.locator("body").innerText());
  await page.screenshot({path:outputDirectory+"/failure.png",fullPage:true});
  throw error;
} finally {
  await writeFile(outputDirectory+"/"+scenario+"-transactions.json",JSON.stringify(transactions,null,2));
  await writeFile(outputDirectory+"/"+scenario+"-wallet-requests.json",JSON.stringify({
    submittedCalls,
    requests: await page.evaluate(() => window.__yethWalletRequests).catch(() => []),
  },null,2));
  await browser.close();
}
