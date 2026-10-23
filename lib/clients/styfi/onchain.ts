// lib/clients/styfi/onchain.ts
import { type Address, type PublicClient, erc20Abi, parseAbi } from "viem";
import { getAccount } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import type { PreparedTransaction } from "@/lib/tx/types";
import type {
  StyfiAccountState,
  StyfiGlobalStats,
  EpochInfo,
  StyfiNudgeState,
  BlacklistStatus,
} from "./types";
import type { StyfiClient, StyfiStakeMode } from "./client";
import { getEpochInfo as getEpochInfoFromGenesis } from "@/lib/format";
import type { GlobalData } from "@/lib/schemas/global";
import {
  STYFI_ADDRESS,
  STYFIX_ADDRESS,
  YFI_ADDRESS,
  STAKING_MIDDLEWARE,
  REWARD_CLAIMER_ADDRESS,
  REWARD_TOKEN_CONFIG,
  GENESIS,
  STREAM_DURATION,
  EPOCH_LENGTH,
} from "@/lib/constants";
import { deriveCooldownEndsAt } from "@/lib/clients/shared/cooldown";
import { nowSeconds } from "@/lib/mocks/time";
import { StakedYfiAbi } from "@/lib/abis/StakedYfi";
import { DelegatedStakedYfiAbi } from "@/lib/abis/DelegatedStakedYfi";
import { RewardClaimerAbi } from "@/lib/abis/RewardClaimer";
import { assertMainnetAccount, MAINNET_CHAIN_ID } from "@/lib/tx/network";
import { simulateThenWrite } from "@/lib/tx/simulateWrite";

const BLACKLIST_PROBES: ReadonlyArray<{
  abi: readonly unknown[];
  functionName: string;
}> = [
  {
    abi: parseAbi(["function blacklist(address user) view returns (bool)"]),
    functionName: "blacklist",
  },
  {
    abi: parseAbi([
      "function isBlacklisted(address user) view returns (bool)",
    ]),
    functionName: "isBlacklisted",
  },
  {
    abi: parseAbi([
      "function is_blacklisted(address user) view returns (bool)",
    ]),
    functionName: "is_blacklisted",
  },
  {
    abi: parseAbi(["function blacklisted(address user) view returns (bool)"]),
    functionName: "blacklisted",
  },
  {
    abi: parseAbi(["function blocked(address user) view returns (bool)"]),
    functionName: "blocked",
  },
];

function toBigInt(value: string | number) {
  return typeof value === "number" ? BigInt(Math.trunc(value)) : BigInt(value);
}

export class OnchainStyfiClient implements StyfiClient {
  private rewardTokenDecimals: number | null = null;
  private chainTimeOffsetSeconds: number | null = null;
  private chainTimeLastFetch: number | null = null;

  constructor(
    private publicClient: PublicClient | null,
    private globalData: GlobalData | null
  ) {}

  private async getRewardTokenDecimals(): Promise<number> {
    if (this.rewardTokenDecimals !== null) return this.rewardTokenDecimals;
    if (!this.publicClient) return REWARD_TOKEN_CONFIG.decimals;

    try {
      const decimals = await this.publicClient.readContract({
        address: REWARD_TOKEN_CONFIG.address,
        abi: erc20Abi,
        functionName: "decimals",
      });
      const parsed =
        typeof decimals === "bigint" ? Number(decimals) : decimals;
      if (Number.isFinite(parsed)) {
        this.rewardTokenDecimals = parsed;
        return parsed;
      }
    } catch (error) {
      console.warn("Failed to fetch reward token decimals", error);
    }

    return REWARD_TOKEN_CONFIG.decimals;
  }

  private async getCanonicalNowSeconds(): Promise<number> {
    const localNow = nowSeconds();
    const maxAgeSeconds = 60;

    if (
      this.chainTimeOffsetSeconds !== null &&
      this.chainTimeLastFetch !== null &&
      localNow - this.chainTimeLastFetch < maxAgeSeconds
    ) {
      return localNow + this.chainTimeOffsetSeconds;
    }

    if (this.publicClient) {
      try {
        const block = await this.publicClient.getBlock({ blockTag: "latest" });
        const timestamp = Number(block.timestamp);
        if (Number.isFinite(timestamp)) {
          this.chainTimeOffsetSeconds = timestamp - localNow;
          this.chainTimeLastFetch = localNow;
          return localNow + this.chainTimeOffsetSeconds;
        }
      } catch (error) {
        console.warn("Failed to fetch chain time", error);
      }
    }

    return localNow;
  }

  private async getBlacklistStatus(address: Address): Promise<BlacklistStatus> {
    if (!this.publicClient) return "unknown";

    for (const probe of BLACKLIST_PROBES) {
      try {
        const result = await this.publicClient.readContract({
          address: STAKING_MIDDLEWARE,
          abi: probe.abi as never,
          functionName: probe.functionName as never,
          args: [address],
        });
        if (typeof result === "boolean") {
          return result ? "blocked" : "clear";
        }
      } catch {
        continue;
      }
    }

    return "unknown";
  }

  private buildFallbackAccountState(
    address: Address,
    nowSecondsValue: number
  ): StyfiAccountState {
    const { currentEpoch, epochEnd } = getEpochInfoFromGenesis(
      GENESIS,
      EPOCH_LENGTH,
      nowSecondsValue
    );

    return {
      address,
      isBlacklisted: false,
      blacklistStatus: "unknown",
      yfiBalance: 0n,
      styfiActive: 0n,
      styfiInCooldown: 0n,
      styfiUnlocked: 0n,
      styfiWithdrawable: 0n,
      styfiCooldown: null,
      styfiX: {
        sharesActive: 0n,
        sharesInCooldown: 0n,
        assetsActive: 0n,
        assetsInCooldown: 0n,
        assetsUnlocked: 0n,
        assetsWithdrawable: 0n,
        cooldown: null,
      },
      claimableGenericRewards: 0n,
      claimableBoostedRewards: 0n,
      accruingGenericRewards: 0n,
      accruingBoostedRewards: 0n,
      allowances: {
        yfiToStyfi: 0n,
        yfiToStyfiX: 0n,
      },
      epoch: {
        currentEpoch,
        epochEnd,
        nextEpochStart: epochEnd,
      },
      rewardToken: REWARD_TOKEN_CONFIG,
    };
  }

  async getAccountState(address: Address): Promise<StyfiAccountState> {
    if (!this.publicClient) {
      throw new Error("Wallet public client not available");
    }
    const commonStyfi = { abi: StakedYfiAbi, address: STYFI_ADDRESS } as const;
    const commonStyfix = {
      abi: DelegatedStakedYfiAbi,
      address: STYFIX_ADDRESS,
    } as const;
    const commonYfi = { abi: erc20Abi, address: YFI_ADDRESS } as const;

    try {
      const blacklistStatusPromise = this.getBlacklistStatus(address);

      // 1. Parallel Reads
      const [
        yfiBalance,
        styfiActive,
        styfiStream,
        styfiMaxWithdraw,
        styfiXActive,
        styfiXStream,
        styfiXMaxWithdraw,
        allowanceStyfi,
        allowanceStyfix,
      ] = await this.publicClient.multicall({
        contracts: [
          // Wallet
          { ...commonYfi, functionName: "balanceOf", args: [address] },

          // stYFI
          { ...commonStyfi, functionName: "balanceOf", args: [address] },
          { ...commonStyfi, functionName: "streams", args: [address] },
          { ...commonStyfi, functionName: "maxWithdraw", args: [address] },

          // stYFIx
          { ...commonStyfix, functionName: "balanceOf", args: [address] },
          { ...commonStyfix, functionName: "streams", args: [address] },
          { ...commonStyfix, functionName: "maxWithdraw", args: [address] },

          // Allowances
          {
            ...commonYfi,
            functionName: "allowance",
            args: [address, STYFI_ADDRESS],
          },
          {
            ...commonYfi,
            functionName: "allowance",
            args: [address, STYFIX_ADDRESS],
          },
        ],
        allowFailure: false,
      });

      // 2. Reward Simulation
      let claimableRewards = 0n;
      try {
        const { result } = await this.publicClient.simulateContract({
          address: REWARD_CLAIMER_ADDRESS,
          abi: RewardClaimerAbi,
          functionName: "claim",
          args: [address],
          account: address,
        });
        claimableRewards = result;
      } catch {
        // Fallback for simulation failure (e.g. 0 rewards)
        claimableRewards = 0n;
      }

      // 3. Map Data
      const now = await this.getCanonicalNowSeconds();
      const formatCooldown = (
        stream: readonly [bigint, bigint, bigint],
        withdrawable: bigint
      ) => {
        const [, total, claimed] = stream;
        const remaining = total - claimed;
        if (remaining <= 0n) return null;

        return {
          amount: remaining,
          endsAt: deriveCooldownEndsAt({
            total,
            claimed,
            withdrawable,
            durationSeconds: STREAM_DURATION,
            nowSecondsOverride: now,
          }),
          totalAmount: total,
        };
      };

      const styfiCooldown = formatCooldown(styfiStream, styfiMaxWithdraw);
      const styfiXCooldown = formatCooldown(styfiXStream, styfiXMaxWithdraw);
      const rewardTokenDecimals = await this.getRewardTokenDecimals();
      const blacklistStatus = await blacklistStatusPromise;
      const isBlacklisted = blacklistStatus === "blocked";

      // In the contracts, "streams" returns [start, total, claimed].
      // The "Active" amount in `balanceOf` is what is earning.
      // The "In Cooldown" is `total - claimed`.
      const styfiInCooldown = styfiStream[1] - styfiStream[2];
      const styfiXInCooldown = styfiXStream[1] - styfiXStream[2];

      const { currentEpoch, epochEnd } = getEpochInfoFromGenesis(
        GENESIS,
        EPOCH_LENGTH,
        now
      );

      return {
        address,
        isBlacklisted,
        blacklistStatus,
        yfiBalance,

        styfiActive,
        styfiInCooldown,
        styfiUnlocked: 0n, // Covered by maxWithdraw usually
        styfiWithdrawable: styfiMaxWithdraw,
        styfiCooldown,

        styfiX: {
          sharesActive: styfiXActive,
          sharesInCooldown: styfiXInCooldown,
          assetsActive: styfiXActive, // 1:1 for stYFIx
          assetsInCooldown: styfiXInCooldown,
          assetsUnlocked: 0n,
          assetsWithdrawable: styfiXMaxWithdraw,
          cooldown: styfiXCooldown,
        },

        claimableGenericRewards: claimableRewards,
        claimableBoostedRewards: 0n,
        accruingGenericRewards: 0n,
        accruingBoostedRewards: 0n,

        allowances: {
          yfiToStyfi: allowanceStyfi,
          yfiToStyfiX: allowanceStyfix,
        },

        epoch: {
          currentEpoch,
          epochEnd,
          nextEpochStart: epochEnd,
        },
        rewardToken: {
          ...REWARD_TOKEN_CONFIG,
          decimals: rewardTokenDecimals,
        },
      };
    } catch {
      console.warn("Failed to fetch stYFI account state; using fallback data.");
      return this.buildFallbackAccountState(address, nowSeconds());
    }
  }

  async getNudgeState(address: Address): Promise<StyfiNudgeState> {
    if (!this.publicClient) {
      return {
        yfiBalance: 0n,
        styfiActive: 0n,
        styfiInCooldown: 0n,
        styfiWithdrawable: 0n,
        styfiXActive: 0n,
        styfiXInCooldown: 0n,
        styfiXWithdrawable: 0n,
        claimableRewards: 0n,
      };
    }

    try {
      const commonStyfi = {
        abi: StakedYfiAbi,
        address: STYFI_ADDRESS,
      } as const;
      const commonStyfix = {
        abi: DelegatedStakedYfiAbi,
        address: STYFIX_ADDRESS,
      } as const;
      const commonYfi = { abi: erc20Abi, address: YFI_ADDRESS } as const;

      const [
        yfiBalance,
        styfiActive,
        styfiStream,
        styfiMaxWithdraw,
        styfiXActive,
        styfiXStream,
        styfiXMaxWithdraw,
      ] = await this.publicClient.multicall({
        contracts: [
          { ...commonYfi, functionName: "balanceOf", args: [address] },
          { ...commonStyfi, functionName: "balanceOf", args: [address] },
          { ...commonStyfi, functionName: "streams", args: [address] },
          { ...commonStyfi, functionName: "maxWithdraw", args: [address] },
          { ...commonStyfix, functionName: "balanceOf", args: [address] },
          { ...commonStyfix, functionName: "streams", args: [address] },
          { ...commonStyfix, functionName: "maxWithdraw", args: [address] },
        ],
        allowFailure: false,
      });

      let claimableRewards = 0n;
      try {
        const { result } = await this.publicClient.simulateContract({
          address: REWARD_CLAIMER_ADDRESS,
          abi: RewardClaimerAbi,
          functionName: "claim",
          args: [address],
          account: address,
        });
        claimableRewards = result;
      } catch {
        claimableRewards = 0n;
      }

      return {
        yfiBalance,
        styfiActive,
        styfiInCooldown: styfiStream[1] - styfiStream[2],
        styfiWithdrawable: styfiMaxWithdraw,
        styfiXActive,
        styfiXInCooldown: styfiXStream[1] - styfiXStream[2],
        styfiXWithdrawable: styfiXMaxWithdraw,
        claimableRewards,
      };
    } catch {
      console.warn("Failed to fetch stYFI nudge state; using fallback data.");
      return {
        yfiBalance: 0n,
        styfiActive: 0n,
        styfiInCooldown: 0n,
        styfiWithdrawable: 0n,
        styfiXActive: 0n,
        styfiXInCooldown: 0n,
        styfiXWithdrawable: 0n,
        claimableRewards: 0n,
      };
    }
  }

  async getEpochInfo(): Promise<EpochInfo> {
    const now = await this.getCanonicalNowSeconds();
    const { currentEpoch, epochEnd } = getEpochInfoFromGenesis(
      GENESIS,
      EPOCH_LENGTH,
      now
    );

    return {
      currentEpoch,
      epochEnd,
      nextEpochStart: epochEnd,
    };
  }

  async getStats(): Promise<StyfiGlobalStats> {
    if (this.globalData?.global?.yfi && this.globalData?.styfi) {
      const totalSupply = this.globalData.global.yfi.totalSupply;
      // Global staked excludes cooldown balances; do not add unstaking here.
      const totalStaked = BigInt(this.globalData.styfi.staked);
      return {
        totalSupply: BigInt(totalSupply),
        totalStaked,
      };
    }

    return this.getStatsFromChain();
  }

  async getStatsFromChain(): Promise<StyfiGlobalStats> {
    if (!this.publicClient) {
      return { totalSupply: 0n, totalStaked: 0n };
    }

    try {
      // Only fetch YFI Supply and stYFI Supply.
      // stYFI.totalSupply() includes the YFI staked via stYFIx (delegated).
      const [yfiSupply, styfiSupply] = await this.publicClient.multicall({
        contracts: [
          {
            abi: erc20Abi,
            address: YFI_ADDRESS,
            functionName: "totalSupply",
          },
          {
            abi: StakedYfiAbi,
            address: STYFI_ADDRESS,
            functionName: "totalSupply",
          },
        ],
        allowFailure: false,
      });

      return {
        totalSupply: yfiSupply,
        totalStaked: styfiSupply, // Fixed: removed double counting of stYFIx
      };
    } catch (e) {
      console.warn("Failed to fetch global stats", e);
      return { totalSupply: 0n, totalStaked: 0n };
    }
  }

  async getApy(): Promise<bigint> {
    const aprBps = this.globalData?.styfi?.current?.aprBps;
    if (aprBps !== undefined) {
      return toBigInt(aprBps);
    }

    // Dynamic APR calculation requires backend indexing of rewards/revenue.
    // Currently no direct contract view for "Current APR".
    return 0n;
  }

  async prepareStake(
    mode: StyfiStakeMode,
    amount: bigint
  ): Promise<PreparedTransaction> {
    return async () => {
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);

      const contractAddress = mode === "stYFI" ? STYFI_ADDRESS : STYFIX_ADDRESS;
      const abi = mode === "stYFI" ? StakedYfiAbi : DelegatedStakedYfiAbi;

      const request = {
        address: contractAddress,
        abi,
        functionName: "deposit",
        args: [amount, address] as const,
        account: address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, `stYFI stake (${mode})`);
    };
  }

  async prepareStartCooldown(
    mode: StyfiStakeMode,
    amount: bigint
  ): Promise<PreparedTransaction> {
    return async () => {
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);
      const contractAddress = mode === "stYFI" ? STYFI_ADDRESS : STYFIX_ADDRESS;
      const abi = mode === "stYFI" ? StakedYfiAbi : DelegatedStakedYfiAbi;

      const request = {
        address: contractAddress,
        abi,
        functionName: "unstake",
        args: [amount] as const,
        account: address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, `stYFI start cooldown (${mode})`);
    };
  }

  async prepareWithdraw(mode: StyfiStakeMode): Promise<PreparedTransaction> {
    return async () => {
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);
      if (!this.publicClient) throw new Error("Wallet public client not available");

      const contractAddress = mode === "stYFI" ? STYFI_ADDRESS : STYFIX_ADDRESS;
      const abi = mode === "stYFI" ? StakedYfiAbi : DelegatedStakedYfiAbi;

      const max = await this.publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "maxWithdraw",
        args: [address],
      });

      if (max === 0n) throw new Error("Nothing to withdraw");

      const request = {
        address: contractAddress,
        abi,
        functionName: "withdraw",
        args: [max, address, address] as const,
        account: address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, `stYFI withdraw (${mode})`);
    };
  }

  async prepareClaimRewards(): Promise<PreparedTransaction> {
    return async () => {
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);

      const request = {
        address: REWARD_CLAIMER_ADDRESS,
        abi: RewardClaimerAbi,
        functionName: "claim",
        args: [address] as const,
        account: address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, "stYFI claim rewards");
    };
  }
}
