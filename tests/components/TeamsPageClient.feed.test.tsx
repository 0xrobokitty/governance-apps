import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import feedExample from "@/docs/apps/teams/onchain-integration-plan/examples/teams-feed.example.json";
import { teamsCopy } from "@/app/teams/messages";
import { mapTeamsFeedToRuntimeState } from "@/lib/clients/teams";
import { TeamsFeedSchema, type TeamsFeed } from "@/lib/schemas/teams-feed";
import { renderWithProviders } from "@/tests/test-utils";

const {
  allowanceState,
  queryState,
  runtimeState,
  walletModals,
  writes,
} = vi.hoisted(() => ({
  allowanceState: {
    current: 0n,
    listeners: new Set<() => void>(),
    refetch: vi.fn(),
  },
  queryState: {
    lastWriteFeed: null as TeamsFeed | null,
    readStatus: "current" as "current" | "stale" | "unavailable",
    warning: null as Error | null,
    writeFeed: null as TeamsFeed | null,
  },
  runtimeState: {
    current: null as ReturnType<typeof mapTeamsFeedToRuntimeState> | null,
  },
  writes: {
    approveFundingReturn: vi.fn(),
    approveRevenueDeposit: vi.fn(),
    claimBonus: vi.fn(),
    claimFunding: vi.fn(),
    depositRevenue: vi.fn(),
    returnFunding: vi.fn(),
  },
  walletModals: {
    connect: vi.fn(),
    switchChain: vi.fn(),
  },
}));

vi.mock("@/web3/wallet-ui", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/web3/wallet-ui")>();
  return {
    ...actual,
    useChainModal: () => ({
      openChainModal: walletModals.switchChain,
    }),
    useConnectModal: () => ({
      openConnectModal: walletModals.connect,
    }),
  };
});

vi.mock("@/lib/hooks/useTeams", () => ({
  teamsKeys: {
    all: ["teams"] as const,
  },
  useTeamsDebugActions: () => ({
    replaceTeam: vi.fn(),
    setSelectedTeam: vi.fn(),
  }),
  useTeamsScenarioCatalog: () => ({
    data: [],
  }),
  useTeamsState: () => ({
    backend: "feed",
    data: runtimeState.current
      ? {
          ...runtimeState.current,
          backend: "feed",
        }
      : null,
    error: null,
    isError: false,
    isLoading: runtimeState.current === null,
    isPending: runtimeState.current === null,
    isRefreshing: false,
    lastUpdatedAt: null,
    readStatus: queryState.readStatus,
    refetch: vi.fn(),
    warning: queryState.warning,
    writeFeed: queryState.writeFeed,
  }),
}));

vi.mock("@/lib/hooks/useTeamsWrites", () => ({
  useTeamsWrites: (feed: TeamsFeed | null) => {
    queryState.lastWriteFeed = feed;
    return {
      ...writes,
      state: { status: "idle" },
    };
  },
}));

vi.mock("@/lib/hooks/useTokenAllowance", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useTokenAllowance: () => ({
      data: useSyncExternalStore(
        (listener) => {
          allowanceState.listeners.add(listener);
          return () => {
            allowanceState.listeners.delete(listener);
          };
        },
        () => allowanceState.current,
        () => allowanceState.current
      ),
      isLoading: false,
      refetch: allowanceState.refetch,
    }),
  };
});

vi.mock("@/lib/hooks/useTokenBalance", () => ({
  useTokenBalance: () => ({
    data: undefined,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

function createFeedWithFinancialHistory(): TeamsFeed {
  const team = feedExample.teams[0]!;
  const currentPeriod = team.periods[0]!;
  const historicalPeriod = {
    ...currentPeriod,
    period: 1,
    startsAt: feedExample.periods.currentStartsAt - feedExample.periods.lengthSeconds,
    endsAt: feedExample.periods.currentStartsAt,
    financials: {
      revenueUsd: "100000000000000000000",
      costUsd: "30000000000000000000",
      profitUsd: "70000000000000000000",
      lossUsd: "0",
    },
    revenueDeposits: [],
    fundingApprovalIds: [],
    bonus: null,
  };
  const currentWithDistinctFinancials = {
    ...currentPeriod,
    financials: {
      revenueUsd: "125000000000000000000",
      costUsd: "50000000000000000000",
      profitUsd: "75000000000000000000",
      lossUsd: "0",
    },
  };
  const currentOnlyTeam = {
    ...team,
    index: 1,
    address: "0x4444444444444444444444444444444444444444",
    name: "Current Only",
    owner: "0x5555555555555555555555555555555555555555",
    periods: [
      {
        ...currentPeriod,
        financials: {
          revenueUsd: "7000000000000000000",
          costUsd: "3000000000000000000",
          profitUsd: "4000000000000000000",
          lossUsd: "0",
        },
        revenueDeposits: [],
        fundingApprovalIds: [],
        bonus: null,
      },
    ],
    lifetime: {
      revenueUsd: "7000000000000000000",
      costUsd: "3000000000000000000",
      profitUsd: "4000000000000000000",
      lossUsd: "0",
    },
  };

  return TeamsFeedSchema.parse({
    ...feedExample,
    periods: {
      ...feedExample.periods,
      indexed: [1, 2],
    },
    teams: [
      {
        ...team,
        periods: [historicalPeriod, currentWithDistinctFinancials],
        lifetime: {
          revenueUsd: "225000000000000000000",
          costUsd: "80000000000000000000",
          profitUsd: "145000000000000000000",
          lossUsd: "0",
        },
      },
      currentOnlyTeam,
    ],
    accountant: {
      ...feedExample.accountant,
      globalByPeriod: [
        {
          period: 1,
          financials: historicalPeriod.financials,
        },
        {
          period: 2,
          financials: currentWithDistinctFinancials.financials,
        },
      ],
      lifetime: {
        revenueUsd: "225000000000000000000",
        costUsd: "80000000000000000000",
        profitUsd: "145000000000000000000",
        lossUsd: "0",
      },
    },
    events: {
      ...feedExample.events,
      teamCount: 2,
    },
  });
}

function createFeedWithReturnableFunding(): TeamsFeed {
  const feed = createFeedWithFinancialHistory();
  const approval = feed.fundingApprovals[0]!;
  const txHash =
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  return TeamsFeedSchema.parse({
    ...feed,
    fundingApprovals: [
      {
        ...approval,
        used: "1000000",
        claimable: "49000000",
        averageCostPriceUsd: "1000000000000000000",
        claims: [
          {
            id: `${txHash}-1`,
            approvalId: approval.id,
            team: approval.team,
            period: approval.period,
            token: approval.token,
            amount: "1000000",
            costUsd: "1000000000000000000",
            vest: null,
            recipient:
              "0x9999999999999999999999999999999999999999",
            txHash,
            blockNumber: feed.blockNumber,
            logIndex: 1,
            timestamp: feed.generatedAt,
          },
        ],
      },
    ],
    events: {
      ...feed.events,
      fundingClaimCount: 1,
    },
  });
}

function createFeedWithTokenDust(): TeamsFeed {
  const payload = structuredClone(feedExample) as unknown as TeamsFeed;
  const team = payload.teams[0]!;
  const period = team.periods[0]!;
  const approval = payload.fundingApprovals[0]!;
  const bonusToken = Object.values(payload.tokens).find(
    (token) => token.symbol === "YFI"
  )!;

  approval.token = bonusToken.address;
  approval.amount = "2";
  approval.used = "1";
  approval.claimable = "1";
  approval.claims = [
    {
      id: "claim-dust",
      approvalId: approval.id,
      team: approval.team,
      period: approval.period,
      token: bonusToken.address,
      amount: "1",
      costUsd: "1",
      vest: null,
      recipient: team.owner,
      txHash:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      blockNumber: payload.blockNumber,
      logIndex: 0,
      timestamp: payload.generatedAt,
    },
  ];
  approval.returns = [];
  period.revenueDeposits = period.revenueDeposits.map((deposit, index) =>
    index === 0 ? { ...deposit, amount: "1" } : deposit
  );
  period.bonus = {
    ...period.bonus!,
    claimableYfi: "1",
    teamAmountYfi: "1",
    ybcAmountYfi: "0",
  };
  payload.events.fundingClaimCount = 1;

  return TeamsFeedSchema.parse(payload);
}

function createFeedWithSharedOracleConverter(): TeamsFeed {
  const payload = structuredClone(feedExample) as unknown as TeamsFeed;
  const token = Object.values(payload.tokens).find(
    (candidate) => candidate.symbol === "USDC"
  )!;
  token.converter = token.priceOracle;
  return TeamsFeedSchema.parse(payload);
}

describe("TeamsPageClient feed mode", () => {
  beforeEach(() => {
    const feed = createFeedWithFinancialHistory();
    runtimeState.current = mapTeamsFeedToRuntimeState(feed);
    queryState.lastWriteFeed = null;
    queryState.readStatus = "current";
    queryState.warning = null;
    queryState.writeFeed = feed;
    allowanceState.current = 0n;
    vi.clearAllMocks();
    allowanceState.refetch.mockReset().mockImplementation(async () => {
      for (const listener of allowanceState.listeners) {
        listener();
      }
    });
    writes.approveFundingReturn.mockReset().mockResolvedValue(true);
    writes.approveRevenueDeposit.mockReset().mockResolvedValue(true);
    writes.claimBonus.mockReset().mockResolvedValue(true);
    writes.claimFunding.mockReset().mockResolvedValue(true);
    writes.depositRevenue.mockReset().mockResolvedValue(true);
    writes.returnFunding.mockReset().mockResolvedValue(true);
    window.history.replaceState(null, "", "/teams");
    window.localStorage.clear();
  });

  it("renders feed data without mock controls and opens a workspace locally", async () => {
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });

    expect(screen.queryByRole("button", { name: /debug/i })).not.toBeInTheDocument();
    const openTeamLink = screen.getByRole("link", {
      name: "Open Example Team details",
    });
    expect(openTeamLink).toHaveAttribute(
      "href",
      "/teams?section=overview&team=0x1111111111111111111111111111111111111111"
    );
    expect(screen.getAllByText("$125").length).toBeGreaterThan(0);

    await user.click(openTeamLink);

    expect(
      await screen.findByRole("heading", { name: "Example Team", level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: teamsCopy.workspace.financialHistory.title,
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(teamsCopy.directory.scope.periodLabel(1)).length
    ).toBeGreaterThan(0);
    const financialHistoryCard = screen
      .getByRole("heading", {
        name: teamsCopy.workspace.financialHistory.title,
      })
      .parentElement?.parentElement;
    const historicalRow = within(financialHistoryCard!).getByText(
      teamsCopy.directory.scope.periodLabel(1)
    ).closest("tr");
    expect(historicalRow).not.toHaveClass(
      "hover:bg-surface-secondary/60",
      "cursor-pointer"
    );
    expect(historicalRow).not.toHaveAttribute("tabindex");
    const revenueLedger = document.getElementById("revenue");
    expect(revenueLedger).not.toBeNull();
    const transactionHash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const depositor =
      "0x3333333333333333333333333333333333333333";
    expect(
      within(revenueLedger!).getByRole("link", {
        name: `View Ethereum transaction ${transactionHash} on Etherscan`,
      })
    ).toHaveAttribute(
      "href",
      `https://etherscan.io/tx/${transactionHash}`
    );
    expect(
      within(revenueLedger!).getByRole("link", {
        name: `View Ethereum address ${depositor} on Etherscan`,
      })
    ).toHaveAttribute(
      "href",
      `https://etherscan.io/address/${depositor}`
    );
    expect(
      within(revenueLedger!).queryByText(
        `${transactionHash}-12`
      )
    ).not.toBeInTheDocument();
    expect(
      within(revenueLedger!).getByText(
        teamsCopy.revenue.history.logIndex(12)
      )
    ).toBeInTheDocument();
    expect(
      within(revenueLedger!).getByText("Feb 5, 2026")
    ).toHaveAttribute("datetime", "2026-02-05T00:06:40.000Z");
    expect(
      within(revenueLedger!).getAllByText(teamsCopy.revenue.history.direct)
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: teamsCopy.revenue.unavailable.connectCta })
    ).toBeEnabled();
    expect(
      screen.getByText(teamsCopy.revenue.unavailable.connectBody)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.revenue.unavailable.connectCta,
      })
    );
    expect(walletModals.connect).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain(
      "team=0x1111111111111111111111111111111111111111"
    );
  });

  it("renders positive token dust without hiding actionable claim and return state", async () => {
    const feed = createFeedWithTokenDust();
    runtimeState.current = mapTeamsFeedToRuntimeState(
      feed,
      feed.teams[0]!.owner,
      { walletChainId: 1 }
    );
    queryState.writeFeed = feed;
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });
    await user.click(
      screen.getByRole("link", { name: "Open Example Team details" })
    );

    const revenueSection = within(document.getElementById("revenue")!);
    const fundingSection = within(document.getElementById("funding")!);
    const bonusSection = within(document.getElementById("bonus")!);

    expect(revenueSection.getAllByText("<0.0001 USDC").length).toBeGreaterThan(0);
    expect(fundingSection.getAllByText("<0.0001 YFI").length).toBeGreaterThan(0);
    expect(bonusSection.getAllByText("<0.0001 YFI").length).toBeGreaterThan(0);
    expect(
      fundingSection.getByRole("button", {
        name: "Use Approval #0 in claim flow",
      })
    ).toBeEnabled();
    expect(
      fundingSection.getByRole("button", {
        name: "Use Approval #0 in return flow",
      })
    ).toBeEnabled();
  });

  it("shows a shared oracle-converter contract as a linked conversion route", async () => {
    const feed = createFeedWithSharedOracleConverter();
    const converter = Object.values(feed.tokens).find(
      (token) => token.symbol === "USDC"
    )!.converter!;
    runtimeState.current = mapTeamsFeedToRuntimeState(
      feed,
      feed.teams[0]!.owner,
      { walletChainId: 1 }
    );
    queryState.writeFeed = feed;
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });
    await user.click(
      screen.getByRole("link", { name: "Open Example Team details" })
    );

    const revenueSection = within(document.getElementById("revenue")!);
    expect(
      revenueSection.getAllByText(
        teamsCopy.revenue.preview.protocolConverter
      ).length
    ).toBeGreaterThan(0);
    expect(
      revenueSection.getAllByRole("link", {
        name: `View Ethereum address ${converter} on Etherscan`,
      }).length
    ).toBeGreaterThan(0);
    expect(revenueSection.queryByText(/USDC ->/)).not.toBeInTheDocument();
  });

  it("opens the chain switch flow for a connected non-mainnet wallet", async () => {
    const feed = createFeedWithFinancialHistory();
    runtimeState.current = mapTeamsFeedToRuntimeState(
      feed,
      "0x9999999999999999999999999999999999999999",
      { walletChainId: 137 }
    );
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });
    await user.click(
      screen.getByRole("link", { name: "Open Example Team details" })
    );
    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.revenue.unavailable.networkCta,
      })
    );

    expect(walletModals.switchChain).toHaveBeenCalledTimes(1);
    expect(walletModals.connect).not.toHaveBeenCalled();
  });

  it("keeps producer values visible while canonical verification pauses deposits", async () => {
    const feed = createFeedWithFinancialHistory();
    runtimeState.current = mapTeamsFeedToRuntimeState(
      feed,
      feed.teams[0]!.owner,
      {
        actionStateTrusted: false,
        walletChainId: 1,
      }
    );
    queryState.readStatus = "stale";
    queryState.warning = new Error(
      "The snapshot block could not be verified."
    );
    queryState.writeFeed = null;
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });
    await user.click(
      screen.getByRole("link", { name: "Open Example Team details" })
    );

    expect(queryState.lastWriteFeed).toBeNull();
    expect(
      screen.getByText("The snapshot block could not be verified.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(teamsCopy.revenue.unavailable.untrustedTitle)
    ).toBeInTheDocument();
    expect(
      screen.getByText(teamsCopy.revenue.unavailable.untrustedBody)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(teamsCopy.revenue.unavailable.restrictedBody)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", {
        name: teamsCopy.revenue.form.amountLabel,
      })
    ).not.toBeInTheDocument();
    const disabledDeposit = screen.getByRole("button", {
      name: teamsCopy.revenue.unavailable.untrustedCta,
    });
    expect(disabledDeposit).toBeDisabled();
    expect(
      screen.queryByRole("button", {
        name: /Use .* in claim flow/i,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Use .* in return flow/i,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(teamsCopy.funding.claimForm.recipient)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(teamsCopy.funding.claimForm.amount)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(teamsCopy.funding.returnForm.amount)
    ).not.toBeInTheDocument();
    const revenueSection = within(document.getElementById("revenue")!);
    const fundingSection = within(document.getElementById("funding")!);
    const bonusSection = within(document.getElementById("bonus")!);
    expect(revenueSection.getAllByText("125 USDC").length).toBeGreaterThan(0);
    const disabledClaim = fundingSection.getByRole("button", {
      name: teamsCopy.funding.claimForm.disabledPermissionCta,
    });
    const disabledReturn = fundingSection.getByRole("button", {
      name: teamsCopy.funding.returnForm.disabledPermissionCta,
    });
    const disabledBonus = bonusSection.getByRole("button", {
      name: teamsCopy.bonus.action.permissionCta,
    });
    expect(disabledClaim).toBeDisabled();
    expect(disabledReturn).toBeDisabled();
    expect(disabledBonus).toBeDisabled();
    await user.click(disabledDeposit);
    await user.click(disabledClaim);
    await user.click(disabledReturn);
    await user.click(disabledBonus);
    expect(writes.approveRevenueDeposit).not.toHaveBeenCalled();
    expect(writes.approveFundingReturn).not.toHaveBeenCalled();
    expect(writes.depositRevenue).not.toHaveBeenCalled();
    expect(writes.claimFunding).not.toHaveBeenCalled();
    expect(writes.returnFunding).not.toHaveBeenCalled();
    expect(writes.claimBonus).not.toHaveBeenCalled();
    expect(
      screen.queryByText(teamsCopy.revenue.success.title)
    ).not.toBeInTheDocument();
  });

  it("retains a route-selected team while the feed arrives asynchronously", async () => {
    const feed = createFeedWithFinancialHistory();
    runtimeState.current = null;
    window.history.replaceState(
      null,
      "",
      "/teams?section=revenue&team=0x1111111111111111111111111111111111111111"
    );
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const view = renderWithProviders(<TeamsPageClient />, { autoConnect: false });

    expect(
      await screen.findByText(teamsCopy.workspace.loadingTitle)
    ).toBeInTheDocument();

    runtimeState.current = mapTeamsFeedToRuntimeState(feed);
    view.rerender(<TeamsPageClient />);

    expect(
      await screen.findByRole("heading", { name: "Example Team", level: 1 })
    ).toBeInTheDocument();
    expect(window.location.search).toContain("section=revenue");
  });

  it("preserves an authorized admin deep link until viewer readiness resolves", async () => {
    const feed = createFeedWithFinancialHistory();
    const operator = "0x9999999999999999999999999999999999999999";
    const operatorFeed = TeamsFeedSchema.parse({
      ...feed,
      revenueRecipient: {
        ...feed.revenueRecipient,
        operator,
      },
    });
    runtimeState.current = null;
    window.history.replaceState(
      null,
      "",
      "/teams?trace=1&section=admin"
    );
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const view = renderWithProviders(<TeamsPageClient />, {
      autoConnect: false,
    });

    expect(
      await screen.findByText(teamsCopy.directory.loadingTitle)
    ).toBeInTheDocument();
    expect(window.location.search).toBe("?trace=1&section=admin");
    expect(replaceState).not.toHaveBeenCalled();

    runtimeState.current = mapTeamsFeedToRuntimeState(operatorFeed, operator, {
      walletChainId: 1,
    });
    view.rerender(<TeamsPageClient />);

    expect(
      await screen.findByRole("heading", {
        name: teamsCopy.admin.title,
        level: 1,
      })
    ).toBeInTheDocument();
    expect(
      within(document.getElementById("admin")!).queryByRole("heading", {
        name: teamsCopy.admin.title,
      })
    ).not.toBeInTheDocument();
    const hierarchy = screen.getByRole("navigation", {
      name: "Teams hierarchy",
    });
    expect(
      within(hierarchy).getByRole("link", { name: teamsCopy.app.routeKey })
    ).toHaveAttribute("href", "/teams");
    expect(within(hierarchy).getByText("admin")).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(window.location.search).toBe("?trace=1&section=admin");
  });

  it("canonicalizes an unauthorized admin deep link after viewer readiness resolves", async () => {
    const feed = createFeedWithFinancialHistory();
    runtimeState.current = null;
    window.history.replaceState(
      null,
      "",
      "/teams?trace=1&section=admin"
    );
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const view = renderWithProviders(<TeamsPageClient />, {
      autoConnect: false,
    });

    expect(
      await screen.findByText(teamsCopy.directory.loadingTitle)
    ).toBeInTheDocument();
    expect(window.location.search).toBe("?trace=1&section=admin");

    runtimeState.current = mapTeamsFeedToRuntimeState(feed);
    view.rerender(<TeamsPageClient />);

    await waitFor(() => {
      expect(window.location.search).toBe("?trace=1");
      expect(
        screen.getByRole("heading", { name: teamsCopy.directory.title })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: teamsCopy.navigation.admin })
      ).not.toBeInTheDocument();
    });
  });

  it("refetches a confirmed exact allowance before enabling a live revenue deposit", async () => {
    const feed = createFeedWithFinancialHistory();
    const viewerAddress =
      "0x9999999999999999999999999999999999999999";
    runtimeState.current = mapTeamsFeedToRuntimeState(feed, viewerAddress, {
      walletChainId: 1,
    });
    writes.approveRevenueDeposit.mockImplementation(async () => {
      allowanceState.current = 1_000_000n;
      return true;
    });
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });
    await user.click(
      screen.getByRole("link", { name: "Open Example Team details" })
    );
    await user.type(
      screen.getByRole("textbox", {
        name: teamsCopy.revenue.form.amountLabel,
      }),
      "1"
    );

    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.revenue.form.approve,
      })
    );

    expect(writes.approveRevenueDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ address: feed.teams[0]!.address }),
      Object.values(feed.tokens).find((token) => token.kind === "revenue")!
        .address,
      "1"
    );
    expect(allowanceState.refetch).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", {
        name: teamsCopy.revenue.form.submit,
      })
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.revenue.form.submit,
      })
    );

    expect(writes.depositRevenue).toHaveBeenCalledWith(
      expect.objectContaining({ address: feed.teams[0]!.address }),
      Object.values(feed.tokens).find((token) => token.kind === "revenue")!
        .address,
      "1",
      6
    );
  });

  it("keeps a live revenue deposit blocked when its approval fails", async () => {
    const feed = createFeedWithFinancialHistory();
    runtimeState.current = mapTeamsFeedToRuntimeState(
      feed,
      "0x9999999999999999999999999999999999999999",
      { walletChainId: 1 }
    );
    writes.approveRevenueDeposit.mockResolvedValue(false);
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });
    await user.click(
      screen.getByRole("link", { name: "Open Example Team details" })
    );
    await user.type(
      screen.getByRole("textbox", {
        name: teamsCopy.revenue.form.amountLabel,
      }),
      "1"
    );
    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.revenue.form.approve,
      })
    );

    expect(writes.approveRevenueDeposit).toHaveBeenCalledTimes(1);
    expect(allowanceState.refetch).not.toHaveBeenCalled();
    expect(writes.depositRevenue).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: teamsCopy.revenue.form.approve,
      })
    ).toBeEnabled();
  });

  it("refetches a confirmed funding allowance before a separate return submission", async () => {
    const feed = createFeedWithReturnableFunding();
    const viewerAddress =
      "0x9999999999999999999999999999999999999999";
    runtimeState.current = mapTeamsFeedToRuntimeState(feed, viewerAddress, {
      walletChainId: 1,
    });
    const selectedTeam = runtimeState.current.data.teams[0]!;
    const selectedApproval = selectedTeam.fundingApprovals[0]!;
    writes.approveFundingReturn.mockImplementation(async () => {
      allowanceState.current = 1_000_000n;
      return true;
    });
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });
    await user.click(
      screen.getByRole("link", { name: "Open Example Team details" })
    );
    await user.type(
      screen.getByLabelText(teamsCopy.funding.returnForm.amount),
      "1"
    );

    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.funding.returnForm.approve,
      })
    );

    expect(writes.approveFundingReturn).toHaveBeenCalledWith(
      selectedTeam,
      selectedApproval,
      "1"
    );
    expect(writes.returnFunding).not.toHaveBeenCalled();
    expect(allowanceState.refetch).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", {
        name: teamsCopy.funding.returnForm.submit,
      })
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.funding.returnForm.submit,
      })
    );

    expect(writes.returnFunding).toHaveBeenCalledWith(
      selectedTeam,
      selectedApproval,
      "1"
    );
  });

  it("keeps a funding return blocked when its approval fails or is rejected", async () => {
    const feed = createFeedWithReturnableFunding();
    runtimeState.current = mapTeamsFeedToRuntimeState(
      feed,
      "0x9999999999999999999999999999999999999999",
      { walletChainId: 1 }
    );
    writes.approveFundingReturn.mockResolvedValue(false);
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });
    await user.click(
      screen.getByRole("link", { name: "Open Example Team details" })
    );
    await user.type(
      screen.getByLabelText(teamsCopy.funding.returnForm.amount),
      "1"
    );
    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.funding.returnForm.approve,
      })
    );

    expect(writes.approveFundingReturn).toHaveBeenCalledTimes(1);
    expect(allowanceState.refetch).not.toHaveBeenCalled();
    expect(writes.returnFunding).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: teamsCopy.funding.returnForm.approve,
      })
    ).toBeEnabled();
  });

  it("does not retarget a pending deposit when workspace selection changes", async () => {
    const feed = createFeedWithFinancialHistory();
    runtimeState.current = mapTeamsFeedToRuntimeState(
      feed,
      "0x9999999999999999999999999999999999999999",
      { walletChainId: 1 }
    );
    allowanceState.current = 2n ** 256n - 1n;
    let finishDeposit: (() => void) | undefined;
    writes.depositRevenue.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishDeposit = () => resolve(true);
        })
    );
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });
    await user.click(
      screen.getByRole("link", { name: "Open Example Team details" })
    );
    await user.type(
      screen.getByRole("textbox", {
        name: teamsCopy.revenue.form.amountLabel,
      }),
      "1"
    );
    expect(
      screen.getByText(teamsCopy.revenue.preview.quoteUnavailable)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: teamsCopy.revenue.form.submit })
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: teamsCopy.revenue.form.submit })
    );

    expect(writes.depositRevenue).toHaveBeenCalledTimes(1);
    expect(writes.depositRevenue.mock.calls[0]?.[0].address).toBe(
      "0x1111111111111111111111111111111111111111"
    );

    await user.click(
      screen.getByRole("link", { name: teamsCopy.app.routeKey })
    );
    await user.click(
      screen.getByRole("link", { name: "Open Current Only details" })
    );
    expect(
      await screen.findByRole("heading", { name: "Current Only", level: 1 })
    ).toBeInTheDocument();
    expect(writes.depositRevenue.mock.calls[0]?.[0].address).toBe(
      "0x1111111111111111111111111111111111111111"
    );

    finishDeposit?.();
    await waitFor(() => {
      expect(writes.depositRevenue).toHaveBeenCalledTimes(1);
    });
  });

  it("contains a rejected bonus callback at the live action boundary", async () => {
    const feed = createFeedWithFinancialHistory();
    runtimeState.current = mapTeamsFeedToRuntimeState(
      feed,
      feed.teams[0]!.owner,
      { walletChainId: 1 }
    );
    writes.claimBonus.mockRejectedValue(new Error("bonus callback failed"));
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });
    await user.click(
      screen.getByRole("link", { name: "Open Example Team details" })
    );
    await user.click(
      within(document.getElementById("bonus")!).getByRole("button", {
        name: teamsCopy.bonus.action.claimCta,
      })
    );

    await waitFor(() => {
      expect(writes.claimBonus).toHaveBeenCalledWith(
        expect.objectContaining({
          address: feed.teams[0]!.address,
        }),
        feed.teams[0]!.owner
      );
    });
  });

  it("switches directory financial scope between current, historical, and all-time values", async () => {
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });

    await screen.findByRole("link", { name: "Open Example Team details" });

    let table = screen.getByRole("table");
    expect(screen.getByText("Current period #2 financials")).toBeInTheDocument();
    expect(within(table).getByText("$125")).toBeInTheDocument();

    await user.click(
      screen.getByRole("tab", {
        name: teamsCopy.directory.scope.lifetime,
      })
    );

    table = screen.getByRole("table");
    expect(screen.getByText("All-time financials")).toBeInTheDocument();
    expect(within(table).getByText("$225")).toBeInTheDocument();

    await user.click(
      screen.getByRole("tab", {
        name: teamsCopy.directory.scope.periodLabel(1),
      })
    );

    table = screen.getByRole("table");
    expect(screen.getByText("Period #1 financials")).toBeInTheDocument();
    expect(within(table).getByText("$100")).toBeInTheDocument();
    expect(
      within(table).getAllByText(
        teamsCopy.directory.scope.missingPeriodValue
      ).length
    ).toBeGreaterThan(0);
  });

  it("keeps legacy mixed-unit feeds usable while financial panels fail closed", async () => {
    const feed = createFeedWithFinancialHistory();
    const team = feed.teams[0]!;
    const period = team.periods.find(
      (entry) => entry.period === feed.periods.current
    )!;
    const mixedFinancials = {
      revenueUsd: "132098434249930278236272",
      costUsd: "456483000000",
      profitUsd: "132098434249473795236272",
      lossUsd: "0",
    };
    runtimeState.current = mapTeamsFeedToRuntimeState(
      TeamsFeedSchema.parse({
        ...feed,
        version: 1,
        units: undefined,
        teams: [
          {
            ...team,
            periods: [{ ...period, financials: mixedFinancials }],
            lifetime: mixedFinancials,
          },
        ],
        accountant: {
          globalByPeriod: [{ period: 2, financials: mixedFinancials }],
          lifetime: mixedFinancials,
        },
        events: {
          ...feed.events,
          teamCount: 1,
        },
      })
    );
    const { TeamsPageClient } = await import("@/app/teams/TeamsPageClient");

    renderWithProviders(<TeamsPageClient />, { autoConnect: false });

    expect(
      screen.getAllByText(teamsCopy.financialData.unavailableTitle).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Open Example Team details" })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("$132,098,434,249,930,278.24")
    ).not.toBeInTheDocument();
  });
});
