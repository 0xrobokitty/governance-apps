import { type Address, type PublicClient, parseAbi, erc20Abi } from "viem";
import { getAccount } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import type { PreparedTransaction } from "@/lib/tx/types";
import type {
  VeyfiAccountState,
  VeyfiGlobalStats,
  LlyfiTokenId,
  LlyfiTokenState,
  LlyfiGlobalInfo,
  VeyfiNudgeState,
} from "./types";
import type { VeyfiClient } from "./client";
import type { GlobalData } from "@/lib/schemas/global";
import {
  VEYFI_ADDRESS,
  VEYFI_REWARD_DISTRIBUTOR_ADDRESS,
  LIQUID_LOCKERS,
  LIQUID_LOCKER_REDEMPTION_ADDRESS,
  GENESIS,
  EPOCH_LENGTH,
  STREAM_DURATION,
  YFI_ADDRESS, // Added import
} from "@/lib/constants";
import { getCurrentEpoch } from "@/lib/format";
import { VotingEscrowRewardDistributorAbi } from "@/lib/abis/VotingEscrowRewardDistributor";
import { LiquidLockerDepositorAbi } from "@/lib/abis/LiquidLockerDepositor";
import { LiquidLockerRedemptionAbi } from "@/lib/abis/LiquidLockerRedemption";
import { deriveCooldownEndsAt } from "@/lib/clients/shared/cooldown";
import { nowSeconds } from "@/lib/mocks/time";
import { assertMainnetAccount, MAINNET_CHAIN_ID } from "@/lib/tx/network";
import { simulateThenWrite } from "@/lib/tx/simulateWrite";
import { normalizeLlyfiSymbol } from "@/lib/clients/veyfi/display";
import { getVeyfiEpochBoostMultiplier } from "@/lib/clients/veyfi/boost";

const LegacyVeYfiAbi = parseAbi([
  "function locked(address) view returns (int128 amount, uint256 end)",
  "function totalSupply() view returns (uint256)",
] as const);

interface LockInfo {
  amount: bigint;
  boost_epochs: bigint;
  unlock_time: bigint;
}

function toBps(value: string | number, label: string) {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100_000) {
    console.warn(`Invalid BPS value for ${label}:`, value);
    return 0;
  }
  if (!Number.isInteger(numeric)) {
    console.warn(`Non-integer BPS value for ${label}:`, value);
  }
  return numeric;
}

export class OnchainVeyfiClient implements VeyfiClient {
  private chainTimeOffsetSeconds: number | null = null;
  private chainTimeLastFetch: number | null = null;

  constructor(
    private publicClient: PublicClient | null,
    private globalData: GlobalData | null
  ) {}

  private resolveRedemptionEnabled(symbol: string): boolean {
    const tokens = this.globalData?.global?.veyfi?.tokens;
    if (!tokens?.length) return true;
    const normalized = normalizeLlyfiSymbol(symbol);
    const match = tokens.find(
      (token) => normalizeLlyfiSymbol(token.symbol) === normalized
    );
    return match?.redemption.enabled ?? true;
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

  private readLegacyPosition(address: Address) {
    if (!this.publicClient) throw new Error("Wallet public client not available");
    return this.publicClient.multicall({
      contracts: [
        {
          address: VEYFI_ADDRESS,
          abi: LegacyVeYfiAbi,
          functionName: "locked",
          args: [address],
        },
        {
          address: VEYFI_REWARD_DISTRIBUTOR_ADDRESS,
          abi: VotingEscrowRewardDistributorAbi,
          functionName: "check_lock",
          args: [address],
        },
        {
          address: VEYFI_REWARD_DISTRIBUTOR_ADDRESS,
          abi: VotingEscrowRewardDistributorAbi,
          functionName: "locks",
          args: [address],
        },
        {
          address: VEYFI_REWARD_DISTRIBUTOR_ADDRESS,
          abi: VotingEscrowRewardDistributorAbi,
          functionName: "last_claimed",
          args: [address],
        },
      ],
      allowFailure: false,
    });
  }

  async getAccountState(address: Address): Promise<VeyfiAccountState> {
    if (!this.publicClient) {
      throw new Error("Wallet public client not available");
    }
    try {
      const lockerCalls = LIQUID_LOCKERS.flatMap((locker) => [
        {
          address: locker.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        },
        {
          address: locker.depositor,
          abi: LiquidLockerDepositorAbi,
          functionName: "balanceOf",
          args: [address],
        },
        {
          address: locker.depositor,
          abi: LiquidLockerDepositorAbi,
          functionName: "streams",
          args: [address],
        },
        {
          address: locker.depositor,
          abi: LiquidLockerDepositorAbi,
          functionName: "maxWithdraw",
          args: [address],
        },
        {
          address: locker.token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, locker.depositor],
        },
        {
          address: locker.token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, LIQUID_LOCKER_REDEMPTION_ADDRESS],
        },
        {
          address: locker.token,
          abi: erc20Abi,
          functionName: "totalSupply",
        },
        {
          address: locker.depositor,
          abi: LiquidLockerDepositorAbi,
          functionName: "totalAssets",
        },
        {
          address: locker.depositor,
          abi: LiquidLockerDepositorAbi,
          functionName: "capacity",
        },
        {
          address: locker.depositor,
          abi: LiquidLockerDepositorAbi,
          functionName: "totalSupply",
        },
      ]);

      const redemptionCalls = [
        {
          address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
          abi: LiquidLockerRedemptionAbi,
          functionName: "fee",
        },
        {
          address: YFI_ADDRESS, // Updated to use constant
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [LIQUID_LOCKER_REDEMPTION_ADDRESS],
        },
      ];

      const lockerRedemptionCalls = LIQUID_LOCKERS.flatMap((locker) => [
        {
          address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
          abi: LiquidLockerRedemptionAbi,
          functionName: "capacities",
          args: [BigInt(locker.index)],
        },
        {
          address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
          abi: LiquidLockerRedemptionAbi,
          functionName: "used",
          args: [BigInt(locker.index)],
        },
        {
          address: locker.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [LIQUID_LOCKER_REDEMPTION_ADDRESS],
        },
      ]);

      const [results, legacy, now] = await Promise.all([
        this.publicClient.multicall({
          contracts: [
            ...lockerCalls,
            ...redemptionCalls,
            ...lockerRedemptionCalls,
          ],
          allowFailure: false,
        }),
        this.readLegacyPosition(address),
        this.getCanonicalNowSeconds(),
      ]);
      const [legacyLockResult, snapshotCheckResult, lockInfo, lastClaimed] = legacy;
      const currentEpoch = getCurrentEpoch(GENESIS, EPOCH_LENGTH, now);
      const boostRaw = getVeyfiEpochBoostMultiplier(currentEpoch);


      const legacyAmount = BigInt(legacyLockResult[0] as bigint);
      const snapshotAmount = (lockInfo as LockInfo).amount;
      const snapshotBoostEpochs = (lockInfo as LockInfo).boost_epochs;
      const snapshotUnlockTime = (lockInfo as LockInfo).unlock_time;
      const boostEpochsValue = Number(snapshotBoostEpochs);
      const boostEpochs = Number.isFinite(boostEpochsValue)
        ? Math.max(0, Math.floor(boostEpochsValue))
        : null;
      const isMigrated = (lastClaimed as bigint) > 0n;
      const snapshotValidAmount = (snapshotCheckResult as [bigint, bigint])[0];
      const isEligible =
        !isMigrated && snapshotAmount > 0n && snapshotValidAmount > 0n;

      const llyfiTokens: LlyfiTokenState[] = [];
      const PER_LOCKER_READS = 10;

      const redemptionStart = LIQUID_LOCKERS.length * PER_LOCKER_READS;
      const redemptionGlobalFee = results[redemptionStart] as bigint;
      const redemptionGlobalYfi = results[redemptionStart + 1] as bigint;
      const redemptionLockerStart = redemptionStart + 2;
      const PER_LOCKER_REDEMPTION_READS = 3;

      for (let i = 0; i < LIQUID_LOCKERS.length; i++) {
        const config = LIQUID_LOCKERS[i];
        const base = i * PER_LOCKER_READS;
        const redBase = redemptionLockerStart + i * PER_LOCKER_REDEMPTION_READS;

        const walletBalance = results[base] as bigint;
        const stakedBalanceShares = results[base + 1] as bigint;
        const streamData = results[base + 2] as unknown as [
          bigint,
          bigint,
          bigint
        ];
        const maxWithdrawAssets = results[base + 3] as bigint;
        const allowanceDepositor = results[base + 4] as bigint;
        const allowanceRedemption = results[base + 5] as bigint;
        const totalSupplyToken = results[base + 6] as bigint;
        const stakedAssets = results[base + 7] as bigint;
        const depositorCapacity = results[base + 8] as bigint;
        const depositorTotalSupply = results[base + 9] as bigint;

        const capacityRedemption = results[redBase] as bigint;
        const usedRedemption = results[redBase + 1] as bigint;
        const inventoryRedemption = results[redBase + 2] as bigint;

        const [, totalShares, claimedShares] = streamData;
        const remainingShares = totalShares - claimedShares;

        const stakedBalanceAssets = stakedBalanceShares * config.scale;
        const remainingAssets = remainingShares * config.scale;
        const totalStreamAssets = totalShares * config.scale;
        const claimedAssets = claimedShares * config.scale;

        const cooldown =
          remainingShares > 0n
            ? {
                amount: remainingAssets,
                endsAt: deriveCooldownEndsAt({
                  total: totalStreamAssets,
                  claimed: claimedAssets,
                  withdrawable: maxWithdrawAssets,
                  durationSeconds: STREAM_DURATION,
                  nowSecondsOverride: now,
                }),
                totalAmount: totalStreamAssets,
              }
            : null;

        const lockedYfi = totalSupplyToken / config.scale;
        const redemptionEnabled = this.resolveRedemptionEnabled(config.symbol);

        llyfiTokens.push({
          symbol: config.symbol as LlyfiTokenId,
          name: config.name,
          address: config.token,
          depositorAddress: config.depositor,
          walletBalance,
          stakedBalance: stakedBalanceAssets,
          cooldownBalance: remainingAssets,
          withdrawable: maxWithdrawAssets,
          cooldown,
          allowance: allowanceDepositor,
          redemptionAllowance: allowanceRedemption,
          lockedYfi,
          veyfiBoost: boostRaw,
          totalSupply: totalSupplyToken,
          stakedAssets,
          depositorTotalSupply,
          depositorCapacity,
          exchangeRate: config.scale,
          redemption: {
            enabled: redemptionEnabled,
            capacity: capacityRedemption,
            used: usedRedemption,
            inventory: inventoryRedemption,
            fee: redemptionGlobalFee,
          },
        });
      }

      return {
        address,
        veYfi: {
          legacyBalance: legacyAmount,
          lockedAmount: isMigrated ? snapshotAmount : 0n,
          migrationEligible: isEligible,
          migrated: isMigrated,
          unlockTime: Number(snapshotUnlockTime),
          boostEpochs,
        },
        llyfiTokens,
        inventory: {
          availableYfi: redemptionGlobalYfi,
          feeBps: Number(redemptionGlobalFee) / 10 ** 14,
        },
      };
    } catch {
      console.warn("Failed to fetch veYFI account state; using fallback data.");
      return {
        address,
        veYfi: null,
        llyfiTokens: [],
        inventory: { availableYfi: 0n, feeBps: 0 },
      };
    }
  }

  async getNudgeState(address: Address): Promise<VeyfiNudgeState> {
    if (!this.publicClient) {
      return {
        legacyBalance: 0n,
        migrationEligible: false,
        migrated: false,
        llyfiTokens: [],
      };
    }

    try {
      const lockerCalls = LIQUID_LOCKERS.flatMap((locker) => [
        {
          address: locker.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        },
        {
          address: locker.depositor,
          abi: LiquidLockerDepositorAbi,
          functionName: "balanceOf",
          args: [address],
        },
      ]);

      const [lockerResults, legacy] = await Promise.all([
        this.publicClient.multicall({
          contracts: lockerCalls,
          allowFailure: false,
        }),
        this.readLegacyPosition(address),
      ]);
      const [legacyLockResult, snapshotCheckResult, lockInfo, lastClaimed] = legacy;


      const legacyBalance = BigInt(legacyLockResult[0] as bigint);
      const snapshotAmount = (lockInfo as LockInfo).amount;
      const snapshotValidAmount = (snapshotCheckResult as [bigint, bigint])[0];
      const migrated = (lastClaimed as bigint) > 0n;
      const migrationEligible =
        !migrated && snapshotAmount > 0n && snapshotValidAmount > 0n;

      const llyfiTokens: Array<{
        symbol: LlyfiTokenId;
        walletBalance: bigint;
        stakedBalance: bigint;
      }> = [];

      for (let i = 0; i < LIQUID_LOCKERS.length; i++) {
        const config = LIQUID_LOCKERS[i];
        const base = i * 2;
        const walletBalance = lockerResults[base] as bigint;
        const stakedBalanceShares = lockerResults[base + 1] as bigint;
        llyfiTokens.push({
          symbol: config.symbol,
          walletBalance,
          stakedBalance: stakedBalanceShares * config.scale,
        });
      }

      return {
        legacyBalance,
        migrationEligible,
        migrated,
        llyfiTokens,
      };
    } catch {
      console.warn("Failed to fetch veYFI nudge state; using fallback data.");
      return {
        legacyBalance: 0n,
        migrationEligible: false,
        migrated: false,
        llyfiTokens: [],
      };
    }
  }

  private buildGlobalStatsFromData(): VeyfiGlobalStats {
    if (!this.globalData?.global?.veyfi) {
      return {
        migratedYfi: 0n,
        lockedYfi: 0n,
        maxBoostMultiplier: 0,
        totalLlyfiStakedPercent: 0,
        inventory: { availableYfi: 0n, feeBps: 0 },
        tokens: [],
      };
    }

    const data = this.globalData.global.veyfi;
    const maxBoostBps = this.globalData.global.maxBoostBps;
    const feeBps = toBps(data.inventory.feeBps, "inventory.feeBps");
    const fee = BigInt(Math.trunc(feeBps)) * 10n ** 14n;
    const tokenMap = new Map(
      data.tokens.map((token) => [normalizeLlyfiSymbol(token.symbol), token])
    );

    const tokens: LlyfiGlobalInfo[] = LIQUID_LOCKERS.map((locker) => {
      const match = tokenMap.get(locker.symbol as string);
      const redemption = match?.redemption;
      return {
        symbol: locker.symbol as LlyfiTokenId,
        name: locker.name,
        address: locker.token,
        redemption: {
          enabled: redemption?.enabled ?? true,
          capacity: redemption ? BigInt(redemption.capacity) : 0n,
          used: redemption ? BigInt(redemption.used) : 0n,
          inventory: redemption ? BigInt(redemption.inventory) : 0n,
          fee,
        },
      };
    });

    return {
      migratedYfi: BigInt(data.migratedYfi),
      lockedYfi: BigInt(data.lockedYfi),
      maxBoostMultiplier: toBps(maxBoostBps, "maxBoostBps") / 10000,
      totalLlyfiStakedPercent:
        toBps(data.totalLlyfiStakedBps, "totalLlyfiStakedBps") / 10000,
      inventory: {
        availableYfi: BigInt(data.inventory.availableYfi),
        feeBps,
      },
      tokens,
    };
  }

  private async overlayInventoryFromChain(
    base: VeyfiGlobalStats
  ): Promise<VeyfiGlobalStats> {
    if (!this.publicClient) return base;

    const calls = [
      {
        address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
        abi: LiquidLockerRedemptionAbi,
        functionName: "fee",
      },
      {
        address: YFI_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [LIQUID_LOCKER_REDEMPTION_ADDRESS],
      },
      ...LIQUID_LOCKERS.flatMap((locker) => [
        {
          address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
          abi: LiquidLockerRedemptionAbi,
          functionName: "capacities",
          args: [BigInt(locker.index)],
        },
        {
          address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
          abi: LiquidLockerRedemptionAbi,
          functionName: "used",
          args: [BigInt(locker.index)],
        },
        {
          address: locker.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [LIQUID_LOCKER_REDEMPTION_ADDRESS],
        },
      ]),
    ];

    const results = await this.publicClient.multicall({
      contracts: calls,
      allowFailure: false,
    });

    const fee = results[0] as bigint;
    const availableYfi = results[1] as bigint;
    const feeBps = toBps(
      Number(fee / 10n ** 14n),
      "redemption.feeBps"
    );

    const tokens: LlyfiGlobalInfo[] = [];
    const redemptionStart = 2;
    const PER_LOCKER_READS = 3;
    const baseTokenMap = new Map(base.tokens.map((token) => [token.symbol, token]));

    for (let i = 0; i < LIQUID_LOCKERS.length; i++) {
      const config = LIQUID_LOCKERS[i];
      const baseIndex = redemptionStart + i * PER_LOCKER_READS;
      const capacity = results[baseIndex] as bigint;
      const used = results[baseIndex + 1] as bigint;
      const inventory = results[baseIndex + 2] as bigint;

      tokens.push({
        symbol: config.symbol as LlyfiTokenId,
        name: config.name,
        address: config.token,
        redemption: {
          enabled:
            baseTokenMap.get(config.symbol as LlyfiTokenId)?.redemption
              .enabled ?? this.resolveRedemptionEnabled(config.symbol),
          capacity,
          used,
          inventory,
          fee,
        },
      });
    }

    return {
      ...base,
      inventory: {
        availableYfi,
        feeBps,
      },
      tokens,
    };
  }

  async getGlobalStats(): Promise<VeyfiGlobalStats> {
    if (this.globalData?.global?.veyfi) {
      const base = this.buildGlobalStatsFromData();
      if (!this.publicClient) return base;
      try {
        return await this.overlayInventoryFromChain(base);
      } catch (e) {
        console.warn("Failed to overlay live inventory, using global data", e);
        return base;
      }
    }

    return this.getGlobalStatsFromChain();
  }

  async getGlobalStatsFromChain(): Promise<VeyfiGlobalStats> {
    if (!this.publicClient) {
      return {
        migratedYfi: 0n,
        lockedYfi: 0n,
        maxBoostMultiplier: 0,
        totalLlyfiStakedPercent: 0,
        inventory: { availableYfi: 0n, feeBps: 0 },
        tokens: [],
      };
    }

    const publicClient = this.publicClient;
    try {
      const readMigration = async () => {
        const now = await this.getCanonicalNowSeconds();
        const currentEpoch = getCurrentEpoch(GENESIS, EPOCH_LENGTH, now);
        const currentEpochArg = BigInt(currentEpoch);
        let migratedUnderlyingApprox = 0n;
        if (currentEpoch > 0) {
          try {
            const totalWeightResult = await publicClient.readContract({
              address: VEYFI_REWARD_DISTRIBUTOR_ADDRESS,
              abi: VotingEscrowRewardDistributorAbi,
              functionName: "total_weights",
              args: [currentEpochArg],
            });
            migratedUnderlyingApprox = totalWeightResult.slope * 104n;
          } catch {
            console.warn(
              "Failed to read veYFI total weights for current epoch; continuing with fallback migrated amount."
            );
          }
        }
        return { currentEpoch, migratedUnderlyingApprox };
      };

      const calls = [
        {
          address: VEYFI_ADDRESS,
          abi: LegacyVeYfiAbi,
          functionName: "totalSupply",
        },
        {
          address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
          abi: LiquidLockerRedemptionAbi,
          functionName: "fee",
        },
        {
          address: YFI_ADDRESS, // Updated to use constant
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [LIQUID_LOCKER_REDEMPTION_ADDRESS],
        },
        ...LIQUID_LOCKERS.flatMap((locker) => [
          {
            address: locker.depositor,
            abi: LiquidLockerDepositorAbi,
            functionName: "totalSupply",
          },
          {
            address: locker.depositor,
            abi: LiquidLockerDepositorAbi,
            functionName: "capacity",
          },
        ]),
        ...LIQUID_LOCKERS.flatMap((locker) => [
          {
            address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
            abi: LiquidLockerRedemptionAbi,
            functionName: "capacities",
            args: [BigInt(locker.index)],
          },
          {
            address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
            abi: LiquidLockerRedemptionAbi,
            functionName: "used",
            args: [BigInt(locker.index)],
          },
          {
            address: locker.token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [LIQUID_LOCKER_REDEMPTION_ADDRESS],
          },
        ]),
      ];

      const [results, { currentEpoch, migratedUnderlyingApprox }] = await Promise.all([
        this.publicClient.multicall({
          contracts: calls,
          allowFailure: false,
        }),
        readMigration(),
      ]);


      const lockedYfi = results[0] as bigint;
      const fee = results[1] as bigint;
      const globalYfi = results[2] as bigint;

      let totalStakedYfiEq = 0n;
      let totalCapacityYfiEq = 0n;

      const lockerStatsStart = 3;
      const redemptionStatsStart = lockerStatsStart + LIQUID_LOCKERS.length * 2;

      for (let i = 0; i < LIQUID_LOCKERS.length; i++) {
        const base = lockerStatsStart + i * 2;
        const supplyShares = results[base] as bigint;
        const capacityShares = results[base + 1] as bigint;

        totalStakedYfiEq += supplyShares;
        totalCapacityYfiEq += capacityShares;
      }

      const totalLlyfiStakedPercent =
        totalCapacityYfiEq > 0n
          ? Number((totalStakedYfiEq * 10000n) / totalCapacityYfiEq) / 10000
          : 0;

      const tokens: LlyfiGlobalInfo[] = [];
      for (let i = 0; i < LIQUID_LOCKERS.length; i++) {
        const config = LIQUID_LOCKERS[i];
        const redBase = redemptionStatsStart + i * 3;

        const capacity = results[redBase] as bigint;
        const used = results[redBase + 1] as bigint;
        const inventory = results[redBase + 2] as bigint;

        tokens.push({
          symbol: config.symbol as LlyfiTokenId,
          name: config.name,
          address: config.token,
          redemption: {
            enabled: this.resolveRedemptionEnabled(config.symbol),
            capacity,
            used,
            inventory,
            fee,
          },
        });
      }

      const maxBoostMultiplier = getVeyfiEpochBoostMultiplier(currentEpoch);
      const feeBps = toBps(
        Number(fee / 10n ** 14n),
        "redemption.feeBps"
      );

      return {
        migratedYfi: migratedUnderlyingApprox,
        lockedYfi,
        maxBoostMultiplier,
        totalLlyfiStakedPercent,
        inventory: {
          availableYfi: globalYfi,
          feeBps,
        },
        tokens,
      };
    } catch {
      console.warn("Failed to fetch veYFI global stats; using fallback data.");
      return {
        migratedYfi: 0n,
        lockedYfi: 0n,
        maxBoostMultiplier: 0,
        totalLlyfiStakedPercent: 0,
        inventory: { availableYfi: 0n, feeBps: 0 },
        tokens: [],
      };
    }
  }

  async prepareMigrateVeYfi(): Promise<PreparedTransaction> {
    return async () => {
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);

      const request = {
        address: VEYFI_REWARD_DISTRIBUTOR_ADDRESS,
        abi: VotingEscrowRewardDistributorAbi,
        functionName: "migrate",
        account: address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, "veYFI migrate");
    };
  }

  private getLockerConfig(symbol: LlyfiTokenId) {
    const config = LIQUID_LOCKERS.find((l) => l.symbol === symbol);
    if (!config) throw new Error(`Unknown LLYFI token: ${symbol}`);
    return config;
  }

  async prepareStakeLlyfi(
    symbol: LlyfiTokenId,
    amount: bigint
  ): Promise<PreparedTransaction> {
    return async () => {
      const config = this.getLockerConfig(symbol);
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);

      const request = {
        address: config.depositor,
        abi: LiquidLockerDepositorAbi,
        functionName: "deposit",
        args: [amount, address] as const,
        account: address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, `veYFI stake ${symbol}`);
    };
  }

  async prepareStartCooldownLlyfi(
    symbol: LlyfiTokenId,
    amount: bigint
  ): Promise<PreparedTransaction> {
    return async () => {
      const config = this.getLockerConfig(symbol);
      const shares = amount / config.scale;
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);

      const request = {
        address: config.depositor,
        abi: LiquidLockerDepositorAbi,
        functionName: "unstake",
        args: [shares] as const,
        account: address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, `veYFI cooldown ${symbol}`);
    };
  }

  async prepareWithdrawLlyfi(
    symbol: LlyfiTokenId
  ): Promise<PreparedTransaction> {
    return async () => {
      const config = this.getLockerConfig(symbol);
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);
      if (!this.publicClient) throw new Error("Wallet public client not available");

      const maxAssets = await this.publicClient.readContract({
        address: config.depositor,
        abi: LiquidLockerDepositorAbi,
        functionName: "maxWithdraw",
        args: [address],
      });

      if (maxAssets === 0n) throw new Error("Nothing to withdraw");

      const request = {
        address: config.depositor,
        abi: LiquidLockerDepositorAbi,
        functionName: "withdraw",
        args: [maxAssets, address, address] as const,
        account: address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, `veYFI withdraw ${symbol}`);
    };
  }

  async prepareRedeemLlyfi(
    symbol: LlyfiTokenId,
    amount: bigint
  ): Promise<PreparedTransaction> {
    return async () => {
      const config = this.getLockerConfig(symbol);
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);
      const request = {
        address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
        abi: LiquidLockerRedemptionAbi,
        functionName: "redeem",
        args: [BigInt(config.index), amount] as const,
        account: address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, `veYFI redeem ${symbol}`);
    };
  }

  async prepareMintLlyfi(
    symbol: LlyfiTokenId,
    amount: bigint
  ): Promise<PreparedTransaction> {
    return async () => {
      const config = this.getLockerConfig(symbol);
      const account = getAccount(wagmiConfig);
      const address = assertMainnetAccount(account);
      const request = {
        address: LIQUID_LOCKER_REDEMPTION_ADDRESS,
        abi: LiquidLockerRedemptionAbi,
        functionName: "exchange",
        args: [BigInt(config.index), amount] as const,
        account: address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateThenWrite(request, request, `veYFI mint ${symbol}`);
    };
  }
}
