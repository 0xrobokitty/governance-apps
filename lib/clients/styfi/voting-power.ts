import { erc20Abi, parseAbi, type Address, type Hash, type PublicClient } from "viem";
import type { DaoDeployment } from "@/lib/clients/dao/deployment";
import type { DaoAccountProposalFacts } from "@/lib/clients/dao/types";
import { assertYbcMainnetDeployment } from "@/lib/clients/ybc/deployment";
import type { YbcFeed } from "@/lib/schemas/ybc-feed";
import { STYFI_GOVERNANCE } from "./deployment";
import { LIQUID_LOCKERS } from "@/lib/constants";
import type { StyfiAccountState } from "./types";
import type { VeyfiAccountState } from "@/lib/clients/veyfi/types";

const votingAbi = parseAbi([
  "function weight_measure() view returns (address)",
  "function voter() view returns (address)",
]);
const measureAbi = parseAbi([
  "function weight(address) view returns (uint256)",
  "function weight_aggregator() view returns (address)",
]);
const voterAbi = parseAbi([
  "function delegated_staking() view returns (address)",
  "function ybc() view returns (address)",
  "function ybc_weight_aggregator() view returns (address)",
]);
const weightAbi = parseAbi(["function weight(address) view returns (uint256)"]);
const ybcAbi = parseAbi([
  "function members(address) view returns (bool)",
  "function num_members() view returns (uint256)",
]);

export type StyfiYbcVotingInfluence = {
  delegatedPower: bigint;
  collectivePower: bigint;
  totalPower: bigint;
  memberShareBps: bigint;
};

export type StyfiVotingPower = {
  address: Address;
  blockNumber: bigint | null;
  blockHash: Hash | null;
  timestamp: number;
  stakedPower: bigint;
  migratedVePower: bigint;
  directPower: bigint;
  delegatedBalance: bigint;
  isYbcMember: boolean;
  memberWeight: bigint;
  /** A full-participation estimate, never the weight of a submitted DAO vote. */
  ybcInfluence: StyfiYbcVotingInfluence | null;
};

/** Voter blends only the YBC members who vote on each proposal. This estimate
 * assumes that every member with current voting weight participates. */
export function deriveYbcVotingInfluence(input: {
  directPower: bigint;
  memberWeight: bigint;
  totalMemberWeight: bigint;
  delegatedPoolPower: bigint;
  collectivePoolPower: bigint;
}): StyfiYbcVotingInfluence {
  const { directPower, memberWeight, totalMemberWeight, delegatedPoolPower, collectivePoolPower } = input;
  if (Object.values(input).some((value) => value < 0n)) {
    throw new Error("Voting weights cannot be negative.");
  }
  if (memberWeight > totalMemberWeight) {
    throw new Error("Member voting weight exceeds the complete roster weight.");
  }
  // Voter requires a positive personal vote before it updates either pool.
  if (directPower === 0n || memberWeight === 0n || totalMemberWeight === 0n) {
    return { delegatedPower: 0n, collectivePower: 0n, totalPower: directPower, memberShareBps: 0n };
  }
  const delegatedPower = (delegatedPoolPower * memberWeight) / totalMemberWeight;
  const collectivePower = (collectivePoolPower * memberWeight) / totalMemberWeight;
  return {
    delegatedPower,
    collectivePower,
    totalPower: directPower + delegatedPower + collectivePower,
    memberShareBps: (memberWeight * 10_000n) / totalMemberWeight,
  };
}

export async function readStyfiVotingPower({
  publicClient,
  account,
  deployment = { votingAddress: STYFI_GOVERNANCE.voting, supportedVoters: [STYFI_GOVERNANCE.voter] },
  ybcFeed,
}: {
  publicClient: PublicClient;
  account: Address;
  deployment?: Pick<DaoDeployment, "votingAddress" | "supportedVoters">;
  ybcFeed?: YbcFeed | null;
}): Promise<StyfiVotingPower> {
  if (publicClient.chain?.id !== 1 || await publicClient.getChainId() !== 1) {
    throw new Error("Voting power requires an Ethereum Mainnet RPC.");
  }
  const block = await publicClient.getBlock({ blockTag: "latest" });
  if (block.number === null || block.hash === null) {
    throw new Error("The voting power snapshot is unavailable.");
  }
  const blockNumber = block.number;
  const [measure, voter] = await publicClient.multicall({
    blockNumber,
    allowFailure: false,
    contracts: [
      { address: deployment.votingAddress, abi: votingAbi, functionName: "weight_measure" },
      { address: deployment.votingAddress, abi: votingAbi, functionName: "voter" },
    ],
  });
  if (!deployment.supportedVoters.some((address) => address.toLowerCase() === voter.toLowerCase())) {
    throw new Error("The current DAO voter is not supported.");
  }
  const [aggregator, delegatedStaking, ybc, memberAggregator] = await publicClient.multicall({
    blockNumber,
    allowFailure: false,
    contracts: [
      { address: measure, abi: measureAbi, functionName: "weight_aggregator" },
      { address: voter, abi: voterAbi, functionName: "delegated_staking" },
      { address: voter, abi: voterAbi, functionName: "ybc" },
      { address: voter, abi: voterAbi, functionName: "ybc_weight_aggregator" },
    ],
  });
  const [directPower, stakedPower, delegatedBalance, isYbcMember, memberWeight] = await publicClient.multicall({
    blockNumber,
    allowFailure: false,
    contracts: [
      { address: measure, abi: measureAbi, functionName: "weight", args: [account] },
      { address: aggregator, abi: weightAbi, functionName: "weight", args: [account] },
      { address: delegatedStaking, abi: erc20Abi, functionName: "balanceOf", args: [account] },
      { address: ybc, abi: ybcAbi, functionName: "members", args: [account] },
      { address: memberAggregator, abi: weightAbi, functionName: "weight", args: [account] },
    ],
  });
  if (directPower < stakedPower) {
    throw new Error("The DAO weight measure does not match the staking breakdown.");
  }

  let ybcInfluence: StyfiYbcVotingInfluence | null = null;
  if (!isYbcMember || directPower === 0n || memberWeight === 0n) {
    ybcInfluence = deriveYbcVotingInfluence({
      directPower, memberWeight: 0n, totalMemberWeight: 0n,
      delegatedPoolPower: 0n, collectivePoolPower: 0n,
    });
  } else if (ybcFeed) {
    // The feed supplies candidate addresses only. Membership and every weight
    // are read at the same block as personal power, including removed entries.
    // A missing new member invalidates the estimate through num_members.
    try {
      assertYbcMainnetDeployment(ybcFeed);
      if (ybc.toLowerCase() !== ybcFeed.deployment.ybc.toLowerCase() ||
          memberAggregator.toLowerCase() !== ybcFeed.deployment.ybcWeightAggregator.toLowerCase()) {
        throw new Error("The YBC roster does not match the current voter.");
      }
      const candidates = [...new Set(ybcFeed.members.map((member) => member.address.toLowerCase()))] as Address[];
      const [memberCount, delegatedPoolPower, collectivePoolPower] = await publicClient.multicall({
        blockNumber,
        allowFailure: false,
        contracts: [
          { address: ybc, abi: ybcAbi, functionName: "num_members" },
          { address: measure, abi: measureAbi, functionName: "weight", args: [delegatedStaking] },
          { address: measure, abi: measureAbi, functionName: "weight", args: [ybc] },
        ],
      });
      const memberships = await publicClient.multicall({
        blockNumber,
        allowFailure: false,
        contracts: candidates.map((address) => ({ address: ybc, abi: ybcAbi, functionName: "members" as const, args: [address] as const })),
      });
      const members = candidates.filter((_, index) => memberships[index]);
      if (BigInt(members.length) !== memberCount || !members.includes(account.toLowerCase() as Address)) {
        throw new Error("The YBC member roster is incomplete.");
      }
      const memberWeights = await publicClient.multicall({
        blockNumber,
        allowFailure: false,
        contracts: members.map((address) => ({ address: memberAggregator, abi: weightAbi, functionName: "weight" as const, args: [address] as const })),
      });
      ybcInfluence = deriveYbcVotingInfluence({
        directPower, memberWeight, delegatedPoolPower, collectivePoolPower,
        totalMemberWeight: memberWeights.reduce((sum, weight) => sum + weight, 0n),
      });
    } catch {
      // Personal power remains useful when roster-dependent estimates fail.
      ybcInfluence = null;
    }
  }
  const canonicalBlock = await publicClient.getBlock({ blockNumber });
  if (canonicalBlock.hash !== block.hash) {
    throw new Error("The voting power snapshot changed. Refresh to try again.");
  }
  return {
    address: account, blockNumber, blockHash: block.hash, timestamp: Number(block.timestamp),
    stakedPower, migratedVePower: directPower - stakedPower, directPower, delegatedBalance,
    isYbcMember, memberWeight, ybcInfluence,
  };
}

export function createMockStyfiVotingPowerFromAccounts(input: {
  address: Address;
  account: StyfiAccountState;
  veyfiAccount: VeyfiAccountState;
  isYbcMember: boolean;
  timestamp: number;
}): StyfiVotingPower {
  const { address, account, veyfiAccount, isYbcMember, timestamp } = input;
  const stakedPower = account.styfiActive + LIQUID_LOCKERS.reduce((total, locker) =>
    total + (veyfiAccount.llyfiTokens.find((token) => token.symbol === locker.symbol)?.stakedBalance ?? 0n) / locker.scale, 0n);
  const migratedVePower = veyfiAccount.veYfi?.migrated && veyfiAccount.veYfi.unlockTime > timestamp
    ? veyfiAccount.veYfi.lockedAmount : 0n;
  return {
    ...createMockStyfiVotingPower({
      address, stakedPower, migratedVePower,
      delegatedBalance: account.styfiX.assetsActive, isYbcMember,
    }),
    timestamp,
  };
}

export function createMockStyfiVotingPower(input: {
  address: Address;
  stakedPower: bigint;
  migratedVePower: bigint;
  delegatedBalance: bigint;
  isYbcMember?: boolean;
}): StyfiVotingPower {
  const directPower = input.stakedPower + input.migratedVePower;
  const memberWeight = input.isYbcMember ? input.stakedPower : 0n;
  return {
    ...input,
    isYbcMember: input.isYbcMember ?? false,
    blockNumber: null,
    blockHash: null,
    timestamp: 1_800_000_000,
    directPower,
    memberWeight,
    ybcInfluence: deriveYbcVotingInfluence({
      directPower,
      memberWeight,
      totalMemberWeight: memberWeight + 900n * 10n ** 18n,
      delegatedPoolPower: 2_000n * 10n ** 18n,
      collectivePoolPower: 100n * 10n ** 18n,
    }),
  };
}

/** DAO fixtures own their wallet and weight independently of the staking mocks.
 * Their base voting weight is modeled as matured stake, before proposal decay. */
export function createMockDaoVotingPower(input: {
  account: Pick<DaoAccountProposalFacts, "address" | "connected" | "correctChain" | "votingWeight">;
  isYbcMember: boolean;
  timestamp: number;
}): StyfiVotingPower | null {
  if (!input.account.connected || !input.account.correctChain) return null;
  return {
    ...createMockStyfiVotingPower({
      address: input.account.address,
      stakedPower: input.account.votingWeight,
      migratedVePower: 0n,
      delegatedBalance: 0n,
      isYbcMember: input.isYbcMember,
    }),
    timestamp: input.timestamp,
  };
}
