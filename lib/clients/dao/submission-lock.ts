import type { Address } from "viem";
import { withTrackedSubmissionLock } from "@/lib/tx/pending-transactions";

/** DAO writes use their own receipt accounting under the shared wallet lock. */
export function withDaoSubmissionLock<T>(chainId: number, account: Address, operation: () => Promise<T> | T): Promise<T> {
  return withTrackedSubmissionLock(chainId, account, async () => operation());
}
