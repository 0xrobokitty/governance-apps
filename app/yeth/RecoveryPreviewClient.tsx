"use client";

import { useState } from "react";
import type { useTx } from "@/lib/tx/useTx";
import { TransactionLink } from "@/components/ui/ExplorerLink";
import { formatEther } from "viem";
import { isRecoveryHash, type RecoveryPending } from "@/lib/clients/yeth/recovery/pending";
import type { RecoveryActionReceipt } from "@/lib/clients/yeth/recovery/onchain";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useYethRecoveryPreview } from "@/lib/hooks/useYethRecoveryPreview";
import { formatRecoveryPercent } from "@/lib/clients/yeth/recovery/format";
import { countdown, recoveryChoices, recoveryTarget } from "@/lib/clients/yeth/recovery/decisions";
import { exitOffer, exitPlan, reviewedAuctionQuote, type ExitMode } from "@/lib/clients/yeth/recovery/journey";
import type { AuctionScenario, RecoverySnapshot } from "@/lib/clients/yeth/recovery/types";
import { recoveryCopy as copy, recoveryDecisionCopy as words, recoveryJourneyCopy as text, recoveryPolishCopy as polish, recoveryProductionCopy as liveCopy, recoveryExitCopy as exitCopy } from "./messages";
import { RecoveryAuctionChart } from "./components/RecoveryAuctionChart";
import type { RecoveryExitState } from "@/lib/hooks/useYethRecoveryExit";
import { RecoveryExitProgress } from "./components/RecoveryExitProgress";
import { RecoveryCapital, RecoveryOverview } from "./components/RecoveryDetails";
import { RecoveryHolders, RecoveryHeadline } from "./components/RecoveryProgress";
import { RecoveryAuctionHistory, RecoveryContracts, RecoveryFaq } from "./components/RecoveryRecords";

const amount = (value: bigint, digits = 3) => Number(formatEther(value)).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const pct = formatRecoveryPercent;
type Review = { weth: bigint; shares: bigint; round: number; mode: ExitMode; originalShares: bigint };
export type RecoveryExitReview = { weth?: bigint; maxShares?: bigint; round?: number; mode: ExitMode; originalShares: bigint };


export type RecoveryController = {
  snapshot: RecoverySnapshot | null;
  error: string | null;
  tx: ReturnType<typeof useTx>;
  walletPromptActive?: boolean;
  exit?: {
    state: RecoveryExitState;
    start: (request: RecoveryExitReview) => Promise<void>;
    continue: () => Promise<void>;
    pause: () => void;
  };
  refresh: () => unknown;
  reviewAuction?: (weth: bigint, shares: bigint, round: number) => Promise<{weth: bigint; shares: bigint; round: number; originalShares?: bigint}>;
  approve: (shares: bigint) => Promise<unknown>;
  take: (weth: bigint, shares: bigint, round: number, exitMode?: ExitMode) => Promise<{ snapshot: RecoverySnapshot; received: bigint; hash?: `0x${string}` } | null>;
  redeem: (expectedShares: bigint) => Promise<boolean>;
  resetAllowance?: () => Promise<unknown>;
  allowanceNeedsReset?: (shares: bigint) => boolean;
  pendingExecution?: RecoveryPending | null;
  completion?: { intent?: Pick<RecoveryPending, "kind">; status: "confirmed" | "failed" | "nonce-consumed"; action: string; hash?: `0x${string}`; exitMode?: ExitMode; receipt?: RecoveryActionReceipt } | null;
  refreshPending?: (submissionHash?: `0x${string}`) => Promise<unknown>;
  canTransact?: boolean;
  canRedeem?: boolean;
  unavailableReason?: string | null;
  scenario?: AuctionScenario;
  setScenario?: (value: AuctionScenario) => void;
  advance?: () => void;
};
export function RecoveryPreviewClient() {
  const preview = useYethRecoveryPreview();
  return <RecoveryDashboard controller={{
    ...preview,
    refresh: () => preview.setScenario(preview.scenario),
    take: async (weth, shares, round) => {
      const before = preview.snapshot?.walletWeth ?? 0n;
      const snapshot = await preview.take(weth, shares, round);
      return snapshot ? {snapshot, received: snapshot.walletWeth - before} : null;
    },
  }} />;
}
export function RecoveryDashboard({ controller: preview, mode: runtime = "mock", connect }: {
  controller: RecoveryController; mode?: "mock" | "live" | "fork"; connect?: React.ReactNode;
}) {
  const { snapshot: s, tx } = preview;
  const isLive = runtime !== "mock";
  const [reviewLoading, setReviewLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const act = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try { return await action(); } catch (error) {
      setActionError(error instanceof Error ? error.message : liveCopy.failed);
      return null;
    }
  };
  const [mode, setMode] = useState<ExitMode>("complete");
  const [tab, setTab] = useState(isLive ? "progress" : "auction");
  const [modal, setModal] = useState<"auction" | "redeem" | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [localPending, setPending] = useState<{ received: bigint; hash?: `0x${string}` } | null>(null);
  const [redeemShares, setRedeemShares] = useState<bigint | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [flowStarted, setFlowStarted] = useState(false);
  const flow = preview.exit?.state;
  const flowActive = flowStarted && !!flow && flow.phase !== "idle";
  const flowBusy = flowActive && !["paused", "complete"].includes(flow.phase);
  const completion = preview.completion;
  const pending = isLive
    ? completion?.status === "confirmed" && completion.action === "take" && completion.exitMode === "complete" && completion.receipt && (s?.shares ?? 0n) > 2n
      ? { received: completion.receipt.wethReceived, hash: completion.hash }
      : null
    : localPending;
  const execution = preview.pendingExecution;
  const busy = reviewLoading || flowBusy || ["simulating", "signing", "submitted", "mining"].includes(tx.state.status);
  const changeScenario = (scenario: AuctionScenario) => {
    setModal(null); setReview(null); setPending(null); setAccepted(false); setMode("complete");
    setTab(["waiting", "empty", "ended", "stale", "no-position"].includes(scenario) ? "progress" : "auction");
    preview.setScenario?.(scenario);
  };

  if (!s) return <div className="container mx-auto max-w-5xl px-4 py-12">
    <p className="mb-6 text-sm text-text-secondary">{isLive ? liveCopy.live : copy.preview}</p>
    {execution && <PendingExecution pending={execution} refresh={preview.refreshPending} runtime={runtime} walletPromptActive={preview.walletPromptActive} />}
    <Card><h1 className="text-2xl font-bold">{preview.error ? words.error : isLive ? liveCopy.loading : words.loading}</h1>
      {preview.error && <><p role="alert" className="my-4">{preview.error}</p><Button onClick={() => isLive ? preview.refresh() : changeScenario("active")}>{isLive ? liveCopy.refresh : words.retry}</Button></>}
    </Card>
  </div>;

  const offer = exitOffer(s, mode);
  const { fresh, active, directValue, recovery } = offer;
  const hasPosition = s.connected && offer.hasUsablePosition;
  const showOffer = hasPosition && fresh;
  const canRedeem = showOffer && !busy && !execution && preview.canTransact !== false && preview.canRedeem !== false;
  const quote = review ? reviewedAuctionQuote(s, review.weth, review.shares, review.round) : null;
  const reviewPlan = quote && review ? exitPlan(s, quote, review.mode) : null;
  const canTake = hasPosition && !!quote && !busy && !execution && preview.canTransact !== false;
  const needsReset = !!review && (preview.allowanceNeedsReset?.(review.shares) ?? false);
  const approved = !!quote && s.allowance >= quote.shares && !needsReset;
  const openExit = async () => {
    tx.reset(); setAccepted(false); setFlowStarted(false); setActionError(null); setRedeemShares(s.shares);
    if (offer.beneficial && offer.quote) {
      const intended = { weth: offer.quote.weth, shares: offer.quote.shares, round: s.auction.kickedAt, originalShares: s.shares };
      setReviewLoading(true);
      await act(async () => {
        const confirmed = preview.reviewAuction ? await preview.reviewAuction(intended.weth, intended.shares, intended.round) : intended;
        setReview({ ...confirmed, originalShares: confirmed.originalShares ?? s.shares, mode: offer.coversPosition ? "complete" : mode });
        setModal("auction");
      });
      setReviewLoading(false);
    } else { setReview(null); setModal("redeem"); }
  };
  const resume = () => { tx.reset(); setAccepted(false); setRedeemShares(s.shares); setActionError(null); setModal("redeem"); };
  const auctionAction = offer.partial ? exitCopy.takeAuction : exitCopy.exitAuction;
  const actionLabel = offer.beneficial ? auctionAction : words.exitAction;
  const reviewRate = modal === "auction" ? reviewPlan?.rate ?? null : fresh && (!s.live || s.live.principalKnown) ? recovery : null;
  const reviewAmount = modal === "auction" ? reviewPlan?.payout ?? 0n : directValue;
  const close = () => {
    if (preview.walletPromptActive) return;
    if (flowBusy) preview.exit?.pause();
    setModal(null);
  };
  const resumeFlow = () => {
    setFlowStarted(true); setAccepted(true); setModal(flow?.step === "redeem" ? "redeem" : "auction");
    void preview.exit?.continue();
  };
  const auctionState = s.auction.kickedAt === 0 ? copy.auction.waiting : s.auction.remainingWeth === 0n ? copy.auction.empty : copy.auction.ended;
  const exitSummary = isLive && s.connected && !modal
    ? flow?.phase === "complete" && flow.receivedWeth > 0n
      ? { title: flow.mode === "auction" ? exitCopy.auctionComplete : exitCopy.complete, receivedWeth: flow.receivedWeth, hash: runtime === "live" ? flow.hash : undefined }
      : !execution && (!flow || flow.phase === "idle") && completion?.status === "confirmed" && completion.receipt && ["take", "redeem"].includes(completion.action)
        ? { title: completion.action === "take" ? exitCopy.lastAuction : exitCopy.lastRedemption, receivedWeth: completion.receipt.wethReceived, hash: runtime === "live" ? completion.hash : undefined }
        : undefined
    : undefined;

  return <div className="container mx-auto max-w-5xl px-4 pb-16 pt-4 md:px-6">
    {!isLive && <div className="mb-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-3 text-xs text-text-secondary">
      <span>{words.preview}</span>
      <label className="flex flex-wrap items-center gap-2">{words.previewState}
        <select aria-label={words.previewState} value={preview.scenario} disabled={busy} onChange={e => changeScenario(e.target.value as AuctionScenario)} className="min-h-10 rounded border border-border bg-surface px-2 text-text-primary">
          {Object.entries(words.states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>}

    <RecoveryHeadline snapshot={s} exitSummary={exitSummary} />
    {!isLive && tx.state.status === "success" && !modal && !pending && <p role="status" className="mb-6 text-sm text-text-secondary">{words.success}</p>}

    {(!fresh || !s.connected || !hasPosition) && !(exitSummary && s.connected && !hasPosition) && <p role="status" className="mb-6 rounded-box border border-border bg-surface-secondary p-4 text-sm">
      {!s.connected ? copy.auction.disconnected : !fresh ? isLive ? liveCopy.walletUpdating : copy.auction.stale : offer.roundingRemainder ? isLive ? liveCopy.dust : words.roundingRemainder : s.originalClaimEth > 0n ? words.exited : isLive ? liveCopy.noPosition : copy.auction.noPosition}
      {isLive && (!s.connected || preview.canTransact === false) && connect && <span className="ml-3 inline-flex">{connect}</span>}
      {!isLive && !s.connected && <button className="ml-2 min-h-10 underline underline-offset-4" onClick={() => changeScenario("active")}>{words.exampleAccount}</button>}
    </p>}

    {preview.unavailableReason && <p role="status" className="mb-5 text-sm text-text-secondary">{preview.unavailableReason}{s.connected && connect && <span className="ml-3 inline-flex">{connect}</span>}</p>}
    {actionError && !modal && <p role="alert" className="mb-5 text-sm text-error-700">{actionError}</p>}
    {preview.error && <p role="alert" className="mb-5 text-sm text-text-secondary">{preview.error} <button type="button" onClick={() => preview.refresh()} className="underline underline-offset-4">{liveCopy.refresh}</button></p>}
    {completion?.status === "nonce-consumed" && !execution && <p role="status" className="mb-5 rounded-box border border-border p-4 text-sm">{completion.intent?.kind === "safe" ? liveCopy.proposalNonceConsumed : liveCopy.transactionNonceConsumed}</p>}
    {completion?.status === "failed" && !execution && <p role="alert" className="mb-5 rounded-box border border-border p-4 text-sm">{liveCopy.executionFailed}</p>}
    {flow?.phase === "paused" && !flow.canContinue && !modal && <p role="status" className="mb-5 text-sm text-text-secondary">{flow.error}</p>}
    {execution && !modal && <PendingExecution pending={execution} refresh={preview.refreshPending} runtime={runtime} walletPromptActive={preview.walletPromptActive} />}
    {flow?.phase === "paused" && flow.canContinue && !modal ? <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-box border border-tokyo-600 p-5">
      <div><h2 className="font-bold">{flow.receivedWeth > 0n ? exitCopy.partComplete : exitCopy.paused}</h2><p className="mt-1 text-sm text-text-secondary">{flow.receivedWeth > 0n ? exitCopy.received(amount(flow.receivedWeth)) : flow.error}</p></div>
      <Button variant="yeth" disabled={!!execution} onClick={resumeFlow}>{exitCopy.continue}</Button>
    </section> : !preview.exit && pending ? <section className="rounded-box border border-tokyo-600 bg-surface p-6" aria-label={text.pendingTitle}>
      <h2 className="text-xl font-bold">{text.pendingTitle}</h2>
      <p role="status" className="my-3 text-sm text-text-secondary">{text.pendingBody(amount(pending.received), fresh ? amount(directValue) : "—")}</p>
      {pending.hash && runtime === "live" && <div className="mb-4"><TransactionLink hash={pending.hash} /></div>}
      <Button variant="yeth" disabled={!canRedeem} onClick={resume}>{text.resume}</Button>
    </section> : showOffer && <section aria-labelledby="exit-heading" className="overflow-hidden rounded-box border border-border bg-surface">
      {offer.beneficial && !offer.coversPosition && <fieldset className="border-b border-border p-4 md:p-5">
        <legend className="float-left mb-3 w-full text-sm font-bold">{polish.chooseExit}</legend>
        <div className="clear-both grid gap-3 md:grid-cols-2">
          {(["auction", "complete"] as const).map(value => <label key={value} className={"relative flex cursor-pointer items-start gap-3 rounded-box border-2 p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tokyo-600 has-[:focus-visible]:ring-offset-2 " + (mode === value ? "border-tokyo-600 bg-tokyo-600/5" : "border-border hover:border-text-tertiary")}>
            <input type="radio" name="exit-mode" value={value} checked={mode === value} disabled={busy || !!execution} onChange={() => setMode(value)} aria-labelledby={"choice-" + value} aria-describedby={"choice-note-" + value} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            <span aria-hidden="true" className={"mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-sm " + (mode === value ? "border-tokyo-600 bg-tokyo-600 text-white" : "border-text-tertiary")}>{mode === value ? "✓" : ""}</span>
            <span className="min-w-0"><span id={"choice-" + value} className="block font-bold">{value === "complete" ? polish.exitFully : polish.auctionOnly}</span>
              <span id={"choice-note-" + value} className="mt-1 block text-xs leading-relaxed text-text-secondary">{value === "complete" ? polish.fullChoice : polish.partialChoice(pct(offer.positionFraction), pct(1 - offer.positionFraction))}</span>
            </span>
          </label>)}
        </div>
      </fieldset>}
      <div className="grid md:grid-cols-[1.6fr_1fr]">
        <div className={offer.beneficial ? "bg-tokyo-900 p-5 text-white md:p-7" : "bg-surface-secondary p-5 md:p-7"}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="exit-heading" className="text-base font-medium">{offer.rate === null ? liveCopy.exitAmount : offer.partial ? polish.receivePartial : polish.receiveToday}</h2>
            {offer.beneficial && <span className="rounded-full border border-white/30 px-2 py-1 text-[0.65rem]">{words.open}</span>}
          </div>
          <p data-testid="exit-rate" hidden={offer.rate === null} className="font-number text-[clamp(2.25rem,18vw,5.5rem)] font-bold leading-none tracking-[-0.05em]">{offer.rate === null ? "—" : pct(offer.rate)}</p>
          <p data-testid="exit-scope" className={"mt-3 text-sm " + (offer.beneficial ? "text-white/85" : "text-text-secondary")}>{offer.partial ? polish.portion(pct(offer.soldFraction)) : polish.entireClaim}</p>
          <p data-testid="exit-payout" className={"break-words font-number font-bold " + (offer.rate === null ? "mt-3 text-4xl" : "mt-5 text-xl")}>{amount(offer.payout)} WETH</p>
          {offer.beneficial && !offer.coversPosition && <p className="mt-2 text-xs leading-relaxed text-white/80">{offer.partial ? polish.keepValue(amount(offer.remainingValue)) : polish.fullValue(amount(offer.quote!.weth), amount(offer.remainingValue))}</p>}
          <Button variant={offer.beneficial ? "secondary" : "yeth"} className={"mt-5 h-auto min-h-12 w-full py-3 " + (offer.beneficial ? "border-white bg-white text-tokyo-900 hover:bg-tokyo-100" : "")} disabled={busy || !!execution || preview.canTransact === false || (!offer.beneficial && preview.canRedeem === false)} isLoading={reviewLoading} aria-label={isLive ? actionLabel + (offer.rate === null ? "" : " at " + pct(offer.rate) + " recovery") : undefined} onClick={openExit}>
            {isLive ? <>{actionLabel}{offer.rate !== null && <span className="ml-2 font-number">{" · "}{pct(offer.rate)}</span>}</> : offer.beneficial ? offer.partial ? polish.reviewPartial : polish.reviewFull : words.exitAction}
          </Button>
          {offer.beneficial && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-white/80" aria-live="off">
            <span>{words.sharedAvailable}: {amount(s.auction.remainingWeth, 2)} WETH</span>
            <span>{offer.nextEvent === "end" ? words.ends : words.nextStep} <time data-testid="auction-timer" className="font-number tabular-nums">{countdown(offer.nextEventIn)}</time></span>
          </div>}
        </div>
        <div className="flex flex-col justify-center p-5 md:p-7">
          <h3 className="text-lg font-bold">{polish.hold}</h3>
          <p data-testid="hold-comparison" className="mt-3 text-xl font-bold leading-snug">{offer.holdYears !== null && offer.holdTarget !== null ? polish.holdFor(words.time(offer.holdYears), pct(offer.holdTarget)) : s.live && recoveryTarget(s, 100).status === "outside-claim" ? liveCopy.targetBelowClaim : polish.holdUnknown}</p>
          {offer.partial && <p className="mt-3 text-xs text-text-secondary">{polish.holdScope}</p>}
          <p className="mt-4 text-sm leading-relaxed text-text-secondary">{polish.holdRisk}</p>
          {!active && <p className="mt-4 text-xs text-text-secondary">{auctionState}</p>}
        </div>
      </div>
    </section>}

    <section aria-label={words.detailsLabel} className="mt-10 min-w-0">
      <Tabs className="[&>span]:shrink-0" variant="line" tabs={Object.entries(text.tabs).map(([id, label]) => ({ id, label }))} activeTab={tab} onChange={setTab} aria-label={words.detailsLabel} getTabId={id => "recovery-tab-" + id} getPanelId={id => "recovery-panel-" + id} />
      {Object.keys(text.tabs).map(id => <div key={id} id={"recovery-panel-" + id} role="tabpanel" aria-labelledby={"recovery-tab-" + id} tabIndex={0} hidden={tab !== id} className="pt-6">
        {tab === id && (!isLive && !fresh && !["faq", "contracts"].includes(id) ? <p className="text-sm text-text-secondary">{copy.auction.stale}</p> : <>
          {id === "auction" && <>{active ? <div><RecoveryAuctionChart snapshot={s} />{!isLive && <button type="button" disabled={busy} onClick={preview.advance} className="mt-3 min-h-10 text-xs underline underline-offset-4">{words.advance}</button>}</div> : <div className="py-6"><h2 className="text-xl font-bold">{auctionState}</h2><p className="mt-2 text-sm text-text-secondary">{copy.auction.waitingBody}</p></div>}<RecoveryAuctionHistory snapshot={s} /></>}
          {id === "progress" && <RecoveryOverview snapshot={s} />}
          {id === "vaults" && <RecoveryCapital snapshot={s} />}
          {id === "holders" && <RecoveryHolders snapshot={s} />}
          {id === "contracts" && <RecoveryContracts />}
          {id === "faq" && <RecoveryFaq />}
        </>)}
      </div>)}
    </section>

    <Modal className="max-h-[calc(100dvh-2rem)] overflow-y-auto" isOpen={modal !== null} onClose={preview.exit ? close : () => { if (!busy) setModal(null); }} title={preview.exit ? modal === "auction" ? review?.mode === "auction" ? exitCopy.takeAuction : exitCopy.exitAuction : words.exitAction : pending ? text.secondStep : review?.mode === "auction" && modal === "auction" ? polish.reviewPartial : polish.reviewFull}>
      {preview.exit ? flowActive && flow ? <RecoveryExitProgress auction={!!review || flow.receivedWeth > 0n && flow.step === "redeem"} redeem={!review || review.mode === "complete" && review.originalShares > review.shares + 2n} state={flow} walletPromptActive={preview.walletPromptActive ?? false} pending={execution && (execution.kind === "safe" || execution.status === "attention" || flow.phase === "awaiting") ? <PendingExecution pending={execution} refresh={preview.refreshPending} runtime={runtime} walletPromptActive={preview.walletPromptActive} /> : undefined} onContinue={() => void preview.exit!.continue()} onClose={close} /> : <div className="space-y-5">
        <div className="rounded-box bg-surface-secondary p-5">
          <p className="text-sm text-text-secondary">{exitCopy.estimatedRecovery}</p>
          {reviewRate !== null && <p className="mt-2 font-number text-5xl font-bold tracking-tight">{pct(reviewRate)}</p>}
          <p className="mt-3 font-number text-2xl font-bold">{amount(reviewAmount)} WETH</p>
          <p className="mt-2 text-sm text-text-secondary">{modal === "auction" && review?.mode === "auction" ? polish.portion(pct(reviewPlan?.soldFraction ?? 0)) : polish.entireClaim}</p>
        </div>
        {modal === "auction" && review && <div className="space-y-3 text-sm">
          <Row label={exitCopy.fromAuction} value={amount(quote?.weth ?? 0n) + " WETH"} />
          <Row label={liveCopy.maximumShares} value={amount(review.shares, 4) + words.shares} />
          {review.mode === "complete" && reviewPlan && reviewPlan.remainingShares > 2n && <Row label={exitCopy.fromVault} value={amount(reviewPlan.remainingValue) + " WETH"} />}
          <p className="text-text-secondary">{review.mode === "complete" && reviewPlan && reviewPlan.remainingShares > 2n ? exitCopy.sequence : exitCopy.auctionSequence}</p>
        </div>}
        <p className="text-xs leading-relaxed text-text-secondary">{modal === "auction" ? liveCopy.auctionLimit + " " + exitCopy.allowanceNote : exitCopy.directNote}</p>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1 size-4 shrink-0 accent-tokyo-600" /><span>{modal === "auction" ? liveCopy.auctionAcknowledgement : copy.confirm.irreversible}</span></label>
        {actionError && <p role="alert" className="text-sm text-error-700">{actionError}</p>}
        {modal === "redeem" && redeemShares !== s.shares && <p role="alert" className="text-sm">{liveCopy.balanceChanged}</p>}
        <Button variant="yeth" className="h-auto min-h-12 w-full py-3" disabled={!accepted || busy || !!execution || preview.canTransact === false || (modal === "auction" ? !quote || !review : !canRedeem || redeemShares !== s.shares)} onClick={() => {
          if (modal === "auction" && !review || modal === "redeem" && redeemShares === null) return;
          setFlowStarted(true);
          void act(async () => {
            try { await preview.exit!.start(modal === "auction" && review ? { weth: quote!.weth, maxShares: review.shares, round: review.round, mode: review.mode, originalShares: review.originalShares } : {mode: "complete", originalShares: redeemShares!}); }
            catch (error) { setFlowStarted(false); throw error; }
          });
        }}>{exitCopy.confirm}</Button>
        <Button variant="ghost" className="w-full" onClick={close}>{words.close}</Button>
      </div> : <div className="space-y-5">
        <p className="text-sm text-text-secondary">{isLive ? modal === "auction" ? liveCopy.auctionLimit : liveCopy.redeemReview : copy.confirm.simulation}</p>
        {execution && <PendingExecution pending={execution} refresh={preview.refreshPending} runtime={runtime} walletPromptActive={preview.walletPromptActive} />}
        {modal === "auction" && review && <div data-testid="review-choice" className="rounded-box border border-tokyo-600 p-4">
          <p className="text-xs text-text-secondary">{polish.yourChoice}</p>
          <p className="mt-1 font-bold">{review.mode === "auction" ? polish.auctionOnly : polish.exitFully}</p>
          <p className="mt-2 text-sm text-text-secondary">{review.mode === "auction" ? reviewPlan ? polish.partialReview(pct(reviewPlan.keptFraction)) : words.offerUnavailable : reviewPlan && reviewPlan.remainingShares <= 2n ? polish.fullAuctionReview : polish.fullReview}</p>
        </div>}
        {pending && <p role="status" className="rounded-box border border-border p-3 text-sm">{text.auctionReceived(amount(pending.received))}</p>}
        <div className="space-y-3 rounded-box bg-surface-secondary p-4 text-sm">
          <Row label={modal === "auction" ? words.receiveUpTo : words.receive} value={(modal === "auction" ? amount(quote?.weth ?? 0n) : amount(fresh ? directValue : 0n)) + " WETH"} />
          {modal === "auction" && reviewPlan && review?.mode === "complete" && reviewPlan.remainingShares > 2n && <><Row label={polish.vaultNext} value={amount(reviewPlan.remainingValue) + " WETH"} /><Row label={polish.totalExit} value={amount(reviewPlan.payout) + " WETH"} /></>}
          <Row label={isLive && modal === "auction" ? liveCopy.maximumShares : words.spend} value={amount(modal === "auction" ? review?.shares ?? 0n : s.shares, 4) + words.shares} />
          <Row label={words.sharesSoldRecovery} value={fresh && (!s.live || s.live.principalKnown) ? pct(modal === "auction" ? quote?.recovery ?? 0 : recovery) : "—"} />
        </div>
        {modal === "auction" && !quote && <p className="text-sm text-text-secondary">{words.offerUnavailable}</p>}
        {pending && <p className="text-sm text-text-secondary">{text.secondStepNote}</p>}
        <p className="text-xs text-text-secondary">{copy.auction.units}</p>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={accepted} disabled={busy} onChange={e => setAccepted(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-tokyo-600" /><span>{isLive && modal === "auction" ? liveCopy.auctionAcknowledgement : copy.confirm.irreversible}</span></label>
        {isLive && modal === "auction" && <p className="rounded-box border border-border p-3 text-xs text-text-secondary">{liveCopy.allowanceBound}</p>}
        {actionError && <p role="alert" className="text-sm text-error-700">{actionError}</p>}
        {redeemShares !== null && modal === "redeem" && redeemShares !== s.shares && <p role="alert" className="text-sm text-text-secondary">{liveCopy.balanceChanged}</p>}
        {tx.state.status === "error" && <p role="alert" className="text-sm text-error-700">{tx.state.errorMessage}</p>}
        {modal === "auction" ? <div className="space-y-2">
          {needsReset && preview.resetAllowance && <Button variant="secondary" className="h-auto min-h-12 w-full py-3" disabled={!accepted || busy || !!execution || preview.canTransact === false} isLoading={busy} onClick={() => void act(async () => { if (await preview.resetAllowance!() === null) setModal(null); })}>{liveCopy.resetApproval}</Button>}
          <Button variant="secondary" className="h-auto min-h-12 w-full py-3" disabled={!accepted || !canTake || approved || needsReset} isLoading={busy && !approved} onClick={() => review && void act(async () => { if (await preview.approve(review.shares) === null) setModal(null); })}>{approved ? isLive ? liveCopy.approved : words.approved : isLive ? liveCopy.approve : copy.auction.approve}</Button>
          <Button variant="yeth" className="h-auto min-h-12 w-full py-3" disabled={!accepted || !canTake || !approved} isLoading={busy && approved} onClick={async () => {
            if (!quote || !review) return;
            let result: {snapshot: RecoverySnapshot; received: bigint; hash?: `0x${string}`} | null = null;
            await act(async () => { result = await preview.take(quote.weth, review.shares, review.round, review.mode); if (!result) setModal(null); });
            if (!result) return;
            const confirmed = result as {snapshot: RecoverySnapshot; received: bigint; hash?: `0x${string}`};
            setAccepted(false); setReview(null);
            if (review.mode === "complete" && recoveryChoices(confirmed.snapshot).hasUsablePosition) {
              setPending({ received: confirmed.received, hash: confirmed.hash }); setRedeemShares(confirmed.snapshot.shares); setModal("redeem"); tx.reset();
            } else setModal(null);
          }}>{isLive ? liveCopy.take : copy.auction.take}</Button>
        </div> : <Button variant="yeth" className="h-auto min-h-12 w-full py-3" disabled={!accepted || !canRedeem || redeemShares !== s.shares} isLoading={busy} onClick={async () => {
          await act(async () => { if (redeemShares === null) return; const confirmed = await preview.redeem(redeemShares); if (confirmed || isLive) { setModal(null); setAccepted(false); } if (confirmed) setPending(null); });
        }}>{isLive ? liveCopy.redeem : copy.direct.confirm}</Button>}
        <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setModal(null)}>{words.close}</Button>
      </div>}
    </Modal>
  </div>;
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1"><span className="text-text-secondary">{label}</span><span className="font-number text-right">{value}</span></div>;
}

function PendingExecution({ pending, refresh, runtime, walletPromptActive = false }: {
  pending: RecoveryPending; refresh?: (submissionHash?: `0x${string}`) => Promise<unknown>; runtime: "mock" | "live" | "fork"; walletPromptActive?: boolean;
}) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const safe = pending.kind === "safe";
  const [recoveredHash, setRecoveredHash] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (walletPromptActive && pending.status === "submitting") return <p role="status" className="text-sm text-text-secondary">{exitCopy.confirmWallet}</p>;
  return <section data-testid={safe ? "recovery-safe-pending" : "recovery-transaction-pending"} className="space-y-3 rounded-box border border-border p-4" aria-label={safe ? liveCopy.safePendingTitle : liveCopy.transactionPendingTitle}>
    <h3 className="text-sm font-bold">{safe ? liveCopy.safePendingTitle : liveCopy.transactionPendingTitle}</h3>
    <p role="status" className="text-sm text-text-secondary">{safe ? liveCopy.safePendingBody : liveCopy.transactionPendingBody}</p>
    {pending.action === "take" && safe && <p className="text-xs text-text-secondary">{liveCopy.delayedAuction}</p>}
    {(error || pending.error) && <p role="alert" className="text-sm text-text-secondary">{error ?? pending.error}</p>}
    {pending.submissionHash && <Button variant="secondary" disabled={checking || !refresh || !!pending.corrupt} isLoading={checking} onClick={async () => {
      setChecking(true); setError(null);
      try { await refresh?.(); } catch (cause) { setError(cause instanceof Error ? cause.message : liveCopy.failed); }
      finally { setChecking(false); }
    }}>{safe ? liveCopy.checkSafeExecution : liveCopy.checkExecution}</Button>}
    <div className="text-xs text-text-secondary">
      <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)} className="min-h-10 py-2 underline underline-offset-4">{pending.submissionHash ? exitCopy.transactionDetails : exitCopy.troubleshoot}</button>
      {detailsOpen && <>
      {pending.submissionHash && <p className="my-2 break-all">{safe ? liveCopy.safeProposal : liveCopy.walletSubmission}: {pending.submissionHash}</p>}
      {pending.transactionHash && runtime === "live" && <TransactionLink hash={pending.transactionHash} />}
      {!pending.submissionHash && !pending.corrupt && <div className="space-y-3">
        <p>{exitCopy.recoveryHelp}</p>
        <label className="block space-y-2"><span>{safe ? liveCopy.recoverSafeHash : liveCopy.recoverTransactionHash}</span><input className="block w-full rounded border border-border bg-surface px-3 py-2 font-mono text-xs" value={recoveredHash} onChange={event => setRecoveredHash(event.target.value.trim())} autoComplete="off" spellCheck={false} /></label>
        <Button variant="secondary" disabled={checking || !refresh || !isRecoveryHash(recoveredHash)} isLoading={checking} onClick={async () => {
          if (!isRecoveryHash(recoveredHash)) return;
          setChecking(true); setError(null);
          try { await refresh?.(recoveredHash); } catch (cause) { setError(cause instanceof Error ? cause.message : liveCopy.failed); }
          finally { setChecking(false); }
        }}>{safe ? liveCopy.checkSafeExecution : liveCopy.checkExecution}</Button>
      </div>}
      </>}
    </div>
  </section>;
}
