"use client";

import { useConnectModal } from "@/web3/wallet-ui";
import { useAccount } from "wagmi";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { TxStatus } from "@/lib/tx/types";
import type { YethAccountState, YethGlobalState } from "@/lib/clients/yeth";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatTokenAmount } from "@/lib/format";
import { useProtocol } from "@/state/protocol";
import { nowSeconds } from "@/lib/mocks/time";
import { MAINNET_CHAIN_ID } from "@/lib/tx/network";
import { IconLinkOut } from "@/components/icons/IconLinkOut";
import {
  useYethAccountState,
  useYethClaimAndExit,
  useYethClaimAndStay,
  useYethGlobalState,
  useYethRedeemToEth,
} from "@/lib/hooks/useYeth";
import { yethCopy as copy } from "./messages";
import { MockControls } from "./components/MockControls";
import { RecoveryHero } from "./components/RecoveryHero";
import { ActionDeck } from "./components/ActionDeck";
import { StatsGrid } from "./components/StatsGrid";
import { TrustFooter } from "./components/TrustFooter";

const ONE = 10n ** 18n;
const CLAIM_HISTORY_STORAGE_KEY = "yeth_claim_history_v1";
const MIN_REASONABLE_DEADLINE_UNIX_SECONDS = 1_577_836_800; // 2020-01-01 00:00:00 UTC

type ClaimHistoryRecord = {
  snapshotLossEth: string;
  recoveredEth: string;
  claimedAt: number;
  txHash: string;
};

export function YethPageClient() {
  const {
    isConnected: wagmiConnected,
    address: wagmiAddress,
    chainId: wagmiChainId,
  } = useAccount();
  const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
  const address = wagmiAddress ?? (isE2E ? E2E_MOCK_ADDRESS : undefined);
  const isConnected = wagmiConnected || !!address;
  const isWrongNetwork =
    !!wagmiConnected && wagmiChainId !== undefined && wagmiChainId !== MAINNET_CHAIN_ID;
  const { yethUsesMockBackend } = useProtocol();
  const { openConnectModal } = useConnectModal();
  const { data: global } = useYethGlobalState();
  const { data: account, isLoading: isAccountLoading } = useYethAccountState();
  const claimExit = useYethClaimAndExit();
  const claimStay = useYethClaimAndStay();
  const redeem = useYethRedeemToEth();
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const storedHistory = useSyncExternalStore(
    subscribeClaimHistory,
    getClaimHistorySnapshot,
    () => null
  );
  const [sessionHistory, setSessionHistory] = useState<{
    address: string;
    record: ClaimHistoryRecord;
  } | null>(null);
  if (sessionHistory && sessionHistory.address !== address?.toLowerCase()) {
    setSessionHistory(null);
  }
  const claimHistory = useMemo(() => {
    if (!address) return null;
    if (sessionHistory?.address === address.toLowerCase()) return sessionHistory.record;
    return loadClaimHistory(address, storedHistory);
  }, [address, sessionHistory, storedHistory]);
  const pendingClaimSnapshotRef = useRef<bigint | null>(null);
  const pendingRecoveredRef = useRef<bigint | null>(null);
  const [lastValidClaimDeadline, setLastValidClaimDeadline] = useState<number | null>(null);
  const [, setCountdownTick] = useState(0);
  const now = nowSeconds();

  const claimExitPending = isTxPending(claimExit.state.status);
  const claimStayPending = isTxPending(claimStay.state.status);
  const redeemPending = isTxPending(redeem.state.status);

  const normalizedClaimDeadline = useMemo(
    () => normalizeClaimDeadline(global?.claimWindow.closesAt),
    [global?.claimWindow.closesAt]
  );
  if (
    normalizedClaimDeadline !== null &&
    normalizedClaimDeadline !== lastValidClaimDeadline
  ) {
    setLastValidClaimDeadline(normalizedClaimDeadline);
  }
  const effectiveClaimDeadline = normalizedClaimDeadline ?? lastValidClaimDeadline;

  const claimWindowClosed = useMemo(() => {
    if (effectiveClaimDeadline === null) return false;
    return now >= effectiveClaimDeadline;
  }, [effectiveClaimDeadline, now]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCountdownTick((tick) => tick + 1);
    }, 30_000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const successfulClaimHash = useMemo(() => {
    if (claimExit.state.status === "success" && claimExit.state.hash) {
      return claimExit.state.hash;
    }
    if (claimStay.state.status === "success" && claimStay.state.hash) {
      return claimStay.state.hash;
    }
    return undefined;
  }, [
    claimExit.state.hash,
    claimExit.state.status,
    claimStay.state.hash,
    claimStay.state.status,
  ]);

  useEffect(() => {
    if (!address || !successfulClaimHash) return;
    if (claimHistory?.txHash === successfulClaimHash) return;

    const snapshotFromHistory = parseSnapshotValue(claimHistory?.snapshotLossEth);
    const recoveredFromHistory = parseSnapshotValue(claimHistory?.recoveredEth);
    const snapshotCandidate =
      pendingClaimSnapshotRef.current ??
      (account?.snapshotLossEth && account.snapshotLossEth > 0n
        ? account.snapshotLossEth
        : null) ??
      (snapshotFromHistory > 0n ? snapshotFromHistory : null) ??
      0n;
    const recoveredCandidate =
      pendingRecoveredRef.current ??
      (account?.claimableNowEth && account.claimableNowEth > 0n
        ? account.claimableNowEth
        : null) ??
      (recoveredFromHistory > 0n ? recoveredFromHistory : null) ??
      0n;

    const record: ClaimHistoryRecord = {
      snapshotLossEth: snapshotCandidate.toString(),
      recoveredEth: recoveredCandidate.toString(),
      claimedAt: nowSeconds(),
      txHash: successfulClaimHash,
    };

    saveClaimHistory(address, record);
    setSessionHistory({ address: address.toLowerCase(), record });
    pendingClaimSnapshotRef.current = null;
    pendingRecoveredRef.current = null;
  }, [
    account?.claimableNowEth,
    account?.snapshotLossEth,
    address,
    claimHistory,
    successfulClaimHash,
  ]);

  const snapshotDisplayValue = useMemo(() => {
    if (account?.snapshotLossEth && account.snapshotLossEth > 0n) {
      return account.snapshotLossEth;
    }
    const persistedSnapshot = parseSnapshotValue(claimHistory?.snapshotLossEth);
    if (persistedSnapshot > 0n) {
      return persistedSnapshot;
    }
    return account?.snapshotLossEth ?? 0n;
  }, [account?.snapshotLossEth, claimHistory?.snapshotLossEth]);
  const recoveredDisplayValue = useMemo(() => {
    const persistedRecovered = parseSnapshotValue(claimHistory?.recoveredEth);
    if (persistedRecovered > 0n) {
      return persistedRecovered;
    }
    return 0n;
  }, [claimHistory?.recoveredEth]);
  const hasPersistedClaimHistory = useMemo(
    () => hasClaimHistoryRecord(claimHistory),
    [claimHistory]
  );
  const isNoSnapshotClaimState = useMemo(() => {
    if (!account) return false;
    return (
      account.snapshotLossEth <= 0n &&
      account.claimableNowEth <= 0n &&
      account.recoveryVaultShares <= 0n &&
      snapshotDisplayValue <= 0n &&
      !hasPersistedClaimHistory
    );
  }, [account, hasPersistedClaimHistory, snapshotDisplayValue]);

  const handleClaimExit = () => {
    if (claimWindowClosed) return;
    if (account?.snapshotLossEth && account.snapshotLossEth > 0n) {
      pendingClaimSnapshotRef.current = account.snapshotLossEth;
    }
    if (account?.claimableNowEth && account.claimableNowEth > 0n) {
      pendingRecoveredRef.current = account.claimableNowEth;
    }
    void claimExit.write();
  };

  const handleOpenRiskModal = () => {
    if (claimWindowClosed) return;
    setIsRiskModalOpen(true);
  };

  const handleClaimStay = () => {
    if (claimWindowClosed) {
      setIsRiskModalOpen(false);
      setRiskAccepted(false);
      return;
    }
    if (account?.snapshotLossEth && account.snapshotLossEth > 0n) {
      pendingClaimSnapshotRef.current = account.snapshotLossEth;
    }
    if (account?.claimableNowEth && account.claimableNowEth > 0n) {
      pendingRecoveredRef.current = account.claimableNowEth;
    }
    setIsRiskModalOpen(false);
    setRiskAccepted(false);
    void claimStay.write();
  };

  const claimWindowCountdown = useMemo(() => {
    if (!global || effectiveClaimDeadline === null) {
      return copy.page.countdownUnavailable;
    }
    return formatCountdown(effectiveClaimDeadline, now);
  }, [effectiveClaimDeadline, global, now]);

  if (claimWindowClosed && isRiskModalOpen) {
    setIsRiskModalOpen(false);
    setRiskAccepted(false);
  }

  return (
    <>
      <div className="space-y-0">
        <RecoveryBanner
          global={global}
          claimWindowClosed={claimWindowClosed}
          claimWindowCountdown={claimWindowCountdown}
          hasClaimDeadline={effectiveClaimDeadline !== null}
        />

        <main className="container mx-auto px-4 md:px-6 pt-8 pb-24 space-y-6">
          {!isConnected ? (
            <ConnectCard onConnect={() => openConnectModal?.()} />
          ) : isWrongNetwork ? (
            <WrongNetworkCard />
          ) : isAccountLoading || !account || !global ? (
            <LoadingCard />
          ) : account.claimableNowEth > 0n ? (
            <UnclaimedRecoveryState
              address={address}
              account={account}
              global={global}
              snapshotValue={snapshotDisplayValue}
              claimDeadline={effectiveClaimDeadline}
              claimWindowClosed={claimWindowClosed}
              claimExitPending={claimExitPending}
              claimStayPending={claimStayPending}
              onClaimExit={handleClaimExit}
              onOpenRiskModal={handleOpenRiskModal}
            />
          ) : account.recoveryVaultShares > 0n ? (
            <PostClaimStayingCard
              account={account}
              global={global}
              onRedeem={() => redeem.write()}
              redeemPending={redeemPending}
            />
          ) : isNoSnapshotClaimState ? (
            <NoSnapshotClaimCard
              address={address}
              snapshotValue={snapshotDisplayValue}
              claimDeadline={effectiveClaimDeadline}
              manualLateClaimUrl={global.manualLateClaimUrl}
            />
          ) : (
            <NoPositionCard
              address={address}
              snapshotValue={snapshotDisplayValue}
              claimDeadline={effectiveClaimDeadline}
              claimedAt={claimHistory?.claimedAt}
              claimTxHash={claimHistory?.txHash}
              recoveredValue={recoveredDisplayValue}
            />
          )}

          {global && <TrustFooter global={global} />}
        </main>

        <Modal
          isOpen={isRiskModalOpen}
          onClose={() => setIsRiskModalOpen(false)}
          title={copy.riskModal.title}
        >
          <div className="space-y-5">
            <p className="text-sm text-text-secondary leading-relaxed">
              {copy.riskModal.body}
            </p>
            <label
              htmlFor="yeth-risk-acceptance"
              className="flex items-start gap-3 text-sm text-text-primary"
            >
              <input
                id="yeth-risk-acceptance"
                name="yeth-risk-acceptance"
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border"
                checked={riskAccepted}
                onChange={(event) => setRiskAccepted(event.target.checked)}
              />
              <span>{copy.riskModal.checkbox}</span>
            </label>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsRiskModalOpen(false)}
                disabled={claimStayPending}
              >
                {copy.riskModal.cancel}
              </Button>
              <Button
                variant="yeth"
                size="sm"
                onClick={handleClaimStay}
                isLoading={claimStayPending}
                disabled={!riskAccepted || claimStayPending || claimWindowClosed}
              >
                {copy.riskModal.continue}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
      {yethUsesMockBackend && <MockControls />}
    </>
  );
}

function RecoveryBanner({
  global,
  claimWindowClosed,
  claimWindowCountdown,
  hasClaimDeadline,
}: {
  global: YethGlobalState | undefined;
  claimWindowClosed: boolean;
  claimWindowCountdown: string;
  hasClaimDeadline: boolean;
}) {
  return (
    <section className="sticky top-16 z-30 border-b border-border bg-surface-secondary">
      <div className="container mx-auto px-4 md:px-6 py-4 space-y-2">
        <p className="text-sm font-medium text-text-primary">
          {copy.page.retiredBanner}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <a
            href={global?.approvedYipUrl ?? "https://gov.yearn.fi"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-text-primary hover:text-tokyo-600 transition-colors underline underline-offset-4"
          >
            Read the approved YIP
            <IconLinkOut className="w-3.5 h-3.5" />
          </a>
          <span className="text-text-tertiary">&#183;</span>
          {global && hasClaimDeadline ? (
            <>
              <span className="font-medium text-text-primary">
                {claimWindowClosed ? copy.page.closedStatus : copy.page.openStatus}
              </span>
              <span>{claimWindowCountdown}</span>
            </>
          ) : (
            <>
              <span className="font-medium text-text-primary">
                {copy.page.statusUnavailable}
              </span>
              <span>{copy.page.countdownUnavailable}</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ConnectCard({ onConnect }: { onConnect: () => void }) {
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-bold">{copy.page.title}</h2>
      <p className="text-sm text-text-secondary">{copy.page.connectPrompt}</p>
      <Button size="sm" onClick={onConnect} className="w-fit">
        {copy.page.connectCta}
      </Button>
    </Card>
  );
}

function WrongNetworkCard() {
  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-bold">{copy.page.wrongNetworkTitle}</h2>
      <p className="text-sm text-text-secondary">{copy.page.wrongNetworkBody}</p>
    </Card>
  );
}

function LoadingCard() {
  return (
    <Card className="space-y-3">
      <div className="h-6 w-44 animate-pulse rounded-md bg-surface-tertiary" />
      <div className="h-4 w-64 animate-pulse rounded-md bg-surface-tertiary" />
      <div className="h-4 w-56 animate-pulse rounded-md bg-surface-tertiary" />
    </Card>
  );
}

function UnclaimedRecoveryState({
  address,
  account,
  global,
  snapshotValue,
  claimDeadline,
  claimWindowClosed,
  claimExitPending,
  claimStayPending,
  onClaimExit,
  onOpenRiskModal,
}: {
  address: string | undefined;
  account: YethAccountState;
  global: YethGlobalState;
  snapshotValue: bigint;
  claimDeadline: number | null;
  claimWindowClosed: boolean;
  claimExitPending: boolean;
  claimStayPending: boolean;
  onClaimExit: () => void;
  onOpenRiskModal: () => void;
}) {
  const recoveredPct = formatRecoveryPercent(
    account.claimableNowEth,
    account.snapshotLossEth
  );

  return (
    <section className="space-y-6">
      {claimWindowClosed ? (
        <div className="flex flex-col items-center py-12 text-center space-y-3">
          <h2 className="text-3xl md:text-5xl font-bold text-text-primary">
            {copy.claimEnded.title}
          </h2>
          <p className="max-w-2xl text-sm text-text-secondary">{copy.claimEnded.body}</p>
          <a
            href={global.manualLateClaimUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-sm font-medium underline underline-offset-4"
          >
            {copy.claimEnded.cta}
          </a>
        </div>
      ) : (
        <RecoveryHero claimableEth={account.claimableNowEth} recoveredPct={recoveredPct} />
      )}

      {!claimWindowClosed ? (
        <ActionDeck
          onExit={onClaimExit}
          onStay={onOpenRiskModal}
          claimableEth={formatTokenAmount(account.claimableNowEth, 18, 4)}
          exitPending={claimExitPending}
          stayPending={claimStayPending}
          disabled={claimWindowClosed}
        />
      ) : null}

      <StatsGrid
        address={address}
        snapshotValue={snapshotValue}
        closesAt={claimDeadline}
      />
    </section>
  );
}

function NoSnapshotClaimCard({
  address,
  snapshotValue,
  claimDeadline,
  manualLateClaimUrl,
}: {
  address: string | undefined;
  snapshotValue: bigint;
  claimDeadline: number | null;
  manualLateClaimUrl: string;
}) {
  return (
    <section className="space-y-6">
      <Card className="space-y-4 py-8 text-center">
        <h2 className="text-2xl font-bold text-text-primary">
          {copy.page.noSnapshotClaimTitle}
        </h2>
        <p className="mx-auto max-w-xl text-sm text-text-secondary">
          {copy.page.noSnapshotClaimBody}
        </p>
        <div className="text-sm">
          <a
            href={manualLateClaimUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex font-medium text-text-primary underline underline-offset-4"
          >
            {copy.page.noSnapshotClaimManualCta}
          </a>
        </div>
      </Card>

      <StatsGrid
        address={address}
        snapshotValue={snapshotValue}
        closesAt={claimDeadline}
      />
    </section>
  );
}

function NoPositionCard({
  address,
  snapshotValue,
  claimDeadline,
  claimedAt,
  claimTxHash,
  recoveredValue,
}: {
  address: string | undefined;
  snapshotValue: bigint;
  claimDeadline: number | null;
  claimedAt?: number;
  claimTxHash?: string;
  recoveredValue?: bigint;
}) {
  return (
    <section className="space-y-6">
      <Card className="space-y-3 py-8 text-center">
        <h2 className="text-2xl font-bold text-text-primary">{copy.page.completeTitle}</h2>
        <p className="mx-auto max-w-xl text-sm text-text-secondary">
          {copy.page.completeBody}
        </p>
      </Card>

      <StatsGrid
        address={address}
        snapshotValue={snapshotValue}
        closesAt={claimDeadline}
        claimedAt={claimedAt}
        claimTxHash={claimTxHash}
        recoveredValue={recoveredValue}
      />
    </section>
  );
}

function PostClaimStayingCard({
  account,
  global,
  onRedeem,
  redeemPending,
}: {
  account: YethAccountState;
  global: YethGlobalState;
  onRedeem: () => void;
  redeemPending: boolean;
}) {
  const currentValueEth = (account.recoveryVaultShares * global.recoveryVault.pps) / ONE;
  const cashOutAmount = formatTokenAmount(currentValueEth, 18, 4);

  return (
    <section className="max-w-xl mx-auto space-y-6 pt-8">
      <header className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-text-primary">
          {copy.postClaim.stayingTitle}
        </h2>
        <p className="text-sm text-text-secondary">
          You are currently exposed to Recovery Vault smart contract risk.
        </p>
      </header>

      <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 flex flex-col items-center border-b border-border">
          <span className="text-xs font-bold uppercase tracking-widest text-text-tertiary mb-2">
            {copy.postClaim.valueLabel}
          </span>
          <span className="text-5xl font-number font-bold text-text-primary tracking-tight">
            {cashOutAmount} <span className="text-2xl text-text-tertiary">ETH</span>
          </span>
        </div>

        <div className="bg-surface-secondary/50 p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Vault Shares</span>
            <span className="font-number text-text-primary">
              {formatTokenAmount(account.recoveryVaultShares, 18, 2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Current PPS</span>
            <span className="font-number text-text-primary">
              {formatTokenAmount(global.recoveryVault.pps, 18, 4)} ETH/share
            </span>
          </div>
        </div>
      </div>

      <>
        <Button
          variant="yeth"
          size="lg"
          className="w-full h-16 text-lg shadow-md"
          onClick={onRedeem}
          isLoading={redeemPending}
        >
          {copy.actions.redeem(cashOutAmount)}
        </Button>
        <p className="text-sm text-text-secondary text-center mt-3">
          This action is <strong>final</strong>. You cannot re-enter the recovery vault later.
        </p>
      </>
    </section>
  );
}

function isTxPending(status: TxStatus) {
  return status === "signing" || status === "submitted" || status === "mining";
}

function formatRecoveryPercent(recovered: bigint, original: bigint) {
  if (original <= 0n) return "0.0%";
  const scaled = Number((recovered * 1000n) / original) / 10;
  return `${scaled.toFixed(1)}%`;
}

function formatCountdown(closesAt: number, now: number) {
  const remaining = Math.max(0, closesAt - now);
  if (remaining === 0) return "Closed";

  const days = Math.floor(remaining / 86_400);
  const hours = Math.floor((remaining % 86_400) / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  if (days > 0) {
    return `Ends in ${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `Ends in ${hours}h ${minutes}m`;
  }
  return `Ends in ${Math.max(1, Math.ceil(remaining / 60))}m`;
}

function normalizeClaimDeadline(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  if (normalized < MIN_REASONABLE_DEADLINE_UNIX_SECONDS) return null;
  return normalized;
}

function parseSnapshotValue(value: string | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function hasClaimHistoryRecord(record: ClaimHistoryRecord | null): boolean {
  if (!record) return false;
  const hasSnapshot = parseSnapshotValue(record.snapshotLossEth) > 0n;
  const hasRecovered = parseSnapshotValue(record.recoveredEth) > 0n;
  const hasClaimedAt =
    typeof record.claimedAt === "number" &&
    Number.isFinite(record.claimedAt) &&
    record.claimedAt > 0;
  const hasTxHash = typeof record.txHash === "string" && record.txHash.length > 0;
  return hasSnapshot || hasRecovered || hasClaimedAt || hasTxHash;
}

function subscribeClaimHistory(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getClaimHistorySnapshot(): string | null {
  try {
    return window.localStorage.getItem(CLAIM_HISTORY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function loadClaimHistory(
  address: string,
  raw: string | null
): ClaimHistoryRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, ClaimHistoryRecord | undefined>;
    return parsed[address.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}

function saveClaimHistory(address: string, record: ClaimHistoryRecord) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(CLAIM_HISTORY_STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, ClaimHistoryRecord | undefined>)
      : {};
    parsed[address.toLowerCase()] = record;
    window.localStorage.setItem(CLAIM_HISTORY_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Best effort only; UI should still function without persistence.
  }
}
