// state/protocol.tsx
"use client";

import {
  createContext,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import { StyfiClient } from "@/lib/clients/styfi";
import { VeyfiClient } from "@/lib/clients/veyfi";
import { YethClient } from "@/lib/clients/yeth";
import { createMockStyfiClient } from "@/lib/clients/styfi/mock";
import { createMockVeyfiClient } from "@/lib/clients/veyfi/mock";
import { createMockYethClient } from "@/lib/clients/yeth/mock";
import { OnchainStyfiClient } from "@/lib/clients/styfi/onchain";
import { OnchainVeyfiClient } from "@/lib/clients/veyfi/onchain"; // [New]
import { OnchainYethClient } from "@/lib/clients/yeth/onchain";
import { usePublicClient, useWalletClient } from "wagmi";
import type { PublicClient } from "viem";
import { mainnet } from "wagmi/chains";
import { TestBridgeListener } from "@/components/TestBridgeListener";
import type { TeamsTestBridgeAdapter } from "@/lib/test-bridge";
import { useGlobalData } from "@/lib/hooks/useGlobalData";
import { useYethGlobalData } from "@/lib/hooks/useYethGlobalData";
import type { GlobalData } from "@/lib/schemas/global";
import type { YethGlobalData } from "@/lib/schemas/yeth-global";
import { assertProductionRuntimeInvariants } from "@/lib/runtime/invariants";
import { resolveHeaderAppKey } from "@/lib/header-nav";
import { useHostname } from "@/lib/hooks/useHostname";
import {
  patchMockTeamsAdmin,
  patchMockTeamsBonus,
  patchMockTeamsFundingApproval,
  patchMockTeamsTeam,
  resetMockTeamsStore,
  setMockTeamsCurrentPeriod,
  setMockTeamsEmpty,
  setMockTeamsLoading,
  setMockTeamsNow,
  setMockTeamsSelectedTeam,
  setMockTeamsViewerRole,
} from "@/lib/clients/teams/mock";
import type { TeamsViewerRole } from "@/lib/clients/teams/types";
import { createYbcTestBridgeAdapter } from "@/lib/clients/ybc/store";
import { createDaoTestBridgeAdapter } from "@/lib/clients/dao/store";

assertProductionRuntimeInvariants("state/protocol");

type ProtocolContextValue = {
  styfi: StyfiClient;
  veyfi: VeyfiClient;
  yeth: YethClient;
  isMock: boolean;
  usesMockBackend: boolean;
  teamsUsesMockBackend: boolean;
  ybcUsesMockBackend: boolean;
  yethUsesMockBackend: boolean;
  mainnetPublicClient: PublicClient | null;
  publicClient: PublicClient | null;
  globalData: GlobalData | null;
  yethGlobalData: YethGlobalData | null;
};

const ProtocolContext = createContext<ProtocolContextValue | null>(null);

export function ProtocolProvider({ children }: { children: ReactNode }) {
  const preferMocks =
    process.env.NEXT_PUBLIC_USE_MOCKS === "true" ||
    process.env.NEXT_PUBLIC_E2E === "true";
  const pathname = usePathname();
  const segments = useSelectedLayoutSegments();
  const hostname = useHostname();
  const appKey = resolveHeaderAppKey(pathname, segments?.[0] ?? null, hostname);
  const shouldLoadStatsData =
    !preferMocks && (appKey === "styfi" || appKey === "veyfi");
  const shouldLoadYethData = !preferMocks && appKey === "yeth";

  const mockClients = useMemo(
    () => ({
      styfi: createMockStyfiClient({ latencyMs: 600 }),
      veyfi: createMockVeyfiClient({ latencyMs: 600 }),
      yeth: createMockYethClient({ latencyMs: 300 }),
    }),
    []
  );

  const { data: globalData } = useGlobalData(shouldLoadStatsData);
  const { data: yethGlobalData } = useYethGlobalData(shouldLoadYethData);
  const { data: walletClient } = useWalletClient();
  const rpcPublicClient = usePublicClient({ chainId: mainnet.id });
  const walletChainId = walletClient?.chain?.id;

  const publicClient = useMemo<PublicClient | null>(() => {
    if (walletChainId !== mainnet.id) return null;
    return rpcPublicClient ?? null;
  }, [rpcPublicClient, walletChainId]);

  // Keep each client's read caches until its own inputs change.
  const styfi = useMemo<StyfiClient>(
    () =>
      preferMocks
        ? mockClients.styfi
        : new OnchainStyfiClient(publicClient, globalData ?? null),
    [preferMocks, mockClients.styfi, publicClient, globalData]
  );
  const veyfi = useMemo<VeyfiClient>(
    () =>
      preferMocks
        ? mockClients.veyfi
        : new OnchainVeyfiClient(publicClient, globalData ?? null),
    [preferMocks, mockClients.veyfi, publicClient, globalData]
  );
  const yeth = useMemo<YethClient>(
    () =>
      preferMocks
        ? mockClients.yeth
        : new OnchainYethClient(publicClient, yethGlobalData ?? null),
    [preferMocks, mockClients.yeth, publicClient, yethGlobalData]
  );

  const value = useMemo(() => {
    // If user wants mocks, ignore the public client
    if (preferMocks) {
      return {
        styfi,
        veyfi,
        yeth,
        isMock: true,
        usesMockBackend: true,
        teamsUsesMockBackend: true,
        ybcUsesMockBackend: true,
        yethUsesMockBackend: true,
        mainnetPublicClient: null,
        publicClient: null,
        globalData: null,
        yethGlobalData: null,
      };
    }

    return {
      styfi,
      veyfi,
      yeth,
      isMock: false,
      usesMockBackend: false,
      teamsUsesMockBackend: false,
      ybcUsesMockBackend: false,
      yethUsesMockBackend: false,
      mainnetPublicClient: rpcPublicClient ?? null,
      publicClient,
      globalData: globalData ?? null,
      yethGlobalData: yethGlobalData ?? null,
    };
  }, [
    preferMocks,
    publicClient,
    rpcPublicClient,
    globalData,
    yethGlobalData,
    styfi,
    veyfi,
    yeth,
  ]);

  const teams = useMemo<TeamsTestBridgeAdapter>(
    () => ({
      async onSetNow(timestamp) {
        setMockTeamsNow(timestamp);
      },
      async patchTeamsAdmin(patch) {
        patchMockTeamsAdmin(patch);
      },
      async patchTeamsBonus(patch) {
        patchMockTeamsBonus(patch);
      },
      async patchTeamsFundingApproval(approvalId, patch) {
        patchMockTeamsFundingApproval(approvalId, patch);
      },
      async patchTeamsTeam(teamId, patch) {
        patchMockTeamsTeam(teamId, patch);
      },
      async resetTeams() {
        resetMockTeamsStore();
      },
      async setTeamsCurrentPeriod(period) {
        setMockTeamsCurrentPeriod(period);
      },
      async setTeamsEmpty(value) {
        setMockTeamsEmpty(value);
      },
      async setTeamsLoading(value) {
        setMockTeamsLoading(value);
      },
      async setTeamsSelectedTeam(teamId) {
        setMockTeamsSelectedTeam(teamId);
      },
      async setTeamsViewerRole(role) {
        setMockTeamsViewerRole(role as TeamsViewerRole);
      },
    }),
    []
  );

  return (
    <ProtocolContext.Provider value={value}>
      {children}
      <TestBridgeListener
        styfi={value.styfi}
        veyfi={value.veyfi}
        yeth={value.yeth}
        teams={teams}
        ybc={createYbcTestBridgeAdapter()}
        dao={createDaoTestBridgeAdapter()}
        enabled={process.env.NEXT_PUBLIC_E2E === "true"}
      />
    </ProtocolContext.Provider>
  );
}

export function useProtocol() {
  const context = useContext(ProtocolContext);
  if (!context) {
    throw new Error("useProtocol must be used within a ProtocolProvider");
  }
  return context;
}

export function useOptionalProtocol() {
  return useContext(ProtocolContext);
}
