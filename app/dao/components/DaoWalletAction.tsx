import Link from "next/link";
import { Button, getButtonClassName } from "@/components/ui/Button";
import { IconCheck } from "@/components/icons/IconCheck";
import { IconClose } from "@/components/icons/IconClose";
import type { DaoWalletParticipation } from "@/lib/clients/dao/participation";
import { daoCopy } from "../messages";

export function DaoWalletAction({ participation, votingOpen, href }: {
  participation?: DaoWalletParticipation;
  votingOpen: boolean;
  href: string;
}) {
  if (!participation || (participation.status === "not-voted" && !votingOpen)) return null;
  const { status, choice } = participation;
  const copy = daoCopy.participation;
  const canReview = status === "not-voted" && votingOpen;
  const label = canReview ? copy.vote : status === "voted" ? copy.choices[choice ?? "unknown"] :
    status === "pending" ? copy.pending.label : copy.unknown.label;
  const description = canReview ? copy.reviewDescription : status === "voted"
    ? choice === "unknown" || choice === null ? copy.unknownChoice : copy.voted.description
    : status === "pending" ? copy.pending.description : copy.unknown.description;
  return (
    <div className="pointer-events-none relative z-10 flex min-w-0 items-center lg:justify-end" data-testid="dao-wallet-action">
      {canReview ? (
        <Link href={href} className={getButtonClassName({ size: "sm", className: "pointer-events-auto min-w-16 cursor-pointer font-medium" })}
          aria-label={`${copy.vote}. ${copy.reviewDescription}`}>
          {copy.vote}
        </Link>
      ) : (
        <Button disabled static size="sm" variant="secondary"
          className="pointer-events-auto gap-1.5 border-transparent bg-surface-secondary/60 px-2.5 font-medium text-text-secondary disabled:cursor-default disabled:opacity-100"
          title={description} aria-label={`${label}. ${description}`}>
          {status === "voted" && choice === "yea" ? <IconCheck className="size-3.5" aria-hidden /> : null}
          {status === "voted" && choice === "nay" ? <IconClose className="size-3.5" aria-hidden /> : null}{label}
        </Button>
      )}
    </div>
  );
}
