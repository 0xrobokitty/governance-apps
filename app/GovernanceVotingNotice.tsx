"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { VotingNotice } from "@/components/domain/VotingNotice";
import { useDaoFeed, useDaoMockRuntime } from "@/lib/hooks/useDao";
import { deriveDaoVotingNotice } from "@/lib/clients/dao/voting-notice";
import { dismissVotingPeriods, parseDismissedVotingPeriods, readDismissedVotingPeriods, subscribeDismissedVotingPeriods } from "@/lib/voting-notice-dismissal";
import { governanceShellCopy } from "./messages";

const emptyServerSnapshot = () => null;

export default function GovernanceVotingNotice({ href }: { href: string }) {
  const feed = useDaoFeed();
  const runtime = useDaoMockRuntime();
  const [wallNow, setWallNow] = useState<number | null>(null);
  const dismissedRaw = useSyncExternalStore(subscribeDismissedVotingPeriods, readDismissedVotingPeriods, emptyServerSnapshot);
  useEffect(() => {
    const update = () => setWallNow(Math.floor(Date.now() / 1000));
    update();
    const timer = setInterval(update, 1_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const now = runtime?.now ?? wallNow;
  const notice = now === null || feed.isError || feed.isPending
    ? null
    : deriveDaoVotingNotice(feed.data, now, runtime ? "mock" : "live");
  const dismissed = parseDismissedVotingPeriods(dismissedRaw);
  if (!notice || notice.periodKeys.every(key => dismissed.includes(key))) return null;
  const copy = governanceShellCopy.voting;
  return <VotingNotice
    title={copy.title}
    description={copy.count(notice.proposalCount)}
    deadline={copy.closes(copy.remaining(notice.endsAt - now!), notice.multipleDeadlines)}
    deadlineTitle={new Date(notice.endsAt * 1000).toUTCString()}
    href={href}
    reviewLabel={copy.review}
    dismissLabel={copy.dismiss}
    onDismiss={() => dismissVotingPeriods(notice.periodKeys)}
  />;
}
