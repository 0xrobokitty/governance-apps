import type { BadgeProps } from "@/components/ui/Badge";
import type {
  BucketStatus,
  BonusPeriodStatus,
  FundingApprovalStatus,
  PeriodFinalizationStatus,
  RevenueTokenAdminStatus,
  TeamBonusStatus,
  TeamLifecycleStatus,
  TeamFundingSummaryState,
  TeamMigrationReadiness,
  TeamReadOnlyReason,
  TeamsRegistryStatus,
  TeamsViewerRole,
} from "@/lib/clients/teams";

type StatusCopy = {
  label: string;
  variant: BadgeProps["variant"];
};

export const teamsCopy = {
  app: {
    slug: "teams",
    routeKey: "/teams",
    displayLabel: "Team Finances",
    betaHost: "teams-beta.dao-ops.com",
    productionHost: "teams.yearn.fi",
  },
  page: {
    title: "Team Finances",
    description:
      "Review each team's revenue, costs, funding, bonus, and status.",
    refreshing: "Refreshing Teams data",
    lastUpdated: "Last updated",
    unavailableTitle: "Teams snapshot unavailable",
    unavailableBody:
      "No Teams data is shown because a canonical mainnet snapshot could not be verified.",
    retryCta: "Retry",
    retrying: "Retrying",
  },
  navigation: {
    directory: "Teams",
    workspace: "Team",
    admin: "Admin",
    backToDirectory: "Teams",
    selectTeamFirst: "Select a team from the directory first.",
  },
  stats: {
    currentPeriod: "Current period",
    activeTeams: "Active",
    retiringTeams: "Retiring",
    retiredTeams: "Retired",
    viewerRole: "Viewer",
  },
  financialData: {
    unavailableValue: "--",
    unavailableTitle: "Financial data unavailable",
    unavailableBody:
      "Financial values are hidden until this data source declares its USD units. Team details and actions are still available.",
  },
  controls: {
    description:
      "Load known states and adjust the Teams runtime.",
    presetLabel: "Preset",
    viewerLabel: "Viewer",
    workspaceLabel: "Team",
    currentPeriodLabel: "Current period",
    scenarioLabel: "Presets",
    directoryOnly: "Directory only",
    surfaceLabel: "Route state",
    surfaceNames: {
      live: "Live",
      loading: "Loading",
      empty: "Empty",
    },
    scenarioNames: {
      "directory-observer": "Directory mix",
      "team-owner-funding": "Owner team",
      "bonus-available": "Single-team snapshot",
      "finance-operator-revenue": "Operator team",
      "retired-read-only": "Retired team",
      "operator-admin": "Operator/admin view",
    },
    customRuntime: "Custom runtime",
  },
  directory: {
    title: "Team Directory",
    description: "Compare registered teams by period or all-time totals.",
    loadingTitle: "Loading team directory",
    loadingBody: "Loading the current team list.",
    emptyTitle: "No teams available",
    emptyBody:
      "No teams are available in this view yet.",
    emptyHint: "No teams are available right now.",
    headers: {
      team: "Team",
      owner: "Owner",
      status: "Status",
      period: "Period",
      revenue: "Revenue",
      cost: "Cost",
      net: "Net",
    },
    scope: {
      label: "Financial scope",
      current: "Current period",
      period: "Period history",
      lifetime: "All-time",
      periodSelect: "Period",
      unavailable: "No periods available",
      currentPeriodLabel: (period: number) => `Current period #${period}`,
      currentCompactLabel: (period: number) => `Current #${period}`,
      periodLabel: (period: number) => `Period #${period}`,
      periodCompactLabel: (period: number) => `Period #${period}`,
      missingPeriod: "No period data",
      missingPeriodValue: "--",
      lifetimeStrip: "All-time",
      scopedSummary: (scope: string) => `${scope} financials`,
    },
  },
  workspace: {
    title: "Team details",
    loadingTitle: "Loading team overview",
    loadingBody: "Loading team details.",
    emptyTitle: "No team selected",
    emptyBody:
      "Open a team from the directory to see its current and all-time totals.",
    noTeamsTitle: "No team available",
    noTeamsBody: "Team details appear here once a team is available.",
    cards: {
      current: "Current Budget Period",
      lifetime: "Lifetime",
      revenue: "Revenue",
      cost: "Cost",
    },
    financialHistory: {
      title: "Financial History",
      empty: "No period financials are available for this team yet.",
      currentBadge: "Current",
      headers: {
        period: "Period",
        dates: "Dates",
        revenue: "Revenue",
        cost: "Cost",
        net: "Profit / Loss",
      },
    },
    fields: {
      teamId: "Team ID",
      contract: "Contract",
      owner: "Owner",
      pendingOwner: "Pending owner",
      migration: "Migration readiness",
      successor: "Successor",
      retirement: "Retirement",
      viewer: "Viewer permissions",
    },
    ownership: {
      pendingTransfer: "Transfer pending to",
      pendingTransferHelp:
        "The current owner nominated this address. Ownership does not change until the transfer is accepted.",
    },
    actionDeck: {
      title: "Actions",
      description: "Deposit revenue or manage funding and bonus claims.",
      outflowsTitle: "Funding and bonus",
      fundingTitle: "Funding approvals",
      fundingBody:
        "Claims spend approved funding. Returns account for used funding.",
      fundingClaimSource: "Claim source",
      fundingReturnSource: "Return accounting",
      fundingClaimableCount: "Claimable approvals",
      fundingReturnableCount: "Returnable approvals",
      fundingClaimableValue: "Claimable USD value",
      fundingRefundableValue: "Refundable value",
      fundingClaimBody: (approvalIdx: number, amount: string, periodLabel: string) =>
        `Approval #${approvalIdx} has ${amount} available from ${periodLabel}.`,
      fundingReturnBody: (approvalIdx: number, amount: string) =>
        `Approval #${approvalIdx} has ${amount} in the current aggregate return bucket.`,
      fundingNoClaimable:
        "No funding approval is claimable right now.",
      fundingNoReturnable:
        "No used funding can be returned right now.",
      fundingCta: "Open funding claim and return flows",
      fundingClaimCta: "Open funding claim flow",
      fundingReturnCta: "Open funding return flow",
      bonusTitle: "YFI bonus",
      bonusBody:
        "Bonus YFI comes from finalized period profit.",
      bonusStatus: "Bonus state",
      bonusClaimable: "Claimable now",
      bonusPeriods: "Periods included",
      bonusPending: "Awaiting finalization",
      bonusCta: "Open bonus claim",
    },
  },
  bonus: {
    title: "Bonus",
    description:
      "Calculated YFI includes the YBC share. Claims require a funded bonus pool.",
    placeholders: {
      loading: "Loading bonus totals and period detail.",
      empty:
        "Bonus totals appear once a team is selected.",
      unselected:
        "Open a team from the directory to see its bonus.",
    },
    summary: {
      claimable: "Finalized bonus (gross)",
      periods: "Periods included",
      awaitingFinalization: "Awaiting finalization",
      noPendingFinalization: "None",
      currentState: "Current state",
    },
    periodDetailSummary: "View period detail and math",
    periodClaimable: "Gross bonus",
    periodLabel: (period: number) => `Period ${period}`,
    periodCount: (count: number) =>
      `${count.toLocaleString("en-US")} ${count === 1 ? "period" : "periods"}`,
    mathTrigger: "Math inputs",
    math: {
      profit: "Team profit",
      adjustedPrice: "Adjusted price",
      bonusFactor: "Bonus factor",
      ybcSplit: "YBC split",
      yfiOutput: "Gross YFI output",
    },
    action: {
      title: "Primary action",
      claimCta: "Claim Bonus",
      stagedCta: "Claim staged",
      permissionCta: "Team owner required",
      pendingCta: "Waiting for finalization",
      claimedCta: "Already claimed",
      noneCta: "No bonus to claim",
      claimBody:
        "Stage the claim and keep the period detail visible.",
      liveClaimBody:
        "Claim the finalized bonus. Period detail stays visible.",
      stagedBody:
        "The claim is staged for review. The bonus breakdown stays visible.",
      permissionBody:
        "Only the eligible team owner can claim this bonus.",
      pendingBody:
        "The period must finalize before this bonus can be claimed.",
      claimedBody:
        "The latest finalized bonus has already been claimed.",
      noneBody:
        "There is no claimable bonus yet.",
    },
    summaries: {
      claimable: (amount: string) =>
        `${amount} is finalized before the YBC split.`,
      claimableWithPending: (amount: string, pendingPeriods: number) =>
        `${amount} is finalized before the YBC split. ${pendingPeriods.toLocaleString("en-US")} ${pendingPeriods === 1 ? "period is" : "periods are"} still waiting for finalization.`,
      pendingFinalization: (pendingPeriods: number) =>
        `No YFI is claimable yet. ${pendingPeriods.toLocaleString("en-US")} ${pendingPeriods === 1 ? "period is" : "periods are"} still waiting for finalization.`,
      claimed:
        "The latest finalized bonus period has already been claimed.",
      none: "No bonus periods are included yet.",
      noneWithHistory:
        "Included periods have no claimable YFI.",
    },
    noPeriods: "No bonus periods are available for this team.",
    statuses: {
      none: {
        label: "No bonus",
        variant: "neutral",
      },
      "pending-finalization": {
        label: "Pending finalization",
        variant: "warning",
      },
      claimable: {
        label: "Finalized",
        variant: "success",
      },
      claimed: {
        label: "Claimed",
        variant: "neutral",
      },
    } satisfies Record<TeamBonusStatus, StatusCopy>,
    periodStatuses: {
      "pending-finalization": {
        label: "Pending finalization",
        variant: "warning",
        body: "The open period is still waiting on finalization, so it stays out of the claimable total.",
      },
      "finalized-claimable": {
        label: "Finalized",
        variant: "success",
        body: "This period is finalized and contributes to the claimable total.",
      },
      "finalized-zero": {
        label: "Finalized to zero",
        variant: "neutral",
        body: "This period finalized with no claimable bonus after applying the configured math.",
      },
      claimed: {
        label: "Claimed",
        variant: "neutral",
        body: "This finalized period has already been claimed and now serves as history only.",
      },
    } satisfies Record<BonusPeriodStatus, StatusCopy & { body: string }>,
  },
  lifecycle: {
    title: "Ownership and Status",
    description:
      "Check owner, retirement, migration, and successor state.",
    placeholders: {
      loading: "Loading owner, retirement, migration, and successor state.",
      empty:
        "Ownership and status details appear once a team is selected.",
      unselected:
        "Open a team from the directory to see owner and status details.",
    },
    atAGlance: "At a glance",
    activeWorkspace: "Active",
    successorNone: "No successor",
    unknownPeriod: "an upcoming period",
    fields: {
      owner: "Owner",
      pendingOwner: "Pending owner",
      retirement: "Retirement",
      migration: "Migration readiness",
      successor: "Successor",
      workspaceAccess: "Access",
    },
    retirement: {
      active: "No retirement scheduled",
      notScheduled: "Retirement not scheduled",
      retiringPrefix: "Retires in period",
      retiredPrefix: "Retired in period",
      announcedPrefix: "Announced",
    },
    summaries: {
      active:
        "This team is active with no retirement scheduled.",
      retiring: (periodLabel: string) =>
        `Retirement is scheduled for ${periodLabel}.`,
      retired: (successor: string) =>
        `This team is retired and read-only. ${successor === "No successor" ? "No successor is recorded." : `Successor: ${successor}.`}`,
    },
    migrationReadiness: {
      "not-needed": {
        label: "No migration needed",
        variant: "neutral",
      },
      pending: {
        label: "Migration pending",
        variant: "warning",
      },
      ready: {
        label: "Migration ready",
        variant: "warning",
      },
      completed: {
        label: "Migration completed",
        variant: "success",
      },
    } satisfies Record<TeamMigrationReadiness, StatusCopy>,
  },
  revenue: {
    title: "Revenue Deposit",
    description:
      "Deposit a supported revenue token. Protocol accounting records the final USD credit.",
    loadingTitle: "Loading revenue deposit flow",
    loadingBody:
      "Loading supported tokens, deposit details, and recent deposits.",
    emptyTitle: "No revenue data available",
    emptyBody: "Revenue deposits appear once a team is selected.",
    noTeamTitle: "No team selected",
    noTeamBody:
      "Open a team from the directory to deposit revenue.",
    permissionless: {
      title: "Permissionless action",
      body: "Anyone can deposit supported revenue tokens for this team.",
    },
    unavailable: {
      title: "Deposits unavailable for this team",
      disabledCta: "Deposit unavailable",
      untrustedTitle: "Deposit actions paused",
      untrustedBody:
        "Producer values remain visible for review, but token approval and deposit submission are paused until a current verified Ethereum Mainnet snapshot is available.",
      untrustedCta: "Waiting for verified snapshot",
      connectTitle: "Connect a wallet to deposit",
      connectBody:
        "Revenue deposits are permissionless. Connect a wallet to continue.",
      connectCta: "Connect wallet",
      networkTitle: "Switch to Ethereum Mainnet",
      networkBody:
        "Revenue deposits are available on Ethereum Mainnet only.",
      networkCta: "Switch network",
      readOnlyBody:
        "This team is read-only, so new deposits stay disabled.",
      restrictedBody:
        "The revenue recipient is not accepting deposits for this team.",
      optionsBody:
        "No supported revenue tokens are available for new deposits.",
    },
    form: {
      tokenLabel: "Supported tokens",
      amountLabel: "Deposit amount",
      amountHint:
        "Protocol accounting determines the final credited USD after submission.",
      submit: "Deposit revenue",
      approve: "Approve token",
      balanceLabel: "Balance",
      amountError: "Enter an amount greater than 0.",
      amountExceedsBalance: "Amount exceeds the connected wallet balance.",
      quoteUnavailable:
        "This mock token has no deterministic credit fixture, so the mock deposit cannot be recorded.",
    },
    tokenBadges: {
      convertible: "Auto-converts",
      direct: "Direct credit",
    },
    preview: {
      title: "Deposit preview",
      submitted: "Depositing",
      path: "Deposit path",
      credit: "Reference accountant credit",
      direct: "Direct accountant credit",
      quote: "Mock reference credit",
      quoteUnavailable:
        "No pre-submit USD credit is available. Protocol accounting records the final credit.",
      convertedPrefix: "Auto-converts to",
      protocolConverter: "Via protocol converter",
      conversionRequired: "Protocol conversion",
    },
    history: {
      title: "Recent deposit history",
      description:
        "Review recently recorded deposits and their final credited USD.",
      auditTitle: "Revenue ledger",
      auditDescription:
        "Deposit transactions with log indices, periods, amounts, and credited USD.",
      emptyTitle: "No deposits recorded yet",
      emptyBody: "This team has no revenue deposit history yet.",
      headers: {
        record: "Transaction",
        period: "Period",
        deposit: "Deposit",
        credit: "Credited USD",
        path: "Path",
        depositor: "Deposited by",
        recorded: "Recorded",
      },
      direct: "Direct credit",
      logIndex: (value: number) => `Log #${value}`,
      localRecord: "Local preview",
      permissionlessDepositor: "Permissionless depositor",
    },
    success: {
      title: "Deposit recorded",
      body:
        "The mock deposit and its fixture-backed USD credit were recorded for this session.",
      currentPeriodPrefix: "Current period",
    },
  },
  funding: {
    title: "Funding Approvals",
    description:
      "Review current-period claims, expired approval history, and returns.",
    emptyTitle: "No funding approvals available",
    emptyBody:
      "This team has no funding approvals yet.",
    summary: {
      claimableUsd: "Current claimable USD",
      refundableUsd: "Refundable value",
      state: "Funding state",
      expiredCount: "Expired approvals",
    },
    summaryStates: {
      "no-approvals": "No approvals",
      "has-claimable": "Claimable balance available",
      "partially-claimed": "Claimed and claimable balances",
      "has-expired": "Includes expired approvals",
      "current-unavailable": "Current claims unavailable",
      "fully-used": "Fully used",
    } satisfies Record<TeamFundingSummaryState, string>,
    headers: {
      approval: "Approval",
      token: "Token",
      period: "Period scope",
      recipient: "Recipient",
      totalApproved: "Total approved",
      used: "Used",
      unclaimed: "Unclaimed allocation",
      claimable: "Current claimable",
      flow: "Claim settlement",
      actions: "Actions",
    },
    statuses: {
      "claimable-current-period": {
        label: "Claimable now",
        variant: "success",
      },
      "partially-claimed": {
        label: "Partially claimed",
        variant: "warning",
      },
      expired: {
        label: "Expired",
        variant: "warning",
      },
      scheduled: {
        label: "Scheduled",
        variant: "neutral",
      },
      "current-unavailable": {
        label: "Claims unavailable",
        variant: "warning",
      },
      "fully-used": {
        label: "Fully used",
        variant: "neutral",
      },
    } satisfies Record<FundingApprovalStatus, StatusCopy>,
    periodScope: {
      currentPeriod: (period: number) => `Current period #${period} claimable now`,
      expired: (period: number) => `Period #${period} expired — audit only`,
      future: (period: number) => `Queued for period #${period}`,
      currentUnavailable: (period: number) =>
        `Current period #${period} — claims unavailable`,
      spent: (period: number) => `Period #${period} fully used`,
    },
    recipientMissing: "Recipient required on claim",
    actions: {
      claim: "Use in claim flow",
      claimSelected: "Selected for claim",
      return: "Use in return flow",
      returnSelected: "Selected for return",
      none: "No action available",
    },
    flow: {
      vestingWindow: (duration: string) =>
        `Vesting window • ${duration} from period start`,
      immediate: "Transfers immediately",
      expired: "Not claimable • audit only",
      future: "Not claimable yet",
      currentUnavailable: "Claims unavailable • current returns stay permissionless",
      spent: "No remaining balance",
    },
    claimForm: {
      title: "Claim Funding",
      description:
        "Select a claimable approval, set a recipient, and simulate the owner claim flow.",
      disabledPermission: "This viewer cannot claim funding in the current view.",
      disabledPermissionCta: "Claim unavailable",
      disabledNoApproval: "Select a claimable approval from the table.",
      disabledNoApprovalCta: "Select approval to claim",
      selectedApproval: "Selected approval",
      selectedState: "Claim status",
      recipient: "Recipient",
      recipientPlaceholder: "0x0000000000000000000000000000000000000000",
      amount: "Amount to claim",
      maxLabel: "Claimable",
      submit: "Claim funding",
      helpers: {
        vestingWindow: (duration: string) =>
          `During the ${duration} window from the period start, a claim vests. After that window, it transfers immediately.`,
        immediate:
          "This current-period approval has no vesting window, so a claim transfers immediately.",
        expired:
          "This approval belongs to a past period and is retained for audit only. It cannot be claimed.",
        future: "This approval is visible but not claimable in the current period.",
        currentUnavailable:
          "This approval is current, but protocol claims are unavailable. Current aggregate returns remain permissionless.",
        spent: "This approval has no remaining claimable balance.",
      },
      success: (
        amount: string,
        symbol: string,
        approvalIdx: number,
        recipient: string
      ) => `Claimed ${amount} ${symbol} from Approval #${approvalIdx} to ${recipient}.`,
      errors: {
        recipientRequired: "Enter a recipient address.",
        recipientInvalid: "Enter a valid recipient address.",
        amountRequired: "Enter an amount to claim.",
        amountInvalid: "Enter an amount greater than zero.",
        amountExceeds: "Claim amount exceeds the remaining balance.",
      },
    },
    returnForm: {
      title: "Return Funding",
      description:
        "Return previously claimed tokens against the current team, period, and token cost bucket.",
      disabledPermission: "This viewer cannot return funding in the current view.",
      disabledPermissionCta: "Return unavailable",
      disabledNoApproval: "Select a refundable approval from the table.",
      disabledNoApprovalCta: "Select approval to return",
      selectedApproval: "Selected approval",
      averagePrice: "Current aggregate cost price",
      amount: "Amount to return",
      maxLabel: "Refundable balance",
      balanceLabel: "Balance",
      estimate: "Estimated refund value",
      note: "Refund accounting uses the current aggregate average cost for this team, period, and token.",
      submit: "Return funding",
      approve: "Approve token",
      success: (
        amount: string,
        symbol: string,
        approvalIdx: number,
        refundValue: string
      ) => `Returned ${amount} ${symbol} from Approval #${approvalIdx} for ${refundValue}.`,
      errors: {
        amountRequired: "Enter an amount to return.",
        amountInvalid: "Enter an amount greater than zero.",
        amountExceeds: "Return amount exceeds the remaining refundable balance.",
        amountExceedsBalance: "Return amount exceeds the connected wallet balance.",
      },
    },
    history: {
      title: "Return history",
      empty: "No funding returns have been recorded yet.",
      record: "Return transaction",
      localRecord: "Local preview",
      logIndex: (value: number) => `Log #${value}`,
      period: (period: number) => `Period #${period}`,
      approval: (approvalIdx: number) => `Approval #${approvalIdx}`,
      returnedBy: "Returned by",
    },
  },
  admin: {
    title: "Admin Console",
    description:
      "Review registry state, revenue tokens, funding queue, and bonus finalization.",
    loadingTitle: "Loading admin console",
    loadingBody:
      "Loading registry, bucket, funding, and bonus detail.",
    emptyTitle: "No admin console available",
    emptyBody:
      "Admin controls appear for operator viewers.",
    accessCard: {
      title: "Admin access required",
      body:
        "Switch to an operator viewer to inspect registry, revenue, funding, and bonus controls.",
      viewerLabel: "Current viewer",
      accessLabel: "Admin controls",
      lockedValue: "Locked",
      hint: "Operator controls unlock for admin viewers.",
    },
    summary: {
      title: "Admin summary",
      viewer: "Viewer",
      currentPeriod: "Current period",
      registryStatus: "Registry",
      finalizationStatus: "Period finalization",
    },
    registry: {
      title: "Registry",
      description:
        "Review team status, retirement timing, successor, and migration state.",
      metrics: {
        active: "Active teams",
        retiring: "Retiring teams",
        retired: "Retired teams",
      },
      headers: {
        team: "Team",
        owner: "Owner",
        status: "Status",
        retirement: "Retirement",
        migration: "Migration",
        workspace: "Team",
      },
      retirement: {
        active: "No retirement scheduled",
        period: (period: number) => `Period #${period}`,
        retired: "Historical team",
      },
      workspace: {
        full: "Full access",
        readOnlyPrefix: "Read-only",
        successor: (teamId: string) => `Successor: ${teamId}`,
        noSuccessor: "No successor set",
      },
    },
    revenue: {
      title: "Revenue Ops",
      description:
        "Review bucket headroom and whitelisted revenue tokens.",
      directCredit: "Direct credit",
      bucketUsage: "Bucket usage",
      ofBudget: "of budget used",
      bucketUnavailable:
        "Bucket accounting is unavailable until the feed identifies the source token and its decimals.",
      bucketLabels: {
        rewards: "Rewards bucket",
        treasury: "Treasury bucket",
        recovery: "Recovery bucket",
      },
      bucketMetrics: {
        budget: "Budget",
        used: "Used",
        remaining: "Remaining",
      },
      tokenTitle: "Whitelisted revenue tokens",
      tokenHeaders: {
        token: "Token",
        status: "Status",
        oracle: "Oracle",
        converter: "Converter",
      },
    },
    fundingOps: {
      title: "Funding Ops",
      description:
        "Track current approval readiness and expired audit records.",
      metrics: {
        approvals: "Approvals visible",
        attention: "Operator attention",
        expired: "Expired approvals",
      },
      headers: {
        approval: "Approval",
        team: "Team",
        status: "Status",
        attention: "Operator attention",
      },
    },
    bonusOps: {
      title: "Bonus Ops",
      description:
        "Review bonus periods and finalization status.",
      metrics: {
        periods: "Periods visible",
        finalization: "Needs finalization",
        history: "Claimed history",
      },
      headers: {
        team: "Team",
        period: "Period",
        status: "Status",
        finalization: "Finalization",
      },
      currentPeriod: (period: number) => `Period #${period}`,
    },
    registryStatuses: {
      active: {
        label: "Active",
        variant: "success",
      },
      paused: {
        label: "Paused",
        variant: "warning",
      },
      deprecated: {
        label: "Deprecated",
        variant: "neutral",
      },
    } satisfies Record<TeamsRegistryStatus, StatusCopy>,
    finalizationStatuses: {
      open: {
        label: "Open",
        variant: "neutral",
      },
      ready: {
        label: "Ready to finalize",
        variant: "warning",
      },
      finalized: {
        label: "Finalized",
        variant: "success",
      },
    } satisfies Record<PeriodFinalizationStatus, StatusCopy>,
    bucketStatuses: {
      healthy: {
        label: "Healthy",
        variant: "success",
      },
      watch: {
        label: "Watch",
        variant: "warning",
      },
      "limit-reached": {
        label: "Limit reached",
        variant: "error",
      },
      unavailable: {
        label: "Unavailable",
        variant: "neutral",
      },
    } satisfies Record<BucketStatus, StatusCopy>,
    tokenStatuses: {
      active: {
        label: "Active",
        variant: "success",
      },
      paused: {
        label: "Paused",
        variant: "warning",
      },
    } satisfies Record<RevenueTokenAdminStatus, StatusCopy>,
    operatorAttention: {
      clear: {
        label: "Clear",
        variant: "neutral",
      },
      required: {
        label: "Required",
        variant: "warning",
      },
    },
    finalizationState: {
      complete: {
        label: "Reviewed",
        variant: "neutral",
      },
      required: {
        label: "Finalize",
        variant: "warning",
      },
    },
  },
  viewerRoles: {
    observer: "Observer",
    "team-owner": "Team owner",
    "finance-operator": "Finance operator",
    "operator-admin": "Operator/admin",
  } satisfies Record<TeamsViewerRole, string>,
  statuses: {
    active: {
      label: "Active",
      variant: "success",
    },
    retiring: {
      label: "Retiring",
      variant: "warning",
    },
    retired: {
      label: "Retired",
      variant: "neutral",
    },
  } satisfies Record<TeamLifecycleStatus, StatusCopy>,
  readOnlyReasons: {
    retired: "Read-only after retirement",
    "successor-active": "Read-only while successor is active",
  } satisfies Record<TeamReadOnlyReason, string>,
} as const;
