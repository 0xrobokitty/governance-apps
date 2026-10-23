import { erc20Abi, parseAbi, type Abi, type Address, type PublicClient } from "viem";
import deployment from "@/lib/deployment.json";
import {
  EPOCH_LENGTH,
  GENESIS,
  LIQUID_LOCKERS,
  REWARD_CLAIMER_ADDRESS,
  REWARD_DISTRIBUTOR_ADDRESS,
  REWARD_TOKEN_CONFIG,
  STYFI_ADDRESS,
  STYFI_REWARD_DISTRIBUTOR_ADDRESS,
  STYFIX_ADDRESS,
  STYFIX_REWARD_DISTRIBUTOR_ADDRESS,
  VEYFI_REWARD_DISTRIBUTOR_ADDRESS,
} from "@/lib/constants";
import type { GlobalData } from "@/lib/schemas/global";
import { deriveStyfiAprSnapshot, unavailableStyfiAprSnapshot, unpackVoteBoostWeight } from "./apr";
import type { StyfiAprPosition, StyfiAprSnapshot, StyfiAprValuation, StyfiRewardScale } from "./apr-types";
import { STYFI_GOVERNANCE } from "./deployment";

const rewardAbi = parseAbi([
  "function last_epoch() view returns (uint256)",
  "function rewards(address,uint256) view returns (uint256)",
  "function components(address) view returns ((address next,uint256 epoch,uint256 numerator,uint256 denominator))",
]);
const stakingAbi = parseAbi([
  "function total_weight_cursor() view returns ((uint256 count,uint256 last))",
  "function total_weight_entries(uint256) view returns ((uint256 epoch,uint256 weight))",
]);
const boostAbi = parseAbi([
  "function num_proposals(uint256) view returns (uint256)",
  "function num_votes(uint256,address) view returns (uint256)",
  "function packed_total_weights(uint256) view returns (uint256)",
  "function weight(uint256,address) view returns (uint256)",
  "function last_claimed(address) view returns (uint256)",
  "function ve_migrated(address) view returns (bool)",
  "function ve_locks(address) view returns ((uint256 amount,uint256 boost_epochs,uint256 unlock_time))",
]);
const veAbi = parseAbi([
  "function locks(address) view returns ((uint256 amount,uint256 boost_epochs,uint256 unlock_time))",
  "function check_lock(address) view returns (uint256,uint256)",
  "function last_claimed(address) view returns (uint256)",
  "function total_weights(uint256) view returns ((uint256 weight,uint256 slope))",
]);
const vaultAbi = parseAbi([
  "function asset() view returns (address)",
  "function convertToAssets(uint256) view returns (uint256)",
]);
const addressAbi = parseAbi([
  "function distributor() view returns (address)",
  "function claim_from() view returns (address)",
]);
const ybcAbi = parseAbi([
  "function killed() view returns (bool)",
  "function supply() view returns (uint256)",
  "function staked(address) view returns (uint256)",
  "function members(address) view returns (bool)",
]);
const llAbi = parseAbi([
  "function normalized_weights(uint256) view returns (uint256)",
  "function current_rewards(uint256) view returns ((uint256 timestamp,uint256 rewards))",
]);
const LL_REWARDS = deployment.LIQUID_LOCKER_REWARD_DISTRIBUTOR as Address;
const YBC = deployment.YBC.YBC as Address;
const YBC_WEIGHTS = deployment.YBC.WEIGHT_AGGREGATOR as Address;
const YBC_REWARDS = deployment.YBC.REWARD_DISTRIBUTOR as Address;
// The configured reward vault holds USDC. Another asset needs a separate price source.
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const PRICE_MAX_AGE_SECONDS = 24 * 60 * 60;

function registeredScale(value: unknown): StyfiRewardScale | null {
  const component = value as { next: Address; numerator: bigint; denominator: bigint };
  return component.next === "0x0000000000000000000000000000000000000000"
    ? null : { numerator: component.numerator, denominator: component.denominator };
}

type Read = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };
const call = (address: Address, abi: Abi, functionName: string, args?: readonly unknown[]): Read => ({ address, abi, functionName, args });

function valuation(globalData: GlobalData | null, now: number): StyfiAprValuation {
  const timestamp = globalData?.global.yfi.priceUpdatedAt ?? globalData?.meta.timestamp ?? null;
  const price = globalData?.global.yfi.priceCts;
  return {
    yfiPriceCts: price && BigInt(price) > 0n ? BigInt(price) : null,
    timestamp,
    stale: globalData?.global.yfi.priceStale === true ||
      ["stale", "unavailable", "error"].includes(globalData?.global.yfi.priceStatus?.toLowerCase() ?? "") ||
      timestamp === null || timestamp > now + 300 || now - timestamp > PRICE_MAX_AGE_SECONDS,
  };
}

/** All contract reads use one block. No transactions or wallet signatures are required. */
export async function fetchStyfiAprSnapshot(
  client: PublicClient,
  globalData: GlobalData | null,
  address?: Address,
): Promise<StyfiAprSnapshot> {
  let price = valuation(globalData, Math.floor(Date.now() / 1000));
  try {
    if (await client.getChainId() !== 1) return unavailableStyfiAprSnapshot(price);
    const block = await client.getBlock({ blockTag: "latest" });
    if (block.number === null || block.hash === null) return unavailableStyfiAprSnapshot(price);
    const timestamp = Number(block.timestamp);
    price = valuation(globalData, timestamp);
    const currentEpoch = Number((block.timestamp - GENESIS) / BigInt(EPOCH_LENGTH));
    if (currentEpoch <= 0) return unavailableStyfiAprSnapshot(price);
    const rewardEpoch = currentEpoch - 1;
    const epoch = BigInt(rewardEpoch);
    const read = async (contracts: Read[]): Promise<readonly unknown[]> => client.multicall({
      contracts,
      blockNumber: block.number!,
      allowFailure: false,
    });

    const [lastEpoch, cursorValue, rewardDecimalsValue, assetValue, delegatedSource, ybcKilled, ybcClaimFrom, ybcSupplyValue, stakingComponent, boostComponent] = await read([
      call(REWARD_DISTRIBUTOR_ADDRESS, rewardAbi, "last_epoch"),
      call(STYFI_REWARD_DISTRIBUTOR_ADDRESS, stakingAbi, "total_weight_cursor"),
      call(REWARD_TOKEN_CONFIG.address, erc20Abi, "decimals"),
      call(REWARD_TOKEN_CONFIG.address, vaultAbi, "asset"),
      call(STYFIX_REWARD_DISTRIBUTOR_ADDRESS, addressAbi, "distributor"),
      call(YBC_REWARDS, ybcAbi, "killed"),
      call(YBC_REWARDS, addressAbi, "claim_from"),
      call(YBC_WEIGHTS, ybcAbi, "supply"),
      call(REWARD_DISTRIBUTOR_ADDRESS, rewardAbi, "components", [STYFI_REWARD_DISTRIBUTOR_ADDRESS]),
      call(REWARD_DISTRIBUTOR_ADDRESS, rewardAbi, "components", [STYFI_GOVERNANCE.voteBoost]),
    ]);
    // rewards() reports zero before finalization. Do not misrepresent that as a zero APR.
    if ((lastEpoch as bigint) <= epoch || (assetValue as string).toLowerCase() !== USDC ||
      (delegatedSource as string).toLowerCase() !== STYFI_GOVERNANCE.delegatedRewardClaimer.toLowerCase() ||
      (!ybcKilled && (ybcClaimFrom as string).toLowerCase() !== REWARD_CLAIMER_ADDRESS.toLowerCase())) {
      return unavailableStyfiAprSnapshot(price);
    }
    const cursor = cursorValue as { count: bigint; last: bigint };
    if (cursor.count === 0n) return unavailableStyfiAprSnapshot(price);
    const rewardDecimals = Number(rewardDecimalsValue);
    if (!Number.isInteger(rewardDecimals) || rewardDecimals < 0 || rewardDecimals > 36) {
      return unavailableStyfiAprSnapshot(price);
    }

    const common = await read([
      call(STYFI_REWARD_DISTRIBUTOR_ADDRESS, stakingAbi, "total_weight_entries", [cursor.count - 1n]),
      call(REWARD_DISTRIBUTOR_ADDRESS, rewardAbi, "rewards", [STYFI_REWARD_DISTRIBUTOR_ADDRESS, epoch]),
      call(REWARD_DISTRIBUTOR_ADDRESS, rewardAbi, "rewards", [STYFI_GOVERNANCE.voteBoost, epoch]),
      call(REWARD_DISTRIBUTOR_ADDRESS, rewardAbi, "rewards", [LL_REWARDS, epoch]),
      call(REWARD_DISTRIBUTOR_ADDRESS, rewardAbi, "rewards", [VEYFI_REWARD_DISTRIBUTOR_ADDRESS, epoch]),
      call(STYFI_GOVERNANCE.voteBoost, boostAbi, "packed_total_weights", [epoch / 5n]),
      call(STYFI_GOVERNANCE.voteBoost, boostAbi, "num_proposals", [epoch]),
      call(STYFI_GOVERNANCE.voteBoost, boostAbi, "num_proposals", [BigInt(currentEpoch)]),
      call(STYFI_GOVERNANCE.voteBoost, boostAbi, "num_votes", [BigInt(currentEpoch), STYFIX_ADDRESS]),
      call(STYFIX_ADDRESS, erc20Abi, "totalSupply"),
      call(REWARD_TOKEN_CONFIG.address, vaultAbi, "convertToAssets", [10n ** BigInt(rewardDecimals)]),
      call(assetValue as Address, erc20Abi, "decimals"),
      call(VEYFI_REWARD_DISTRIBUTOR_ADDRESS, veAbi, "total_weights", [epoch]),
      ...LIQUID_LOCKERS.flatMap((locker) => [
        call(LL_REWARDS, llAbi, "normalized_weights", [BigInt(locker.index)]),
        call(locker.depositor, erc20Abi, "totalSupply"),
        call(LL_REWARDS, llAbi, "current_rewards", [BigInt(locker.index)]),
      ]),
    ]);
    const [stakingEntry, stakingRewards, boostRewards, llRewards, veRewards, packedTotal, rewardProposals, currentProposals, delegatedVotes, styfixSupply, assetsPerShare, assetDecimalsValue, veTotal] = common;
    const rewardAssetDecimals = Number(assetDecimalsValue);
    if (!Number.isInteger(rewardAssetDecimals) || rewardAssetDecimals < 0 || rewardAssetDecimals > 36) {
      return unavailableStyfiAprSnapshot(price);
    }
    const liquidLockerEpochRewards = LIQUID_LOCKERS.map((_, i) => {
      const cached = common[15 + i * 3] as { timestamp: bigint; rewards: bigint };
      // A weight update only affects future epochs after the current stream was cached.
      return cached.timestamp / BigInt(EPOCH_LENGTH) === BigInt(currentEpoch)
        ? cached.rewards
        : (llRewards as bigint) * (common[13 + i * 3] as bigint) / 10n ** 18n;
    });
    const liquidLockerSupplies = LIQUID_LOCKERS.map((_, i) => common[14 + i * 3] as bigint);
    const accounts = [STYFIX_ADDRESS, YBC, ...(address ? [address] : [])];
    const positionValues = await read(accounts.flatMap((account) => [
      call(STYFI_ADDRESS, erc20Abi, "balanceOf", [account]),
      call(STYFIX_ADDRESS, erc20Abi, "balanceOf", [account]),
      ...LIQUID_LOCKERS.map((locker) => call(locker.depositor, erc20Abi, "balanceOf", [account])),
      call(VEYFI_REWARD_DISTRIBUTOR_ADDRESS, veAbi, "locks", [account]),
      call(VEYFI_REWARD_DISTRIBUTOR_ADDRESS, veAbi, "check_lock", [account]),
      call(VEYFI_REWARD_DISTRIBUTOR_ADDRESS, veAbi, "last_claimed", [account]),
      call(STYFI_GOVERNANCE.voteBoost, boostAbi, "weight", [epoch, account]),
      call(STYFI_GOVERNANCE.voteBoost, boostAbi, "last_claimed", [account]),
      call(STYFI_GOVERNANCE.voteBoost, boostAbi, "ve_migrated", [account]),
      call(STYFI_GOVERNANCE.voteBoost, boostAbi, "ve_locks", [account]),
    ]));
    let pendingEarlyExitReport = false;
    const positions = accounts.map((_, i): StyfiAprPosition => {
      const values = positionValues.slice(i * 12, (i + 1) * 12);
      const lock = values[5] as { amount: bigint; boost_epochs: bigint; unlock_time: bigint };
      const checkedLock = values[6] as readonly [bigint, bigint];
      const migrated = (values[7] as bigint) > 0n;
      const unlockedEpoch = lock.unlock_time > GENESIS ? (lock.unlock_time - GENESIS) / BigInt(EPOCH_LENGTH) : 0n;
      // An early exit can still await reporting. Avoid displaying forfeitable rewards as income.
      const validLock = checkedLock[0] > 0n;
      const boostLock = values[11] as { amount: bigint; unlock_time: bigint };
      const boostUnlockEpoch = boostLock.unlock_time > GENESIS ? (boostLock.unlock_time - GENESIS) / BigInt(EPOCH_LENGTH) : 0n;
      if (!validLock && ((migrated && lock.amount > 0n && unlockedEpoch > BigInt(currentEpoch)) ||
        (values[10] === true && boostLock.amount > 0n && boostUnlockEpoch > BigInt(currentEpoch)))) {
        pendingEarlyExitReport = true;
      }
      const receivesVeRewards = migrated && (validLock || unlockedEpoch <= BigInt(currentEpoch)) &&
        (values[7] as bigint) <= block.timestamp && unlockedEpoch > epoch && lock.boost_epochs >= epoch;
      return {
        styfi: values[0] as bigint,
        styfix: values[1] as bigint,
        // Depositor shares already use YFI units, including the 1UP depositor.
        liquidLockers: values.slice(2, 5) as bigint[],
        veYfi: migrated && validLock && lock.unlock_time > block.timestamp ? lock.amount : 0n,
        veRewardWeight: receivesVeRewards ? lock.amount + lock.amount / 104n * (lock.boost_epochs - epoch) : 0n,
        boostWeight: (values[9] as bigint) > 0n && (values[9] as bigint) <= block.timestamp ? values[8] as bigint : 0n,
      };
    });
    if (pendingEarlyExitReport) return unavailableStyfiAprSnapshot(price);
    let account;
    if (address) {
      const [member, memberStake, votes, rewardEpochVotes] = await read([
        call(YBC, ybcAbi, "members", [address]),
        call(YBC_WEIGHTS, ybcAbi, "staked", [address]),
        call(STYFI_GOVERNANCE.voteBoost, boostAbi, "num_votes", [BigInt(currentEpoch), address]),
        call(STYFI_GOVERNANCE.voteBoost, boostAbi, "num_votes", [epoch, address]),
      ]);
      account = {
        address,
        position: positions[2],
        isYbcMember: member as boolean,
        ybcStake: memberStake as bigint,
        participation: { votes: votes as bigint, proposals: currentProposals as bigint },
        rewardEpochVotes: rewardEpochVotes as bigint,
      };
    }
    const canonicalBlock = await client.getBlock({ blockNumber: block.number });
    if (canonicalBlock.hash !== block.hash) return unavailableStyfiAprSnapshot(price);
    return deriveStyfiAprSnapshot({
      blockNumber: block.number,
      timestamp,
      currentEpoch,
      rewardEpoch,
      rewardScales: { staking: registeredScale(stakingComponent), voteBoost: registeredScale(boostComponent) },
      valuation: price,
      rewardDecimals,
      rewardAssetDecimals,
      rewardAssetsPerShare: assetsPerShare as bigint,
      stakingEpochRewards: stakingRewards as bigint,
      stakingWeight: (stakingEntry as { weight: bigint }).weight,
      styfixSupply: styfixSupply as bigint,
      delegatedPosition: positions[0],
      boostEpochRewards: boostRewards as bigint,
      boostTotalWeight: unpackVoteBoostWeight(packedTotal as bigint, rewardEpoch),
      rewardEpochProposals: rewardProposals as bigint,
      delegatedParticipation: { votes: delegatedVotes as bigint, proposals: currentProposals as bigint },
      liquidLockerEpochRewards,
      liquidLockerSupplies,
      veEpochRewards: veRewards as bigint,
      veTotalWeight: (veTotal as { weight: bigint }).weight,
      ybcPosition: positions[1],
      ybcSupply: ybcSupplyValue as bigint,
      ybcRewardsEnabled: !(ybcKilled as boolean),
      account,
    });
  } catch {
    return unavailableStyfiAprSnapshot(price);
  }
}
