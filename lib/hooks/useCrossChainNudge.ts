"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { resolveGovernanceAppHref } from "@/lib/governance-links";
import { formatTokenAmount } from "@/lib/format";
import { getLlyfiDisplaySymbol } from "@/lib/clients/veyfi/display";
import { crossAppNudgeCopy as copy } from "@/app/_shared/messages";
import { useIdentity } from "@/state/identity";
import { useProtocol } from "@/state/protocol";
import { getRefetchOnWindowFocus } from "@/lib/query/focus-refetch-policy";
import { useDocumentVisibility, useIsRouteActive } from "@/lib/hooks/usePollingGate";
import type { StyfiNudgeState } from "@/lib/clients/styfi";
import type { VeyfiNudgeState } from "@/lib/clients/veyfi";

type NudgeApp = "styfi" | "veyfi";

export type CrossAppNudge = {
  id: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  targetApp: NudgeApp;
  priority: number;
};

type UseCrossChainNudgeOptions = {
  currentApp: NudgeApp;
  hostname?: string | null;
};

const DUST_THRESHOLD = 10n ** 15n; // 0.001 token units (18 decimals)
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function formatTokenForCopy(amount: bigint) {
  return formatTokenAmount(amount, 18, 4);
}

function formatTokenList(
  tokens: Array<{ symbol: string; amount: bigint }>,
  maxItems = 2
) {
  const entries = tokens
    .filter((token) => token.amount > DUST_THRESHOLD)
    .map((token) => `${formatTokenForCopy(token.amount)} ${token.symbol}`);

  if (entries.length === 0) return "";
  if (entries.length <= maxItems) return entries.join(", ");
  return `${entries.slice(0, maxItems).join(", ")}, +${entries.length - maxItems} more`;
}

function toHashFragment(hash?: string) {
  if (!hash) return "";
  return hash.startsWith("#") ? hash : `#${hash}`;
}

function buildNudgeHref(
  app: NudgeApp,
  hostname: string | null | undefined,
  params: Record<string, string>,
  hash?: string
) {
  const baseHref = resolveGovernanceAppHref(app, hostname);
  const query = new URLSearchParams(params).toString();
  return `${baseHref}?${query}${toHashFragment(hash)}`;
}

function buildStyfiPageNudge(
  state: VeyfiNudgeState,
  hostname?: string | null
): CrossAppNudge | null {
  const hasLegacyMigration =
    state.legacyBalance > DUST_THRESHOLD &&
    state.migrationEligible &&
    !state.migrated;
  const hasUnstakedLlyfi = state.llyfiTokens.some(
    (token) => token.walletBalance > DUST_THRESHOLD
  );
  const walletTokenSummary = formatTokenList(
    state.llyfiTokens.map((token) => ({
      symbol: getLlyfiDisplaySymbol(token.symbol),
      amount: token.walletBalance,
    }))
  );
  const legacyAmountLabel = formatTokenForCopy(state.legacyBalance);

  if (hasLegacyMigration) {
    return {
      id: "nudge_veyfi_migration",
      targetApp: "veyfi",
      priority: 110,
      title: copy.styfiPage.migration.title,
      body: copy.styfiPage.migration.body(legacyAmountLabel),
      ctaLabel: copy.shared.cta.toVeyfi,
      href: buildNudgeHref(
        "veyfi",
        hostname,
        { source: "nudge", from: "styfi", action: "migration" },
        "migration-card"
      ),
    };
  }

  if (hasUnstakedLlyfi) {
    return {
      id: "nudge_veyfi_unstaked_llyfi",
      targetApp: "veyfi",
      priority: 90,
      title: copy.styfiPage.unstakedLlyfi.title,
      body: walletTokenSummary
        ? copy.styfiPage.unstakedLlyfi.body(walletTokenSummary)
        : copy.styfiPage.unstakedLlyfi.fallback,
      ctaLabel: copy.shared.cta.toVeyfi,
      href: buildNudgeHref("veyfi", hostname, {
        source: "nudge",
        from: "styfi",
        focus: "stake",
      }),
    };
  }

  return null;
}

function buildVeyfiPageNudge(
  state: StyfiNudgeState,
  hostname?: string | null
): CrossAppNudge | null {
  const hasUnstakedYfi = state.yfiBalance > DUST_THRESHOLD;
  const yfiBalanceLabel = formatTokenForCopy(state.yfiBalance);

  if (hasUnstakedYfi) {
    return {
      id: "nudge_styfi_unstaked_yfi",
      targetApp: "styfi",
      priority: 90,
      title: copy.veyfiPage.unstakedYfi.title,
      body: copy.veyfiPage.unstakedYfi.body(yfiBalanceLabel),
      ctaLabel: copy.shared.cta.toStyfi,
      href: buildNudgeHref(
        "styfi",
        hostname,
        { source: "nudge", from: "veyfi", focus: "stake" },
        "stake-manage"
      ),
    };
  }

  return null;
}

function dismissKey(nudgeId: string, address: string) {
  return `nudge_dismissed_${nudgeId}_${address.toLowerCase()}`;
}

export function useCrossChainNudge({
  currentApp,
  hostname,
}: UseCrossChainNudgeOptions) {
  const { address, isConnected } = useIdentity();
  const { isConnected: isWalletConnected } = useAccount();
  const { styfi, veyfi, publicClient, usesMockBackend } = useProtocol();
  const isVisible = useDocumentVisibility();
  const isPollingRoute = useIsRouteActive([
    currentApp === "styfi" ? "/styfi" : "/veyfi",
  ]);
  const searchParams = useSearchParams();

  const baseEnabled =
    !!address &&
    isConnected &&
    isWalletConnected &&
    (usesMockBackend || !!publicClient);
  const enabled = baseEnabled && isVisible && isPollingRoute;
  const queryKey = ["cross-app", "nudge", currentApp, address] as const;
  const source = searchParams.get("source");
  const from = searchParams.get("from");
  const suppressedTarget: NudgeApp | null =
    source === "nudge" && (from === "styfi" || from === "veyfi") ? from : null;

  const { data: queryResult, isLoading } = useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      if (!address) return null;
      if (currentApp === "styfi") {
        const state = await veyfi.getNudgeState(address);
        return {
          candidate: buildStyfiPageNudge(state, hostname),
          checkedAt: Date.now(),
        };
      }
      const state = await styfi.getNudgeState(address);
      return {
        candidate: buildVeyfiPageNudge(state, hostname),
        checkedAt: Date.now(),
      };
    },
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 20_000,
    refetchOnWindowFocus: getRefetchOnWindowFocus("cross-app.nudge"),
  });

  const [localDismissals, setLocalDismissals] = useState<Record<string, number>>({});
  const candidate = queryResult?.candidate ?? null;
  const checkedAt = queryResult?.checkedAt ?? 0;
  let nudge = candidate;
  if (!address || !candidate) {
    nudge = null;
  } else if (suppressedTarget === candidate.targetApp) {
    nudge = null;
  } else if (typeof window !== "undefined") {
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(dismissKey(candidate.id, address)); } catch { /* Optional preference storage. */ }
    const local = localDismissals[dismissKey(candidate.id, address)];
    if (raw || local !== undefined) {
      const dismissedAt = Math.max(Number(raw ?? 0), local ?? 0);
      if (Number.isFinite(dismissedAt) && checkedAt - dismissedAt < DISMISS_TTL_MS) {
        nudge = null;
      }
    }
  }

  const dismiss = useCallback(
    (nudgeId: string) => {
      if (!address || typeof window === "undefined") return;
      const key = dismissKey(nudgeId, address);
      const now = Date.now();
      setLocalDismissals(previous => ({ ...previous, [key]: now }));
      try { window.localStorage.setItem(key, String(now)); } catch { /* Local dismissal remains effective. */ }
    },
    [address]
  );

  return {
    nudge,
    dismiss,
    isLoading: baseEnabled && isLoading,
  };
}
