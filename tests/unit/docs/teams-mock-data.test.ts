import { describe, expect, it } from "vitest";
import { formatUnits, parseUnits } from "viem";
import mockData from "@/docs/apps/teams/examples/mock-data.example.json";
import type {
  BonusPeriodStatus,
  BucketStatus,
  FundingApprovalStatus,
  PeriodFinalizationStatus,
  RevenueTokenAdminStatus,
  TeamBonusStatus,
  TeamFinancials,
  TeamFundingSummaryState,
  TeamLifecycleStatus,
  TeamMigrationReadiness,
  TeamReadOnlyReason,
  TeamRecord,
  TeamsMockDataV1,
  TeamsMockExampleScenariosV1,
  TeamsMockScenarioId,
  TeamsRegistryStatus,
  TeamsViewerRole,
} from "@/lib/clients/teams/types";

const expectedScenarioIds: TeamsMockScenarioId[] = [
  "directory-observer",
  "team-owner-funding",
  "bonus-available",
  "finance-operator-revenue",
  "retired-read-only",
  "operator-admin",
];

const expectedFundingStatuses: FundingApprovalStatus[] = [
  "claimable-current-period",
  "current-unavailable",
  "expired",
  "fully-used",
  "partially-claimed",
  "scheduled",
];

const expectedBonusStatuses: TeamBonusStatus[] = [
  "claimable",
  "claimed",
  "none",
  "pending-finalization",
];

const expectedBonusPeriodStatuses: BonusPeriodStatus[] = [
  "claimed",
  "finalized-claimable",
  "finalized-zero",
  "pending-finalization",
];

const expectedLifecycleStatuses: TeamLifecycleStatus[] = [
  "active",
  "retired",
  "retiring",
];

const expectedViewerRoles: TeamsViewerRole[] = [
  "finance-operator",
  "observer",
  "operator-admin",
  "team-owner",
];

const expectedReadOnlyReasons: TeamReadOnlyReason[] = [
  "retired",
  "successor-active",
];

const expectedMigrationReadiness: TeamMigrationReadiness[] = [
  "completed",
  "not-needed",
  "pending",
  "ready",
];

const expectedFundingSummaryStates: TeamFundingSummaryState[] = [
  "current-unavailable",
  "fully-used",
  "has-claimable",
  "has-expired",
  "no-approvals",
  "partially-claimed",
];

const expectedRegistryStatuses: TeamsRegistryStatus[] = [
  "active",
  "deprecated",
  "paused",
];

const expectedPeriodFinalizationStatuses: PeriodFinalizationStatus[] = [
  "finalized",
  "open",
  "ready",
];

const expectedBucketStatuses: BucketStatus[] = [
  "healthy",
  "limit-reached",
  "watch",
];

const expectedRevenueTokenStatuses: RevenueTokenAdminStatus[] = [
  "active",
  "paused",
];

function parseTeamsMockData(): TeamsMockExampleScenariosV1 {
  const value: unknown = mockData;
  assertTeamsMockExampleScenariosV1(value);
  return value;
}

function assertTeamsMockExampleScenariosV1(
  value: unknown
): asserts value is TeamsMockExampleScenariosV1 {
  assertRecord(value);
  expect(value.version).toBe(1);
  assertNumber(value.generatedAt);
  assertArray(value.scenarios);

  for (const scenario of value.scenarios) {
    assertRecord(scenario);
    expectOneOf(scenario.id, expectedScenarioIds);
    assertString(scenario.label);
    assertTeamsMockDataV1(scenario.data);
  }
}

function assertTeamsMockDataV1(value: unknown): asserts value is TeamsMockDataV1 {
  assertRecord(value);
  expect(value.version).toBe(1);
  assertNumber(value.generatedAt);
  assertNumber(value.currentPeriod);
  assertViewerContext(value.viewer);
  assertNullableString(value.selectedTeamId);
  assertTotals(value.totals);
  assertArray(value.teams);

  for (const team of value.teams) {
    assertTeamRecord(team);
  }

  if (value.admin !== undefined) {
    assertAdminRecord(value.admin);
  }
}

function assertViewerContext(value: unknown): void {
  assertRecord(value);
  expectOneOf(value.role, expectedViewerRoles);
  assertNullableString(value.address);
  assertNullableString(value.teamId);
  assertBoolean(value.canDepositRevenue);
  assertBoolean(value.canClaimFunding);
  assertBoolean(value.canReturnFunding);
  assertBoolean(value.canClaimBonus);
  assertBoolean(value.canUseAdmin);
}

function assertTotals(value: unknown): void {
  assertRecord(value);
  assertFinancials(value.currentPeriod);
  assertFinancials(value.lifetime);
  assertNumber(value.activeTeamCount);
  assertNumber(value.retiringTeamCount);
  assertNumber(value.retiredTeamCount);
}

function assertTeamRecord(value: unknown): asserts value is TeamRecord {
  assertRecord(value);
  assertString(value.id);
  assertString(value.name);
  assertAddress(value.address);
  assertAddress(value.owner);
  assertNullableString(value.pendingOwner);
  expectOneOf(value.status, expectedLifecycleStatuses);
  assertNullableOneOf(value.readOnlyReason, expectedReadOnlyReasons);
  assertFinancials(value.currentPeriod);
  assertArray(value.financialPeriods);
  for (const entry of value.financialPeriods) {
    assertFinancialPeriod(entry);
  }
  assertFinancials(value.lifetime);
  assertLifecycleState(value.lifecycle);
  assertArray(value.revenueOptions);
  assertArray(value.revenueHistory);
  assertFundingSummary(value.fundingSummary);
  assertArray(value.fundingApprovals);
  assertArray(value.fundingReturns);
  assertBonusState(value.bonus);

  for (const option of value.revenueOptions) {
    assertRevenueOption(option);
  }

  for (const entry of value.revenueHistory) {
    assertRevenueHistoryEntry(entry);
  }

  for (const approval of value.fundingApprovals) {
    assertFundingApproval(approval);
  }

  for (const entry of value.fundingReturns) {
    assertFundingReturnEntry(entry);
  }
}

function assertFinancials(value: unknown): void {
  assertRecord(value);
  assertDecimalString(value.revenueUsd);
  assertDecimalString(value.costUsd);
  assertDecimalString(value.profitUsd);
  assertDecimalString(value.lossUsd);
}

function assertFinancialPeriod(value: unknown): void {
  assertRecord(value);
  assertNumber(value.period);
  assertNullableNumber(value.startsAt);
  assertNullableNumber(value.endsAt);
  assertFinancials(value.financials);
}

function assertLifecycleState(value: unknown): void {
  assertRecord(value);
  expectOneOf(value.migrationReadiness, expectedMigrationReadiness);
  assertNullableString(value.successorTeamId);
  assertNullableNumber(value.retirementAnnouncedAt);
  assertNullableNumber(value.retirementEffectivePeriod);
}

function assertRevenueOption(value: unknown): void {
  assertRecord(value);
  assertString(value.symbol);
  assertAddress(value.tokenAddress);
  assertNumber(value.decimals);
  assertBoolean(value.isConvertible);
  assertNullableString(value.convertToSymbol);
  assertDecimalString(value.oraclePriceUsd);
  assertDecimalString(value.previewAmount);
  assertDecimalString(value.estimatedCreditUsd);
}

function assertRevenueHistoryEntry(value: unknown): void {
  assertRecord(value);
  assertString(value.id);
  assertNumber(value.period);
  assertString(value.symbol);
  assertDecimalString(value.amount);
  assertDecimalString(value.creditedUsd);
  assertNullableString(value.convertedToSymbol);
  assertAddress(value.depositedBy);
  assertNumber(value.createdAt);
}

function assertFundingSummary(value: unknown): void {
  assertRecord(value);
  expectOneOf(value.state, expectedFundingSummaryStates);
  assertNullableDecimalString(value.claimableUsd);
  assertNullableDecimalString(value.refundableUsd);
}

function assertFundingApproval(value: unknown): void {
  assertRecord(value);
  assertString(value.id);
  assertNumber(value.idx);
  assertNumber(value.approvedPeriod);
  assertString(value.symbol);
  assertAddress(value.tokenAddress);
  assertNumber(value.decimals);
  assertRawAmountString(value.amountRaw);
  assertRawAmountString(value.usedRaw);
  assertRawAmountString(value.claimableRaw);
  assertRawAmountString(value.claimedRaw);
  assertRawAmountString(value.returnedRaw);
  assertRawAmountString(value.returnableRaw);
  assertDecimalString(value.totalApproved);
  assertDecimalString(value.used);
  assertDecimalString(value.claimable);
  assertNumber(value.streamDurationDays);
  expectOneOf(value.status, expectedFundingStatuses);
  assertNullableString(value.recipient);
  assertNullableDecimalString(value.claimedCostUsd);
  assertNullableDecimalString(value.refundValueUsd);
  assertNullableDecimalString(value.averageClaimPriceUsd);
}

function assertFundingReturnEntry(value: unknown): void {
  assertRecord(value);
  assertString(value.id);
  assertString(value.approvalId);
  assertNumber(value.approvalIdx);
  assertNumber(value.period);
  assertString(value.symbol);
  assertNumber(value.decimals);
  assertRawAmountString(value.amountRaw);
  assertDecimalString(value.amount);
  assertNullableDecimalString(value.refundValueUsd);
  assertAddress(value.returnedBy);
  assertNumber(value.createdAt);
}

function assertBonusState(value: unknown): void {
  assertRecord(value);
  expect(value.tokenSymbol).toBe("YFI");
  assertNumber(value.tokenDecimals);
  expectOneOf(value.status, expectedBonusStatuses);
  assertRawAmountString(value.totalClaimableRaw);
  assertDecimalString(value.totalClaimable);
  assertNumber(value.includedPeriodCount);
  assertArray(value.periods);

  for (const period of value.periods) {
    assertBonusPeriod(period);
  }
}

function assertBonusPeriod(value: unknown): void {
  assertRecord(value);
  assertNumber(value.period);
  expectOneOf(value.status, expectedBonusPeriodStatuses);
  assertBoolean(value.finalized);
  assertBoolean(value.claimed);
  assertDecimalString(value.profitUsd);
  assertDecimalString(value.adjustedPriceUsd);
  assertNumber(value.bonusFactorBps);
  assertNumber(value.ybcSplitBps);
  assertRawAmountString(value.claimableYfiRaw);
  assertDecimalString(value.claimableYfi);
}

function assertAdminRecord(value: unknown): void {
  assertRecord(value);
  expectOneOf(value.registryStatus, expectedRegistryStatuses);
  expectOneOf(
    value.periodFinalizationStatus,
    expectedPeriodFinalizationStatuses
  );
  assertBucket(value.rewardsBucket);
  assertBucket(value.treasuryBucket);
  assertBucket(value.recoveryBucket);
  assertArray(value.whitelistedRevenueTokens);
  assertArray(value.fundingQueue);
  assertArray(value.bonusQueue);

  for (const token of value.whitelistedRevenueTokens) {
    assertRevenueTokenAdminRecord(token);
  }

  for (const entry of value.fundingQueue) {
    assertAdminFundingQueueEntry(entry);
  }

  for (const entry of value.bonusQueue) {
    assertAdminBonusQueueEntry(entry);
  }
}

function assertBucket(value: unknown): void {
  assertRecord(value);
  assertDecimalString(value.budget);
  assertDecimalString(value.used);
  assertDecimalString(value.remaining);
  expectOneOf(value.status, expectedBucketStatuses);
}

function assertRevenueTokenAdminRecord(value: unknown): void {
  assertRecord(value);
  assertString(value.symbol);
  assertAddress(value.tokenAddress);
  assertAddress(value.oracle);
  if (value.converter !== null) {
    assertAddress(value.converter);
  }
  expectOneOf(value.status, expectedRevenueTokenStatuses);
}

function assertAdminFundingQueueEntry(value: unknown): void {
  assertRecord(value);
  assertString(value.approvalId);
  assertNumber(value.approvalIdx);
  assertString(value.teamId);
  expectOneOf(value.status, expectedFundingStatuses);
  assertBoolean(value.requiresOperatorAttention);
}

function assertAdminBonusQueueEntry(value: unknown): void {
  assertRecord(value);
  assertString(value.teamId);
  assertNumber(value.period);
  expectOneOf(value.status, expectedBonusPeriodStatuses);
  assertBoolean(value.requiresFinalization);
}

function assertString(value: unknown): asserts value is string {
  expect(typeof value).toBe("string");
}

function assertAddress(value: unknown): void {
  assertString(value);
  expect(value).toMatch(/^0x[a-fA-F0-9]{40}$/);
}

function assertDecimalString(value: unknown): asserts value is string {
  assertString(value);
  expect(value).toMatch(/^\d+(\.\d+)?$/);
}

function assertNullableDecimalString(value: unknown): void {
  if (value !== null) {
    assertDecimalString(value);
  }
}

function assertRawAmountString(value: unknown): asserts value is string {
  assertString(value);
  expect(value).toMatch(/^(0|[1-9]\d*)$/);
}

function assertBoolean(value: unknown): asserts value is boolean {
  expect(typeof value).toBe("boolean");
}

function assertNumber(value: unknown): asserts value is number {
  expect(typeof value).toBe("number");
}

function assertNullableString(value: unknown): void {
  if (value !== null) {
    assertString(value);
  }
}

function assertNullableNumber(value: unknown): void {
  if (value !== null) {
    assertNumber(value);
  }
}

function assertNullableOneOf<T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): void {
  if (value !== null) {
    expectOneOf(value, allowedValues);
  }
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object record");
  }
}

function assertArray(value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected array");
  }
}

function expectOneOf<T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): asserts value is T {
  expect(typeof value).toBe("string");
  expect(allowedValues).toContain(value as T);
}

const financialKeys = [
  "revenueUsd",
  "costUsd",
  "profitUsd",
  "lossUsd",
] as const;

function sumFinancials(
  teams: TeamRecord[],
  scope: "currentPeriod" | "lifetime"
): TeamFinancials {
  const sums = Object.fromEntries(
    financialKeys.map((key) => [key, 0])
  ) as Record<keyof TeamFinancials, number>;

  for (const team of teams) {
    for (const key of financialKeys) {
      sums[key] += toCents(team[scope][key]);
    }
  }

  return {
    revenueUsd: formatCents(sums.revenueUsd),
    costUsd: formatCents(sums.costUsd),
    profitUsd: formatCents(sums.profitUsd),
    lossUsd: formatCents(sums.lossUsd),
  };
}

function expectFinancialsToEqual(
  actual: TeamFinancials,
  expected: TeamFinancials
): void {
  for (const key of financialKeys) {
    expect(actual[key]).toBe(expected[key]);
  }
}

function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function formatCents(value: number): string {
  return (value / 100).toFixed(2);
}

function expectRawFundingAndBonusToReconcile(team: TeamRecord): void {
  for (const approval of team.fundingApprovals) {
    const expectedReturnedRaw = team.fundingReturns
      .filter((entry) => entry.approvalId === approval.id)
      .reduce((sum, entry) => sum + BigInt(entry.amountRaw), 0n);
    const expectedReturnableRaw =
      BigInt(approval.claimedRaw) > expectedReturnedRaw
        ? BigInt(approval.claimedRaw) - expectedReturnedRaw
        : 0n;

    expect(approval.returnedRaw).toBe(expectedReturnedRaw.toString());
    expect(approval.returnableRaw).toBe(expectedReturnableRaw.toString());
  }

  expect(team.bonus.totalClaimableRaw).toBe(
    team.bonus.periods
      .reduce((sum, period) => sum + BigInt(period.claimableYfiRaw), 0n)
      .toString()
  );
}

describe("Team Finances mock data contract", () => {
  it("binds the example JSON to the exported v1 TypeScript contract", () => {
    const teamsMockData = parseTeamsMockData();

    expect(teamsMockData.version).toBe(1);
    expect(teamsMockData.scenarios.map((scenario) => scenario.id)).toEqual(
      expectedScenarioIds
    );
  });

  it("covers the stable Teams scenario and status sets", () => {
    const teamsMockData = parseTeamsMockData();
    const fundingStatuses = new Set<FundingApprovalStatus>();
    const bonusStatuses = new Set<TeamBonusStatus>();
    const bonusPeriodStatuses = new Set<BonusPeriodStatus>();
    const fundingSummaryStates = new Set<TeamFundingSummaryState>();
    const lifecycleStatuses = new Set<TeamLifecycleStatus>();
    const viewerRoles = new Set<TeamsViewerRole>();

    for (const scenario of teamsMockData.scenarios) {
      viewerRoles.add(scenario.data.viewer.role);

      for (const team of scenario.data.teams) {
        lifecycleStatuses.add(team.status);
        bonusStatuses.add(team.bonus.status);
        fundingSummaryStates.add(team.fundingSummary.state);

        for (const approval of team.fundingApprovals) {
          fundingStatuses.add(approval.status);
        }

        for (const period of team.bonus.periods) {
          bonusPeriodStatuses.add(period.status);
        }
      }
    }

    expect([...fundingStatuses].sort()).toEqual(expectedFundingStatuses);
    expect([...bonusStatuses].sort()).toEqual(expectedBonusStatuses);
    expect([...bonusPeriodStatuses].sort()).toEqual(
      expectedBonusPeriodStatuses
    );
    expect([...fundingSummaryStates].sort()).toEqual(
      expectedFundingSummaryStates
    );
    expect([...lifecycleStatuses].sort()).toEqual(expectedLifecycleStatuses);
    expect([...viewerRoles].sort()).toEqual(expectedViewerRoles);
  });

  it("keeps route-ready mock invariants explicit", () => {
    const teamsMockData = parseTeamsMockData();

    for (const scenario of teamsMockData.scenarios) {
      const teamIds = new Set(scenario.data.teams.map((team) => team.id));
      const { teams, totals } = scenario.data;

      expectFinancialsToEqual(
        totals.currentPeriod,
        sumFinancials(teams, "currentPeriod")
      );
      expectFinancialsToEqual(
        totals.lifetime,
        sumFinancials(teams, "lifetime")
      );
      expect(totals.activeTeamCount).toBe(
        teams.filter((team) => team.status === "active").length
      );
      expect(totals.retiringTeamCount).toBe(
        teams.filter((team) => team.status === "retiring").length
      );
      expect(totals.retiredTeamCount).toBe(
        teams.filter((team) => team.status === "retired").length
      );

      if (scenario.data.selectedTeamId) {
        expect(teamIds.has(scenario.data.selectedTeamId)).toBe(true);
      }

      for (const team of scenario.data.teams) {
        expectRawFundingAndBonusToReconcile(team);
        expect(team.financialPeriods[0]).toMatchObject({
          period: scenario.data.currentPeriod,
          startsAt: null,
          endsAt: null,
          financials: team.currentPeriod,
        });

        if (team.status === "retired") {
          expect(team.readOnlyReason).not.toBeNull();
        }

        for (const period of team.bonus.periods) {
          if (period.status === "pending-finalization") {
            expect(period.claimableYfi).toBe("0");
          }
          if (period.status === "finalized-claimable") {
            const adjustedPrice = parseUnits(period.adjustedPriceUsd, 18);
            expect(adjustedPrice).toBeGreaterThan(0n);
            const grossYfi =
              (parseUnits(period.profitUsd, 18) *
                BigInt(period.bonusFactorBps) *
                10n ** 18n) /
              adjustedPrice /
              10_000n;
            expect(period.claimableYfiRaw).toBe(grossYfi.toString());
            expect(period.claimableYfi).toBe(formatUnits(grossYfi, 18));
          }
        }
      }
    }
  });
});
