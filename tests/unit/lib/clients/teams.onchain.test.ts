import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import feedExample from "@/docs/apps/teams/onchain-integration-plan/examples/teams-feed.example.json";
import {
  deriveTeamsViewerForTeam,
  getTeamsDepositReadiness,
  isTeamsFundingApprovalClaimable,
  isTeamsFundingApprovalReturnable,
  mapTeamsFeedToPageData,
  mapTeamsFeedToRuntimeState,
  OnchainTeamsClient,
} from "@/lib/clients/teams";
import {
  TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK,
  TeamsFeedSchema,
  type TeamsFeed,
} from "@/lib/schemas/teams-feed";

function parseFeed(value: unknown): TeamsFeed {
  return TeamsFeedSchema.parse(value);
}

describe("Teams feed mapper", () => {
  it("maps a feed into the existing observer page state", () => {
    const data = mapTeamsFeedToPageData(parseFeed(feedExample));
    const team = data.teams[0]!;

    expect(data.currentPeriod).toBe(2);
    expect(data.viewer.role).toBe("observer");
    expect(data.viewer.canDepositRevenue).toBe(false);
    expect(data.selectedTeamId).toBeNull();
    expect(data.totals.activeTeamCount).toBe(1);
    expect(data.totals.currentPeriod.revenueUsd).toBe("125");
    expect(team.currentPeriod.profitUsd).toBe("75");
    expect(team.financialPeriods).toEqual([
      expect.objectContaining({
        period: 2,
        financials: expect.objectContaining({
          revenueUsd: "125",
          costUsd: "50",
        }),
      }),
    ]);
    expect(team.revenueHistory[0]).toEqual(
      expect.objectContaining({
        amount: "125",
        creditedUsd: "125",
        symbol: "USDC",
        converterAddress: null,
        convertedToSymbol: null,
        txHash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        logIndex: 12,
      })
    );
    expect(team.revenueOptions[0]).toMatchObject({
      isConvertible: false,
      converterAddress: null,
      convertToSymbol: null,
    });
  });

  it("fails pre-correction v2 financials closed even for preconstructed data", () => {
    const preCorrectionFeed = structuredClone(
      feedExample
    ) as unknown as TeamsFeed;
    preCorrectionFeed.blockNumber =
      TEAMS_FEED_CORRECTED_ACCOUNTING_BLOCK - 1;

    const data = mapTeamsFeedToPageData(preCorrectionFeed);

    expect(data.financialData).toEqual({
      status: "unavailable",
      source: "feed",
      reason: "incompatible-feed",
      feedVersion: 2,
    });
    expect(data.teams[0]?.currentPeriod.revenueUsd).toBe("0.00");
  });

  it("treats a shared price-oracle and converter contract as a conversion route", () => {
    const sourceToken = Object.values(feedExample.tokens).find(
      (token) => token.symbol === "USDC"
    )!;
    const feed = parseFeed({
      ...feedExample,
      tokens: {
        ...feedExample.tokens,
        [sourceToken.address]: {
          ...sourceToken,
          converter: sourceToken.priceOracle,
        },
      },
    });
    const team = mapTeamsFeedToPageData(feed).teams[0]!;

    expect(team.revenueOptions[0]).toMatchObject({
      isConvertible: true,
      converterAddress: sourceToken.priceOracle,
      convertToSymbol: null,
    });
    expect(team.revenueHistory[0]).toMatchObject({
      converterAddress: sourceToken.priceOracle,
      convertedToSymbol: null,
    });
  });

  it("keeps a null converter mapping on the direct route", () => {
    const team = mapTeamsFeedToPageData(parseFeed(feedExample)).teams[0]!;

    expect(team.revenueOptions[0]).toMatchObject({
      isConvertible: false,
      converterAddress: null,
      convertToSymbol: null,
    });
    expect(team.revenueHistory[0]).toMatchObject({
      converterAddress: null,
      convertedToSymbol: null,
    });
  });

  it("keeps a non-token converter as a contract address without inventing an output token", () => {
    const converter = "0x7777777777777777777777777777777777777777";
    const sourceToken = Object.values(feedExample.tokens).find(
      (token) => token.symbol === "USDC"
    )!;
    const feed = parseFeed({
      ...feedExample,
      tokens: {
        ...feedExample.tokens,
        [sourceToken.address]: {
          ...sourceToken,
          converter,
        },
      },
    });
    const team = mapTeamsFeedToPageData(feed).teams[0]!;

    expect(
      Object.values(feed.tokens).some(
        (token) => token.address.toLowerCase() === converter.toLowerCase()
      )
    ).toBe(false);
    expect(team.revenueOptions[0]).toMatchObject({
      isConvertible: true,
      converterAddress: converter,
      convertToSymbol: null,
    });
    expect(team.revenueHistory[0]).toMatchObject({
      converterAddress: converter,
      convertedToSymbol: null,
    });
  });

  it("fails legacy mixed-unit financials closed without hiding nonfinancial data", () => {
    const sourceTeam = feedExample.teams[0]!;
    const sourcePeriod = sourceTeam.periods[0]!;
    const mixedPeriod = {
      ...sourcePeriod,
      financials: {
        revenueUsd: "132098434249930278236272",
        costUsd: "456483000000",
        profitUsd: "132098434249473795236272",
        lossUsd: "0",
      },
    };
    const legacyFeed = parseFeed({
      ...feedExample,
      version: 1,
      units: undefined,
      teams: [
        {
          ...sourceTeam,
          periods: [
            {
              ...sourcePeriod,
              period: 0,
              financials: {
                revenueUsd: "501213450000",
                costUsd: "358539000000",
                profitUsd: "142674450000",
                lossUsd: "0",
              },
              revenueDeposits: [],
              fundingApprovalIds: [],
              bonus: null,
            },
            mixedPeriod,
          ],
          lifetime: mixedPeriod.financials,
        },
      ],
      accountant: {
        globalByPeriod: [
          { period: 0, financials: sourceTeam.periods[0]!.financials },
          { period: 2, financials: mixedPeriod.financials },
        ],
        lifetime: mixedPeriod.financials,
      },
    });

    const data = mapTeamsFeedToPageData(legacyFeed);
    const team = data.teams[0]!;

    expect(data.financialData).toEqual({
      status: "unavailable",
      source: "feed",
      reason: "incompatible-feed",
      feedVersion: 1,
    });
    expect(team.currentPeriod).toEqual({
      revenueUsd: "0.00",
      costUsd: "0.00",
      profitUsd: "0.00",
      lossUsd: "0.00",
    });
    expect(team.name).toBe("Example Team");
    expect(team.revenueHistory[0]?.amount).toBe("125");
    expect(team.revenueOptions[0]).toMatchObject({
      symbol: "USDC",
      previewAmount: null,
      estimatedCreditUsd: null,
    });
  });

  it("overlays the connected team owner perspective with client-derived write readiness", () => {
    const data = mapTeamsFeedToPageData(
      parseFeed(feedExample),
      "0x2222222222222222222222222222222222222222",
      { walletChainId: 1 }
    );

    expect(data.viewer.role).toBe("team-owner");
    expect(data.viewer.teamId).toBe("example-team");
    expect(data.viewer.walletStatus).toBe("mainnet");
    expect(data.viewer.canDepositRevenue).toBe(false);

    const selectedViewer = deriveTeamsViewerForTeam(
      data.viewer,
      data.teams[0]!,
      data.currentPeriod
    );
    expect(selectedViewer.canDepositRevenue).toBe(true);
    expect(selectedViewer.canClaimFunding).toBe(true);
    expect(selectedViewer.canReturnFunding).toBe(false);
    expect(selectedViewer.canClaimBonus).toBe(true);
    expect(
      getTeamsDepositReadiness(data.teams[0]!, selectedViewer, true)
    ).toEqual({
      state: "ready",
      canSubmit: true,
    });
  });

  it("blocks client-derived write readiness on the wrong network", () => {
    const data = mapTeamsFeedToPageData(
      parseFeed(feedExample),
      "0x2222222222222222222222222222222222222222",
      { walletChainId: 137 }
    );

    expect(data.viewer.role).toBe("team-owner");
    expect(data.viewer.walletStatus).toBe("switch-mainnet");
    expect(data.viewer.canDepositRevenue).toBe(false);
    const selectedViewer = deriveTeamsViewerForTeam(
      data.viewer,
      data.teams[0]!,
      data.currentPeriod
    );
    expect(selectedViewer.canClaimFunding).toBe(false);
    expect(selectedViewer.canReturnFunding).toBe(false);
    expect(selectedViewer.canClaimBonus).toBe(false);
    expect(
      getTeamsDepositReadiness(data.teams[0]!, selectedViewer, true)
    ).toEqual({
      state: "switch-mainnet",
      canSubmit: false,
    });
  });

  it("keeps a connected wallet blocked until mainnet is positively resolved", () => {
    const data = mapTeamsFeedToPageData(
      parseFeed(feedExample),
      "0x2222222222222222222222222222222222222222"
    );
    const selectedViewer = deriveTeamsViewerForTeam(
      data.viewer,
      data.teams[0]!,
      data.currentPeriod
    );

    expect(data.viewer.walletStatus).toBe("switch-mainnet");
    expect(selectedViewer).toMatchObject({
      canDepositRevenue: true,
      canClaimFunding: false,
      canReturnFunding: false,
      canClaimBonus: false,
    });
    expect(getTeamsDepositReadiness(data.teams[0]!, selectedViewer, true)).toEqual(
      {
        state: "switch-mainnet",
        canSubmit: false,
      }
    );
  });

  it("does not label stale period financials as current-period data", () => {
    const feed = parseFeed({
      ...feedExample,
      periods: {
        ...feedExample.periods,
        current: 3,
        indexed: [2, 3],
      },
    });
    const data = mapTeamsFeedToPageData(feed);
    const team = data.teams[0]!;

    expect(team.currentPeriod).toEqual({
      revenueUsd: "0.00",
      costUsd: "0.00",
      profitUsd: "0.00",
      lossUsd: "0.00",
    });
    expect(team.financialPeriods[0]).toMatchObject({
      period: 2,
      financials: expect.objectContaining({
        revenueUsd: "125",
      }),
    });
  });

  it("maps funding approvals and bonus periods from base-unit feed values", () => {
    const data = mapTeamsFeedToPageData(parseFeed(feedExample));
    const team = data.teams[0]!;
    const approval = team.fundingApprovals[0]!;
    const bonusPeriod = team.bonus.periods[0]!;

    expect(approval.totalApproved).toBe("50");
    expect(approval.claimable).toBe("50");
    expect(approval.amountRaw).toBe("50000000");
    expect(approval.claimableRaw).toBe("50000000");
    expect(approval.returnableRaw).toBe("0");
    expect(approval.status).toBe("claimable-current-period");
    expect(team.fundingSummary.claimableUsd).toBeNull();
    expect(data.admin?.fundingQueue[0]?.teamId).toBe("example-team");
    expect(team.bonus.status).toBe("claimable");
    expect(team.bonus.totalClaimable).toBe("1");
    expect(team.bonus.totalClaimableRaw).toBe("1000000000000000000");
    expect(bonusPeriod.claimableYfi).toBe("1");
    expect(bonusPeriod.claimableYfiRaw).toBe("1000000000000000000");
    expect(bonusPeriod.adjustedPriceUsd).toBe("7500");
    expect(bonusPeriod.bonusFactorBps).toBe(1000);
    expect(bonusPeriod.ybcSplitBps).toBe(1000);
  });

  it("keeps past unclaimed approvals expired and non-actionable", async () => {
    const feed = structuredClone(feedExample) as unknown as TeamsFeed;
    const sourceTeam = feed.teams[0]!;
    const approval = feed.fundingApprovals[0]!;
    approval.period = feed.periods.current - 1;
    approval.status = "expired";
    approval.claimable = "1";

    const data = mapTeamsFeedToPageData(feed, sourceTeam.owner, {
      walletChainId: 1,
    });
    const team = data.teams[0]!;
    const mappedApproval = team.fundingApprovals[0]!;
    const viewer = deriveTeamsViewerForTeam(
      data.viewer,
      team,
      data.currentPeriod
    );

    expect(mappedApproval.status).toBe("expired");
    expect(
      isTeamsFundingApprovalClaimable(mappedApproval, data.currentPeriod)
    ).toBe(false);
    expect(viewer.canClaimFunding).toBe(false);

    const client = new OnchainTeamsClient(feed, sourceTeam.owner, 1);
    await expect(
      client.prepareFundingClaim(
        sourceTeam.address as Address,
        BigInt(approval.id),
        1n,
        sourceTeam.owner as Address
      )
    ).rejects.toThrow("not claimable");
    await expect(
      client.prepareFundingReturn(
        sourceTeam.address as Address,
        BigInt(approval.id),
        1n
      )
    ).rejects.toThrow("current-period");
  });

  it("keeps future approvals scheduled rather than claimable", () => {
    const feed = structuredClone(feedExample) as unknown as TeamsFeed;
    const approval = feed.fundingApprovals[0]!;
    approval.period = feed.periods.current + 1;
    approval.status = "pending";
    approval.claimable = "0";

    const mappedApproval =
      mapTeamsFeedToPageData(feed).teams[0]!.fundingApprovals[0]!;

    expect(mappedApproval.status).toBe("scheduled");
    expect(
      isTeamsFundingApprovalClaimable(mappedApproval, feed.periods.current)
    ).toBe(false);
  });

  it("maps inactive current approvals as unavailable without blocking returns", () => {
    const feed = structuredClone(feedExample) as unknown as TeamsFeed;
    const sourceTeam = feed.teams[0]!;
    const approval = feed.fundingApprovals[0]!;
    sourceTeam.status = "retired";
    approval.used = "10000000";
    approval.claimable = "0";
    approval.status = "inactive_team";
    approval.claims = [
      {
        id: "claim-inactive-current",
        approvalId: approval.id,
        team: approval.team,
        period: approval.period,
        token: approval.token,
        amount: "10000000",
        costUsd: "10000000000000000000",
        vest: null,
        recipient: sourceTeam.owner,
        txHash:
          "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        blockNumber: feed.blockNumber,
        logIndex: 3,
        timestamp: feed.generatedAt,
      },
    ];

    const data = mapTeamsFeedToPageData(feed, sourceTeam.owner, {
      walletChainId: 1,
    });
    const team = data.teams[0]!;
    const mappedApproval = team.fundingApprovals[0]!;
    const viewer = deriveTeamsViewerForTeam(
      data.viewer,
      team,
      data.currentPeriod
    );

    expect(mappedApproval.status).toBe("current-unavailable");
    expect(mappedApproval.returnableRaw).toBe("10000000");
    expect(team.fundingSummary.state).toBe("current-unavailable");
    expect(
      isTeamsFundingApprovalClaimable(mappedApproval, data.currentPeriod)
    ).toBe(false);
    expect(
      isTeamsFundingApprovalReturnable(mappedApproval, data.currentPeriod)
    ).toBe(true);
    expect(viewer.canClaimFunding).toBe(false);
    expect(viewer.canReturnFunding).toBe(true);
  });

  it("preserves sub-day funding durations for presentation", () => {
    const feed = structuredClone(feedExample) as unknown as TeamsFeed;
    feed.fundingApprovals[0]!.durationSeconds = 60 * 60;

    const approval =
      mapTeamsFeedToPageData(feed).teams[0]!.fundingApprovals[0]!;

    expect(approval.streamDurationDays).toBeCloseTo(1 / 24);
    expect(approval.streamDurationDays).toBeGreaterThan(0);
  });

  it("derives refundable funding value from claimed cost net of returns", () => {
    const data = mapTeamsFeedToPageData(
      parseFeed({
        ...feedExample,
        fundingApprovals: [
          {
            ...feedExample.fundingApprovals[0]!,
            used: "10000000",
            claimable: "40000000",
            claims: [
              {
                id: "claim-0",
                approvalId: 0,
                team: feedExample.fundingApprovals[0]!.team,
                period: 2,
                token: feedExample.fundingApprovals[0]!.token,
                amount: "10000000",
                costUsd: "10000000000000000000",
                vest: null,
                recipient: "0x2222222222222222222222222222222222222222",
                txHash:
                  "0x1111111111111111111111111111111111111111111111111111111111111111",
                blockNumber: feedExample.blockNumber,
                logIndex: 0,
                timestamp: 1,
              },
            ],
            returns: [
              {
                id: "return-0",
                approvalId: 0,
                team: feedExample.fundingApprovals[0]!.team,
                period: 2,
                token: feedExample.fundingApprovals[0]!.token,
                amount: "2000000",
                refundUsd: "2000000000000000000",
                sender: "0x2222222222222222222222222222222222222222",
                txHash:
                  "0x2222222222222222222222222222222222222222222222222222222222222222",
                blockNumber: feedExample.blockNumber,
                logIndex: 0,
                timestamp: 2,
              },
            ],
          },
        ],
        events: {
          ...feedExample.events,
          fundingClaimCount: 1,
          fundingReturnCount: 1,
        },
      })
    );
    const approval = data.teams[0]!.fundingApprovals[0]!;

    expect(approval.claimedCostUsd).toBe("8");
    expect(approval.refundValueUsd).toBe("8");
    expect(approval.claimedRaw).toBe("10000000");
    expect(approval.returnedRaw).toBe("2000000");
    expect(approval.returnableRaw).toBe("8000000");
    expect(data.teams[0]!.fundingReturns[0]).toMatchObject({
      txHash:
        "0x2222222222222222222222222222222222222222222222222222222222222222",
      logIndex: 0,
    });
  });

  it("maps one aggregate return selector across sibling approvals without double counting", () => {
    const payload = structuredClone(feedExample) as unknown as TeamsFeed;
    const first = payload.fundingApprovals[0]!;
    first.used = "10";
    first.claimable = "49999990";
    first.averageCostPriceUsd = "1000000000000000000";
    first.claims = [
      {
        id: "claim-aggregate",
        approvalId: first.id,
        team: first.team,
        period: first.period,
        token: first.token,
        amount: "10",
        costUsd: "10000000000000000000",
        vest: null,
        recipient: payload.teams[0]!.owner,
        txHash:
          "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        blockNumber: payload.blockNumber,
        logIndex: 3,
        timestamp: payload.generatedAt,
      },
    ];
    const sibling = structuredClone(first);
    sibling.id = 1;
    sibling.used = "0";
    sibling.claimable = sibling.amount;
    sibling.claims = [];
    sibling.returns = [
      {
        id: "return-cross-approval",
        approvalId: sibling.id,
        team: sibling.team,
        period: sibling.period,
        token: sibling.token,
        amount: "8",
        refundUsd: "8000000000000000000",
        sender: payload.teams[0]!.owner,
        txHash:
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        blockNumber: payload.blockNumber,
        logIndex: 4,
        timestamp: payload.generatedAt,
      },
    ];
    payload.fundingApprovals.push(sibling);
    payload.teams[0]!.periods[0]!.fundingApprovalIds = [0, 1];
    payload.events.fundingApprovalCount = 2;
    payload.events.fundingClaimCount = 1;
    payload.events.fundingReturnCount = 1;

    const data = mapTeamsFeedToPageData(parseFeed(payload));
    const approvals = data.teams[0]!.fundingApprovals;

    expect(approvals).toHaveLength(2);
    expect(approvals[0]).toMatchObject({
      idx: 0,
      claimedRaw: "10",
      claimedCostUsd: "2",
      returnedRaw: "0",
      returnableRaw: "2",
      refundValueUsd: "2",
    });
    expect(approvals[1]).toMatchObject({
      idx: 1,
      claimedRaw: "0",
      claimedCostUsd: "0",
      returnedRaw: "8",
      returnableRaw: "0",
      refundValueUsd: "0",
    });
    expect(data.teams[0]!.fundingSummary.refundableUsd).toBe("2.00");
  });

  it("preserves exact token dust while keeping v1 raw-token writes eligible", async () => {
    const sourceApproval = feedExample.fundingApprovals[0]!;
    const sourceTeam = feedExample.teams[0]!;
    const sourcePeriod = sourceTeam.periods[0]!;
    const claim = {
      id: "claim-dust",
      approvalId: sourceApproval.id,
      team: sourceApproval.team,
      period: feedExample.periods.current,
      token: sourceApproval.token,
      amount: "1",
      costUsd: "1",
      vest: null,
      recipient: sourceTeam.owner,
      txHash:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      blockNumber: feedExample.blockNumber,
      logIndex: 0,
      timestamp: 1,
    };
    const feed = parseFeed({
      ...feedExample,
      version: 1,
      units: undefined,
      fundingApprovals: [
        {
          ...sourceApproval,
          amount: "2",
          used: "1",
          claimable: "1",
          claims: [claim],
          returns: [],
        },
      ],
      teams: [
        {
          ...sourceTeam,
          periods: [
            {
              ...sourcePeriod,
              revenueDeposits: sourcePeriod.revenueDeposits.map(
                (deposit, index) =>
                  index === 0 ? { ...deposit, amount: "1" } : deposit
              ),
              bonus: {
                ...sourcePeriod.bonus!,
                claimableYfi: "1",
                teamAmountYfi: "1",
                ybcAmountYfi: "0",
              },
            },
          ],
        },
      ],
      events: {
        ...feedExample.events,
        fundingClaimCount: 1,
      },
    });
    const data = mapTeamsFeedToPageData(feed, sourceTeam.owner, {
      walletChainId: 1,
    });
    const team = data.teams[0]!;
    const approval = team.fundingApprovals[0]!;
    const viewer = deriveTeamsViewerForTeam(
      data.viewer,
      team,
      data.currentPeriod
    );

    expect(data.financialData.status).toBe("unavailable");
    expect(team.revenueHistory[0]?.amount).toBe("0.000001");
    expect(approval.totalApproved).toBe("0.000002");
    expect(approval.used).toBe("0.000001");
    expect(approval.claimable).toBe("0.000001");
    expect(approval.claimableRaw).toBe("1");
    expect(approval.returnableRaw).toBe("1");
    expect(approval.claimedCostUsd).toBeNull();
    expect(approval.refundValueUsd).toBeNull();
    expect(team.fundingSummary).toMatchObject({
      claimableUsd: null,
      refundableUsd: null,
    });
    expect(team.bonus.totalClaimable).toBe("0.000000000000000001");
    expect(team.bonus.totalClaimableRaw).toBe("1");
    expect(team.bonus.periods[0]?.claimableYfi).toBe(
      "0.000000000000000001"
    );
    expect(viewer).toMatchObject({
      canDepositRevenue: true,
      canClaimFunding: true,
      canReturnFunding: true,
      canClaimBonus: true,
    });

    const client = new OnchainTeamsClient(feed, sourceTeam.owner, 1);
    await expect(
      client.prepareFundingClaim(
        sourceTeam.address as Address,
        BigInt(sourceApproval.id),
        2n,
        sourceTeam.owner as Address
      )
    ).rejects.toThrow("exceeds the remaining raw balance");
    await expect(
      client.prepareFundingReturn(
        sourceTeam.address as Address,
        BigInt(sourceApproval.id),
        2n
      )
    ).resolves.toEqual(expect.any(Function));
    await expect(
      client.prepareFundingReturn(
        sourceTeam.address as Address,
        BigInt(sourceApproval.id),
        1n
      )
    ).resolves.toEqual(expect.any(Function));
  });

  it("maps operator access and empty feed runtime safely", () => {
    const feed = parseFeed({
      ...feedExample,
      revenueRecipient: {
        ...feedExample.revenueRecipient,
        operator: "0x9999999999999999999999999999999999999999",
      },
    });
    const data = mapTeamsFeedToPageData(
      feed,
      "0x9999999999999999999999999999999999999999"
    );

    expect(data.viewer.role).toBe("operator-admin");
    expect(data.viewer.canUseAdmin).toBe(true);
    expect(data.admin?.whitelistedRevenueTokens[0]?.symbol).toBe("USDC");

    const emptyRuntime = mapTeamsFeedToRuntimeState({
      ...feed,
      teams: [],
      accountant: {
        ...feed.accountant,
        lifetime: {
          revenueUsd: "0",
          costUsd: "0",
          profitUsd: "0",
          lossUsd: "0",
        },
      },
      events: {
        ...feed.events,
        teamCount: 0,
      },
    });
    expect(emptyRuntime.isEmpty).toBe(true);
    expect(emptyRuntime.data.teams).toEqual([]);
  });

  it("rejects a syntactically valid team address that is absent from the current feed", async () => {
    const feed = parseFeed(feedExample);
    const client = new OnchainTeamsClient(feed);
    const revenueToken = Object.values(feed.tokens).find(
      (token) => token.kind !== "bonus"
    )!;

    await expect(
      client.prepareRevenueDeposit(
        "0x9999999999999999999999999999999999999999" as Address,
        revenueToken.address as Address,
        1n
      )
    ).rejects.toThrow(
      "The selected Teams contract is not present in the current feed."
    );
  });

  it("keeps revenue options curated while accepting every oracle-bound feed token", async () => {
    const fundingToken =
      "0x4444444444444444444444444444444444444444";
    const unknownToken =
      "0x5555555555555555555555555555555555555555";
    const revenueWithoutOracle =
      "0x6666666666666666666666666666666666666666";
    const feed = parseFeed({
      ...feedExample,
      tokens: {
        ...feedExample.tokens,
        [fundingToken]: {
          address: fundingToken,
          symbol: "FUND",
          name: "Funding token",
          decimals: 18,
          kind: "funding",
          priceOracle:
            "0x7777777777777777777777777777777777777777",
          converter: null,
        },
        [unknownToken]: {
          address: unknownToken,
          symbol: "UNKNOWN",
          name: null,
          decimals: 18,
          kind: "unknown",
          priceOracle:
            "0x7777777777777777777777777777777777777777",
          converter: null,
        },
        [revenueWithoutOracle]: {
          address: revenueWithoutOracle,
          symbol: "NO_ORACLE",
          name: "Unsupported revenue token",
          decimals: 18,
          kind: "revenue",
          priceOracle: null,
          converter: null,
        },
      },
    });
    const team = mapTeamsFeedToPageData(feed).teams[0]!;
    const client = new OnchainTeamsClient(
      feed,
      feed.teams[0]!.owner,
      1
    );

    expect(team.revenueOptions.map((option) => option.symbol)).toEqual([
      "USDC",
      "FUND",
      "UNKNOWN",
    ]);

    for (const token of [fundingToken, unknownToken]) {
      await expect(
        client.prepareRevenueDeposit(
          team.address as Address,
          token as Address,
          1n
        )
      ).resolves.toEqual(expect.any(Function));
    }
    await expect(
      client.prepareRevenueDeposit(
        team.address as Address,
        revenueWithoutOracle as Address,
        1n
      )
    ).rejects.toThrow(
        "The selected revenue token is not supported by the current feed."
      );
  });
});
