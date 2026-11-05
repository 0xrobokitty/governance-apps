// lib/tx/types.ts

export type TransactionHash = `0x${string}`;

/**
 * A PreparedTransaction is a function that, when called, submits the transaction
 * and returns its hash. The caller (useTx) is responsible for waiting on the
 * receipt and driving lifecycle state.
 */
export type PreparedTransaction = () => Promise<TransactionHash>;

/**
 * Coarse-grained transaction lifecycle used by the UI.
 */
export type TxStatus =
  | "idle"
  | "simulating"
  | "signing"
  | "submitted"
  | "mining"
  | "pending"
  | "success"
  | "error";

export type TxErrorType =
  | "user_rejected"
  | "revert"
  | "network"
  | "cooldown_not_ready"
  | "cap_exceeded"
  | "insufficient_balance"
  | "unknown";

export type TxState = {
  status: TxStatus;
  hash?: TransactionHash;
  errorType?: TxErrorType;
  errorMessage?: string;
};
