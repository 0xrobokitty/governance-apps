import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, defineChain, erc20Abi, http, parseAbi, parseEther, toHex, type Address, type Hex } from "viem";
import { YETH_RECOVERY_VAULT } from "@/lib/clients/yeth/deployment";
import { readRecoveryAccount, createRecoveryActionQuote, validateRecoveryTake, parseRecoveryReceipt, recoveryAuctionAbi, recoveryVaultAbi, RECOVERY_AUCTION, RECOVERY_WRAPPER, RECOVERY_WETH } from "@/lib/clients/yeth/recovery/onchain";

const rpcUrl = process.env.YETH_FORK_RPC_URL;
const account = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const holder = "0xd2ae9df04234e52f7c522af83683e40c8b9d4335" as const;
const chain = defineChain({ id: 31337, name: "Isolated yETH UAT", nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18}, rpcUrls: {default: {http: [rpcUrl || "http://127.0.0.1:18546"]}}, contracts: {multicall3: {address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 0}} });
const client = createPublicClient({ chain, transport: http(rpcUrl || "http://127.0.0.1:18546"), cacheTime: 0 });
const wallet = (address: Address) => createWalletClient({ account: address, chain, transport: http(rpcUrl || "http://127.0.0.1:18546") });
const wrapperAbi = parseAbi(["function governance() view returns(address)", "function kick() returns(uint256)", "function setStepDecayRate(uint256)"]);
const rpc = async (method: string, params: unknown[] = []) => {
  const response = await fetch(rpcUrl!, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({jsonrpc:"2.0", id:1, method, params})});
  const data = await response.json() as { error?: { message: string }; result: string };
  if (data.error) throw new Error(data.error.message);
  return data.result;
};
const confirmed = async (hash: Hex) => {
  const receipt = await client.waitForTransactionReceipt({hash});
  expect(receipt.status).toBe("success");
  return receipt;
};
let governance: Address;
let snapshot: string;
let originalSnapshot: string;
async function fundAuction(amount = "1") {
  await confirmed(await wallet(account).writeContract({address: RECOVERY_WETH, abi: parseAbi(["function deposit() payable"]), functionName:"deposit", value:parseEther(amount)}));
  await confirmed(await wallet(account).writeContract({address: RECOVERY_WETH, abi:erc20Abi, functionName:"transfer", args:[RECOVERY_WRAPPER,parseEther(amount)]}));
  await confirmed(await wallet(governance).writeContract({address: RECOVERY_WRAPPER,abi:wrapperAbi,functionName:"kick"}));
}
async function approveAndQuote() {
  const quote = createRecoveryActionQuote(await readRecoveryAccount(client,account,31337));
  await confirmed(await wallet(account).writeContract({address:YETH_RECOVERY_VAULT,abi:erc20Abi,functionName:"approve",args:[RECOVERY_AUCTION,quote.maxShares]}));
  return quote;
}
describe.skipIf(!rpcUrl)("actual deployed recovery contracts on isolated Ethereum fork", () => {
  beforeAll(async () => {
    const url = new URL(rpcUrl!);
    if (!["127.0.0.1","localhost","[::1]"].includes(url.hostname) || await client.getChainId() !== 31337) throw new Error("Refusing nonlocal or nonfork transaction transport.");
    await rpc("anvil_nodeInfo");
    originalSnapshot = await rpc("evm_snapshot");
    await rpc("anvil_setCode",[account,"0x"]);
    governance = await client.readContract({address:RECOVERY_WRAPPER,abi:wrapperAbi,functionName:"governance"});
    await rpc("anvil_impersonateAccount",[holder]);
    await rpc("anvil_impersonateAccount",[governance]);
    await rpc("anvil_setBalance",[holder,toHex(parseEther("10"))]);
    await rpc("anvil_setBalance",[governance,toHex(parseEther("10"))]);
    await confirmed(await wallet(holder).writeContract({address:YETH_RECOVERY_VAULT,abi:erc20Abi,functionName:"transfer",args:[account,parseEther("10")]}));
    snapshot = await rpc("evm_snapshot");
  }, 120_000);
  afterAll(async () => { if (originalSnapshot) await rpc("evm_revert",[originalSnapshot]); });
  beforeEach(async () => {
    await rpc("evm_revert",[snapshot]);
    snapshot = await rpc("evm_snapshot");
  });
  it("reads live balances and rejects an unavailable auction", async () => {
    const state = await readRecoveryAccount(client,account,31337);
    expect(state.shares).toBe(parseEther("10"));
    expect(state.directAssets).toBeGreaterThan(0n);
    expect(() => createRecoveryActionQuote(state)).toThrow("No auction");
    console.log("fork block",state.blockNumber.toString(),"direct WETH",state.directAssets.toString());
  }, 120_000);
  it("takes limited liquidity, confirms actual WETH, then redeems the explicit remainder", async () => {
    await fundAuction();
    await rpc("evm_increaseTime",[86_400]);
    await rpc("evm_mine");
    const quote = await approveAndQuote();
    const state = await readRecoveryAccount(client,account,31337);
    validateRecoveryTake(state,quote);
    const simulation = await client.simulateContract({account,address:RECOVERY_AUCTION,abi:recoveryAuctionAbi,functionName:"take",args:[RECOVERY_WETH,quote.requestedWeth,account]});
    const receipt = await confirmed(await wallet(account).writeContract(simulation.request));
    const amounts = parseRecoveryReceipt(receipt,account,"take",quote.maxShares,quote.requestedWeth);
    expect(amounts.wethReceived).toBe(parseEther("1"));
    const remaining = await readRecoveryAccount(client,account,31337);
    expect(remaining.shares).toBe(state.shares-amounts.sharesSpent);
    expect(remaining.shares).toBeGreaterThan(0n);
    expect(remaining.maxRedeem).toBeGreaterThanOrEqual(remaining.shares);
    const exit = await client.simulateContract({account,address:YETH_RECOVERY_VAULT,abi:recoveryVaultAbi,functionName:"redeem",args:[remaining.shares,account,account]});
    const exitReceipt = await confirmed(await wallet(account).writeContract(exit.request));
    const exitAmounts = parseRecoveryReceipt(exitReceipt,account,"redeem",remaining.shares);
    expect((await readRecoveryAccount(client,account,31337)).shares).toBe(0n);
    console.log("confirmed partial auction",receipt.transactionHash,amounts,"confirmed remainder exit",exitReceipt.transactionHash,exitAmounts);
  }, 120_000);
  it("takes a full position from a larger auction with only the exact approved budget", async () => {
    await fundAuction("100");
    await rpc("evm_increaseTime",[86_400]);
    await rpc("evm_mine");
    const quote = await approveAndQuote();
    expect(quote.maxShares).toBeLessThanOrEqual(parseEther("10"));
    validateRecoveryTake(await readRecoveryAccount(client,account,31337),quote);
    const receipt = await confirmed(await wallet(account).writeContract({address:RECOVERY_AUCTION,abi:recoveryAuctionAbi,functionName:"take",args:[RECOVERY_WETH,quote.requestedWeth,account]}));
    const amounts = parseRecoveryReceipt(receipt,account,"take",quote.maxShares,quote.requestedWeth);
    expect(amounts.sharesSpent).toBe(quote.maxShares);
    expect((await readRecoveryAccount(client,account,31337)).shares).toBeLessThanOrEqual(1n);
  }, 120_000);
  it("demonstrates why an approval cap cannot guarantee the rate across restart and reduced inventory", async () => {
    await fundAuction();
    await rpc("evm_increaseTime",[86_400]);
    await rpc("evm_mine");
    const quote = await approveAndQuote();
    // A pending take has no encoded round, deadline, or minimum WETH. Recreate its calldata after a restart.
    await rpc("anvil_impersonateAccount",[RECOVERY_AUCTION]);
    await rpc("anvil_setBalance",[RECOVERY_AUCTION,toHex(parseEther("1"))]);
    await confirmed(await wallet(RECOVERY_AUCTION).writeContract({address:RECOVERY_WETH,abi:erc20Abi,functionName:"transfer",args:[account,parseEther("0.99")]}));
    await rpc("evm_increaseTime",[604_801]);
    await rpc("evm_mine");
    await confirmed(await wallet(governance).writeContract({address:RECOVERY_WRAPPER,abi:wrapperAbi,functionName:"kick"}));
    const restarted = await readRecoveryAccount(client,account,31337);
    expect(() => validateRecoveryTake(restarted,quote)).toThrow("restarted");
    // Deliberately bypass only the UI guard to demonstrate the deployed contract limitation.
    const receipt = await confirmed(await wallet(account).writeContract({address:RECOVERY_AUCTION,abi:recoveryAuctionAbi,functionName:"take",args:[RECOVERY_WETH,quote.requestedWeth,account]}));
    const amounts = parseRecoveryReceipt(receipt,account,"take",quote.maxShares,quote.requestedWeth);
    expect(amounts.wethReceived).toBe(parseEther("0.01"));
    expect(amounts.sharesSpent).toBeLessThan(quote.maxShares);
    expect(amounts.sharesSpent * 10n**18n / amounts.wethReceived).toBeGreaterThan(quote.price);
    console.log("restart/partial-inventory contract limitation confirmed",receipt.transactionHash);
  }, 120_000);
  it("does not treat a transaction mined after an intervening fill as a successful recovery", async () => {
    await fundAuction();
    const quote = await approveAndQuote();
    const simulation = await client.simulateContract({account,address:RECOVERY_AUCTION,abi:recoveryAuctionAbi,functionName:"take",args:[RECOVERY_WETH,quote.requestedWeth,account]});
    await confirmed(await wallet(account).writeContract(simulation.request));
    // The original reviewed calldata is now stale, although its earlier simulation succeeded.
    const hash = await wallet(account).writeContract({...simulation.request,gas:500_000n});
    const receipt = await client.waitForTransactionReceipt({hash});
    expect(receipt.status).toBe("reverted");
    expect(() => parseRecoveryReceipt(receipt,account,"take",quote.maxShares,quote.requestedWeth)).toThrow("reverted");
    console.log("mined stale-fill revert correctly rejected",hash);
  }, 120_000);
  it("rejects a changed round before sending", async () => {
    await fundAuction();
    const quote = await approveAndQuote();
    await rpc("evm_increaseTime",[604_801]);
    await rpc("evm_mine");
    await confirmed(await wallet(governance).writeContract({address:RECOVERY_WRAPPER,abi:wrapperAbi,functionName:"kick"}));
    const changed = await readRecoveryAccount(client,account,31337);
    expect(() => validateRecoveryTake(changed,quote)).toThrow("changed");
  }, 120_000);
});
