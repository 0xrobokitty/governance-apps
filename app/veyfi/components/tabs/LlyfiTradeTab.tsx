"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "@/state/identity";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import {
  useVeyfiAccount,
  useLlyfiRedeem,
  useLlyfiMint,
  veyfiKeys,
} from "@/lib/hooks/useVeyfi";
import { useTokenApprove } from "@/lib/hooks/useTokenApprove";
import { useTokenAllowance } from "@/lib/hooks/useTokenAllowance";
import { formatInputAmount, formatTokenAmount, formatPercent } from "@/lib/format";
import { parseAmount } from "@/lib/parse";
import { LlyfiTokenState } from "@/lib/clients/veyfi";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { YFI_ADDRESS, SPENDER_REDEMPTION } from "@/lib/constants";
import { getLlyfiDisplaySymbol } from "@/lib/clients/veyfi/display";
import { computeTradeQuote } from "@/lib/clients/veyfi/trade-quote";

export function LlyfiTradeTab({ token }: { token: LlyfiTokenState }) {
  const { canTransact, yfiBalance, blacklistStatus, address } = useIdentity();
  const queryClient = useQueryClient();
  const { data } = useVeyfiAccount();
  const [mode, setMode] = useState<"sell" | "buy">("sell");
  const [input, setInput] = useState("");

  const { amount, isValid } = useMemo(() => parseAmount(input), [input]);

  const { write: redeem, state: redeemState } = useLlyfiRedeem();
  const { write: mint, state: mintState } = useLlyfiMint();
  const { write: approve, isLoading: approveLoading } = useTokenApprove();

  const { data: yfiAllowance = 0n, refetch: refetchYfiAllowance } =
    useTokenAllowance(YFI_ADDRESS, SPENDER_REDEMPTION);

  const { data: llyfiAllowance = 0n, refetch: refetchLlyfiAllowance } =
    useTokenAllowance(token.address, SPENDER_REDEMPTION);

  const isSell = mode === "sell";
  const userBalance = isSell ? token.walletBalance : yfiBalance;
  const displaySymbol = getLlyfiDisplaySymbol(token.symbol);
  const sourceSymbol = isSell ? displaySymbol : "YFI";
  const targetSymbol = isSell ? "YFI" : displaySymbol;

  const exchangeRate = token.exchangeRate;
  const { hasValidExchangeRate, yfiValue, llyfiValue } = computeTradeQuote({
    amount,
    exchangeRate,
    isSell,
  });
  const ONE_E18 = 10n ** 18n;

  const feePercent = token.redemption.fee;
  const feeAmountYfi = (yfiValue * feePercent) / ONE_E18;

  const netOutput = isSell
    ? yfiValue > feeAmountYfi
      ? yfiValue - feeAmountYfi
      : 0n
    : llyfiValue;

  const remainingCapacityYfi =
    token.redemption.capacity - token.redemption.used;

  // --- Logic for Constraints & Instructive Errors ---
  let capExceeded = false;
  let inventoryExceeded = false;
  let maxProtocolInput = 0n;

  if (!hasValidExchangeRate) {
    maxProtocolInput = 0n;
  } else if (isSell) {
    // Selling LLYFI. Constraints are on the YFI Output side.
    const availableGlobalYfi = data?.inventory.availableYfi ?? 0n;

    // The bottleneck is the tighter of (Capacity Remaining) or (Inventory Remaining)
    const limitYfi =
      remainingCapacityYfi < availableGlobalYfi
        ? remainingCapacityYfi
        : availableGlobalYfi;

    // Convert that YFI limit back to LLYFI input
    maxProtocolInput = limitYfi * exchangeRate;

    if (yfiValue > remainingCapacityYfi) capExceeded = true;
    if (yfiValue > availableGlobalYfi) inventoryExceeded = true;
  } else {
    // Buying LLYFI (Minting). Constraint is on the LLYFI Inventory.
    // Input is YFI.
    // Max LLYFI we can buy is token.redemption.inventory.
    // Max YFI we can input is inventory / exchangeRate.

    maxProtocolInput = token.redemption.inventory / exchangeRate;

    // Use llyfiValue calculated above
    if (llyfiValue > token.redemption.inventory) inventoryExceeded = true;
  }

  const currentAllowance = isSell ? llyfiAllowance : yfiAllowance;
  const needsApproval =
    hasValidExchangeRate && isValid && amount > 0n && amount > currentAllowance;

  const handleApprove = async () => {
    if (!hasValidExchangeRate || amount <= 0n) return;
    const tokenAddress = isSell ? token.address : YFI_ADDRESS;
    await approve(tokenAddress, SPENDER_REDEMPTION, amount, {
      invalidate: async () => {
        if (isSell) {
          await refetchLlyfiAllowance();
        } else {
          await refetchYfiAllowance();
        }
        await queryClient.invalidateQueries({
          queryKey: veyfiKeys.account(address),
        });
      },
    });
  };

  const isSubmitting =
    redeemState.status === "signing" ||
    redeemState.status === "submitted" ||
    redeemState.status === "mining" ||
    mintState.status === "signing" ||
    mintState.status === "submitted" ||
    mintState.status === "mining";

  const transactionStatuses = `${redeemState.status}:${mintState.status}`;
  const [previousStatuses, setPreviousStatuses] = useState(transactionStatuses);
  if (previousStatuses !== transactionStatuses) {
    setPreviousStatuses(transactionStatuses);
    const [previousRedeem, previousMint] = previousStatuses.split(":");
    if (
      (redeemState.status === "success" && previousRedeem !== "success") ||
      (mintState.status === "success" && previousMint !== "success")
    ) {
      setInput("");
    }
  }

  if (!token.redemption.enabled) {
    return (
      <p className="text-sm text-neutral-600">
        Trading is currently unavailable for {displaySymbol}.
      </p>
    );
  }

  // Error logic with Instructive Messages
  let errorMsg = undefined;
  if (!isSubmitting) {
    if (!hasValidExchangeRate) {
      errorMsg =
        "Trading is temporarily unavailable because the token exchange rate is invalid.";
    } else if (capExceeded) {
      errorMsg = `Exceeds capacity (Max: ${formatTokenAmount(
        maxProtocolInput,
        18,
        2
      )} ${sourceSymbol})`;
    } else if (inventoryExceeded) {
      errorMsg = `Exceeds inventory (Max: ${formatTokenAmount(
        maxProtocolInput,
        18,
        2
      )} ${sourceSymbol})`;
    } else if (isValid && amount > userBalance) {
      errorMsg = "Insufficient balance";
    }
  }

  return (
    <div className="space-y-4">
      <div className="pb-2 border-b border-neutral-100">
        <RadioGroup
          name={`trade-${token.symbol}`}
          value={mode}
          onChange={(nextMode) => {
            setMode(nextMode);
            setInput("");
          }}
          options={[
            { value: "sell", label: `Sell ${displaySymbol}` },
            { value: "buy", label: `Buy ${displaySymbol}` },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
        <p className="text-neutral-600">{isSell ? "You sell" : "You buy"}</p>
        <div className="flex items-center gap-2 font-medium text-neutral-600">
          <span className="">
            {formatTokenAmount(isValid ? amount : 0n)} {sourceSymbol}
          </span>
          <span className="text-lg text-neutral-400">&rarr;</span>
          <span className="">
            {formatTokenAmount(netOutput)} {targetSymbol}
          </span>
        </div>
      </div>

      <AmountInput
        value={input}
        onChange={setInput}
        tokenSymbol={sourceSymbol}
        maxLabel={`Balance: ${formatTokenAmount(userBalance)}`}
        onMaxClick={() => setInput(formatInputAmount(userBalance))}
        error={errorMsg}
      />

      {isSell && isValid && amount > 0n && !capExceeded && (
        <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 rounded-md border border-neutral-200 text-xs text-neutral-600">
          <span>Exit Fee ({formatPercent(Number(feePercent) / 1e18)})</span>
          <span className="font-number font-medium">
            -{formatTokenAmount(feeAmountYfi)} YFI
          </span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        {needsApproval ? (
          <Button
            variant="secondary"
            disabled={
              !canTransact ||
              !hasValidExchangeRate ||
              blacklistStatus === "blocked" ||
              approveLoading
            }
            isLoading={approveLoading}
            onClick={handleApprove}
          >
            Approve {sourceSymbol}
          </Button>
        ) : (
          <Button
            variant="veyfi"
            disabled={
              !isValid ||
              amount <= 0n ||
              !!errorMsg ||
              !canTransact ||
              !hasValidExchangeRate ||
              blacklistStatus === "blocked" ||
              isSubmitting
            }
            isLoading={isSubmitting}
            onClick={() => {
              if (isSell) {
                redeem(token.symbol, amount);
              } else {
                mint(token.symbol, amount);
              }
            }}
          >
            {isSell ? `Sell ${displaySymbol}` : `Buy ${displaySymbol}`}
          </Button>
        )}
      </div>
      {blacklistStatus === "blocked" && (
        <p className="text-xs text-red-600">
          This address is restricted from making token transfers.
        </p>
      )}
    </div>
  );
}
