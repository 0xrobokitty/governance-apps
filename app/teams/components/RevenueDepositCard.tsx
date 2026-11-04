"use client";

import {
  useChainModal,
  useConnectModal,
} from "@/web3/wallet-ui";
import { useState, type ReactNode } from "react";
import type { Address } from "viem";
import { AmountInput } from "@/components/ui/AmountInput";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  AddressLink,
  TransactionLink,
} from "@/components/ui/ExplorerLink";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { UtcTime } from "@/components/ui/UtcTime";
import { cn } from "@/lib/cn";
import {
  estimateRevenueCreditUsd,
  formatTeamsTokenAmount,
  formatTeamsUsd,
  getTeamsDepositReadiness,
  parsePositiveTeamsTokenAmountRaw,
  type RevenueHistoryEntry,
  type RevenueOption,
  type TeamRecord,
  type TeamsDepositReadiness,
  type TeamsViewerContext,
} from "@/lib/clients/teams";
import { nowSeconds } from "@/lib/mocks/time";
import { formatAddress, formatInputAmount, formatTokenAmount } from "@/lib/format";
import type { TxState } from "@/lib/tx/types";
import { useTokenAllowance } from "@/lib/hooks/useTokenAllowance";
import { useTokenBalance } from "@/lib/hooks/useTokenBalance";
import { teamsCopy } from "../messages";

type RevenueDepositCardProps = {
  team: TeamRecord | null;
  viewer: TeamsViewerContext | null;
  currentPeriod: number | null;
  headingLevel?: 2 | 3;
  onUpdateTeam: (team: TeamRecord) => void;
  onDepositRevenue?: (
    team: TeamRecord,
    tokenAddress: string,
    amount: string,
    decimals: number
  ) => Promise<boolean>;
  onApproveRevenueDeposit?: (
    team: TeamRecord,
    tokenAddress: string,
    amount: string
  ) => Promise<boolean>;
  state: "ready" | "loading" | "empty";
  txState?: TxState;
};

type DisplayRevenueHistoryEntry = RevenueHistoryEntry & {
  depositorLabel?: string;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function RevenueDepositCard({
  team,
  viewer,
  currentPeriod,
  headingLevel = 2,
  onUpdateTeam,
  onDepositRevenue,
  onApproveRevenueDeposit,
  state,
  txState,
}: RevenueDepositCardProps) {
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const initialOption = team?.revenueOptions[0] ?? null;
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | null>(
    () => initialOption?.tokenAddress ?? null
  );
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | undefined>(undefined);
  const [successEntry, setSuccessEntry] = useState<DisplayRevenueHistoryEntry | null>(null);
  const selectedOption =
    team?.revenueOptions.find(
      (option) => option.tokenAddress === selectedTokenAddress
    ) ??
    team?.revenueOptions[0] ??
    null;
  const amountRaw = selectedOption
    ? parsePositiveTeamsTokenAmountRaw(amount, selectedOption.decimals)
    : null;
  const allowance = useTokenAllowance(
    (selectedOption?.tokenAddress ?? ZERO_ADDRESS) as Address,
    (team?.address ?? ZERO_ADDRESS) as Address
  );
  const tokenBalance = useTokenBalance(
    (selectedOption?.tokenAddress ?? ZERO_ADDRESS) as Address,
    viewer?.address as Address | null | undefined
  );
  const liveMode = Boolean(onDepositRevenue);
  const availableBalance = tokenBalance.data;
  const hasAvailableBalance = availableBalance !== undefined;
  const exceedsAvailableBalance =
    liveMode &&
    hasAvailableBalance &&
    amountRaw !== null &&
    amountRaw > availableBalance;
  const needsApproval =
    liveMode &&
    Boolean(selectedOption) &&
    amountRaw !== null &&
    !exceedsAvailableBalance &&
    (allowance.data ?? 0n) < amountRaw;
  const isTxPending = isTeamsTxPending(txState);

  if (state === "loading") {
    return (
      <Card className="space-y-5" aria-busy="true">
        <RevenueHeader
          level={headingLevel}
          title={teamsCopy.revenue.loadingTitle}
          description={teamsCopy.revenue.loadingBody}
        />
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="min-w-0 space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-44" />
          </div>
          <div className="min-w-0 space-y-4">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </Card>
    );
  }

  if (state === "empty") {
    return (
      <Card className="space-y-4">
        <RevenueHeader
          level={headingLevel}
          title={teamsCopy.revenue.emptyTitle}
          description={teamsCopy.revenue.emptyBody}
        />
      </Card>
    );
  }

  if (!team) {
    return (
      <Card className="space-y-4">
        <RevenueHeader
          level={headingLevel}
          title={teamsCopy.revenue.title}
          description={teamsCopy.revenue.description}
        />
        <div className="rounded-box border border-dashed border-border bg-surface-secondary px-4 py-5">
          <p className="text-sm font-bold text-text-primary">
            {teamsCopy.revenue.noTeamTitle}
          </p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            {teamsCopy.revenue.noTeamBody}
          </p>
        </div>
      </Card>
    );
  }

  const activeTeam = team;
  const estimatedCreditUsd =
    selectedOption && amount ? estimateRevenueCreditUsd(selectedOption, amount) : null;
  const depositReadiness = getTeamsDepositReadiness(
    activeTeam,
    viewer,
    liveMode
  );
  const canDeposit = depositReadiness.canSubmit;
  const unavailableDescriptionId = "teams-revenue-unavailable-description";
  const unavailable = getUnavailableState(depositReadiness, activeTeam);
  const unavailableAction =
    depositReadiness.state === "disconnected"
      ? openConnectModal
      : depositReadiness.state === "switch-mainnet"
        ? openChainModal ?? openConnectModal
        : undefined;
  const renderedHistory: DisplayRevenueHistoryEntry[] = activeTeam.revenueHistory.map((entry) => ({
    ...entry,
    depositorLabel: successEntry?.id === entry.id ? successEntry.depositorLabel : undefined,
  }));

  function handleSelectToken(tokenAddress: string) {
    setSelectedTokenAddress(tokenAddress);
    setAmount("");
    setAmountError(undefined);
    setSuccessEntry(null);
  }

  async function handleSubmit() {
    if (!selectedOption) return;

    if (amountRaw === null || amountRaw <= 0n) {
      setAmountError(teamsCopy.revenue.form.amountError);
      setSuccessEntry(null);
      return;
    }

    if (exceedsAvailableBalance) {
      setAmountError(teamsCopy.revenue.form.amountExceedsBalance);
      setSuccessEntry(null);
      return;
    }

    if (liveMode && onDepositRevenue) {
      if (needsApproval) {
        if (!onApproveRevenueDeposit) {
          return;
        }
        const approved = await onApproveRevenueDeposit(
          activeTeam,
          selectedOption.tokenAddress,
          amount
        );
        if (!approved) return;
        await allowance.refetch();
        return;
      }

      const submitted = await onDepositRevenue(
        activeTeam,
        selectedOption.tokenAddress,
        amount,
        selectedOption.decimals
      );
      if (!submitted) return;
      await tokenBalance.refetch();
      setSuccessEntry(null);
      setAmountError(undefined);
      return;
    }

    const creditedUsd = estimateRevenueCreditUsd(selectedOption, amount);
    if (!creditedUsd) {
      setAmountError(teamsCopy.revenue.form.quoteUnavailable);
      setSuccessEntry(null);
      return;
    }

    const recordedAt = nowSeconds();
    const entry: DisplayRevenueHistoryEntry = {
      id: `mock-${activeTeam.id}-${recordedAt}`,
      period: currentPeriod ?? 0,
      symbol: selectedOption.symbol,
      amount: normalizeDecimal(amount),
      creditedUsd,
      converterAddress: selectedOption.converterAddress ?? null,
      convertedToSymbol: selectedOption.convertToSymbol,
      depositedBy: viewer?.address ?? activeTeam.owner,
      createdAt: recordedAt,
      depositorLabel: viewer?.address
        ? formatAddress(viewer.address)
        : teamsCopy.revenue.history.permissionlessDepositor,
    };

    onUpdateTeam({
      ...activeTeam,
      revenueHistory: [entry, ...activeTeam.revenueHistory],
    });
    setSuccessEntry(entry);
    setAmountError(undefined);
  }

  return (
    <Card className="space-y-6">
      <RevenueHeader
        level={headingLevel}
        title={teamsCopy.revenue.title}
        description={teamsCopy.revenue.description}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="brand">{activeTeam.name}</Badge>
        {currentPeriod !== null && <Badge variant="neutral">Period #{currentPeriod}</Badge>}
      </div>

      {successEntry ? (
        <Banner variant="brand" title={teamsCopy.revenue.success.title}>
          <p>
            {teamsCopy.revenue.success.currentPeriodPrefix} #{successEntry.period}:{" "}
            {formatTeamsTokenAmount(successEntry.amount)} {successEntry.symbol} credited{" "}
            {formatTeamsUsd(successEntry.creditedUsd, 2)}.
          </p>
          <p>{teamsCopy.revenue.success.body}</p>
        </Banner>
      ) : null}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 space-y-4">
          {canDeposit ? (
            <>
              <Banner variant="brand" title={teamsCopy.revenue.permissionless.title}>
                <p>{teamsCopy.revenue.permissionless.body}</p>
              </Banner>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
                  {teamsCopy.revenue.form.tokenLabel}
                </p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
                  {activeTeam.revenueOptions.map((option) => {
                    const isSelected = option.tokenAddress === selectedOption?.tokenAddress;

                    return (
                      <button
                        key={option.tokenAddress}
                        type="button"
                        onClick={() => handleSelectToken(option.tokenAddress)}
                        className={cn(
                          "min-w-0 rounded-box border px-4 py-3 text-left transition-colors",
                          isSelected
                            ? "border-text-primary bg-app"
                            : "border-border bg-surface-secondary hover:border-border-hover"
                        )}
                        aria-pressed={isSelected}
                      >
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                          <span
                            className="min-w-0 truncate whitespace-nowrap text-sm font-bold text-text-primary"
                            title={option.symbol}
                          >
                            {option.symbol}
                          </span>
                          <Badge
                            className="shrink-0"
                            variant={option.isConvertible ? "warning" : "success"}
                          >
                            {option.isConvertible
                              ? teamsCopy.revenue.tokenBadges.convertible
                              : teamsCopy.revenue.tokenBadges.direct}
                          </Badge>
                        </div>
                        <p className="mt-2 min-w-0 break-words text-xs leading-5 text-text-secondary [overflow-wrap:anywhere]">
                          {getRevenueOptionDescription(option)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <label
                  htmlFor="teams-revenue-amount"
                  className="text-xs font-bold uppercase tracking-wide text-text-tertiary"
                >
                  {teamsCopy.revenue.form.amountLabel}
                </label>
                <AmountInput
                  id="teams-revenue-amount"
                  value={amount}
                  onChange={(nextAmount) => {
                    setAmount(nextAmount);
                    setAmountError(undefined);
                    setSuccessEntry(null);
                  }}
                  tokenSymbol={selectedOption?.symbol}
                  onMaxClick={
                    selectedOption && liveMode && hasAvailableBalance
                      ? () =>
                          setAmount(
                            formatInputAmount(
                              availableBalance,
                              selectedOption.decimals
                            )
                          )
                      : undefined
                  }
                  maxLabel={
                    selectedOption && liveMode && hasAvailableBalance
                      ? `${teamsCopy.revenue.form.balanceLabel}: ${formatTokenAmount(
                          availableBalance,
                          selectedOption.decimals
                        )} ${selectedOption.symbol}`
                      : undefined
                  }
                  error={
                    amountError ??
                    (exceedsAvailableBalance
                      ? teamsCopy.revenue.form.amountExceedsBalance
                      : undefined)
                  }
                  aria-label={teamsCopy.revenue.form.amountLabel}
                />
                <p className="text-sm leading-6 text-text-secondary">
                  {teamsCopy.revenue.form.amountHint}
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    void handleSubmit();
                  }}
                  disabled={
                    isTxPending ||
                    exceedsAvailableBalance ||
                    (liveMode && tokenBalance.isLoading)
                  }
                  isLoading={isTxPending}
                >
                  {needsApproval
                    ? teamsCopy.revenue.form.approve
                    : teamsCopy.revenue.form.submit}
                </Button>
                {txState?.status === "error" && txState.errorMessage ? (
                  <p className="text-sm font-medium text-red-600" role="alert">
                    {txState.errorMessage}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <Banner variant="warning" title={unavailable.title}>
                <p id={unavailableDescriptionId}>{unavailable.body}</p>
              </Banner>
              <Button
                type="button"
                disabled={!unavailableAction}
                onClick={unavailableAction}
                aria-describedby={unavailableDescriptionId}
              >
                {unavailable.cta}
              </Button>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="min-w-0 space-y-4 rounded-box border border-border bg-app p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
              {teamsCopy.revenue.preview.title}
            </p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              <PreviewMetric
                label={teamsCopy.revenue.preview.submitted}
                value={
                  selectedOption && amountRaw !== null && amountRaw > 0n
                    ? `${formatTeamsTokenAmount(amount)} ${selectedOption.symbol}`
                    : "--"
                }
              />
              <PreviewMetric
                label={teamsCopy.revenue.preview.path}
                value={
                  selectedOption ? (
                    <RevenueConversionPath
                      inputSymbol={selectedOption.symbol}
                      converterAddress={selectedOption.converterAddress}
                      outputSymbol={selectedOption.convertToSymbol}
                      isConvertible={selectedOption.isConvertible}
                      directLabel={teamsCopy.revenue.preview.direct}
                    />
                  ) : (
                    teamsCopy.revenue.preview.direct
                  )
                }
              />
              <PreviewMetric
                label={teamsCopy.revenue.preview.credit}
                value={estimatedCreditUsd ? formatTeamsUsd(estimatedCreditUsd, 2) : "--"}
                emphasize={Boolean(estimatedCreditUsd)}
              />
            </div>
            {selectedOption?.previewAmount &&
            selectedOption.estimatedCreditUsd ? (
              <div className="min-w-0 rounded-box border border-border bg-surface-secondary px-4 py-3">
                <p className="break-words text-sm font-medium text-text-primary [overflow-wrap:anywhere]">
                  {teamsCopy.revenue.preview.quote}:{" "}
                  <span className="font-number">
                    {formatTeamsTokenAmount(selectedOption.previewAmount)}{" "}
                    {selectedOption.symbol}
                  </span>{" "}
                  {"->"}{" "}
                  <span className="font-number">
                    {formatTeamsUsd(selectedOption.estimatedCreditUsd, 2)}
                  </span>
                </p>
              </div>
            ) : (
              <div className="rounded-box border border-border bg-surface-secondary px-4 py-3">
                <p className="text-sm text-text-secondary">
                  {teamsCopy.revenue.preview.quoteUnavailable}
                </p>
              </div>
            )}
          </div>

          <RevenueHistoryLedger
            history={renderedHistory}
            headingLevel={headingLevel === 2 ? 3 : 4}
            variant="compact"
            financialDataAvailable={
              activeTeam.financialData.status === "available"
            }
            className="rounded-box border border-border bg-app p-4"
          />
        </div>
      </div>
    </Card>
  );
}

export function RevenueHistoryLedger({
  history,
  title = teamsCopy.revenue.history.title,
  description = teamsCopy.revenue.history.description,
  headingLevel = 3,
  financialDataAvailable = true,
  variant = "table",
  className,
}: {
  history: RevenueHistoryEntry[];
  title?: string;
  description?: string;
  headingLevel?: 2 | 3 | 4;
  financialDataAvailable?: boolean;
  variant?: "table" | "compact";
  className?: string;
}) {
  const renderedHistory = history as DisplayRevenueHistoryEntry[];
  const Heading =
    headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : "h4";

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <Heading className="text-lg font-bold text-text-primary">
          {title}
        </Heading>
        <p className="text-sm leading-6 text-text-secondary">{description}</p>
      </div>

      {renderedHistory.length === 0 ? (
        <div className="rounded-box border border-dashed border-border bg-surface-secondary px-4 py-5">
          <p className="text-sm font-bold text-text-primary">
            {teamsCopy.revenue.history.emptyTitle}
          </p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            {teamsCopy.revenue.history.emptyBody}
          </p>
        </div>
      ) : variant === "compact" ? (
        <div className="space-y-2">
          {renderedHistory.slice(0, 3).map((entry) => (
            <article
              key={entry.id}
              className="min-w-0 rounded-box border border-border bg-surface-secondary/40 px-4 py-3"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <RevenueTransactionReference entry={entry} />
                <p className="min-w-0 break-words text-right font-number text-sm font-bold text-text-primary [overflow-wrap:anywhere]">
                  {formatTeamsTokenAmount(entry.amount)} {entry.symbol}
                </p>
              </div>

              <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
                    {teamsCopy.revenue.history.headers.period}
                  </dt>
                  <dd className="mt-1 font-number text-sm font-medium text-text-primary">
                    #{entry.period}
                  </dd>
                </div>
                <div className="min-w-0 sm:text-right">
                  <dt className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
                    {teamsCopy.revenue.history.headers.credit}
                  </dt>
                  <dd className="mt-1 break-words font-number text-sm font-bold text-text-primary [overflow-wrap:anywhere]">
                    {financialDataAvailable
                      ? formatTeamsUsd(entry.creditedUsd, 2)
                      : teamsCopy.financialData.unavailableValue}
                  </dd>
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
                    {teamsCopy.revenue.history.headers.path}
                  </dt>
                  <dd className="mt-1 text-sm text-text-secondary">
                    <RevenueConversionPath
                      inputSymbol={entry.symbol}
                      converterAddress={entry.converterAddress}
                      outputSymbol={entry.convertedToSymbol}
                      directLabel={teamsCopy.revenue.history.direct}
                    />
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
                <AddressLink
                  address={entry.depositedBy}
                  label={entry.depositorLabel}
                  variant="compact"
                />
                <UtcTime
                  timestamp={entry.createdAt}
                  format="date"
                  className="text-xs text-text-secondary"
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{teamsCopy.revenue.history.headers.record}</TableHead>
              <TableHead>{teamsCopy.revenue.history.headers.period}</TableHead>
              <TableHead>{teamsCopy.revenue.history.headers.deposit}</TableHead>
              <TableHead className="text-right">
                {teamsCopy.revenue.history.headers.credit}
              </TableHead>
              <TableHead>{teamsCopy.revenue.history.headers.path}</TableHead>
              <TableHead>{teamsCopy.revenue.history.headers.depositor}</TableHead>
              <TableHead className="text-right">
                {teamsCopy.revenue.history.headers.recorded}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderedHistory.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <RevenueTransactionReference entry={entry} />
                </TableCell>
                <TableCell className="font-medium text-text-primary">
                  #{entry.period}
                </TableCell>
                <TableCell className="font-number text-text-primary">
                  {formatTeamsTokenAmount(entry.amount)} {entry.symbol}
                </TableCell>
                <TableCell className="text-right font-number text-text-primary">
                  {financialDataAvailable
                    ? formatTeamsUsd(entry.creditedUsd, 2)
                    : teamsCopy.financialData.unavailableValue}
                </TableCell>
                <TableCell className="text-text-secondary">
                  <RevenueConversionPath
                    inputSymbol={entry.symbol}
                    converterAddress={entry.converterAddress}
                    outputSymbol={entry.convertedToSymbol}
                    directLabel={teamsCopy.revenue.history.direct}
                  />
                </TableCell>
                <TableCell>
                  <AddressLink
                    address={entry.depositedBy}
                    label={entry.depositorLabel}
                    variant="compact"
                  />
                </TableCell>
                <TableCell className="text-right text-text-secondary">
                  <UtcTime timestamp={entry.createdAt} format="date" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function RevenueTransactionReference({
  entry,
}: {
  entry: RevenueHistoryEntry;
}) {
  if (!entry.txHash) {
    return (
      <span className="text-xs font-medium text-text-secondary">
        {teamsCopy.revenue.history.localRecord}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <TransactionLink hash={entry.txHash} variant="compact" />
      {entry.logIndex !== undefined ? (
        <span className="font-number text-xs text-text-secondary">
          {teamsCopy.revenue.history.logIndex(entry.logIndex)}
        </span>
      ) : null}
    </div>
  );
}

function RevenueHeader({
  level,
  title,
  description,
}: {
  level: 2 | 3;
  title: string;
  description: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";

  return (
    <div className="space-y-1">
      <Heading className="text-2xl font-bold text-text-primary">{title}</Heading>
      <p className="text-sm leading-6 text-text-secondary">{description}</p>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1 rounded-box border border-border bg-surface-secondary px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p
        className={cn(
          "break-words font-number text-base font-bold text-text-primary [overflow-wrap:anywhere]",
          emphasize && "text-yearn-blue"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function getRevenueOptionDescription(option: RevenueOption) {
  if (option.converterAddress) {
    return teamsCopy.revenue.preview.protocolConverter;
  }
  if (option.convertToSymbol) {
    return `${teamsCopy.revenue.preview.convertedPrefix} ${option.convertToSymbol}`;
  }
  return option.isConvertible
    ? teamsCopy.revenue.preview.conversionRequired
    : teamsCopy.revenue.preview.direct;
}

function RevenueConversionPath({
  inputSymbol,
  converterAddress,
  outputSymbol,
  isConvertible = false,
  directLabel,
}: {
  inputSymbol: string;
  converterAddress?: string | null;
  outputSymbol?: string | null;
  isConvertible?: boolean;
  directLabel: string;
}) {
  if (converterAddress) {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span>{teamsCopy.revenue.preview.protocolConverter}</span>
        <AddressLink address={converterAddress} variant="compact" />
      </span>
    );
  }
  if (outputSymbol) {
    return (
      <span>
        {inputSymbol} {"->"} {outputSymbol}
      </span>
    );
  }
  return isConvertible
    ? teamsCopy.revenue.preview.conversionRequired
    : directLabel;
}

function getUnavailableState(
  readiness: TeamsDepositReadiness,
  team: TeamRecord
) {
  switch (readiness.state) {
    case "untrusted":
      return {
        title: teamsCopy.revenue.unavailable.untrustedTitle,
        body: teamsCopy.revenue.unavailable.untrustedBody,
        cta: teamsCopy.revenue.unavailable.untrustedCta,
      };
    case "disconnected":
      return {
        title: teamsCopy.revenue.unavailable.connectTitle,
        body: teamsCopy.revenue.unavailable.connectBody,
        cta: teamsCopy.revenue.unavailable.connectCta,
      };
    case "switch-mainnet":
      return {
        title: teamsCopy.revenue.unavailable.networkTitle,
        body: teamsCopy.revenue.unavailable.networkBody,
        cta: teamsCopy.revenue.unavailable.networkCta,
      };
    case "unsupported":
      return {
        title: teamsCopy.revenue.unavailable.title,
        body: teamsCopy.revenue.unavailable.optionsBody,
        cta: teamsCopy.revenue.unavailable.disabledCta,
      };
    case "restricted":
    case "ready":
      return {
        title: teamsCopy.revenue.unavailable.title,
        body: team.readOnlyReason
          ? teamsCopy.revenue.unavailable.readOnlyBody
          : teamsCopy.revenue.unavailable.restrictedBody,
        cta: teamsCopy.revenue.unavailable.disabledCta,
      };
  }
}

function normalizeDecimal(value: string): string {
  if (!value.includes(".")) return value;

  return value.replace(/\.?0+$/, "");
}

function isTeamsTxPending(state?: TxState) {
  return (
    state?.status === "signing" ||
    state?.status === "submitted" ||
    state?.status === "mining"
  );
}
