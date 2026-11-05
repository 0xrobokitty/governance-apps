"use client";

import type { ReactNode } from "react";
import { formatEther } from "viem";
import { Button } from "@/components/ui/Button";
import type { RecoveryExitState } from "@/lib/hooks/useYethRecoveryExit";
import { recoveryExitCopy as copy } from "../messages";

const amount = (value: bigint) => Number(formatEther(value)).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function RecoveryExitProgress({ state, walletPromptActive, pending, onContinue, onClose, auction = false, redeem = true }: {
  state: RecoveryExitState;
  walletPromptActive: boolean;
  pending?: ReactNode;
  onContinue: () => void;
  onClose: () => void;
  auction?: boolean;
  redeem?: boolean;
}) {
  const complete = state.phase === "complete";
  const paused = state.phase === "paused";
  const steps = [
    ...(auction ? [{ id: "approve", label: copy.approval }, { id: "take", label: copy.auction }] : []),
    ...(redeem || state.step === "redeem" ? [{ id: "redeem", label: copy.redemption }] : []),
  ];
  const current = state.step === "reset" ? "approve" : state.step;
  const index = steps.findIndex(step => step.id === current);
  return <div className="space-y-5" data-testid="exit-sequence">
    <div className="rounded-box bg-surface-secondary p-5">
      <p data-testid="exit-phase" role="status" className="font-bold">{complete ? copy.complete : paused ? copy.paused : walletPromptActive ? copy.confirmWallet : state.phase === "awaiting" ? copy.awaiting : copy.inProgress}</p>
      {state.receivedWeth > 0n && <p className="mt-3 font-number text-3xl font-bold">{amount(state.receivedWeth)} <span className="text-xl">WETH</span></p>}
      {state.receivedWeth > 0n && <p className="mt-1 text-sm text-text-secondary">{copy.receivedSuffix}</p>}
    </div>
    <ol className="space-y-3" aria-label={copy.steps}>
      {steps.map((step, i) => {
        const done = complete || index > i || state.receivedWeth > 0n && step.id !== "redeem";
        const active = !done && step.id === current;
        return <li key={step.id} className="flex items-center gap-3 text-sm" aria-current={active ? "step" : undefined}>
          <span className={"flex size-7 shrink-0 items-center justify-center rounded-full border font-number " + (done || active ? "border-tokyo-600 bg-tokyo-600 text-white" : "border-border text-text-secondary")} aria-hidden="true">{done ? "✓" : i + 1}</span>
          <span className={active ? "font-bold" : "text-text-secondary"}>{state.step === "reset" && active ? copy.resetApproval : step.label}</span>
          {done && <span className="ml-auto text-xs text-text-secondary">{copy.done}</span>}
        </li>;
      })}
    </ol>
    {!complete && !paused && <p className="text-sm leading-relaxed text-text-secondary">{copy.keepOpen}</p>}
    {state.error && <p role="alert" className="text-sm leading-relaxed text-text-secondary">{state.error}</p>}
    {!complete && pending}
    {paused && state.canContinue && <Button variant="yeth" className="min-h-12 w-full" disabled={walletPromptActive} onClick={onContinue}>{copy.continue}</Button>}
    <Button variant={complete ? "yeth" : "ghost"} className="min-h-12 w-full" disabled={walletPromptActive} onClick={onClose}>{complete ? copy.done : copy.close}</Button>
  </div>;
}
