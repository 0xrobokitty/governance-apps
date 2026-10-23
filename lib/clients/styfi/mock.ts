// lib/clients/styfi/mock.ts
"use client";

import type { Address } from "viem";
import type { PreparedTransaction, TransactionHash } from "@/lib/tx/types";
import type {
  StyfiAccountState,
  StyfiGlobalStats,
  EpochInfo,
  StyfiNudgeState,
} from "./types";
import type { StyfiClient, StyfiStakeMode } from "./client";
import { GLOBAL_WORLD_STATE } from "@/lib/mocks/world-state";
import {
  REWARD_TOKEN_CONFIG,
  SPENDER_STYFI,
  SPENDER_STYFIX,
  STREAM_DURATION,
  EPOCH_LENGTH,
  MOCK_YFI_ADDRESS,
  YFI_ADDRESS,
} from "@/lib/constants";
import { nowSeconds } from "@/lib/mocks/time";
import { resetStyfiMockScenario } from "./scenarios";

const GLOBAL_STYFI_STORE = new Map<string, StyfiAccountState>();
const GLOBAL_LAST_ACCRUAL = new Map<string, number>();

let txCounter = 0;
let pendingStyfiBalance: bigint = 0n;
let pendingStyfixBalance: bigint = 0n;
function nextMockHash(): TransactionHash {
  txCounter++;
  return `0x${txCounter.toString(16).padStart(64, "0")}` as TransactionHash;
}

function cloneState<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? `BIGINT::${v.toString()}` : v
    ),
    (_k, v) =>
      typeof v === "string" && v.startsWith("BIGINT::")
        ? BigInt(v.slice("BIGINT::".length))
        : v
  );
}

// Vyper-aligned maxWithdraw calculation
function calculateMaxWithdraw(
  total: bigint,
  startTime: number,
  unlockedStored: bigint
): bigint {
  if (startTime === 0 || total === 0n) return unlockedStored;

  const now = nowSeconds();
  const timeElapsed = Math.min(Math.max(0, now - startTime), STREAM_DURATION);

  const streamClaimable =
    (total * BigInt(timeElapsed)) / BigInt(STREAM_DURATION);
  return streamClaimable + unlockedStored;
}

export class MockStyfiClient implements StyfiClient {
  private lastAddress: Address | null = null;
  private readonly latencyMs: number;

  constructor(options: { latencyMs?: number } = {}) {
    this.latencyMs = options.latencyMs ?? 600;
  }

  private getOrCreate(address: Address): StyfiAccountState {
    const key = address.toLowerCase();
    const identity = GLOBAL_WORLD_STATE.get(address);
    let state = GLOBAL_STYFI_STORE.get(key);

    if (!state) {
      state = {
        address,
        isBlacklisted: identity.isBlacklisted,
        blacklistStatus: identity.isBlacklisted ? "blocked" : "clear",
        yfiBalance: identity.yfiBalance,
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
        allowances: { yfiToStyfi: 0n, yfiToStyfiX: 0n },
        epoch: {
          currentEpoch: 12,
          epochEnd: nowSeconds() + 864000,
          nextEpochStart: nowSeconds() + 864000,
        },
        rewardToken: REWARD_TOKEN_CONFIG,
      };
      GLOBAL_STYFI_STORE.set(key, state);
      GLOBAL_LAST_ACCRUAL.set(key, nowSeconds());
    }
    state.yfiBalance = identity.yfiBalance;
    state.isBlacklisted = identity.isBlacklisted;
    state.blacklistStatus = identity.isBlacklisted ? "blocked" : "clear";
    return state;
  }

  async getAccountState(address: Address): Promise<StyfiAccountState> {
    this.lastAddress = address;
    await new Promise((r) => setTimeout(r, this.latencyMs));
    const state = this.getOrCreate(address);

    if (pendingStyfiBalance > 0n) {
      state.styfiActive += pendingStyfiBalance;
      pendingStyfiBalance = 0n;
    }
    if (pendingStyfixBalance > 0n) {
      state.styfiX.assetsActive += pendingStyfixBalance;
      state.styfiX.sharesActive += pendingStyfixBalance;
      pendingStyfixBalance = 0n;
    }

    const now = nowSeconds();
    const last = GLOBAL_LAST_ACCRUAL.get(address.toLowerCase()) || now;
    const elapsed = BigInt(now - last);
    if (elapsed > 0n) {
      const earningAssets =
        state.styfiActive + state.styfiX.assetsActive + 50n * 10n ** 18n;
      state.claimableGenericRewards += (earningAssets * elapsed) / 2000000n;
      GLOBAL_LAST_ACCRUAL.set(address.toLowerCase(), now);
    }

    // stYFI
    let styfiStart = 0;
    if (state.styfiCooldown) {
      styfiStart = state.styfiCooldown.endsAt - STREAM_DURATION;
    }
    state.styfiWithdrawable = calculateMaxWithdraw(
      state.styfiInCooldown,
      styfiStart,
      state.styfiUnlocked
    );

    // stYFIx
    let styfixStart = 0;
    if (state.styfiX.cooldown) {
      styfixStart = state.styfiX.cooldown.endsAt - STREAM_DURATION;
    }
    state.styfiX.assetsWithdrawable = calculateMaxWithdraw(
      state.styfiX.assetsInCooldown,
      styfixStart,
      state.styfiX.assetsUnlocked
    );

    return cloneState(state);
  }

  async getNudgeState(address: Address): Promise<StyfiNudgeState> {
    const state = await this.getAccountState(address);
    return {
      yfiBalance: state.yfiBalance,
      styfiActive: state.styfiActive,
      styfiInCooldown: state.styfiInCooldown,
      styfiWithdrawable: state.styfiWithdrawable,
      styfiXActive: state.styfiX.assetsActive,
      styfiXInCooldown: state.styfiX.assetsInCooldown,
      styfiXWithdrawable: state.styfiX.assetsWithdrawable,
      claimableRewards:
        state.claimableGenericRewards + state.claimableBoostedRewards,
    };
  }

  async getEpochInfo(): Promise<EpochInfo> {
    // Fixed epoch for deterministic mock behavior (tests should not drift over time).
    return {
      currentEpoch: 12,
      epochEnd: nowSeconds() + EPOCH_LENGTH,
      nextEpochStart: nowSeconds() + EPOCH_LENGTH,
    };
  }

  async getApy(): Promise<bigint> {
    return 6840n;
  }
  async getStats(): Promise<StyfiGlobalStats> {
    return {
      totalSupply: 36666n * 10n ** 18n,
      totalStaked: 2500n * 10n ** 18n,
    };
  }

  async getStatsFromChain(): Promise<StyfiGlobalStats> {
    return this.getStats();
  }

  async prepareStake(
    mode: StyfiStakeMode,
    amount: bigint
  ): Promise<PreparedTransaction> {
    const addr = this.lastAddress!;
    return async () => {
      GLOBAL_WORLD_STATE.updateYfi(addr, -amount);
      const s = this.getOrCreate(addr);
      if (mode === "stYFI") s.styfiActive += amount;
      else {
        s.styfiX.assetsActive += amount;
        s.styfiX.sharesActive += amount;
      }
      return nextMockHash();
    };
  }

  async prepareStartCooldown(
    mode: StyfiStakeMode,
    amount: bigint
  ): Promise<PreparedTransaction> {
    const addr = this.lastAddress!;

    return async () => {
      const s = this.getOrCreate(addr);
      const now = nowSeconds();
      const endsAt = now + STREAM_DURATION;

      if (mode === "stYFI") {
        s.styfiActive -= amount;
        s.styfiInCooldown += amount;
        s.styfiCooldown = { amount: s.styfiInCooldown, endsAt };
      } else {
        s.styfiX.assetsActive -= amount;
        s.styfiX.assetsInCooldown += amount;
        s.styfiX.sharesInCooldown = s.styfiX.assetsInCooldown; // 1:1 in mock

        s.styfiX.cooldown = { amount: s.styfiX.assetsInCooldown, endsAt };
      }
      return nextMockHash();
    };
  }

  async prepareWithdraw(mode: StyfiStakeMode): Promise<PreparedTransaction> {
    const addr = this.lastAddress!;
    return async () => {
      const s = this.getOrCreate(addr);

      if (mode === "stYFI") {
        const withdrawable = s.styfiWithdrawable;
        GLOBAL_WORLD_STATE.updateYfi(addr, withdrawable);

        if (withdrawable > s.styfiUnlocked) {
          const fromStream = withdrawable - s.styfiUnlocked;
          s.styfiUnlocked = 0n;
          s.styfiInCooldown -= fromStream;
        } else {
          s.styfiUnlocked -= withdrawable;
        }

        if (s.styfiInCooldown <= 0n) s.styfiCooldown = null;
      } else {
        const withdrawable = s.styfiX.assetsWithdrawable;
        GLOBAL_WORLD_STATE.updateYfi(addr, withdrawable);

        if (withdrawable > s.styfiX.assetsUnlocked) {
          const fromStream = withdrawable - s.styfiX.assetsUnlocked;
          s.styfiX.assetsUnlocked = 0n;
          s.styfiX.assetsInCooldown -= fromStream;
        } else {
          s.styfiX.assetsUnlocked -= withdrawable;
        }
        s.styfiX.sharesInCooldown = s.styfiX.assetsInCooldown;

        if (s.styfiX.assetsInCooldown <= 0n) s.styfiX.cooldown = null;
      }
      return nextMockHash();
    };
  }

  async prepareClaimRewards(): Promise<PreparedTransaction> {
    const addr = this.lastAddress!;
    return async () => {
      const s = this.getOrCreate(addr);
      s.claimableGenericRewards = 0n;
      s.claimableBoostedRewards = 0n;
      return nextMockHash();
    };
  }

  debugSetAllowance(u: Address, _t: Address, s: Address, a: bigint) {
    const state = this.getOrCreate(u);
    // Strict comparison against defined spenders (Mock OR Real)
    if (s.toLowerCase() === SPENDER_STYFI.toLowerCase()) {
      state.allowances.yfiToStyfi = a;
    } else if (s.toLowerCase() === SPENDER_STYFIX.toLowerCase()) {
      state.allowances.yfiToStyfiX = a;
    }
  }

  debugSetBalance(u: Address, mode: StyfiStakeMode, amount: bigint) {
    const state = this.getOrCreate(u);
    if (mode === "stYFI") {
      const nextActive = state.styfiActive + amount;
      state.styfiActive = nextActive > 0n ? nextActive : 0n;
    } else {
      const nextActive = state.styfiX.assetsActive + amount;
      const clamped = nextActive > 0n ? nextActive : 0n;
      state.styfiX.assetsActive = clamped;
      state.styfiX.sharesActive = clamped;
    }
    GLOBAL_LAST_ACCRUAL.set(u.toLowerCase(), nowSeconds());
  }

  debugSetPendingBalance(mode: StyfiStakeMode, amount: bigint) {
    if (mode === "stYFI") pendingStyfiBalance = amount;
    else pendingStyfixBalance = amount;
  }

  debugMintYfi(u: Address, a: bigint) {
    GLOBAL_WORLD_STATE.updateYfi(u, a);
  }
}

export function createMockStyfiClient(options?: { latencyMs?: number }) {
  return new MockStyfiClient(options);
}

export function resetMockStyfiStore() {
  resetStyfiMockScenario();
  GLOBAL_STYFI_STORE.clear();
  GLOBAL_LAST_ACCRUAL.clear();
  txCounter = 0;
  pendingStyfiBalance = 0n;
  pendingStyfixBalance = 0n;
}

/**
 * Sync helper for useTokenAllowance in Mock mode.
 * Returns the allowance if found, 0n otherwise.
 */
export function readMockStyfiAllowance(
  user: Address,
  token: Address,
  spender: Address
): bigint {
  const store = GLOBAL_STYFI_STORE.get(user.toLowerCase());
  if (!store) return 0n;

  // Mock Styfi Client only cares about YFI approvals
  const isYfi =
    token.toLowerCase() === MOCK_YFI_ADDRESS.toLowerCase() ||
    token.toLowerCase() === YFI_ADDRESS.toLowerCase() ||
    token.toLowerCase() === "0xd4c188f035793eecaa53808cc067099100b653ba"; // Legacy real YFI

  if (!isYfi) return 0n;

  if (spender.toLowerCase() === SPENDER_STYFI.toLowerCase()) {
    return store.allowances.yfiToStyfi;
  }
  if (spender.toLowerCase() === SPENDER_STYFIX.toLowerCase()) {
    return store.allowances.yfiToStyfiX;
  }

  return 0n;
}
