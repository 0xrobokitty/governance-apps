#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicClient, http, parseAbi, parseAbiItem, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import nextEnv from "@next/env";

// Source: styfi/deployment.json. Earlier than every indexed source deployment;
// absence of code at the preceding block is verified before accepting coverage.
export const INDEX_FROM_BLOCK = 24_320_000n;
export const INDEX_DEPLOYMENT = {
  voting: "0x543e8871562a8C53E8B6a26835aeEcB3a5A13070",
  measure: "0x67237108547aC7e2dABFB81EDd1b4CBCFFfc8D0c",
  aggregator: "0x6973CF85d479b9253E13E71F377E8CD2c2dfECd7",
  delegated: "0x9C42461AA8422926e3AEF7B1C6e3743597149d79",
  ve: "0x2548BF65916fdABB5A5673fC4225011FF29ee884",
  ybc: "0xd6AFd78C05f0d425F2b46359746dD44991dCB315",
};
export const INDEX_TOKENS = [
  "0x42b25284E8ae427D79da78b65DFFC232aAECc016",
  "0xA16F6FC7380300525C812ea2733Ad62DDA58143B",
  "0x52Aa16860E0D42B6a7b6ecC15688472eb20135c9",
  "0x3d4Ced97ADb0ae3A53DA95a47fFc749aAd26BC8f",
];
const lower = (value) => value.toLowerCase();
const tokens = new Set(INDEX_TOKENS.map(lower));
const sources = [...INDEX_TOKENS, INDEX_DEPLOYMENT.ve, INDEX_DEPLOYMENT.aggregator];
const events = [
  parseAbiItem("event Transfer(address indexed sender,address indexed receiver,uint256 value)"),
  parseAbiItem("event Migrate(address indexed account,uint256 unlock_epoch,uint256 amount)"),
  parseAbiItem("event AddComponent(address indexed component,address indexed depositor)"),
];
const abi = parseAbi([
  "function weight(address) view returns (uint256)",
  "function weight_measure() view returns (address)",
  "function voter() view returns (address)",
  "function weight_aggregator() view returns (address)",
  "function delegated_staking() view returns (address)",
  "function voting_escrow() view returns (address)",
  "function ybc() view returns (address)",
]);

export function collectVotingCandidates(logs, candidates, components) {
  for (const log of logs) {
    if (log.removed) throw new Error("Removed event in canonical index range.");
    const source = lower(log.address);
    if (log.eventName === "Transfer" && tokens.has(source)) {
      for (const address of [log.args.sender, log.args.receiver]) {
        if (address && lower(address) !== zeroAddress) candidates.add(lower(address));
      }
    } else if (log.eventName === "Migrate" && source === lower(INDEX_DEPLOYMENT.ve)) {
      candidates.add(lower(log.args.account));
    } else if (log.eventName === "AddComponent" && source === lower(INDEX_DEPLOYMENT.aggregator)) {
      const depositor = lower(log.args.depositor);
      if (!tokens.has(depositor)) throw new Error("An unindexed staking component was added; update the index sources.");
      components.add(depositor);
    }
  }
}

async function scan(client, fromBlock, toBlock) {
  try {
    return await client.getLogs({ address: sources, events, strict: true, fromBlock, toBlock });
  } catch (error) {
    if (toBlock - fromBlock < 500n) throw error;
    const middle = (fromBlock + toBlock) / 2n;
    return [...await scan(client, fromBlock, middle), ...await scan(client, middle + 1n, toBlock)];
  }
}

export async function buildVotingPowerSnapshot(client, previous = null, progress = () => {}) {
  if (await client.getChainId() !== 1) throw new Error("The index requires Ethereum Mainnet.");
  const head = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber: head - 12n });
  if (!block.hash || block.number === null) throw new Error("Missing canonical snapshot block.");
  const blockNumber = block.number;
  const call = (address, functionName, args = []) => ({ address, abi, functionName, args });
  const [measure, voter, aggregator, delegated, ve] = await client.multicall({ blockNumber, allowFailure: false, contracts: [
    call(INDEX_DEPLOYMENT.voting, "weight_measure"), call(INDEX_DEPLOYMENT.voting, "voter"),
    call(INDEX_DEPLOYMENT.measure, "weight_aggregator"), call(INDEX_DEPLOYMENT.measure, "delegated_staking"),
    call(INDEX_DEPLOYMENT.measure, "voting_escrow"),
  ] });
  if (lower(voter) !== "0x5069bce8c8e371a45ab113604b128bbdf5ee5c11") throw new Error("The active Voter is not supported by this index.");
  const [ybc, voterDelegated] = await client.multicall({ blockNumber, allowFailure: false, contracts: [call(voter, "ybc"), call(voter, "delegated_staking")] });
  for (const [actual, expected] of [[measure, INDEX_DEPLOYMENT.measure], [aggregator, INDEX_DEPLOYMENT.aggregator], [delegated, INDEX_DEPLOYMENT.delegated], [voterDelegated, delegated], [ve, INDEX_DEPLOYMENT.ve], [ybc, INDEX_DEPLOYMENT.ybc]]) {
    if (lower(actual) !== lower(expected)) throw new Error("Governance configuration differs from the indexed deployment.");
  }
  const priorCode = await Promise.all(sources.map((address) => client.getCode({ address, blockNumber: INDEX_FROM_BLOCK - 1n })));
  if (priorCode.some((code) => code && code !== "0x")) throw new Error("Index start does not precede every source deployment.");
  let cache = previous;
  if (cache && (cache.version !== 1 || cache.fromBlock !== String(INDEX_FROM_BLOCK) || BigInt(cache.block.number) > blockNumber ||
      (await client.getBlock({ blockNumber: BigInt(cache.block.number) })).hash !== cache.block.hash)) cache = null;
  const candidates = new Set(cache?.accounts ?? []);
  const components = new Set(cache?.components ?? []);
  let from = cache ? BigInt(cache.block.number) + 1n : INDEX_FROM_BLOCK;
  const started = Date.now();
  while (from <= blockNumber) {
    const ranges = [];
    for (let index = 0; index < 4 && from <= blockNumber; index++) {
      const to = from + 49_999n < blockNumber ? from + 49_999n : blockNumber;
      ranges.push([from, to]);
      from = to + 1n;
    }
    const results = await Promise.all(ranges.map(([first, last]) => scan(client, first, last)));
    for (const logs of results) collectVotingCandidates(logs, candidates, components);
    progress({ throughBlock: String(from - 1n), accounts: candidates.size });
  }
  if (components.size !== INDEX_TOKENS.length) throw new Error("Incomplete aggregator component history.");
  candidates.add(lower(ybc));
  // The underlying stYFI held by stYFIx is replaced by its epoch snapshot.
  // Count that pool once, never both the underlying stake and delegated shares.
  candidates.delete(lower(delegated));
  candidates.delete(zeroAddress);
  const addresses = [...candidates].sort();
  const accounts = [];
  let stakedPower = 0n;
  let migratedVePower = 0n;
  for (let i = 0; i < addresses.length; i += 100) {
    const batch = addresses.slice(i, i + 100);
    const weights = await client.multicall({ blockNumber, allowFailure: false, contracts: batch.flatMap((address) => [call(measure, "weight", [address]), call(aggregator, "weight", [address])]) });
    batch.forEach((address, index) => {
      const direct = weights[index * 2];
      const staked = weights[index * 2 + 1];
      if (direct < staked) throw new Error("Inconsistent direct voting-weight breakdown.");
      stakedPower += staked;
      migratedVePower += direct - staked;
      if (direct > 0n) accounts.push({ address, stakedPower: String(staked), migratedVePower: String(direct - staked), directPower: String(direct) });
    });
  }
  const [delegatedPower] = await client.multicall({ blockNumber, allowFailure: false, contracts: [call(measure, "weight", [delegated])] });
  if ((await client.getBlock({ blockNumber })).hash !== block.hash) throw new Error("Snapshot block was replaced during indexing.");
  const snapshot = {
    version: 1, chainId: 1,
    block: { number: String(blockNumber), hash: block.hash, timestamp: Number(block.timestamp) },
    deployment: INDEX_DEPLOYMENT,
    coverage: { fromBlock: String(INDEX_FROM_BLOCK), throughBlock: String(blockNumber), complete: true, tokens: INDEX_TOKENS, candidateCount: candidates.size },
    totals: { stakedPower: String(stakedPower), migratedVePower: String(migratedVePower), delegatedPower: String(delegatedPower), totalPower: String(stakedPower + migratedVePower + delegatedPower) },
    accounts,
  };
  return { snapshot, cache: { version: 1, fromBlock: String(INDEX_FROM_BLOCK), block: snapshot.block, accounts: addresses, components: [...components] }, elapsedMs: Date.now() - started };
}

async function atomicJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n");
  await rename(`${file}.tmp`, file);
}

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const rpc = process.env.DAO_VOTING_POWER_RPC_URL || (process.env.NEXT_PUBLIC_RPC_URLS ?? "").split(",").map((value) => value.trim()).find(Boolean);
  if (!rpc) throw new Error("Configure DAO_VOTING_POWER_RPC_URL or NEXT_PUBLIC_RPC_URLS.");
  const client = createPublicClient({ chain: mainnet, transport: http(rpc, { timeout: 20_000, retryCount: 1 }) });
  const output = resolve(process.env.DAO_VOTING_POWER_OUTPUT ?? "public/dao-voting-power.json");
  const cacheFile = resolve("outputs/dao-voting-power-index.json");
  let cache = null;
  try { cache = JSON.parse(await readFile(cacheFile, "utf8")); } catch { /* First run has no index. */ }
  do {
    try {
      const result = await buildVotingPowerSnapshot(client, cache, (progress) => console.log(JSON.stringify(progress)));
      await atomicJson(output, result.snapshot);
      await atomicJson(cacheFile, result.cache);
      cache = result.cache;
      console.log(JSON.stringify({ block: result.snapshot.block, totals: result.snapshot.totals, candidates: cache.accounts.length, elapsedMs: result.elapsedMs, output }));
    } catch (error) {
      // Do not print provider errors: they may contain credential-bearing URLs.
      console.error(`Voting-power snapshot failed: ${error instanceof Error ? error.name : "unknown error"}. No snapshot was replaced.`);
      if (!process.argv.includes("--watch")) process.exitCode = 1;
    }
    if (!process.argv.includes("--watch")) break;
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  } while (true);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
