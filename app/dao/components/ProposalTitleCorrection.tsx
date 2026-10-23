import { DAO_TITLE_OVERRIDES_URL, findDaoTitleOverride } from "@/lib/clients/dao/title-overrides";
import type { DaoProposal } from "@/lib/clients/dao/types";
import { daoCopy } from "../messages";

export function ProposalTitleCorrection({ proposal, originalTitle }: {
  proposal: DaoProposal;
  originalTitle: string | null | undefined;
}) {
  if (!findDaoTitleOverride(proposal.ref, proposal.content.digest)) return null;
  return (
    <details className="text-xs text-text-secondary">
      <summary className="min-h-10 w-fit cursor-pointer content-center rounded font-bold focus-visible:outline-2 focus-visible:outline-offset-2">
        {daoCopy.titleCorrection.label}
      </summary>
      <div className="space-y-2 pb-2">
        <p className="break-words [overflow-wrap:anywhere]">
          {daoCopy.titleCorrection.original}: {originalTitle ?? daoCopy.titleCorrection.unavailable}
        </p>
        <p>{daoCopy.titleCorrection.unchanged}</p>
        <a href={DAO_TITLE_OVERRIDES_URL} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center rounded font-bold text-yearn-blue underline underline-offset-4 dark:text-blue-300">
          {daoCopy.titleCorrection.source}
        </a>
      </div>
    </details>
  );
}
