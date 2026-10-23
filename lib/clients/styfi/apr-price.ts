import { parseAbi, type PublicClient } from "viem";
import type { GlobalData } from "@/lib/schemas/global";
import type { StyfiAprValuation } from "./apr-types";

export const YFI_USD_FEED = "0xA027702dbb89fbd58938e4324ac03B58d812b0E1" as const;
// Chainlink YFI/USD updates on a 1% deviation or a 24-hour heartbeat.
// https://data.chain.link/ethereum/mainnet/crypto-usd/yfi-usd
export const YFI_PRICE_HEARTBEAT_SECONDS = 86_400;
const oracleAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
]);

export function styfiFeedValuation(data: GlobalData | null, now: number): StyfiAprValuation {
  const yfi = data?.global.yfi;
  // Publication time is not the quote's update time.
  const timestamp = yfi?.priceUpdatedAt ?? null;
  const price = yfi?.priceCts ? BigInt(yfi.priceCts) : 0n;
  const knownOracle = yfi?.priceSource === "chainlink:yfi-usd" &&
    yfi.priceFeed?.toLowerCase() === YFI_USD_FEED.toLowerCase() && yfi.priceUpdatedAt != null;
  const invalidTime = timestamp === null || timestamp <= 0 || timestamp > now ||
    now - timestamp > YFI_PRICE_HEARTBEAT_SECONDS;
  // The producer currently applies a three-hour limit to this 24-hour feed.
  // Re-evaluate only its age-only status for the verified source. Preserve errors.
  const upstreamError = ["cached", "unavailable", "error"].includes(yfi?.priceStatus?.toLowerCase() ?? "");
  return {
    yfiPriceCts: price > 0n ? price : null,
    timestamp,
    stale: price <= 0n || invalidTime || upstreamError ||
      (!knownOracle && (yfi?.priceStale === true || yfi?.priceStatus?.toLowerCase() === "stale")),
  };
}

/** Read the latest oracle quote at the same block as the reward calculation. */
export async function readStyfiAprValuation(
  client: PublicClient,
  blockNumber: bigint,
  timestamp: number,
  fallback: GlobalData | null,
): Promise<StyfiAprValuation> {
  const cached = styfiFeedValuation(fallback, timestamp);
  try {
    const [decimals, description, round] = await client.multicall({
      contracts: [
        { address: YFI_USD_FEED, abi: oracleAbi, functionName: "decimals" },
        { address: YFI_USD_FEED, abi: oracleAbi, functionName: "description" },
        { address: YFI_USD_FEED, abi: oracleAbi, functionName: "latestRoundData" },
      ],
      blockNumber,
      allowFailure: false,
    });
    const [roundId, answer, , updatedAt, answeredInRound] = round;
    if (description !== "YFI / USD" || decimals !== 8 || roundId === 0n ||
      answer <= 0n || updatedAt <= 0n || updatedAt > BigInt(timestamp) || answeredInRound < roundId) {
      return cached;
    }
    const price = answer / 1_000_000n;
    if (price <= 0n) return cached;
    return {
      yfiPriceCts: price,
      timestamp: Number(updatedAt),
      stale: timestamp - Number(updatedAt) > YFI_PRICE_HEARTBEAT_SECONDS,
    };
  } catch {
    return cached;
  }
}
