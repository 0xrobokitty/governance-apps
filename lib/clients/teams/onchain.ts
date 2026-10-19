import {
  erc20Abi,
  formatUnits,
  getAddress,
  isAddress,
  type Address,
} from "viem";
import { BonusDistributorAbi } from "@/lib/abis/BonusDistributor";
import { TeamAbi } from "@/lib/abis/Team";
import { assertMainnetAccount, MAINNET_CHAIN_ID } from "@/lib/tx/network";
import type { PreparedTransaction } from "@/lib/tx/types";
import {
  addTeamsDecimalStrings,
  createTeamsScenarioCatalog,
  deriveTeamsFundingSummary,
  formatTeamsRawTokenAmount,
  type TeamsClient,
  type TeamsScenarioCatalogEntry,
} from "./client";
import type { TeamsMockRuntimeState } from "./mock";
import type {
  AdminBonusQueueEntry,
  AdminFundingQueueEntry,
  BonusPeriod,
  BonusPeriodStatus,
  BucketRecord,
  FundingApproval,
  FundingApprovalStatus,
  FundingReturnEntry,
  RevenueHistoryEntry,
  RevenueOption,
  RevenueTokenAdminRecord,
  TeamBonusState,
  TeamFinancials,
  TeamFinancialPeriod,
  TeamId,
  TeamLifecycleStatus,
  TeamMigrationReadiness,
  TeamReadOnlyReason,
  TeamRecord,
  TeamsAdminRecord,
  TeamsMockDataV1,
  TeamsMockScenario,
  TeamsMockScenarioId,
  TeamsViewerContext,
  TeamsViewerRole,
  TeamsFinancialDataState,
  ProtocolUsd18String,
} from "./types";
import type {
  TeamsFeed,
  TeamsFeedFinancials,
  TeamsFeedFundingApproval,
  TeamsFeedTeam,
  TeamsFeedTeamPeriod,
  TeamsFeedToken,
} from "@/lib/schemas/teams-feed";
import {
  hasCompatibleTeamsFinancialUnits,
  TEAMS_BONUS_TOKEN_DECIMALS,
  TEAMS_PROTOCOL_USD_DECIMALS,
} from "@/lib/schemas/teams-feed";
import {
  assertTeamsBonusSimulationTarget,
  assertTeamsBonusWriteTarget,
  assertTeamsBlockAnchorCanonical,
  assertTeamsFundingWriteTarget,
  assertTeamsMainnetWriteClient,
  assertTeamsRevenueWriteTarget,
  readTeamsCurrentBlockAnchor,
  TeamsWriteValidationError,
  type TeamsCurrentBlockAnchor,
  type TeamsWritePublicClient,
} from "./security";
import { TEAMS_MAINNET_DEPLOYMENT } from "./deployment";

const ZERO_FINANCIALS: TeamFinancials = {
  revenueUsd: "0.00",
  costUsd: "0.00",
  profitUsd: "0.00",
  lossUsd: "0.00",
};
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const READ_ONLY_PRESET_ID: TeamsMockScenarioId = "directory-observer";
const MAX_TEAMS_WRITE_SIMULATION_ATTEMPTS = 3;
type TeamsMapOptions = {
  actionStateTrusted?: boolean;
  walletChainId?: number | null;
};

export class OnchainTeamsClient implements TeamsClient {
  constructor(
    private readonly feed: TeamsFeed,
    private readonly account: string | null = null,
    private readonly chainId: number | null = null
  ) {}

  async listScenarioCatalog(): Promise<TeamsScenarioCatalogEntry[]> {
    return createTeamsScenarioCatalog([
      {
        id: READ_ONLY_PRESET_ID,
        label: "Teams feed",
        data: mapTeamsFeedToPageData(this.feed, this.account),
      },
    ]);
  }

  async getScenario(_id: TeamsMockScenarioId): Promise<TeamsMockScenario> {
    void _id;
    return {
      id: READ_ONLY_PRESET_ID,
      label: "Teams feed",
      data: mapTeamsFeedToPageData(this.feed, this.account),
    };
  }

  async getPageState(): Promise<TeamsMockRuntimeState> {
    return mapTeamsFeedToRuntimeState(this.feed, this.account);
  }

  async prepareRevenueDeposit(
    team: Address,
    token: Address,
    amount: bigint
  ): Promise<PreparedTransaction> {
    const canonicalTeam = resolveCanonicalTeamsFeedTeamAddress(this.feed, team);
    const canonicalToken = resolveCanonicalTeamsFeedTokenAddress(this.feed, token);
    assertPositiveAmount(amount);
    const preparedWallet = getPreparedTeamsWallet(this.account, this.chainId);

    return async () => {
      const context = await getValidatedTeamsWriteContext(preparedWallet);
      const validateTarget = (anchor: TeamsCurrentBlockAnchor) =>
        assertTeamsRevenueWriteTarget(
          this.feed,
          context.publicClient,
          anchor,
          canonicalTeam,
          canonicalToken
        );
      const request = {
        address: canonicalTeam,
        abi: TeamAbi,
        functionName: "deposit_revenue",
        args: [canonicalToken, amount] as const,
        account: preparedWallet.address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateValidatedTeamsWrite(
        context,
        request,
        validateTarget
      );
    };
  }

  async prepareRevenueApproval(
    team: Address,
    token: Address,
    amount: bigint
  ): Promise<PreparedTransaction> {
    const canonicalTeam = resolveCanonicalTeamsFeedTeamAddress(this.feed, team);
    const canonicalToken = resolveCanonicalTeamsFeedTokenAddress(this.feed, token);
    assertPositiveAmount(amount);
    const preparedWallet = getPreparedTeamsWallet(this.account, this.chainId);

    return async () => {
      const context = await getValidatedTeamsWriteContext(preparedWallet);
      const validateTarget = (anchor: TeamsCurrentBlockAnchor) =>
        assertTeamsRevenueWriteTarget(
          this.feed,
          context.publicClient,
          anchor,
          canonicalTeam,
          canonicalToken
        );
      const request = {
        address: canonicalToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [canonicalTeam, amount] as const,
        account: preparedWallet.address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateValidatedTeamsWrite(
        context,
        request,
        validateTarget
      );
    };
  }

  async prepareFundingClaim(
    team: Address,
    approvalIdx: bigint,
    amount: bigint,
    recipient: Address
  ): Promise<PreparedTransaction> {
    const canonicalTeam = resolveCanonicalTeamsFeedTeamAddress(this.feed, team);
    const approval = resolveTeamsFeedFundingApproval(
      this.feed,
      canonicalTeam,
      approvalIdx
    );
    assertValidTeamsAddress(recipient, "recipient");
    assertPositiveAmount(amount);
    if (approval.period !== this.feed.periods.current) {
      throw new Error("The selected Teams funding approval is not claimable.");
    }
    if (amount > BigInt(approval.claimable)) {
      throw new Error("Teams funding claim exceeds the remaining raw balance.");
    }
    const canonicalToken = getAddress(approval.token);
    const preparedWallet = getPreparedTeamsWallet(this.account, this.chainId);

    return async () => {
      const context = await getValidatedTeamsWriteContext(preparedWallet);
      const binding = {
        action: "claim",
        approvalIdx,
        requestedAmount: amount,
        team: canonicalTeam,
        token: canonicalToken,
        preparedAccount: preparedWallet.address,
      } as const;
      const validateTarget = (anchor: TeamsCurrentBlockAnchor) =>
        assertTeamsFundingWriteTarget(
          this.feed,
          context.publicClient,
          anchor,
          binding
        );
      const request = {
        address: canonicalTeam,
        abi: TeamAbi,
        functionName: "claim_funding",
        args: [approvalIdx, amount, recipient] as const,
        account: preparedWallet.address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateValidatedTeamsWrite(
        context,
        request,
        validateTarget
      );
    };
  }

  async prepareFundingReturn(
    team: Address,
    approvalIdx: bigint,
    amount: bigint
  ): Promise<PreparedTransaction> {
    const canonicalTeam = resolveCanonicalTeamsFeedTeamAddress(this.feed, team);
    const approval = resolveTeamsFeedFundingApproval(
      this.feed,
      canonicalTeam,
      approvalIdx
    );
    assertPositiveAmount(amount);
    if (approval.period !== this.feed.periods.current) {
      throw new Error(
        "Only the current-period Teams funding approval can accept returns."
      );
    }
    const canonicalToken = getAddress(approval.token);
    const preparedWallet = getPreparedTeamsWallet(this.account, this.chainId);

    return async () => {
      const context = await getValidatedTeamsWriteContext(preparedWallet);
      const binding = {
        action: "return",
        approvalIdx,
        requestedAmount: amount,
        team: canonicalTeam,
        token: canonicalToken,
        preparedAccount: preparedWallet.address,
      } as const;
      const validateTarget = (anchor: TeamsCurrentBlockAnchor) =>
        assertTeamsFundingWriteTarget(
          this.feed,
          context.publicClient,
          anchor,
          binding
        );
      const request = {
        address: canonicalTeam,
        abi: TeamAbi,
        functionName: "return_funding",
        args: [approvalIdx, amount] as const,
        account: preparedWallet.address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateValidatedTeamsWrite(
        context,
        request,
        validateTarget
      );
    };
  }

  async prepareFundingReturnApproval(
    team: Address,
    approvalIdx: bigint,
    amount: bigint
  ): Promise<PreparedTransaction> {
    const canonicalTeam = resolveCanonicalTeamsFeedTeamAddress(this.feed, team);
    const approval = resolveTeamsFeedFundingApproval(
      this.feed,
      canonicalTeam,
      approvalIdx
    );
    assertPositiveAmount(amount);
    if (approval.period !== this.feed.periods.current) {
      throw new Error(
        "Only the current-period Teams funding approval can accept returns."
      );
    }
    const canonicalToken = getAddress(approval.token);
    const preparedWallet = getPreparedTeamsWallet(this.account, this.chainId);

    return async () => {
      const context = await getValidatedTeamsWriteContext(preparedWallet);
      const binding = {
        action: "return",
        approvalIdx,
        requestedAmount: amount,
        team: canonicalTeam,
        token: canonicalToken,
        preparedAccount: preparedWallet.address,
      } as const;
      const validateTarget = (anchor: TeamsCurrentBlockAnchor) =>
        assertTeamsFundingWriteTarget(
          this.feed,
          context.publicClient,
          anchor,
          binding
        );
      const request = {
        address: canonicalToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [canonicalTeam, amount] as const,
        account: preparedWallet.address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateValidatedTeamsWrite(
        context,
        request,
        validateTarget
      );
    };
  }

  async prepareBonusClaim(
    team: Address,
    recipient: Address
  ): Promise<PreparedTransaction> {
    const canonicalTeam = resolveCanonicalTeamsFeedTeamAddress(this.feed, team);
    assertValidTeamsAddress(recipient, "recipient");
    const preparedWallet = getPreparedTeamsWallet(this.account, this.chainId);

    return async () => {
      const context = await getValidatedTeamsWriteContext(preparedWallet);
      const validateTarget = (anchor: TeamsCurrentBlockAnchor) =>
        assertTeamsBonusWriteTarget(
          this.feed,
          context.publicClient,
          anchor,
          canonicalTeam,
          preparedWallet.address
        );
      const request = {
        address: TEAMS_MAINNET_DEPLOYMENT.bonusDistributor,
        abi: BonusDistributorAbi,
        functionName: "claim",
        args: [canonicalTeam, recipient] as const,
        account: preparedWallet.address,
        chainId: MAINNET_CHAIN_ID,
      };
      return simulateValidatedTeamsWrite(
        context,
        request,
        validateTarget,
        (anchor, result) =>
          assertTeamsBonusSimulationTarget(
            context.publicClient,
            anchor,
            result
          )
      );
    };
  }
}

async function getTeamsWriteRuntime() {
  const [
    {
      getAccount,
      getPublicClient,
      simulateContract,
      writeContract,
    },
    { wagmiConfig },
  ] =
    await Promise.all([
      import("wagmi/actions"),
      import("@/web3/wagmi"),
    ]);

  return {
    getAccount,
    getPublicClient,
    simulateContract,
    wagmiConfig,
    writeContract,
  };
}

type PreparedTeamsWallet = {
  address: Address;
  chainId: typeof MAINNET_CHAIN_ID;
};

function getPreparedTeamsWallet(
  account: string | null,
  chainId: number | null
): PreparedTeamsWallet {
  if (!account || !isAddress(account)) {
    throw new Error("No account connected");
  }
  if (chainId !== MAINNET_CHAIN_ID) {
    throw new Error("Wrong network. Please switch to Ethereum Mainnet.");
  }
  return {
    address: getAddress(account),
    chainId: MAINNET_CHAIN_ID,
  };
}

async function getValidatedTeamsWriteContext(
  preparedWallet: PreparedTeamsWallet
) {
  const runtime = await getTeamsWriteRuntime();
  assertPreparedTeamsWallet(
    preparedWallet,
    runtime.getAccount(runtime.wagmiConfig)
  );
  const publicClient = runtime.getPublicClient(runtime.wagmiConfig, {
    chainId: MAINNET_CHAIN_ID,
  });
  if (!publicClient) {
    throw new Error("Ethereum Mainnet public client is unavailable.");
  }
  const writePublicClient = publicClient as TeamsWritePublicClient;
  await assertTeamsMainnetWriteClient(writePublicClient);
  const anchor = await readTeamsCurrentBlockAnchor(writePublicClient);

  return {
    anchor,
    publicClient: writePublicClient,
    runtime,
    assertWalletAndChain: async () => {
      assertPreparedTeamsWallet(
        preparedWallet,
        runtime.getAccount(runtime.wagmiConfig)
      );
      await assertTeamsMainnetWriteClient(writePublicClient);
    },
    assertAnchorAndWallet: async (
      validationAnchor: TeamsCurrentBlockAnchor
    ) => {
      await assertTeamsBlockAnchorCanonical(
        writePublicClient,
        validationAnchor
      );
      assertPreparedTeamsWallet(
        preparedWallet,
        runtime.getAccount(runtime.wagmiConfig)
      );
      await assertTeamsMainnetWriteClient(writePublicClient);
    },
  };
}

async function simulateValidatedTeamsWrite(
  context: Awaited<ReturnType<typeof getValidatedTeamsWriteContext>>,
  request: unknown,
  validateTarget: (anchor: TeamsCurrentBlockAnchor) => Promise<void>,
  validateSimulationResult?: (
    anchor: TeamsCurrentBlockAnchor,
    result: unknown
  ) => Promise<void>
) {
  let anchor = context.anchor;
  for (
    let attempt = 0;
    attempt < MAX_TEAMS_WRITE_SIMULATION_ATTEMPTS;
    attempt += 1
  ) {
    await validateTarget(anchor);
    await context.assertAnchorAndWallet(anchor);
    const simulation = await context.runtime.simulateContract(
      context.runtime.wagmiConfig,
      addTeamsSimulationBlock(request, anchor.blockNumber) as never
    );
    if (validateSimulationResult) {
      await validateSimulationResult(anchor, simulation.result);
    }
    await context.assertAnchorAndWallet(anchor);
    const latestAnchor = await readTeamsCurrentBlockAnchor(
      context.publicClient
    );
    if (assertTeamsAnchorProgression(anchor, latestAnchor)) {
      anchor = latestAnchor;
      continue;
    }
    await context.assertWalletAndChain();
    return context.runtime.writeContract(
      context.runtime.wagmiConfig,
      removeTeamsSimulationBlock(simulation.request) as never
    );
  }

  throw new TeamsWriteValidationError(
    "The Teams chain head advanced too often to submit a validated transaction."
  );
}

function addTeamsSimulationBlock(
  request: unknown,
  blockNumber: bigint
): Record<string, unknown> {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TeamsWriteValidationError(
      "The Teams transaction request is invalid."
    );
  }
  return {
    ...(request as Record<string, unknown>),
    blockNumber,
  };
}

function removeTeamsSimulationBlock(
  request: unknown
): Record<string, unknown> {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TeamsWriteValidationError(
      "The Teams simulated transaction request is invalid."
    );
  }
  const writeRequest = {
    ...(request as Record<string, unknown>),
  };
  delete writeRequest.blockNumber;
  delete writeRequest.blockTag;
  return writeRequest;
}

function assertTeamsAnchorProgression(
  previous: TeamsCurrentBlockAnchor,
  current: TeamsCurrentBlockAnchor
): boolean {
  if (current.blockNumber < previous.blockNumber) {
    throw new TeamsWriteValidationError(
      "The latest Teams validation anchor regressed."
    );
  }
  if (
    current.blockNumber === previous.blockNumber &&
    current.blockHash.toLowerCase() !== previous.blockHash.toLowerCase()
  ) {
    throw new TeamsWriteValidationError(
      "The Teams validation anchor changed at the same block height."
    );
  }
  return current.blockNumber > previous.blockNumber;
}

function assertPreparedTeamsWallet(
  preparedWallet: PreparedTeamsWallet,
  currentAccount: Parameters<typeof assertMainnetAccount>[0]
): void {
  const currentAddress = assertMainnetAccount(currentAccount);
  if (
    !sameAddress(currentAddress, preparedWallet.address) ||
    currentAccount.chainId !== preparedWallet.chainId
  ) {
    throw new Error(
      "The connected Teams wallet changed after this action was prepared."
    );
  }
}

export function mapTeamsFeedToRuntimeState(
  feed: TeamsFeed,
  account: string | null = null,
  options: TeamsMapOptions = {}
): TeamsMockRuntimeState {
  const data = mapTeamsFeedToPageData(feed, account, options);

  return {
    presetId: READ_ONLY_PRESET_ID,
    data,
    isLoading: false,
    isEmpty: feed.teams.length === 0,
    currentTimeSeconds: feed.generatedAt,
    periodBase: feed.periods.current,
    periodAnchorTimeSeconds: feed.periods.currentStartsAt,
    timeTravelDays: 0,
  };
}

export function mapTeamsFeedToPageData(
  feed: TeamsFeed,
  account: string | null = null,
  options: TeamsMapOptions = {}
): TeamsMockDataV1 {
  const financialData = mapFinancialDataState(feed);
  const teamIds = resolveTeamIds(feed.teams);
  const fundingBuckets = createFeedFundingBuckets(feed.fundingApprovals);
  const teams = feed.teams.map((team) =>
    mapTeam(feed, team, teamIds, financialData, fundingBuckets)
  );
  const viewer = mapViewer(feed, teams, account, options);
  const currentGlobalPeriod = feed.accountant.globalByPeriod.find(
    (entry) => entry.period === feed.periods.current
  );

  return {
    version: 1,
    generatedAt: feed.generatedAt,
    currentPeriod: feed.periods.current,
    financialData,
    viewer,
    selectedTeamId: null,
    totals: {
      currentPeriod: currentGlobalPeriod
        ? mapFinancials(feed, currentGlobalPeriod.financials)
        : sumFinancials(teams, "currentPeriod", financialData),
      lifetime: mapFinancials(feed, feed.accountant.lifetime),
      activeTeamCount: teams.filter((team) => team.status === "active").length,
      retiringTeamCount: teams.filter((team) => team.status === "retiring").length,
      retiredTeamCount: teams.filter((team) => team.status === "retired").length,
    },
    teams,
    admin: mapAdmin(feed, teams),
  };
}

function mapTeam(
  feed: TeamsFeed,
  team: TeamsFeedTeam,
  teamIds: Map<string, TeamId>,
  financialData: TeamsFinancialDataState,
  fundingBuckets: TeamsFundingBucketMap
): TeamRecord {
  const currentPeriod =
    team.periods.find((period) => period.period === feed.periods.current) ?? null;
  const financialPeriods = mapFinancialPeriods(feed, team);
  const fundingApprovals = feed.fundingApprovals
    .filter((approval) => sameAddress(approval.team, team.address))
    .map((approval) => mapFundingApproval(feed, approval, fundingBuckets));
  const id = teamIds.get(normalizeAddress(team.address)) ?? createTeamId(team);

  return {
    id,
    name: team.name,
    address: team.address,
    owner: team.owner,
    pendingOwner: team.pendingOwner,
    status: mapLifecycleStatus(team),
    readOnlyReason: mapReadOnlyReason(team),
    financialData,
    currentPeriod: currentPeriod
      ? mapFinancials(feed, currentPeriod.financials)
      : ZERO_FINANCIALS,
    financialPeriods,
    lifetime: mapFinancials(feed, team.lifetime),
    lifecycle: {
      migrationReadiness: mapMigrationReadiness(team),
      successorTeamId: team.successor
        ? teamIds.get(normalizeAddress(team.successor)) ?? normalizeAddress(team.successor)
        : null,
      retirementAnnouncedAt: null,
      retirementEffectivePeriod: team.retirementPeriod,
    },
    revenueOptions: mapRevenueOptions(feed),
    revenueHistory: mapRevenueHistory(feed, team),
    fundingSummary: deriveTeamsFundingSummary(
      fundingApprovals,
      feed.periods.current
    ),
    fundingApprovals,
    fundingReturns: feed.fundingApprovals
      .filter((approval) => sameAddress(approval.team, team.address))
      .flatMap((approval) => mapFundingReturns(feed, approval)),
    bonus: mapBonus(feed, team),
  };
}

function mapFinancialPeriods(
  feed: TeamsFeed,
  team: TeamsFeedTeam
): TeamFinancialPeriod[] {
  return team.periods
    .map((period) => ({
      period: period.period,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      financials: mapFinancials(feed, period.financials),
    }))
    .sort((left, right) => right.period - left.period);
}

function mapViewer(
  feed: TeamsFeed,
  teams: TeamRecord[],
  account: string | null,
  options: TeamsMapOptions
): TeamsViewerContext {
  const normalizedAccount = account ? normalizeAddress(account) : null;
  const ownedTeam =
    normalizedAccount === null
      ? null
      : teams.find((team) => normalizeAddress(team.owner) === normalizedAccount) ??
        null;
  const isOperator =
    normalizedAccount !== null &&
    feed.revenueRecipient.operator !== null &&
    normalizeAddress(feed.revenueRecipient.operator) === normalizedAccount;
  const role: TeamsViewerRole = isOperator
    ? "operator-admin"
      : ownedTeam
      ? "team-owner"
      : "observer";
  const isMainnetAccount =
    normalizedAccount !== null &&
    options.walletChainId === MAINNET_CHAIN_ID;

  return {
    role,
    address: account,
    teamId: role === "observer" ? null : ownedTeam?.id ?? null,
    actionStateTrusted: options.actionStateTrusted !== false,
    walletStatus:
      normalizedAccount === null
        ? "disconnected"
        : isMainnetAccount
          ? "mainnet"
          : "switch-mainnet",
    revenueDepositsEnabled:
      options.actionStateTrusted !== false &&
      !feed.revenueRecipient.killed,
    canDepositRevenue: false,
    canClaimFunding: false,
    canReturnFunding: false,
    canClaimBonus: false,
    canUseAdmin: isOperator,
  };
}

function mapRevenueOptions(feed: TeamsFeed): RevenueOption[] {
  return Object.values(feed.tokens)
    .filter(isFeedRevenueOptionCandidate)
    .map((token) => {
      const converterAddress = resolveProtocolConverterAddress(token);
      return {
        symbol: token.symbol,
        tokenAddress: token.address,
        decimals: token.decimals,
        isConvertible: converterAddress !== null,
        converterAddress,
        convertToSymbol: null,
        oraclePriceUsd: null,
        previewAmount: null,
        estimatedCreditUsd: null,
      };
    });
}

function mapRevenueHistory(feed: TeamsFeed, team: TeamsFeedTeam): RevenueHistoryEntry[] {
  return team.periods
    .flatMap((period) =>
      period.revenueDeposits.map((deposit) => {
        const token = getFeedToken(feed, deposit.token);
        const converterAddress = resolveProtocolConverterAddress(token);
        return {
          id: deposit.id,
          txHash: deposit.txHash,
          logIndex: deposit.logIndex,
          period: deposit.period,
          symbol: token?.symbol ?? "UNKNOWN",
          amount: formatTeamsRawTokenAmount(
            deposit.amount,
            token?.decimals ?? 18
          ),
          creditedUsd: fromUsd(feed, deposit.revenueUsd),
          converterAddress,
          convertedToSymbol: null,
          depositedBy: deposit.depositor,
          createdAt: deposit.timestamp ?? feed.generatedAt,
        };
      })
    )
    .sort((left, right) => right.createdAt - left.createdAt);
}

function mapFundingApproval(
  feed: TeamsFeed,
  approval: TeamsFeedFundingApproval,
  fundingBuckets: TeamsFundingBucketMap
): FundingApproval {
  const token = getFeedToken(feed, approval.token);
  const decimals = token?.decimals ?? 18;
  const fundingBucket = fundingBuckets.get(getFundingBucketKey(approval));
  if (!fundingBucket) {
    throw new Error(
      `Teams funding bucket is unavailable for approval ${approval.id}.`
    );
  }
  const claimedRaw = approval.claims.reduce(
    (sum, claim) => sum + BigInt(claim.amount),
    0n
  );
  const returnedRaw = approval.returns.reduce(
    (sum, entry) => sum + BigInt(entry.amount),
    0n
  );
  const isReturnSelector = fundingBucket.selectorId === approval.id;
  const outstandingCostUsd =
    isReturnSelector
      ? fundingBucket.claimedCostUsd > fundingBucket.refundedUsd
        ? fundingBucket.claimedCostUsd - fundingBucket.refundedUsd
        : 0n
      : 0n;
  const returnableRaw =
    isReturnSelector && fundingBucket.claimedRaw > fundingBucket.returnedRaw
      ? fundingBucket.claimedRaw - fundingBucket.returnedRaw
      : 0n;

  return {
    id: `approval-${approval.id}`,
    idx: approval.id,
    approvedPeriod: approval.period,
    symbol: token?.symbol ?? "UNKNOWN",
    tokenAddress: approval.token,
    decimals,
    amountRaw: approval.amount,
    usedRaw: approval.used,
    claimableRaw: approval.claimable,
    claimedRaw: claimedRaw.toString(),
    returnedRaw: returnedRaw.toString(),
    returnableRaw: returnableRaw.toString(),
    totalApproved: formatTeamsRawTokenAmount(approval.amount, decimals),
    used: formatTeamsRawTokenAmount(approval.used, decimals),
    claimable: formatTeamsRawTokenAmount(approval.claimable, decimals),
    streamDurationDays: approval.durationSeconds / 86_400,
    status: mapFundingStatus(feed, approval),
    recipient: approval.claims.at(-1)?.recipient ?? null,
    claimedCostUsd: hasCompatibleTeamsFinancialUnits(feed)
      ? fromProtocolUsd18(outstandingCostUsd.toString())
      : null,
    refundValueUsd: hasCompatibleTeamsFinancialUnits(feed)
      ? fromProtocolUsd18(outstandingCostUsd.toString())
      : null,
    averageClaimPriceUsd:
      hasCompatibleTeamsFinancialUnits(feed) && approval.averageCostPriceUsd
      ? fromProtocolUsd18(approval.averageCostPriceUsd)
      : null,
  };
}

type TeamsFundingBucket = {
  selectorId: number;
  claimedRaw: bigint;
  returnedRaw: bigint;
  claimedCostUsd: bigint;
  refundedUsd: bigint;
};

type TeamsFundingBucketMap = Map<string, TeamsFundingBucket>;

function createFeedFundingBuckets(
  approvals: readonly TeamsFeedFundingApproval[]
): TeamsFundingBucketMap {
  const buckets: TeamsFundingBucketMap = new Map();
  for (const approval of approvals) {
    const key = getFundingBucketKey(approval);
    const bucket = buckets.get(key) ?? {
      selectorId: approval.id,
      claimedRaw: 0n,
      returnedRaw: 0n,
      claimedCostUsd: 0n,
      refundedUsd: 0n,
    };
    bucket.selectorId = Math.min(bucket.selectorId, approval.id);
    for (const claim of approval.claims) {
      bucket.claimedRaw += BigInt(claim.amount);
      bucket.claimedCostUsd += BigInt(claim.costUsd);
    }
    for (const fundingReturn of approval.returns) {
      bucket.returnedRaw += BigInt(fundingReturn.amount);
      bucket.refundedUsd += BigInt(fundingReturn.refundUsd);
    }
    buckets.set(key, bucket);
  }
  return buckets;
}

function getFundingBucketKey(
  approval: Pick<TeamsFeedFundingApproval, "period" | "team" | "token">
): string {
  return [
    normalizeAddress(approval.team),
    approval.period,
    normalizeAddress(approval.token),
  ].join(":");
}

function mapFundingReturns(
  feed: TeamsFeed,
  approval: TeamsFeedFundingApproval
): FundingReturnEntry[] {
  const token = getFeedToken(feed, approval.token);
  const decimals = token?.decimals ?? 18;
  return approval.returns.map((entry) => ({
    id: entry.id,
    txHash: entry.txHash,
    logIndex: entry.logIndex,
    approvalId: `approval-${approval.id}`,
    approvalIdx: approval.id,
    period: entry.period,
    symbol: token?.symbol ?? "UNKNOWN",
    decimals,
    amountRaw: entry.amount,
    amount: formatTeamsRawTokenAmount(entry.amount, decimals),
    refundValueUsd: hasCompatibleTeamsFinancialUnits(feed)
      ? fromProtocolUsd18(entry.refundUsd)
      : null,
    returnedBy: entry.sender,
    createdAt: entry.timestamp ?? feed.generatedAt,
  }));
}

function mapBonus(feed: TeamsFeed, team: TeamsFeedTeam): TeamBonusState {
  const claimsByPeriod = new Set(
    feed.bonus.claims
      .filter((claim) => sameAddress(claim.team, team.address))
      .map((claim) => claim.period)
  );
  const periods = team.periods
    .map((period) => mapBonusPeriod(feed, period, claimsByPeriod))
    .filter((period): period is BonusPeriod => period !== null);
  const totalClaimableRaw = periods.reduce(
    (sum, period) => sum + BigInt(period.claimableYfiRaw),
    0n
  );
  const hasClaimable = totalClaimableRaw > 0n;
  const hasPending = periods.some((period) => period.status === "pending-finalization");
  const hasClaimed = periods.some((period) => period.status === "claimed");

  return {
    tokenSymbol: "YFI",
    tokenDecimals: TEAMS_BONUS_TOKEN_DECIMALS,
    status: hasClaimable
      ? "claimable"
      : hasPending
        ? "pending-finalization"
        : hasClaimed
          ? "claimed"
          : "none",
    totalClaimableRaw: totalClaimableRaw.toString(),
    totalClaimable: formatTeamsRawTokenAmount(
      totalClaimableRaw.toString(),
      TEAMS_BONUS_TOKEN_DECIMALS
    ),
    includedPeriodCount: periods.length,
    periods,
  };
}

function mapBonusPeriod(
  feed: TeamsFeed,
  period: TeamsFeedTeamPeriod,
  claimsByPeriod: Set<number>
): BonusPeriod | null {
  const bonus = period.bonus;
  if (!bonus) return null;

  const claimed = claimsByPeriod.has(period.period) || bonus.status === "claimed";
  const finalized = bonus.parameters !== null || claimed || bonus.status !== "unfinalized";
  const status: BonusPeriodStatus = claimed
    ? "claimed"
    : bonus.status === "claimable" && BigInt(bonus.claimableYfi) > 0n
      ? "finalized-claimable"
      : finalized
        ? "finalized-zero"
        : "pending-finalization";
  const adjustedPrice = bonus.parameters?.bonusPriceUsd ?? "0";

  return {
    period: bonus.period,
    status,
    finalized,
    claimed,
    profitUsd: mapFinancials(feed, period.financials).profitUsd,
    adjustedPriceUsd: fromUsd(feed, adjustedPrice),
    bonusFactorBps: bonus.parameters?.bonusFactorBps ?? 0,
    ybcSplitBps: bonus.parameters?.ybcSplitBps ?? 0,
    claimableYfiRaw: bonus.claimableYfi,
    claimableYfi: formatTeamsRawTokenAmount(
      bonus.claimableYfi,
      TEAMS_BONUS_TOKEN_DECIMALS
    ),
  };
}

function mapAdmin(feed: TeamsFeed, teams: TeamRecord[]): TeamsAdminRecord {
  const currentBonusPeriods = teams.flatMap((team) =>
    team.bonus.periods.filter((period) => period.period === feed.periods.current)
  );

  return {
    registryStatus: feed.revenueRecipient.killed ? "deprecated" : "active",
    periodFinalizationStatus:
      currentBonusPeriods.length > 0 &&
      currentBonusPeriods.every((period) => period.finalized)
        ? "finalized"
        : currentBonusPeriods.some((period) => period.status === "pending-finalization")
          ? "open"
          : "ready",
    rewardsBucket: mapBucket(feed, 0),
    treasuryBucket: mapBucket(feed, 1),
    recoveryBucket: mapBucket(feed, 2),
    whitelistedRevenueTokens: Object.values(feed.tokens)
      .filter(isFeedRevenueOptionCandidate)
      .map(mapRevenueTokenAdminRecord),
    fundingQueue: feed.fundingApprovals.map((approval) =>
      mapAdminFundingQueueEntry(feed, teams, approval)
    ),
    bonusQueue: teams.flatMap((team) => mapAdminBonusQueue(team)),
  };
}

function mapBucket(feed: TeamsFeed, index: 0 | 1 | 2): BucketRecord {
  const token = getFeedToken(feed, feed.revenueRecipient.token);
  if (
    !token ||
    feed.revenueRecipient.sumBalance === null ||
    feed.revenueRecipient.used === null
  ) {
    return {
      sourceAvailable: false,
      unit: null,
      budget: null,
      used: null,
      remaining: null,
      status: "unavailable",
    };
  }

  const sumBalance = BigInt(feed.revenueRecipient.sumBalance);
  const budgetRaw =
    (sumBalance * BigInt(feed.revenueRecipient.tokenSplitBps[index])) / 10_000n;
  const usedRaw = BigInt(feed.revenueRecipient.used[index]);
  const remainingRaw = budgetRaw > usedRaw ? budgetRaw - usedRaw : 0n;

  return {
    sourceAvailable: true,
    unit: {
      kind: "token",
      symbol: token.symbol,
      decimals: token.decimals,
    },
    budget: formatTeamsRawTokenAmount(budgetRaw.toString(), token.decimals),
    used: formatTeamsRawTokenAmount(usedRaw.toString(), token.decimals),
    remaining: formatTeamsRawTokenAmount(
      remainingRaw.toString(),
      token.decimals
    ),
    status:
      remainingRaw === 0n && budgetRaw > 0n
        ? "limit-reached"
        : budgetRaw > 0n && (usedRaw * 10n) / budgetRaw >= 8n
          ? "watch"
          : "healthy",
  };
}

function mapRevenueTokenAdminRecord(token: TeamsFeedToken): RevenueTokenAdminRecord {
  return {
    symbol: token.symbol,
    tokenAddress: token.address,
    oracle: token.priceOracle ?? "0x0000000000000000000000000000000000000000",
    converter: token.converter,
    status: "active",
  };
}

function mapAdminFundingQueueEntry(
  feed: TeamsFeed,
  teams: TeamRecord[],
  approval: TeamsFeedFundingApproval
): AdminFundingQueueEntry {
  const teamId =
    teams.find((team) => sameAddress(team.address, approval.team))?.id ??
    normalizeAddress(approval.team);

  return {
    approvalId: `approval-${approval.id}`,
    approvalIdx: approval.id,
    teamId,
    status: mapFundingStatus(feed, approval),
    requiresOperatorAttention:
      approval.period === feed.periods.current &&
      approval.status === "claimable" &&
      BigInt(approval.claimable) > 0n,
  };
}

function mapAdminBonusQueue(team: TeamRecord): AdminBonusQueueEntry[] {
  return team.bonus.periods.map((period) => ({
    teamId: team.id,
    period: period.period,
    status: period.status,
    requiresFinalization: period.status === "pending-finalization",
  }));
}

function mapFundingStatus(
  feed: TeamsFeed,
  approval: TeamsFeedFundingApproval
): FundingApprovalStatus {
  const hasUnusedAllocation =
    BigInt(approval.amount) > BigInt(approval.used);
  if (!hasUnusedAllocation || approval.status === "fully_claimed") {
    return "fully-used";
  }
  if (approval.period < feed.periods.current) return "expired";
  if (approval.period > feed.periods.current) return "scheduled";
  if (approval.status === "claimable" && approval.period === feed.periods.current) {
    return BigInt(approval.used) > 0n ? "partially-claimed" : "claimable-current-period";
  }
  return "current-unavailable";
}

function mapFinancials(
  feed: TeamsFeed,
  financials: TeamsFeedFinancials
): TeamFinancials {
  if (!hasCompatibleTeamsFinancialUnits(feed)) return ZERO_FINANCIALS;

  return {
    revenueUsd: fromProtocolUsd18(financials.revenueUsd),
    costUsd: fromProtocolUsd18(financials.costUsd),
    profitUsd: fromProtocolUsd18(financials.profitUsd),
    lossUsd: fromProtocolUsd18(financials.lossUsd),
  };
}

function sumFinancials(
  teams: readonly TeamRecord[],
  key: "currentPeriod" | "lifetime",
  financialData: TeamsFinancialDataState
): TeamFinancials {
  if (financialData.status === "unavailable") return ZERO_FINANCIALS;

  return {
    revenueUsd: addTeamsDecimalStrings(
      teams.map((team) => team[key].revenueUsd)
    ),
    costUsd: addTeamsDecimalStrings(teams.map((team) => team[key].costUsd)),
    profitUsd: addTeamsDecimalStrings(
      teams.map((team) => team[key].profitUsd)
    ),
    lossUsd: addTeamsDecimalStrings(teams.map((team) => team[key].lossUsd)),
  };
}

function mapLifecycleStatus(team: TeamsFeedTeam): TeamLifecycleStatus {
  if (team.status === "retiring") return "retiring";
  if (team.status === "retired" || team.status === "migrated") return "retired";
  return "active";
}

function mapReadOnlyReason(team: TeamsFeedTeam): TeamReadOnlyReason | null {
  if (team.status === "retired" || team.status === "migrated") return "retired";
  if (team.successor) return "successor-active";
  return null;
}

function mapMigrationReadiness(team: TeamsFeedTeam): TeamMigrationReadiness {
  if (team.status === "migrated") return "completed";
  if (team.successor) return "ready";
  return "not-needed";
}

function resolveTeamIds(teams: TeamsFeedTeam[]) {
  const counts = new Map<string, number>();
  const ids = new Map<string, TeamId>();

  for (const team of teams) {
    const baseId = createTeamId(team);
    const count = counts.get(baseId) ?? 0;
    counts.set(baseId, count + 1);
    ids.set(
      normalizeAddress(team.address),
      count === 0 ? baseId : `${baseId}-${team.index}`
    );
  }

  return ids;
}

export function resolveCanonicalTeamsFeedTeamAddress(
  feed: TeamsFeed,
  requestedAddress: string
): Address {
  assertValidTeamsAddress(requestedAddress, "team");
  const team = feed.teams.find((entry) =>
    sameAddress(entry.address, requestedAddress)
  );
  if (!team) {
    throw new Error("The selected Teams contract is not present in the current feed.");
  }
  return getAddress(team.address);
}

function resolveCanonicalTeamsFeedTokenAddress(
  feed: TeamsFeed,
  requestedAddress: string
): Address {
  assertValidTeamsAddress(requestedAddress, "token");
  const token = Object.values(feed.tokens).find((entry) =>
    sameAddress(entry.address, requestedAddress)
  );
  if (!token || !hasFeedRevenueOracle(token)) {
    throw new Error("The selected revenue token is not supported by the current feed.");
  }
  return getAddress(token.address);
}

function hasFeedRevenueOracle(token: TeamsFeedToken) {
  return (
    token.priceOracle !== null &&
    normalizeAddress(token.priceOracle) !== ZERO_ADDRESS
  );
}

function isFeedRevenueOptionCandidate(token: TeamsFeedToken) {
  return token.kind !== "bonus" && hasFeedRevenueOracle(token);
}

function resolveTeamsFeedFundingApproval(
  feed: TeamsFeed,
  team: Address,
  approvalIdx: bigint
): TeamsFeedFundingApproval {
  const approval = feed.fundingApprovals.find(
    (entry) =>
      BigInt(entry.id) === approvalIdx && sameAddress(entry.team, team)
  );
  if (!approval) {
    throw new Error(
      "The selected Teams funding approval is not present for this team."
    );
  }
  return approval;
}

function createTeamId(team: TeamsFeedTeam) {
  const slug = team.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || normalizeAddress(team.address);
}

function resolveProtocolConverterAddress(
  token: TeamsFeedToken | null
): string | null {
  return token?.converter ?? null;
}

function getFeedToken(feed: TeamsFeed, address: string | null | undefined) {
  if (!address) return null;
  const normalized = normalizeAddress(address);
  return (
    Object.values(feed.tokens).find(
      (token) => normalizeAddress(token.address) === normalized
    ) ?? null
  );
}

function mapFinancialDataState(feed: TeamsFeed): TeamsFinancialDataState {
  return hasCompatibleTeamsFinancialUnits(feed)
    ? {
        status: "available",
        source: "feed",
        usdDecimals: TEAMS_PROTOCOL_USD_DECIMALS,
      }
    : {
        status: "unavailable",
        source: "feed",
        reason: "incompatible-feed",
        feedVersion: feed.version,
      };
}

function fromUsd(feed: TeamsFeed, value: string) {
  return hasCompatibleTeamsFinancialUnits(feed)
    ? fromProtocolUsd18(value)
    : "0";
}

function fromProtocolUsd18(value: string) {
  return toFixedDisplay(
    value as ProtocolUsd18String,
    TEAMS_PROTOCOL_USD_DECIMALS,
    2
  );
}

function toFixedDisplay(value: string, decimals: number, fractionDigits: number) {
  const formatted = formatUnits(BigInt(value), decimals);
  const [whole, fraction = ""] = formatted.split(".");

  if (fractionDigits === 0) return whole ?? "0";

  const paddedFraction = fraction.padEnd(fractionDigits, "0");
  const trimmedFraction = paddedFraction
    .slice(0, fractionDigits)
    .replace(/0+$/, "");
  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole ?? "0";
}

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function sameAddress(left: string, right: string) {
  return normalizeAddress(left) === normalizeAddress(right);
}

function assertValidTeamsAddress(address: string, label: string) {
  if (!isAddress(address) || normalizeAddress(address) === ZERO_ADDRESS) {
    throw new Error(`Invalid Teams ${label} address.`);
  }
}

function assertPositiveAmount(amount: bigint) {
  if (amount <= 0n) {
    throw new Error("Teams write amount must be greater than zero.");
  }
}
