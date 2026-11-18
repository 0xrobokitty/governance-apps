"use client";

import { useState, useSyncExternalStore } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Hash } from "viem";
import { Button } from "@/components/ui/Button";
import { getServerTrackedSnapshot, getTrackedSnapshot, subscribeTrackedSubmissions, type TrackedSubmission } from "@/lib/tx/pending-transactions";
import { checkTrackedCancellation, checkTrackedSubmission, reconcileTrackedSubmission } from "@/lib/tx/tracked-write";

export function PendingTransactions() {
  const { address, chainId } = useAccount();
  const snapshot = useSyncExternalStore(subscribeTrackedSubmissions, () => getTrackedSnapshot(chainId, address), getServerTrackedSnapshot);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ scope: string; text: string; hash?: Hash } | null>(null);
  const scope = `${chainId}:${address?.toLowerCase()}`;
  const activeNotice = notice?.scope === scope ? notice : null;
  if (!snapshot.value.length && !snapshot.error && !activeNotice) return null;
  return (
    <section aria-label="Wallet transaction status" className="mx-auto w-full max-w-7xl px-4 py-3 md:px-6">
      <div className="rounded-box border border-border bg-surface p-4 text-sm">
        {snapshot.error && <p role="alert">{snapshot.error}</p>}
        {activeNotice && <div role="status" className="mb-3 flex flex-wrap items-center gap-3">
          <span>{activeNotice.text}</span>
          {activeNotice.hash && chainId === 1 && <a className="underline" href={`https://etherscan.io/tx/${activeNotice.hash}`} target="_blank" rel="noreferrer">View execution</a>}
          <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>Dismiss result</Button>
        </div>}
        {snapshot.value.length > 0 && <>
          <h2 className="font-bold">Pending wallet transactions</h2>
          <p className="mt-1 text-text-secondary">Queued proposals need wallet approval and execution. Checking here never sends another transaction.</p>
          <ul className="mt-3 space-y-4">
            {snapshot.value.map(record => <PendingTransaction key={record.id} record={record} onComplete={async (text, hash) => {
              setNotice({ scope, text, hash });
              await queryClient.invalidateQueries();
            }} />)}
          </ul>
        </>}
      </div>
    </section>
  );
}
function PendingTransaction({ record, onComplete }: { record: TrackedSubmission; onComplete: (text: string, hash?: Hash) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [reconciliation, setReconciliation] = useState(false);
  const [queueChecked, setQueueChecked] = useState(false);
  const [message, setMessage] = useState(record.error ?? "");
  const [submissionHash, setSubmissionHash] = useState("");
  const [executionHash, setExecutionHash] = useState("");
  const check = async (cancel = false, reconcile = false) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (reconcile) {
        const hash = await reconcileTrackedSubmission(record, submissionHash.trim() ? submissionHash.trim() as Hash : undefined, executionHash.trim() ? executionHash.trim() as Hash : undefined, queueChecked);
        await onComplete(hash
          ? "Queue review recorded. A matching execution was verified; the original submission outcome remains unknown."
          : "Queue review recorded. The original submission outcome remains unknown. The local retry block was removed.", hash);
      } else if (cancel) {
        if (await checkTrackedCancellation(record)) await onComplete("The Safe nonce was consumed. This proposal cannot execute again; its action outcome was not verified.");
        else setMessage("The proposal can still execute. Check its queue in the Safe.");
      } else {
        const result = await checkTrackedSubmission(record, executionHash.trim() ? executionHash.trim() as Hash : undefined, submissionHash.trim() ? submissionHash.trim() as Hash : undefined);
        if (result.status === "pending") setMessage(result.error ?? "Execution is still pending. Check the wallet queue and return after execution.");
        else if (result.status === "reconciliation-required") {
          setReconciliation(true);
          setMessage("This verifies an identical call, but cannot identify the original uncertain submission. Check the wallet queue for duplicate proposals before clearing this record.");
        } else await onComplete(result.status === "confirmed" ? `${record.label}: execution confirmed.` : `${record.label}: execution failed.`, result.hash);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Execution could not be verified. Check again."); }
    finally { setBusy(false); }
  };
  return <li className="border-t border-border pt-3">
    <p className="font-semibold">{record.label}</p>
    {record.submissionHash && <p className="mt-1 break-all font-mono text-xs">{record.hashKind === "safe-proposal" ? "Safe proposal" : "Wallet submission"}: {record.submissionHash}</p>}
    {!record.submissionHash && <p className="mt-1 text-text-secondary">Submission is uncertain. Find its identifier in the wallet before continuing.</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" isLoading={busy} onClick={() => void check()}>Check execution</Button>
      {record.kind === "safe" && record.hashKind === "safe-proposal" && record.submissionHash && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void check(true)}>Check replaced or cancelled proposal</Button>}
    </div>
    <details className="mt-3">
      <summary className="min-h-10 cursor-pointer py-2 underline">Review original call</summary>
      <dl className="space-y-1 break-all font-mono text-xs">
        <dt>Target</dt><dd>{record.to}</dd>
        <dt>ETH value (wei)</dt><dd>{record.value}</dd>
        <dt>Calldata</dt><dd className="max-h-32 overflow-auto">{record.data}</dd>
      </dl>
    </details>
    <details className="mt-3">
      <summary className="min-h-10 cursor-pointer py-2 underline">Recover wallet identifiers</summary>
      <p className="mb-2 text-text-secondary">Use the original proposal or submission identifier. If the wallet cannot resolve it, add the executed Ethereum transaction hash.</p>
      {!record.submissionHash && <label className="mb-2 block">Wallet submission hash
        <input className="mt-1 block w-full rounded-box border border-border bg-app p-2 font-mono text-xs" value={submissionHash} onChange={event => { setSubmissionHash(event.target.value); setReconciliation(false); setQueueChecked(false); }} autoComplete="off" spellCheck={false} maxLength={66} />
      </label>}
      <label className="block">Execution transaction hash (optional)
        <input className="mt-1 block w-full rounded-box border border-border bg-app p-2 font-mono text-xs" value={executionHash} onChange={event => { setExecutionHash(event.target.value); setReconciliation(false); setQueueChecked(false); }} autoComplete="off" spellCheck={false} maxLength={66} />
      </label>
    </details>
    {!record.submissionHash && !reconciliation && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setReconciliation(true)}>Review uncertain submission</Button>}
    {reconciliation && <div className="mt-3 space-y-2">
      <p>Check the wallet queue and recent activity for this exact call. Clearing this record permits another submission. It does not cancel a wallet proposal.</p>
      <label className="flex items-start gap-2"><input type="checkbox" checked={queueChecked} onChange={event => setQueueChecked(event.target.checked)} />
        <span>I checked the wallet queue and verified that no unresolved duplicate proposal remains.</span>
      </label>
      <Button size="sm" variant="secondary" disabled={busy || !queueChecked} onClick={() => void check(false, true)}>Finish queue reconciliation</Button>
    </div>}
    {message && <p role="status" className="mt-2 break-words">{message}</p>}
  </li>;
}
