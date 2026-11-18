import type { Hash, PublicClient } from "viem";
import { resolveWalletReceipt, type WalletReceiptProvider } from "@/lib/tx/wallet-receipt";
import type { RecoveryPending } from "./pending";
export type {
  WalletReceiptProvider as RecoveryWalletProvider,
  WalletReceiptResolution as RecoveryReceiptResolution,
} from "@/lib/tx/wallet-receipt";

/** Retain the recovery-specific intent boundary while sharing canonical proof. */
export function resolveRecoveryReceipt(
  client: PublicClient, pending: RecoveryPending,
  provider?: WalletReceiptProvider, executionHash?: Hash,
) {
  return resolveWalletReceipt(client, pending, provider, executionHash);
}
