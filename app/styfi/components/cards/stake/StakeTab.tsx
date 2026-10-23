"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "@/state/identity";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { formatInputAmount, formatTokenAmount } from "@/lib/format";
import { parseAmount } from "@/lib/parse";
import {
  styfiKeys,
  useStyfiAccount,
  useStyfiStake,
} from "@/lib/hooks/useStyfi";
import { useTokenApprove } from "@/lib/hooks/useTokenApprove";
import { useTokenAllowance } from "@/lib/hooks/useTokenAllowance";
import { YFI_ADDRESS, SPENDER_STYFI, SPENDER_STYFIX } from "@/lib/constants";
import { StyfiAsset, modeLabel } from "../../types";
import { styfiCopy as copy } from "../../../messages";

type Props = {
  asset: StyfiAsset;
};

export function StakeTab({ asset }: Props) {
  const queryClient = useQueryClient();
  const {
    canTransact,
    yfiBalance,
    blacklistStatus,
    isLoading: isIdentityLoading,
  } = useIdentity();
  const { data: styfiData, isLoading: isStyfiLoading } = useStyfiAccount();

  const { write: stake, state: stakeState } = useStyfiStake();
  const { write: approve, isLoading: approveLoading } = useTokenApprove();

  const [input, setInput] = useState<string>("");
  const { amount, isValid } = useMemo(() => parseAmount(input || "0"), [input]);

  const spender = asset === "stYFI" ? SPENDER_STYFI : SPENDER_STYFIX;

  const { data: allowance = 0n, refetch: refetchAllowance } = useTokenAllowance(
    YFI_ADDRESS,
    spender
  );

  const outputAmount = isValid ? amount : 0n;
  const needsApproval = isValid && amount > allowance;
  const insufficientBalance = isValid && amount > yfiBalance;

  const isSubmitting =
    stakeState.status === "signing" ||
    stakeState.status === "submitted" ||
    stakeState.status === "mining";

  const isLoading = isIdentityLoading || isStyfiLoading;

  const isDisabled =
    !canTransact ||
    blacklistStatus === "blocked" ||
    !isValid ||
    amount <= 0n ||
    insufficientBalance ||
    isLoading ||
    approveLoading ||
    isSubmitting;

  const onMax = () => {
    setInput(formatInputAmount(yfiBalance));
  };

  const handleApprove = async () => {
    if (!isValid || amount <= 0n) return;

    await approve(YFI_ADDRESS, spender, amount, {
      invalidate: async () => {
        await refetchAllowance();
        await queryClient.invalidateQueries({
          queryKey: styfiKeys.account(styfiData?.address),
        });
      },
    });
  };

  const handleStake = async () => {
    if (!isValid || amount <= 0n) return;
    const { data: freshAllowance = 0n } = await refetchAllowance();
    if (freshAllowance < amount) {
      return;
    }
    await stake(asset, amount);
    setInput("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600">{copy.stakeTab.amountLabel}</p>
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-600">
          <span className="">{formatTokenAmount(outputAmount)} YFI</span>
          <span className="text-lg text-neutral-400">&rarr;</span>
          <span className="">
            {formatTokenAmount(outputAmount)} {modeLabel(asset)}
          </span>
        </div>
      </div>

      <AmountInput
        value={input}
        onChange={setInput}
        onMaxClick={onMax}
        maxLabel={copy.stakeTab.balanceLabel(formatTokenAmount(yfiBalance))}
        tokenSymbol="YFI"
        error={
          insufficientBalance ? copy.stakeTab.insufficientBalance : undefined
        }
        placeholder="0.00"
        disabled={isLoading || approveLoading || isSubmitting}
      />

      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3 sm:justify-end">
        {needsApproval ? (
          <Button
            variant="secondary"
            onClick={handleApprove}
            disabled={
              !canTransact ||
              blacklistStatus === "blocked" ||
              !isValid ||
              amount <= 0n ||
              approveLoading
            }
            isLoading={approveLoading}
          >
            {copy.stakeTab.approve}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleStake}
            disabled={isDisabled}
            isLoading={isSubmitting}
          >
            {copy.stakeTab.stake}
          </Button>
        )}

        {blacklistStatus === "blocked" && (
          <p className="text-xs text-red-600">{copy.shared.blacklistedBody}</p>
        )}
      </div>
    </div>
  );
}
