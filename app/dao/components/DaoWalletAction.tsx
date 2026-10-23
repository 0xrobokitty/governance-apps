import Link from "next/link";
import { Button, getButtonClassName } from "@/components/ui/Button";
import { IconCheck } from "@/components/icons/IconCheck";
import type { DaoWalletParticipation } from "@/lib/clients/dao/participation";
import { daoCopy } from "../messages";

export function DaoWalletAction({ participation, votingOpen, href }: {
  participation?: DaoWalletParticipation;
  votingOpen: boolean;
  href: string;
}) {
  if (!participation) return null;
  const { status, choice } = participation;
  const copy = daoCopy.participation;
  const canReview = status === "not-voted" && votingOpen;
  const label = status === "voted" ? copy.choices[choice ?? "unknown"] : copy[status].label;
  const description = status === "voted" && choice === "unknown" ? copy.unknownChoice : copy[status].description;
  return (
    <div className="relative z-10 flex min-w-0 cursor-default items-center justify-between gap-3 border-t border-border pt-4 lg:flex-col lg:items-stretch lg:gap-2 lg:border-t-0 lg:pt-0" data-testid="dao-wallet-action">
      <span className="text-xs text-text-tertiary lg:text-center">{copy.yourVote}</span>
      {canReview ? (
        <Link href={href} className={getButtonClassName({ size: "sm", className: "min-w-32 cursor-pointer font-bold lg:w-full" })}
          aria-label={`${copy.vote}. ${copy.reviewDescription}`}>
          {copy.vote}
        </Link>
      ) : status === "not-voted" ? (
        <span className="text-sm text-text-secondary lg:text-center" title={description}>{label}</span>
      ) : (
        <Button disabled static size="sm" variant="secondary"
          className={status === "voted"
            ? "min-w-32 gap-1.5 border-green-200 bg-green-50 font-bold text-green-800 disabled:cursor-default disabled:opacity-100 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
            : status === "pending"
              ? "min-w-32 border-amber-200 bg-amber-50 font-bold text-amber-800 disabled:cursor-default disabled:opacity-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
              : "min-w-32 font-bold disabled:cursor-default disabled:opacity-100"}
          title={description} aria-label={`${label}. ${description}`}>
          {status === "voted" ? <IconCheck className="size-3.5" aria-hidden /> : null}{label}
        </Button>
      )}
    </div>
  );
}
