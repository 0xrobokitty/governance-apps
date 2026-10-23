"use client";

import { IconPencil } from "@/components/icons/IconPencil";
import { Tooltip } from "@/components/ui/Tooltip";
import { findDaoTitleOverride } from "@/lib/clients/dao/title-overrides";
import type { DaoProposal } from "@/lib/clients/dao/types";
import { daoCopy } from "../messages";

export function ProposalTitleCorrection({ proposal, originalTitle }: {
  proposal: DaoProposal;
  originalTitle: string | null | undefined;
}) {
  if (!findDaoTitleOverride(proposal.ref, proposal.content.digest)) return null;
  return (
    <Tooltip side="bottom" align="end" className="relative z-30 shrink-0 align-middle" content={
      <span className="block space-y-1.5 text-left font-normal">
        <span className="block font-semibold">{daoCopy.titleCorrection.label}</span>
        <span className="block break-words [overflow-wrap:anywhere]">
          {daoCopy.titleCorrection.original}: {originalTitle ?? daoCopy.titleCorrection.unavailable}
        </span>
        <span className="block">{daoCopy.titleCorrection.unchanged}</span>
      </span>
    }>
      <button
        type="button"
        aria-label={daoCopy.titleCorrection.label}
        onClick={(event) => event.currentTarget.focus()}
        onKeyDown={(event) => { if (event.key === "Escape") event.currentTarget.blur(); }}
        className="inline-flex size-10 items-center justify-center rounded text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <IconPencil className="size-3.5" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
