"use client";
import { useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import type { DaoWalletSubmission as WalletSubmission } from "@/lib/clients/dao/wallet-submission";
import { restoreDaoWalletSubmission, isDaoSmartWalletSubmission, assertDaoSubmissionWallet, prepareDaoWalletSubmission, daoWalletProvider, explicitlyRejectedDaoSubmission, isDaoSubmissionHash } from "@/lib/clients/dao/wallet-submission";
import { useTx } from "@/lib/tx/useTx";
import { getDaoRouteClient } from "./useDao";
import { getDaoDeployments, daoDeploymentScope } from "@/lib/clients/dao/deployment";
import { deriveDaoProposalContentIdentity } from "@/lib/clients/dao/content";
import { decodeDaoProposeReceipt } from "@/lib/clients/dao/receipt";
import { normalizeTxError } from "@/lib/tx/errors";
import { daoContentBase64, retrieveDaoPublishedContent } from "@/lib/clients/dao/publication";
import { readDaoContentBytes } from "@/lib/clients/dao/content-bytes";
import { daoProposeCall, DaoPreparationChangedError } from "@/lib/clients/dao/writes";
import { DaoTransactionReplacedError, DaoSafeNonceConsumedError, DaoTransactionPendingError, DaoReconciliationRequiredError, isDaoTerminalTransactionError, waitForDaoReceipt } from "@/lib/clients/dao/live-receipt";
import { withDaoSubmissionLock } from "@/lib/clients/dao/submission-lock";
import { assertDaoAuthoringStorageReadable, clearDaoAuthoringSubmission, daoAuthoringStorageKey, readDaoAuthoringRecovery, saveDaoAuthoringRecovery, saveDaoPendingCreation } from "@/lib/clients/dao/authoring-recovery";
import type { DaoAuthoringServices, DaoAuthoringRecovery } from "@/lib/clients/dao/authoring-services";
import type { DaoDecodedProposeIdentity, DaoProposerState } from "@/lib/clients/dao/types";
import type { DaoForumValidationResult } from "@/lib/clients/dao/authoring-types";
import { daoCopy } from "@/app/dao/messages";
import { daoProposeCopy } from "@/app/dao/propose/messages";

function submissionIdentity(record: DaoAuthoringRecovery | null) {
  return JSON.stringify([record?.publication?.fingerprint, record?.transactionHash, record?.walletSubmission, record?.lastFailure]);
}

export function useDaoAuthoringServices(address: Address, proposer: DaoProposerState) {
  const tx = useTx();
  const submitting = useRef(false);
  const deployments = getDaoDeployments();
  const deployment = deployments.find(d => d.active);
  const key = daoAuthoringStorageKey(daoDeploymentScope(deployments), address);
  const recovery = useMemo(() => readDaoAuthoringRecovery(key, address), [key, address]);
  const [identities] = useState(() => new Map<string, DaoDecodedProposeIdentity>());
  const services: DaoAuthoringServices = {
    retainReview(review) {
      const stored = readDaoAuthoringRecovery(key, address);
      if (stored?.transactionHash || (stored?.walletSubmission && !stored.lastFailure)) return false;
      if (review) return saveDaoAuthoringRecovery(key, review);
      try { sessionStorage.removeItem(key); return true; } catch { return false; }
    },
    async validateForum(input) {
      try {
        const result = await fetch("/api/dao-forum?url=" + encodeURIComponent(input), { cache: "no-store", signal: AbortSignal.timeout(30_000) });
        if (!result.ok) throw new Error("Forum unavailable");
        return await result.json() as DaoForumValidationResult;
      } catch {
        return { state: "invalid", error: { code: "FORUM_UNAVAILABLE", message: "The forum could not be checked. Retry without changing your draft." } };
      }
    },
    async publish(review) {
      try {
        const stored = readDaoAuthoringRecovery(key, address);
        if (stored?.transactionHash || (stored?.walletSubmission && !stored.lastFailure)) throw new Error("Resolve the existing wallet submission before publishing another proposal.");
        if (!proposer.canPropose) throw new Error("Refresh proposal eligibility before continuing.");
        if (review.content.createdBy.toLowerCase() !== address.toLowerCase()) throw new Error("Wallet account changed. Restore the review with its original wallet.");
        if (!saveDaoAuthoringRecovery(key, review)) throw new Error(daoProposeCopy.recovery.storageUnavailable);
        const identity = deriveDaoProposalContentIdentity(review.content);
        const response = await fetch("/api/dao-content", {
          method: "POST", headers: { "Content-Type": "application/octet-stream", "X-DAO-Content-Digest": identity.digest,
            "X-DAO-Content-CID": identity.cid },
          body: new Uint8Array(identity.bytes), signal: AbortSignal.timeout(150_000),
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => ({})) as { code?: string };
          const messages = daoCopy.publicationErrors;
          throw new Error(failure.code && Object.hasOwn(messages, failure.code)
            ? messages[failure.code as keyof typeof messages] : messages.unavailable);
        }
        const result = await response.json() as { digest?: unknown; cid?: unknown; publishedAt?: unknown };
        if (result.digest !== identity.digest || result.cid !== identity.cid || typeof result.publishedAt !== "number" ||
            !Number.isSafeInteger(result.publishedAt) || result.publishedAt <= 0) throw new Error("Publication returned a different content identity.");
        const retained = await retrieveDaoPublishedContent(identity.digest);
        if (readDaoContentBytes(daoContentBase64(retained), identity.digest).state !== "available") throw new Error("Published content could not be verified.");
        const publication = { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: result.publishedAt };
        saveDaoAuthoringRecovery(key, review, publication);
        return { state: "published", publication };
      } catch (error) {
        return { state: "failed", error: { code: "PUBLICATION_FAILED", message: error instanceof Error ? error.message : "Content publication failed." } };
      }
    },
    async submit({ review, publication, onSubmitted }) {
      if (submitting.current) return { state: "failed", error: { code: "NETWORK_ERROR", message: "A proposal submission is already in progress." } };
      const existing = readDaoAuthoringRecovery(key, address);
      if (existing?.transactionHash) return { state: "submitted", transactionHash: existing.transactionHash, walletSubmission: existing.walletSubmission };
      if (existing?.walletSubmission && !existing.lastFailure) return { state: "failed", error: { code: "SUBMISSION_UNKNOWN", message: "The wallet submission is unresolved. Recover its transaction or Safe proposal hash before submitting again." } };
      let hash: Hex | null = null;
      let failure: unknown;
      let walletSubmission: WalletSubmission | undefined;
      submitting.current = true;
      try { await tx.execute(async () => withDaoSubmissionLock(1, address, async () => {
        assertDaoAuthoringStorageReadable(key, address);
        const latest = readDaoAuthoringRecovery(key, address);
        if (latest?.transactionHash || (latest?.walletSubmission && !latest.lastFailure)) throw new Error("A proposal submission is already pending in another tab.");
        if (!proposer.canPropose) throw new Error("Refresh proposal eligibility before continuing.");
        if (!deployment) throw new Error("No active trusted DAO deployment.");
        if (review.content.createdBy.toLowerCase() !== address.toLowerCase()) throw new Error("Wallet account changed. Review the proposal again.");
        const identity = deriveDaoProposalContentIdentity(review.content);
        if (identity.digest !== publication.fingerprint || identity.cid !== publication.cid) throw new Error("Published content changed.");
        await retrieveDaoPublishedContent(identity.digest);
        const client = getDaoRouteClient();
        if (!client.preparePropose) throw new Error("Live creation is unavailable.");
        const prepared = await client.preparePropose(address, identity.digest, review.scriptCheck.script as Hex, proposer.expectedVotingEpoch);
        const call = daoProposeCall(deployment.chainId, address, deployment.votingAddress, publication.fingerprint, review.scriptCheck.script as Hex);
        walletSubmission = (await prepareDaoWalletSubmission(call)).submission;
        if (!saveDaoAuthoringRecovery(key, review, publication, null, proposer.expectedVotingEpoch, undefined, walletSubmission)) {
          walletSubmission = undefined;
          throw new Error("Transaction storage is unavailable. No DAO proposal was sent.");
        }
        try {
          const submitted = await prepared();
          if (isDaoSubmissionHash(submitted)) {
            hash = submitted;
            walletSubmission = { ...walletSubmission, submissionHash: submitted };
            saveDaoAuthoringRecovery(key, review, publication, submitted, proposer.expectedVotingEpoch, undefined, walletSubmission);
          }
          return submitted;
        }
        catch (error) {
          if (explicitlyRejectedDaoSubmission(error)) {
            walletSubmission = undefined;
            clearDaoAuthoringSubmission(key);
            saveDaoAuthoringRecovery(key, review, publication);
          }
          throw error;
        }
      }), {
        tracking: "domain",
        onSubmitted: submitted => {
          if (!isDaoSubmissionHash(submitted) || !walletSubmission) throw new Error("The wallet did not return a valid submission hash.");
          onSubmitted?.(submitted, walletSubmission);
        },
        waitForReceipt: async submitted => {
          if (!walletSubmission?.submissionHash) return { pending: true };
          try {
            const receipt = await waitForDaoReceipt(submitted, deployment!.chainId, address, daoProposeCall(deployment!.chainId, address, deployment!.votingAddress, publication.fingerprint, review.scriptCheck.script as Hex),
              { submission: walletSubmission, provider: await daoWalletProvider(walletSubmission) });
            hash = receipt.transactionHash;
            await withDaoSubmissionLock(1, address, () => {
              const current = readDaoAuthoringRecovery(key, address);
              if (current?.transactionHash === walletSubmission?.submissionHash && current?.walletSubmission?.submissionHash === walletSubmission?.submissionHash) saveDaoAuthoringRecovery(key, review, publication, hash, proposer.expectedVotingEpoch, undefined, walletSubmission);
            });
            return hash;
          } catch (error) { if (error instanceof DaoTransactionPendingError) return { pending: true }; throw error; }
        },
        onError: error => { failure = error; },
      }); } finally { submitting.current = false; }
      const error = normalizeTxError(failure);
      if (hash && !isDaoTerminalTransactionError(failure)) return { state: "submitted", transactionHash: hash, walletSubmission };
      if (hash && isDaoTerminalTransactionError(failure)) await withDaoSubmissionLock(1, address, () => {
        const current = readDaoAuthoringRecovery(key, address);
        if (current?.walletSubmission?.submissionHash !== walletSubmission?.submissionHash || current?.transactionHash !== walletSubmission?.submissionHash) return false;
        return saveDaoAuthoringRecovery(key, review, publication, null, null, {
        transactionHash: isDaoTerminalTransactionError(failure) ? failure.transactionHash ?? hash! : hash!,
        code: failure instanceof DaoSafeNonceConsumedError ? "PROPOSAL_CONSUMED" : failure instanceof DaoTransactionReplacedError ? "PROPOSAL_REPLACED" : "PROPOSAL_REVERTED",
        message: error.message,
      }, walletSubmission); });
      return { state: "failed", walletSubmission, error: {
        transactionHash: isDaoTerminalTransactionError(failure) ? failure.transactionHash ?? hash ?? undefined : hash ?? undefined,
        code: walletSubmission && !hash ? "SUBMISSION_UNKNOWN" : failure instanceof DaoPreparationChangedError ? "PREPARATION_CHANGED" : failure instanceof DaoSafeNonceConsumedError ? "PROPOSAL_CONSUMED" : failure instanceof DaoTransactionReplacedError ? "PROPOSAL_REPLACED" : isDaoTerminalTransactionError(failure) ? "PROPOSAL_REVERTED" : error.code === "user_rejected" ? "WALLET_REJECTED" : error.code === "revert" ? "PROPOSAL_REVERTED" : "NETWORK_ERROR",
        message: walletSubmission && !hash ? "The wallet submission is unresolved. Recover its transaction or Safe proposal hash before submitting again." : error.message,
      } };
    },
    async recoverSubmission(hash) { return withDaoSubmissionLock(1, address, async () => {
      const stored = readDaoAuthoringRecovery(key, address);
      if (isDaoSubmissionHash(hash) && stored?.state === "published" && stored.transactionHash && isDaoSmartWalletSubmission(stored.walletSubmission) && !stored.walletSubmission.reconciliationRequired && !stored.lastFailure) {
        const walletSubmission = { ...stored.walletSubmission, executionHash: hash };
        if (!saveDaoAuthoringRecovery(key, stored.review, stored.publication, stored.transactionHash, stored.expectedEpoch, undefined, walletSubmission)) return { state: "failed", error: { code: "NETWORK_ERROR", message: "The execution hash could not be saved." } };
        return { state: "submitted", transactionHash: hash, walletSubmission };
      }
      if (!isDaoSubmissionHash(hash) || stored?.state !== "published" || !stored.walletSubmission || (stored.transactionHash && !stored.walletSubmission.reconciliationRequired) || stored.walletSubmission.reconciliationVerified || stored.lastFailure) {
        return { state: "failed", error: { code: "NETWORK_ERROR", message: "No unresolved proposal submission matches this wallet." } };
      }
      const walletSubmission = { ...stored.walletSubmission, submissionHash: hash, reconciliationRequired: true, reconciliationVerified: false, hashKind: isDaoSmartWalletSubmission(stored.walletSubmission) ? "unknown" as const : "transaction" as const };
      if (!saveDaoAuthoringRecovery(key, stored.review, stored.publication, hash, stored.expectedEpoch, undefined, walletSubmission)) return { state: "failed", error: { code: "NETWORK_ERROR", message: "The recovered hash could not be saved." } };
      return { state: "submitted", transactionHash: hash, walletSubmission };
    }); },
    async finishWalletReview(expected) { return withDaoSubmissionLock(1, address, () => {
      const stored = readDaoAuthoringRecovery(key, address);
      if (stored?.state !== "published" || !stored.walletSubmission || stored.lastFailure ||
          JSON.stringify(stored.walletSubmission) !== JSON.stringify(expected)) return false;
      const noHash = (!stored.transactionHash && !stored.walletSubmission.submissionHash) || stored.walletSubmission.reconciliationRequired;
      if (!noHash && !(stored.walletSubmission.reconciliationRequired && stored.walletSubmission.reconciliationVerified)) return false;
      assertDaoSubmissionWallet(stored.walletSubmission);
      return clearDaoAuthoringSubmission(key) && saveDaoAuthoringRecovery(key, stored.review, stored.publication);
    }); },
    async confirm(review, publication, hash, epoch) {
      if (!deployment) throw new Error("No trusted DAO deployment.");
      let stored = readDaoAuthoringRecovery(key, address);
      if (stored?.state !== "published" || stored.publication.fingerprint !== publication.fingerprint ||
          deriveDaoProposalContentIdentity(review.content).digest !== stored.publication.fingerprint ||
          stored.review.scriptCheck.script !== review.scriptCheck.script ||
          ![stored.transactionHash, stored.walletSubmission?.submissionHash, stored.walletSubmission?.executionHash].includes(hash)) {
        throw new Error("The saved DAO submission changed. Retry its current state.");
      }
      const call = daoProposeCall(deployment.chainId, address, deployment.votingAddress, publication.fingerprint, review.scriptCheck.script as Hex);
      if (stored?.state === "published" && stored.transactionHash && !stored.walletSubmission) {
        const restored = await restoreDaoWalletSubmission(call, stored.transactionHash);
        if (restored) {
          const original = stored;
          await withDaoSubmissionLock(1, address, () => {
            if (submissionIdentity(readDaoAuthoringRecovery(key, address)) !== submissionIdentity(original)) throw new Error("The saved DAO submission changed. Retry its current state.");
            if (!saveDaoAuthoringRecovery(key, original.review, original.publication, original.transactionHash, original.expectedEpoch, original.lastFailure, restored)) throw new Error("The Safe submission context could not be saved.");
          });
          stored = { ...original, walletSubmission: restored };
        }
      }
      const persist = (operation: () => boolean) => withDaoSubmissionLock(1, address, () => {
        if (submissionIdentity(readDaoAuthoringRecovery(key, address)) !== submissionIdentity(stored)) throw new Error("The saved wallet submission changed. Check its current state again.");
        if (!operation()) throw new Error("The DAO receipt state could not be saved. Check the saved submission again.");
      });
      const receipt = await waitForDaoReceipt(hash, deployment.chainId, address, daoProposeCall(deployment.chainId, address, deployment.votingAddress, publication.fingerprint, review.scriptCheck.script as Hex), stored?.walletSubmission ? {
        submission: stored.walletSubmission, provider: await daoWalletProvider(stored.walletSubmission),
        executionHash: stored.walletSubmission.executionHash ?? (hash !== stored.walletSubmission.submissionHash ? hash : undefined), checkCancellation: true,
      } : undefined).catch(async error => {
        if (stored?.walletSubmission?.reconciliationRequired && isDaoTerminalTransactionError(error)) {
          await persist(() => saveDaoAuthoringRecovery(key, review, publication, error.transactionHash ?? hash, stored.expectedEpoch ?? epoch, undefined, { ...stored.walletSubmission!, reconciliationVerified: true }));
          throw new DaoReconciliationRequiredError(error.transactionHash ?? hash);
        }
        if (isDaoTerminalTransactionError(error)) await persist(() => saveDaoAuthoringRecovery(key, review, publication, null, null, {
          transactionHash: error.transactionHash ?? hash, code: error instanceof DaoSafeNonceConsumedError ? "PROPOSAL_CONSUMED" : error instanceof DaoTransactionReplacedError ? "PROPOSAL_REPLACED" : "PROPOSAL_REVERTED", message: error.message,
        }, stored?.walletSubmission));
        throw error;
      });
      if (stored?.walletSubmission?.reconciliationRequired) {
        await persist(() => saveDaoAuthoringRecovery(key, review, publication, receipt.transactionHash, stored.expectedEpoch ?? epoch, undefined, { ...stored.walletSubmission!, reconciliationVerified: true }));
        throw new DaoReconciliationRequiredError(receipt.transactionHash);
      }
      await persist(() => saveDaoAuthoringRecovery(key, review, publication, receipt.transactionHash, stored?.expectedEpoch ?? epoch, undefined, stored?.walletSubmission));
      return { state: "confirmed", receipt, decoded: decodeDaoProposeReceipt(receipt, {
        chainId: deployment.chainId, votingAddress: deployment.votingAddress, transactionHash: receipt.transactionHash,
        proposer: address, votingEpoch: stored?.expectedEpoch ?? epoch,
        contentDigest: publication.fingerprint, script: review.scriptCheck.script as Hex,
      }) };
    },
    async register(review, _publication, identity) {
      identities.set(identity.ref.proposalId.toString(), identity);
      saveDaoPendingCreation(identity, review.parsedContent.title ?? "Proposal");
    },
    async index(ref) {
      const identity = identities.get(ref.proposalId.toString());
      if (!identity) return null;
      const feed = await getDaoRouteClient().getFeed();
      const proposal = feed.proposals.find(p => p.ref.chainId === ref.chainId && p.ref.votingAddress === ref.votingAddress && p.ref.proposalId === ref.proposalId);
      if (!proposal || proposal.proposer.toLowerCase() !== identity.proposer.toLowerCase() ||
          proposal.content.digest !== identity.contentDigest || proposal.script.bytes !== identity.script ||
          proposal.votingEpoch !== identity.votingEpoch ||
          !proposal.events.some(event => event.type === "propose" && event.log.transactionHash === identity.log.transactionHash && event.log.blockHash === identity.log.blockHash && event.log.logIndex === identity.log.logIndex)) return null;
      await withDaoSubmissionLock(1, address, () => {
        const current = readDaoAuthoringRecovery(key, address);
        if (current?.transactionHash === identity.log.transactionHash && !current.walletSubmission?.reconciliationRequired &&
            current.publication?.fingerprint === identity.contentDigest && clearDaoAuthoringSubmission(key)) sessionStorage.removeItem(key);
      });
      return proposal;
    },
  };
  return { services, recovery, recoveryKey: key };
}
