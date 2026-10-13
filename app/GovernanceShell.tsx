"use client";

import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import dynamic from "next/dynamic";
import { AppDirectoryFooter } from "@/components/domain/AppDirectoryFooter";
import { resolveGovernanceAppPathHref } from "@/lib/governance-links";
import { resolveHeaderAppKey } from "@/lib/header-nav";
import { useHostname } from "@/lib/hooks/useHostname";
import { isGovernanceAppEnabled } from "@/lib/app-discovery";
import { isDaoEnabled, isGovernanceDiscoveryEnabled } from "@/lib/runtime/features";
import { governanceShellCopy } from "./messages";

const GovernanceVotingNotice = dynamic(() => import("./GovernanceVotingNotice"), { ssr: false });

function useGovernanceShellRoute() {
  const pathname = usePathname();
  const segments = useSelectedLayoutSegments();
  const hostname = useHostname();
  const app = resolveHeaderAppKey(pathname, segments?.[0] ?? null, hostname);
  return { app, hostname, visible: Boolean(hostname && app && isGovernanceAppEnabled(app) && isGovernanceDiscoveryEnabled()) };
}

export function GovernanceAppFooter() {
  const { app, hostname, visible } = useGovernanceShellRoute();
  if (!visible) return null;
  const copy = governanceShellCopy.directory;
  const groups = copy.groups.map(group => ({
    title: group.title,
    links: group.links.filter(link => isGovernanceAppEnabled(link.app)).map(link => ({
      ...link,
      href: resolveGovernanceAppPathHref(link.app, link.path, hostname),
      current: link.app === app,
    })),
  })).filter(group => group.links.length > 0);
  return <AppDirectoryFooter {...copy} groups={groups} />;
}

export function GovernanceAppNotice() {
  const { app, hostname, visible } = useGovernanceShellRoute();
  if (!visible || app === "dao" || !isDaoEnabled()) return null;
  return <GovernanceVotingNotice href={resolveGovernanceAppPathHref("dao", "/", hostname)} />;
}
