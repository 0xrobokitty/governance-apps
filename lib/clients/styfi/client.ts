// lib/clients/styfi/client.ts
import type { Address } from "viem";
import type { PreparedTransaction } from "@/lib/tx/types";
import type {
  EpochInfo,
  StyfiAccountState,
  StyfiGlobalStats,
  StyfiNudgeState,
} from "./types";

export type StyfiStakeMode = "stYFI" | "stYFIx";

export interface StyfiClient {
  getAccountState(address: Address): Promise<StyfiAccountState>;
  getNudgeState(address: Address): Promise<StyfiNudgeState>;
  getEpochInfo(): Promise<EpochInfo>;
  getStats(): Promise<StyfiGlobalStats>;
  /**
   * Optional: force an on-chain stats fetch, bypassing the global data feed.
   */
  getStatsFromChain?: () => Promise<StyfiGlobalStats>;

  /**
   * Legacy base staking APR in basis points (500 = 5%). This excludes Vote Boost
   * and YBC income. The stYFI page uses the dedicated APR snapshot instead.
   */
  getApy(): Promise<bigint>;

  // Writes are “prepared” – they don’t send until useTx executes them.
  prepareStake(
    mode: StyfiStakeMode,
    amount: bigint
  ): Promise<PreparedTransaction>;

  prepareStartCooldown(
    mode: StyfiStakeMode,
    amount: bigint
  ): Promise<PreparedTransaction>;

  prepareWithdraw(mode: StyfiStakeMode): Promise<PreparedTransaction>;

  prepareClaimRewards(): Promise<PreparedTransaction>;

  /**
   * Mock-only helper to sync allowances without importing mock modules.
   * No-op in on-chain clients.
   */
  debugSetAllowance?: (
    user: Address,
    token: Address,
    spender: Address,
    amount: bigint
  ) => void;

  /**
   * Mock-only helper to inject balances for testing onboarding flows.
   */
  debugSetBalance?: (
    user: Address,
    mode: StyfiStakeMode,
    amount: bigint
  ) => void;

  /**
   * Mock-only helper to queue a balance injection for the next address that connects.
   */
  debugSetPendingBalance?: (mode: StyfiStakeMode, amount: bigint) => void;

  /**
   * Mock-only helper to mint YFI to the user's wallet.
   */
  debugMintYfi?: (user: Address, amount: bigint) => void;
}
