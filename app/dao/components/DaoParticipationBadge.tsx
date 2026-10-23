import { Badge } from "@/components/ui/Badge";
import { IconCheck } from "@/components/icons/IconCheck";
import type { DaoParticipation } from "@/lib/clients/dao/participation";
import { daoCopy } from "../messages";

export function DaoParticipationBadge({ status }: { status?: DaoParticipation }) {
  if (!status) return null;
  const copy = daoCopy.participation[status];
  return (
    <Badge
      variant={status === "voted" ? "success" : status === "pending" ? "warning" : "neutral"}
      className={status === "voted" ? "gap-1 dark:bg-green-950 dark:text-green-200" : status === "pending" ? "dark:bg-amber-950 dark:text-amber-200" : "dark:bg-neutral-800 dark:text-neutral-200"}
      title={copy.description}
      aria-label={`${copy.label}. ${copy.description}`}
      data-testid="dao-participation-badge"
    >
      {status === "voted" ? <IconCheck className="size-3" aria-hidden /> : null}
      {copy.label}
    </Badge>
  );
}
