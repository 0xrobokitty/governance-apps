import { IconClose } from "@/components/icons/IconClose";
import { IconChevron } from "@/components/icons/IconChevron";

type VotingNoticeProps = {
  title: string;
  description: string;
  deadline: string;
  deadlineTitle: string;
  href: string;
  reviewLabel: string;
  dismissLabel: string;
  onDismiss: () => void;
};

export function VotingNotice({ title, description, deadline, deadlineTitle, href, reviewLabel, dismissLabel, onDismiss }: VotingNoticeProps) {
  return (
    <aside aria-label={title} className="border-b border-border bg-surface" data-testid="governance-voting-notice">
      <div className="container mx-auto flex items-start gap-3 px-4 py-3 md:items-center md:px-6">
        <span aria-hidden className="mt-4 size-2 shrink-0 rounded-full bg-yearn-blue md:mt-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-x-4 gap-y-1 sm:flex-row sm:flex-wrap sm:items-center">
          <p className="text-pretty text-sm leading-6">
            <strong className="font-semibold">{title}.</strong>{" "}
            <span className="text-text-secondary">{description}</span>
          </p>
          <span title={deadlineTitle} className="font-number text-xs leading-6 text-text-secondary tabular-nums">{deadline}</span>
          <a href={href} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md text-sm font-medium text-yearn-blue transition-colors hover:text-text-primary dark:text-blue-300 dark:hover:text-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary motion-reduce:transition-none sm:ml-auto">
            {reviewLabel}<IconChevron className="size-4 -rotate-90" aria-hidden />
          </a>
        </div>
        <button type="button" onClick={onDismiss} aria-label={dismissLabel} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-[background-color,color,scale] hover:bg-surface-secondary hover:text-text-primary active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary motion-reduce:transition-none motion-reduce:active:scale-100">
          <IconClose className="size-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
