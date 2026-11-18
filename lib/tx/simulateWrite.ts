import { trackedContractWrite } from "./tracked-write";
import { simulateContract, writeContract } from "wagmi/actions";
import type { TransactionHash } from "@/lib/tx/types";
import { isSimulationTransportFallbackEnabled } from "@/lib/runtime/features";
import { normalizeTxError } from "@/lib/tx/errors";
import { wagmiConfig } from "@/web3/wagmi";

type SimulateRequest = Parameters<typeof simulateContract>[1];
type WriteRequest = Parameters<typeof writeContract>[1];

function toErrorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error.toLowerCase();
  if (typeof error === "object") {
    const maybe = error as { shortMessage?: string; message?: string; name?: string };
    return `${maybe.name ?? ""} ${maybe.shortMessage ?? ""} ${maybe.message ?? ""}`.toLowerCase();
  }
  return String(error).toLowerCase();
}

export function isTransportSimulationError(error: unknown): boolean {
  const normalized = normalizeTxError(error);
  if (normalized.code === "network") {
    return true;
  }

  const text = toErrorText(error);
  return (
    text.includes("http request failed") ||
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("network error") ||
    text.includes("network request failed") ||
    text.includes("rpc request failed") ||
    text.includes("socket hang up") ||
    text.includes("timeout") ||
    text.includes("econn")
  );
}

function isDeterministicSimulationFailure(error: unknown): boolean {
  const normalized = normalizeTxError(error);
  if (
    normalized.code === "user_rejected" ||
    normalized.code === "cooldown_not_ready" ||
    normalized.code === "cap_exceeded" ||
    normalized.code === "insufficient_balance" ||
    normalized.code === "revert"
  ) {
    return true;
  }

  const text = toErrorText(error);
  return (
    text.includes("wrong network") ||
    text.includes("no account connected") ||
    text.includes("chain mismatch")
  );
}

/**
 * Pre-simulate writes for early safety, but fall back to direct wallet write when
 * simulation fails due transport/RPC issues on unstable forked UAT environments.
 */
export async function simulateThenWrite(
  simulateRequest: SimulateRequest,
  writeRequest: WriteRequest,
  context: string
): Promise<TransactionHash> {
  let request: WriteRequest;
  try {
    const simulation = await simulateContract(wagmiConfig, simulateRequest as never);
    request = simulation.request as WriteRequest;
  } catch (error) {
    const fallbackEnabled = isSimulationTransportFallbackEnabled();
    const shouldFallback =
      fallbackEnabled &&
      !isDeterministicSimulationFailure(error) &&
      (isTransportSimulationError(error) || normalizeTxError(error).code === "unknown");

    if (!shouldFallback) {
      throw error;
    }
    console.warn(
      `[tx] Simulation failed for ${context}; falling back to direct wallet write.`,
      error
    );
    request = writeRequest;
  }
  // Only simulation failures may select the transport fallback. A wallet error
  // must never invoke a second send.
  return trackedContractWrite(request, () => writeContract(wagmiConfig, request as never), context);
}
