export type WalletConnectPairing = {
  status: "idle" | "connecting" | "pending" | "connected" | "cancelled" | "expired" | "error";
  uri?: string;
  error?: string;
  expiresAt?: number;
};

export const walletConnectPairingServerSnapshot: WalletConnectPairing =
  Object.freeze({ status: "idle" });
let snapshot = walletConnectPairingServerSnapshot;
const listeners = new Set<() => void>();
let cancel: (() => void) | undefined;

export function getWalletConnectPairing() {
  return snapshot;
}

export function subscribeWalletConnectPairing(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function cancelWalletConnectPairing() {
  cancel?.();
}

/** Connector-only updates. No pairing URI is persisted in application storage. */
export function updateWalletConnectPairing(value: WalletConnectPairing) {
  snapshot = Object.freeze(value);
  listeners.forEach((listener) => listener());
}

export function setWalletConnectPairingCancel(handler: (() => void) | undefined) {
  cancel = handler;
}
