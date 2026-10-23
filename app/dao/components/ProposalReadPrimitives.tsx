import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { UtcTime } from "@/components/ui/UtcTime";
import { TransactionLink } from "@/components/ui/ExplorerLink";
import {
  deriveDaoProposalExecutionReadiness,
  deriveDaoProposalTimingDisplay,
  deriveDaoVoteDisplay,
  type DaoDisplayStatus,
  type DaoProposal,
  type DaoProposalTimingDisplay,
} from "@/lib/clients/dao";
import { cn } from "@/lib/cn";
import { daoCopy } from "../messages";
import { ProposalVoteResults } from "./ProposalVoteResults";

const STATUS_VARIANTS: Record<
  DaoDisplayStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  discussion: "neutral",
  voting: "brand",
  approved: "success",
  rejected: "error",
  executed: "success",
  expired: "warning",
  retracted: "neutral",
  flagged: "error",
  vetoed: "error",
  not_found: "neutral",
};

const STATUS_DARK_CLASS_NAMES: Partial<Record<DaoDisplayStatus, string>> = {
  voting:
    "bg-yearn-blue text-white dark:bg-blue-950 dark:text-blue-200",
  approved: "dark:bg-green-950 dark:text-green-200",
  executed: "dark:bg-green-950 dark:text-green-200",
};

export function ProposalStatusBadge({
  status,
}: {
  status: DaoDisplayStatus;
}) {
  return (
    <Badge
      variant={STATUS_VARIANTS[status]}
      className={cn("font-sans", STATUS_DARK_CLASS_NAMES[status])}
      data-testid="dao-proposal-status"
    >
      {daoCopy.status[status]}
    </Badge>
  );
}

export function ProposalTypeBadge({ proposal }: { proposal: DaoProposal }) {
  return (
    <Badge className="font-sans">
      {daoCopy.proposalType[proposal.type]}
    </Badge>
  );
}

export function ProposalHeadingFacts({
  proposal,
}: {
  proposal: DaoProposal;
}) {
  const readiness = deriveDaoProposalExecutionReadiness(proposal);
  const isIntegrityBlocked = readiness.state === "integrity_blocked";

  return (
    <div
      data-testid="dao-proposal-heading-facts"
      className="min-w-0 space-y-2"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {isIntegrityBlocked ? (
          <Badge className="bg-red-700 font-sans text-white dark:bg-red-300 dark:text-red-950">
            {daoCopy.executionReadiness.blocked}
          </Badge>
        ) : null}
        <ProposalStatusBadge status={proposal.displayStatus} />
        <ProposalTypeBadge proposal={proposal} />
      </div>
      {isIntegrityBlocked ? (
        <p className="max-w-2xl text-pretty text-xs font-bold text-error-700 dark:text-red-300">
          {readiness.reason}
        </p>
      ) : null}
    </div>
  );
}

export function ProposalTiming({
  className,
  now,
  proposal,
  showExact = false,
}: {
  className?: string;
  now: number;
  proposal: DaoProposal;
  showExact?: boolean;
}) {
  const timing = deriveDaoProposalTimingDisplay(proposal, now);
  const timestamp = timing.timestamp;

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <p className="text-pretty font-number text-sm font-bold tabular-nums text-text-primary">
        <ProposalTimingText timing={timing} />
      </p>
      {showExact && timestamp !== null ? (
        <UtcTime
          timestamp={timestamp}
          className="font-number text-xs tabular-nums text-text-secondary"
        />
      ) : null}
    </div>
  );
}

export function ProposalVoteSummary({
  compact = false,
  proposal,
  hostname,
}: {
  compact?: boolean;
  proposal: DaoProposal;
  hostname?: string;
}) {
  if (!compact) return <ProposalVoteResults proposal={proposal} hostname={hostname} />;
  const vote = deriveDaoVoteDisplay(proposal);

  return (
    <div className="min-w-0 space-y-2">
      <div
        aria-hidden="true"
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-200"
      >
        <span
          aria-hidden="true"
          className="h-full bg-yearn-blue motion-reduce:transition-none"
          style={{ width: `${vote.yeaPercentTenths / 10}%` }}
        />
        <span
          aria-hidden="true"
          className="h-full bg-neutral-500 motion-reduce:transition-none"
          style={{ width: `${vote.nayPercentTenths / 10}%` }}
        />
      </div>
      <p className="font-number text-sm font-bold tabular-nums">
        {daoCopy.detail.voteBreakdown(vote.yeaPercent, vote.nayPercent)}
      </p>
      <p className="text-pretty font-number text-xs tabular-nums text-text-secondary">
        {daoCopy.detail.voteCaption(vote.thresholdPercent)}
      </p>
    </div>
  );
}

function ProposalTimingText({
  timing,
}: {
  timing: DaoProposalTimingDisplay;
}) {
  if (timing.kind === "voting_opens") {
    return daoCopy.timing.votingOpens(
      formatRelativeDuration(timing.remainingSeconds)
    );
  }
  if (timing.kind === "voting_ends") {
    return daoCopy.timing.votingEnds(
      formatRelativeDuration(timing.remainingSeconds)
    );
  }
  if (timing.kind === "execution_opens") {
    return daoCopy.timing.executionOpens(
      formatRelativeDuration(timing.remainingSeconds)
    );
  }
  if (timing.kind === "execution_expires") {
    return daoCopy.timing.executionExpires(
      formatRelativeDuration(timing.remainingSeconds)
    );
  }
  if (timing.kind === "approved_on") {
    return (
      <>
        {daoCopy.timing.approvedOn} <UtcTime timestamp={timing.timestamp} format="date" />
      </>
    );
  }
  if (timing.kind === "rejected_on") {
    return (
      <>
        {daoCopy.timing.rejectedOn} <UtcTime timestamp={timing.timestamp} format="date" />
      </>
    );
  }
  if (timing.kind === "execution_expired_on") {
    return (
      <>
        {daoCopy.timing.executionExpiredOn}{" "}
        <UtcTime timestamp={timing.timestamp} format="date" />
      </>
    );
  }

  const event = timing.event;
  if (!event) {
    return daoCopy.detail.timeUnavailable;
  }
  return (
    <>
      {daoCopy.detail.eventVerbs[event.type]}{" "}
      <UtcTime
        timestamp={event.log.timestamp}
        fallback={daoCopy.detail.timeUnavailable}
      />{" "}
      <span aria-hidden="true">·</span>{" "}
      {event.log.transactionHash ? (
        <TransactionLink
          hash={event.log.transactionHash}
          label={daoCopy.detail.viewTransaction}
          variant="compact"
        />
      ) : (
        daoCopy.detail.transactionUnavailable
      )}
    </>
  );
}

function formatRelativeDuration(seconds: number): string {
  if (seconds >= 86_400) {
    return daoCopy.timing.duration.day(Math.ceil(seconds / 86_400));
  }
  if (seconds >= 3_600) {
    return daoCopy.timing.duration.hour(Math.ceil(seconds / 3_600));
  }
  return daoCopy.timing.duration.minute(Math.max(1, Math.ceil(seconds / 60)));
}
