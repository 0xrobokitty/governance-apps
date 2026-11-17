"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Hash, PublicClient } from "viem";
import { useAccount } from "wagmi";
import {
  assertTeamsSnapshotTransition,
  mapTeamsFeedToRuntimeState,
  readTeamsCanonicalSnapshot,
  type TeamsCanonicalSnapshot,
} from "@/lib/clients/teams";
import { createMockTeamsClient } from "@/lib/clients/teams/mock";
import {
  patchMockTeamsAdmin,
  patchMockTeamsBonus,
  patchMockTeamsFundingApproval,
  patchMockTeamsTeam,
  replaceMockTeamsTeam,
  resetMockTeamsStore,
  setMockTeamsAdminVisible,
  setMockTeamsCurrentPeriod,
  setMockTeamsEmpty,
  setMockTeamsLoading,
  setMockTeamsPreset,
  setMockTeamsSelectedTeam,
  setMockTeamsSelectedTeamBonusState,
  setMockTeamsSelectedTeamFundingState,
  setMockTeamsSelectedTeamLifecycle,
  setMockTeamsSelectedTeamReadOnlyReason,
  setMockTeamsSelectedTeamRevenueState,
  setMockTeamsViewerRole,
  type TeamsBonusDebugState,
  type TeamsFundingDebugState,
  type TeamsRevenueDebugState,
} from "@/lib/clients/teams/mock";
import type {
  TeamId,
  TeamLifecycleStatus,
  TeamReadOnlyReason,
  TeamRecord,
  TeamsMockScenarioId,
  TeamsViewerRole,
} from "@/lib/clients/teams/types";
import type { TeamsFeed } from "@/lib/schemas/teams-feed";
import { useTeamsData } from "@/lib/hooks/useTeamsData";
import {
  getTeamsAuthorityFingerprint,
  teamsKeys,
} from "@/lib/hooks/teamsKeys";
import { useOptionalProtocol } from "@/state/protocol";

const teamsClient = createMockTeamsClient({ latencyMs: 250 });
export { teamsKeys } from "@/lib/hooks/teamsKeys";

type TeamsRuntimeState = Awaited<ReturnType<typeof teamsClient.getPageState>> & {
  backend: "mock" | "feed";
  feed: TeamsFeed | null;
};

type AcceptedTeamsFeed = {
  activationId: number;
  authorityFingerprint: Hash;
  feed: TeamsFeed;
  snapshot: TeamsCanonicalSnapshot;
};

type TeamsAcceptanceState = {
  acceptedFeed: AcceptedTeamsFeed | null;
  evaluatedFeed: TeamsFeed | null;
  evaluatedSnapshot: TeamsCanonicalSnapshot | null;
  transitionError: Error | null;
};

// The rollback baseline must survive a route remount alongside the query cache.
const acceptedTeamsByQueryClient = new WeakMap<ReturnType<typeof useQueryClient>, TeamsAcceptanceState>();

async function invalidateTeamsQueries(
  queryClient: ReturnType<typeof useQueryClient>
) {
  await queryClient.invalidateQueries({
    queryKey: teamsKeys.all,
    refetchType: "all",
  });
}

export function useTeamsScenarioCatalog() {
  return useQuery({
    queryKey: teamsKeys.scenarioCatalog(),
    queryFn: () => teamsClient.listScenarioCatalog(),
    staleTime: Infinity,
  });
}

export function useTeamsScenario(id: TeamsMockScenarioId) {
  return useQuery({
    queryKey: teamsKeys.scenario(id),
    queryFn: () => teamsClient.getScenario(id),
    staleTime: Infinity,
  });
}

export function useTeamsState() {
  const queryClient = useQueryClient();
  const { address, chainId } = useAccount();
  const protocol = useOptionalProtocol();
  const usesMockBackend = protocol?.teamsUsesMockBackend ?? true;
  const teamsFeed = useTeamsData(!usesMockBackend);
  const latestFeed = teamsFeed.data?.feed ?? null;
  const latestActivationId = teamsFeed.data?.activationId ?? null;
  const mainnetPublicClient = protocol?.mainnetPublicClient ?? null;
  const latestAuthorityFingerprint = useMemo(
    () =>
      latestFeed
        ? getTeamsAuthorityFingerprint(latestFeed)
        : null,
    [latestFeed]
  );
  const [acceptanceState, setAcceptanceState] =
    useState<TeamsAcceptanceState>(() => acceptedTeamsByQueryClient.get(queryClient) ?? {
      acceptedFeed: null,
      evaluatedFeed: null,
      evaluatedSnapshot: null,
      transitionError: null,
    });
  const { acceptedFeed, transitionError } = acceptanceState;
  const canonicalSnapshot = useTeamsCanonicalSnapshot({
    enabled: !usesMockBackend,
    activationId: latestActivationId,
    authorityFingerprint: latestAuthorityFingerprint,
    feed: latestFeed,
    previousAuthorityFingerprint:
      acceptedFeed?.authorityFingerprint ?? null,
    previousSnapshot: acceptedFeed?.snapshot ?? null,
    publicClient: mainnetPublicClient,
  });
  const mockQuery = useQuery({
    queryKey: teamsKeys.pageState(),
    queryFn: async (): Promise<TeamsRuntimeState> => ({
      ...(await teamsClient.getPageState()),
      backend: "mock",
      feed: null,
    }),
    staleTime: Infinity,
    enabled: usesMockBackend,
  });

  const nextFeed = latestFeed;
  const nextVerification = canonicalSnapshot.data ?? null;
  if (
    !usesMockBackend &&
    nextFeed &&
    latestActivationId !== null &&
    latestAuthorityFingerprint &&
    nextVerification &&
    snapshotMatchesFeed(nextVerification, nextFeed) &&
    (acceptanceState.evaluatedFeed !== nextFeed ||
      acceptanceState.evaluatedSnapshot !== nextVerification)
  ) {
    const nextAcceptance = transitionTeamsAcceptance(
      acceptedTeamsByQueryClient.get(queryClient) ?? acceptanceState,
      {
        activationId: latestActivationId,
        authorityFingerprint: latestAuthorityFingerprint,
        feed: nextFeed,
        snapshot: nextVerification,
      },
      nextVerification
    );
    acceptedTeamsByQueryClient.set(queryClient, nextAcceptance);
    setAcceptanceState(nextAcceptance);
  }

  const latestFeedVerified =
    latestFeed !== null &&
    canonicalSnapshot.data !== undefined &&
    canonicalSnapshot.isFetchedAfterMount &&
    snapshotMatchesFeed(
      canonicalSnapshot.data,
      latestFeed
    );
  const actionStateTrusted =
    !usesMockBackend &&
    acceptedFeed !== null &&
    latestFeedVerified &&
    acceptedFeed.activationId === latestActivationId &&
    !canonicalSnapshot.isError &&
    !transitionError;
  const feedRuntime = useMemo<TeamsRuntimeState | null>(() => {
    if (usesMockBackend || !acceptedFeed) return null;
    return {
      ...mapTeamsFeedToRuntimeState(acceptedFeed.feed, address ?? null, {
        actionStateTrusted,
        walletChainId: chainId,
      }),
      backend: "feed",
      feed: acceptedFeed.feed,
    };
  }, [
    acceptedFeed,
    actionStateTrusted,
    address,
    chainId,
    usesMockBackend,
  ]);

  if (usesMockBackend) {
    return {
      ...mockQuery,
      backend: "mock" as const,
      isRefreshing: mockQuery.isFetching,
      lastUpdatedAt: mockQuery.data?.data.generatedAt ?? null,
      readStatus: "current" as const,
      warning: null,
      writeFeed: null,
    };
  }

  const feedError = getTeamsReadError({
    canonicalSnapshotError: canonicalSnapshot.error,
    canonicalSnapshotFailed: canonicalSnapshot.isError,
    feedError: teamsFeed.error,
    feedFailed: teamsFeed.isError,
    hasAcceptedFeed: Boolean(feedRuntime),
    isLoading: teamsFeed.isLoading || canonicalSnapshot.isLoading,
    publicClientAvailable: Boolean(mainnetPublicClient),
  });
  const warning = feedRuntime
    ? getTeamsReadWarning({
        canonicalSnapshotError: canonicalSnapshot.isError
          ? canonicalSnapshot.error
          : null,
        feedError: teamsFeed.isError ? teamsFeed.error : null,
        latestFeedVerified,
        publicClientAvailable: Boolean(mainnetPublicClient),
        transitionError,
      })
    : null;
  const readStatus = feedRuntime
    ? warning
      ? ("stale" as const)
      : ("current" as const)
    : feedError
      ? ("unavailable" as const)
      : ("current" as const);

  return {
    ...teamsFeed,
    backend: "feed" as const,
    data: feedRuntime,
    error: feedError,
    isError: feedError !== null,
    isPending:
      teamsFeed.isLoading ||
      canonicalSnapshot.isLoading ||
      (!feedRuntime && !feedError),
    isLoading:
      teamsFeed.isLoading ||
      canonicalSnapshot.isLoading ||
      (!feedRuntime && !feedError),
    isRefreshing:
      teamsFeed.isFetching || canonicalSnapshot.isFetching,
    lastUpdatedAt: acceptedFeed?.snapshot.blockTimestamp ?? null,
    readStatus,
    writeFeed: actionStateTrusted ? acceptedFeed?.feed ?? null : null,
    refetch: async () => {
      await Promise.all([
        teamsFeed.refetch(),
        ...(mainnetPublicClient && latestFeed
          ? [canonicalSnapshot.refetch()]
          : []),
      ]);
    },
    warning,
  };
}

function useTeamsCanonicalSnapshot({
  activationId,
  authorityFingerprint,
  enabled,
  feed,
  previousAuthorityFingerprint,
  previousSnapshot,
  publicClient,
}: {
  activationId: number | null;
  authorityFingerprint: Hash | null;
  enabled: boolean;
  feed: TeamsFeed | null;
  previousAuthorityFingerprint: Hash | null;
  previousSnapshot: TeamsCanonicalSnapshot | null;
  publicClient: PublicClient | null;
}) {
  const transitionAuthority = getTeamsTransitionAuthority(
    authorityFingerprint,
    previousAuthorityFingerprint
  );

  return useQuery({
    queryKey: teamsKeys.canonicalSnapshot(
      authorityFingerprint,
      activationId,
      transitionAuthority
    ),
    queryFn: async (): Promise<TeamsCanonicalSnapshot> => {
      if (!publicClient || !feed) {
        throw new Error("Teams snapshot verification is unavailable.");
      }
      return readTeamsCanonicalSnapshot(
        publicClient,
        feed,
        previousSnapshot
      );
    },
    enabled:
      enabled && Boolean(publicClient && feed && activationId),
    staleTime: 15_000,
    refetchInterval: 15_000,
    retry: false,
  });
}

function getTeamsTransitionAuthority(
  authorityFingerprint: Hash | null,
  previousAuthorityFingerprint: Hash | null
): string {
  if (
    !authorityFingerprint ||
    !previousAuthorityFingerprint ||
    authorityFingerprint === previousAuthorityFingerprint
  ) {
    return "current";
  }
  return previousAuthorityFingerprint;
}

function transitionTeamsAcceptance(
  current: TeamsAcceptanceState,
  next: AcceptedTeamsFeed,
  evaluatedSnapshot: TeamsCanonicalSnapshot
): TeamsAcceptanceState {
  let transitionError: Error | null = null;
  try {
    assertTeamsSnapshotTransition(
      current.acceptedFeed?.snapshot ?? null,
      next.snapshot
    );
  } catch (error) {
    transitionError =
      error instanceof Error
        ? error
        : new Error("The Teams snapshot transition is invalid.");
  }

  return {
    acceptedFeed: transitionError
      ? current.acceptedFeed
      : next,
    evaluatedFeed: next.feed,
    evaluatedSnapshot,
    transitionError,
  };
}

function snapshotMatchesFeed(
  snapshot: TeamsCanonicalSnapshot,
  feed: TeamsFeed
): boolean {
  return (
    snapshot.blockNumber === BigInt(feed.blockNumber) &&
    snapshot.blockHash.toLowerCase() === feed.blockHash.toLowerCase()
  );
}

function getTeamsReadError({
  canonicalSnapshotError,
  canonicalSnapshotFailed,
  feedError,
  feedFailed,
  hasAcceptedFeed,
  isLoading,
  publicClientAvailable,
}: {
  canonicalSnapshotError: unknown;
  canonicalSnapshotFailed: boolean;
  feedError: unknown;
  feedFailed: boolean;
  hasAcceptedFeed: boolean;
  isLoading: boolean;
  publicClientAvailable: boolean;
}): Error | null {
  if (hasAcceptedFeed) return null;
  if (feedError instanceof Error) return feedError;
  if (feedFailed) return new Error("Unknown Teams feed error.");
  if (!publicClientAvailable) {
    return new Error(
      "Ethereum Mainnet RPC is unavailable for Teams snapshot verification."
    );
  }
  if (canonicalSnapshotError instanceof Error) {
    return canonicalSnapshotError;
  }
  if (canonicalSnapshotFailed) {
    return new Error("Unknown Teams snapshot verification error.");
  }
  if (!isLoading) {
    return new Error("No verified Teams feed payload is available.");
  }
  return null;
}

function getTeamsReadWarning({
  canonicalSnapshotError,
  feedError,
  latestFeedVerified,
  publicClientAvailable,
  transitionError,
}: {
  canonicalSnapshotError: unknown;
  feedError: unknown;
  latestFeedVerified: boolean;
  publicClientAvailable: boolean;
  transitionError: Error | null;
}): Error | null {
  if (feedError instanceof Error) return feedError;
  if (feedError) return new Error("The latest Teams feed refresh failed.");
  if (!publicClientAvailable) {
    return new Error(
      "Ethereum Mainnet RPC is unavailable. Teams actions are paused."
    );
  }
  if (canonicalSnapshotError instanceof Error) {
    return canonicalSnapshotError;
  }
  if (canonicalSnapshotError) {
    return new Error(
      "The Teams snapshot could not be verified on Ethereum Mainnet."
    );
  }
  if (transitionError) return transitionError;
  if (!latestFeedVerified) {
    return new Error(
      "The latest Teams feed is still awaiting canonical verification. Actions are paused."
    );
  }
  return null;
}

export function useTeamsDebugActions() {
  const queryClient = useQueryClient();

  return {
    async applyPreset(id: TeamsMockScenarioId) {
      setMockTeamsPreset(id);
      await invalidateTeamsQueries(queryClient);
    },
    async patchAdmin(patch: Record<string, unknown>) {
      patchMockTeamsAdmin(patch);
      await invalidateTeamsQueries(queryClient);
    },
    async patchBonus(patch: Record<string, unknown>) {
      patchMockTeamsBonus(patch);
      await invalidateTeamsQueries(queryClient);
    },
    async patchFundingApproval(approvalId: string, patch: Record<string, unknown>) {
      patchMockTeamsFundingApproval(approvalId, patch);
      await invalidateTeamsQueries(queryClient);
    },
    async patchTeam(teamId: TeamId, patch: Record<string, unknown>) {
      patchMockTeamsTeam(teamId, patch);
      await invalidateTeamsQueries(queryClient);
    },
    async replaceTeam(team: TeamRecord) {
      replaceMockTeamsTeam(team);
      await invalidateTeamsQueries(queryClient);
    },
    async reset() {
      resetMockTeamsStore();
      await invalidateTeamsQueries(queryClient);
    },
    async setAdminVisible(enabled: boolean) {
      setMockTeamsAdminVisible(enabled);
      await invalidateTeamsQueries(queryClient);
    },
    async setBonusState(mode: TeamsBonusDebugState) {
      setMockTeamsSelectedTeamBonusState(mode);
      await invalidateTeamsQueries(queryClient);
    },
    async setCurrentPeriod(period: number | null) {
      setMockTeamsCurrentPeriod(period);
      await invalidateTeamsQueries(queryClient);
    },
    async setEmpty(value: boolean) {
      setMockTeamsEmpty(value);
      await invalidateTeamsQueries(queryClient);
    },
    async setFundingState(mode: TeamsFundingDebugState) {
      setMockTeamsSelectedTeamFundingState(mode);
      await invalidateTeamsQueries(queryClient);
    },
    async setLifecycle(status: TeamLifecycleStatus) {
      setMockTeamsSelectedTeamLifecycle(status);
      await invalidateTeamsQueries(queryClient);
    },
    async setLoading(value: boolean) {
      setMockTeamsLoading(value);
      await invalidateTeamsQueries(queryClient);
    },
    async setReadOnlyReason(reason: TeamReadOnlyReason | null) {
      setMockTeamsSelectedTeamReadOnlyReason(reason);
      await invalidateTeamsQueries(queryClient);
    },
    async setRevenueState(mode: TeamsRevenueDebugState) {
      setMockTeamsSelectedTeamRevenueState(mode);
      await invalidateTeamsQueries(queryClient);
    },
    async setSelectedTeam(teamId: TeamId | null) {
      setMockTeamsSelectedTeam(teamId);
      await invalidateTeamsQueries(queryClient);
    },
    async setViewerRole(role: TeamsViewerRole) {
      setMockTeamsViewerRole(role);
      await invalidateTeamsQueries(queryClient);
    },
  };
}
