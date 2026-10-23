"use client";

import { useSyncExternalStore } from "react";
import type { Address } from "viem";
import { deriveDaoParticipation, type DaoParticipationMap } from "@/lib/clients/dao/participation";
import { serializeDaoProposalRef } from "@/lib/clients/dao/domain";
import { readDaoMockAccountProposalState } from "@/lib/clients/dao/store";
import { daoDeploymentScope, getDaoDeployments } from "@/lib/clients/dao/deployment";
import { daoActionStorageKey, parseDaoActionRecovery, readDaoActionRaw, subscribeDaoActionRecovery } from "@/lib/clients/dao/action-recovery";
import type { DaoMockRuntimeSnapshot, DaoProposal } from "@/lib/clients/dao/types";

/** The board uses its existing snapshot and local receipt state, with no per-row RPC fan-out. */
export function useDaoParticipation(
  proposals: DaoProposal[],
  address: Address | null,
  runtime: DaoMockRuntimeSnapshot | null,
): DaoParticipationMap {
  // Feed loading owns configuration errors. A malformed deployment must not
  // turn this optional badge overlay into a render-time exception.
  let scope: string | null = null;
  if (!runtime && address) {
    try { scope = daoDeploymentScope(getDaoDeployments()); } catch { /* No local receipt overlay. */ }
  }
  const raw = useSyncExternalStore(
    subscribeDaoActionRecovery,
    () => JSON.stringify(proposals.map((proposal) => scope && address
      ? readDaoActionRaw(daoActionStorageKey(scope, proposal.ref, address)) : null)),
    () => "[]",
  );
  if (!address) return {};
  const saved = JSON.parse(raw) as Array<string | null>;
  return Object.fromEntries(proposals.map((proposal, index) => {
    const pending = runtime?.pendingAction ?? parseDaoActionRecovery(saved[index] ?? null, proposal.ref, address);
    const status = deriveDaoParticipation(proposal, address, pending);
    // Mock controls model account participation independently of fixture history.
    const value = runtime && status !== "pending"
      ? readDaoMockAccountProposalState(proposal.ref, address).hasVoted ? "voted" : "not-voted"
      : status;
    return [serializeDaoProposalRef(proposal.ref), value];
  }));
}
