// Creates test funds only after verifying a loopback Anvil node with chain ID 31337.
import fixture from "../lib/clients/yeth/recovery/fork-fixture.json" with { type: "json" };
import { createPublicClient, createWalletClient, defineChain, erc20Abi, http, parseAbi, parseEther, toHex } from "viem";
const rpcUrl = process.env.YETH_FORK_RPC_URL ?? "http://127.0.0.1:18546";
const url = new URL(rpcUrl);
if (process.env.NODE_ENV === "production" || !["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) throw new Error("This fixture requires a development loopback RPC.");
const mode = process.argv[2] ?? "partial";
if (!["empty", "partial", "full"].includes(mode)) throw new Error("Choose empty, partial, or full.");
const account = fixture.account;
const seededShares = BigInt(fixture.seededSharesWei);
const holder = "0xd2ae9df04234e52f7c522af83683e40c8b9d4335";
const vault = "0xE5387cd454Dcc542421c069C009D915Ab9EFaaFd";
const wrapper = "0x26868F94684dEC5Ea6fF93ccc06aBde1015ce2CE";
const auction = "0x68383672a70Ae3B78e5E2a67D78cf1E379BE3801";
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const chain = defineChain({id:31337,name:"Local Ethereum fork",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:{default:{http:[rpcUrl]}}});
const client = createPublicClient({chain,transport:http(rpcUrl)});
const wallet = (address) => createWalletClient({chain,account:address,transport:http(rpcUrl)});
const rpc = async (method,params=[]) => {
  const data = await (await fetch(rpcUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})})).json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
};
if (await client.getChainId() !== 31337) throw new Error("Refusing a nonfork chain.");
await rpc("anvil_nodeInfo");
const abi = parseAbi(["function governance() view returns(address)","function kick() returns(uint256)"]);
const active = await client.readContract({address:auction,abi:parseAbi(["function available(address) view returns(uint256)"]),functionName:"available",args:[weth]});
if (active > 0n) throw new Error("Start a fresh disposable fork before changing its scenario.");
await rpc("anvil_setCode",[account,"0x"]); // Remove mainnet delegation on the public Anvil fixture account only.
await rpc("anvil_setBalance",[account,toHex(parseEther("1000"))]);
await rpc("anvil_impersonateAccount",[holder]);
await rpc("anvil_setBalance",[holder,toHex(parseEther("10"))]);
const confirm = async (hash) => {
  const receipt = await client.waitForTransactionReceipt({hash});
  if (receipt.status !== "success") throw new Error("A fixture transaction reverted.");
};
const balance = await client.readContract({address:vault,abi:erc20Abi,functionName:"balanceOf",args:[account]});
if (balance > seededShares) throw new Error("The fixture account has unexpected shares. Start a fresh disposable fork.");
if (balance < seededShares) await confirm(await wallet(holder).writeContract({address:vault,abi:erc20Abi,functionName:"transfer",args:[account,seededShares-balance]}));
if (mode !== "empty") {
  const governance = await client.readContract({address:wrapper,abi,functionName:"governance"});
  await rpc("anvil_impersonateAccount",[governance]);
  await rpc("anvil_setBalance",[governance,toHex(parseEther("10"))]);
  const amount = parseEther(mode === "full" ? "100" : "1");
  await confirm(await wallet(account).writeContract({address:weth,abi:parseAbi(["function deposit() payable"]),functionName:"deposit",value:amount}));
  await confirm(await wallet(account).writeContract({address:weth,abi:erc20Abi,functionName:"transfer",args:[wrapper,amount]}));
  await confirm(await wallet(governance).writeContract({address:wrapper,abi,functionName:"kick"}));
  await rpc("evm_increaseTime",[86400]);
  await rpc("evm_mine");
}
const blockNumber = await client.getBlockNumber();
const remainingShares = await client.readContract({
  address:vault,abi:erc20Abi,functionName:"balanceOf",args:[account],blockNumber,
});
console.log(JSON.stringify({
  mode,chainId:31337,rpcUrl,account,blockNumber:String(blockNumber),
  banner:"Local Ethereum fork · test funds",
  positionBasis: {
    kind:fixture.kind,account,seededSharesWei:fixture.seededSharesWei,
    remainingSharesWei:String(remainingShares),
    targetSource:fixture.basisSource,
    representedClaimFormula:"remainingSharesWei * targetAssetsPerShareWad / 1e18",
    note:"The app uses the full-recovery PPS target in its verified Stats publication. This is synthetic UAT principal, not a production holder attribution.",
  },
},null,2));
