export const styfiCopy = {
  accountSummary: {
    ybc: {
      section: "Other Governance Positions",
      title: "Yearn Builders Collective",
      symbol: "YBC",
      open: "View YBC membership",
      backing: "Estimated backing",
      calculation: "Your reward share × collective backing",
      formula: (share: string, total: string, backing: string) => `${share}% × ${total} YFI ≈ ${backing} YFI`,
      explanation: "This backing supports your YBC rewards. It is not an additional deposit or a withdrawable balance.",
      disabled: "New YBC rewards are disabled. Previously earned rewards remain claimable.",
    },
  },
  shared: {
    blacklistedTitle: "Blacklisted",
    blacklistedBody:
      "This address is restricted from making token transfers or making governance proposals. Voting or unstaking is still allowed.",
  },
  page: {
    stats: {
      totalSupply: { label: "Total Supply" },
      staked: { label: "Staked" },
      apr: { label: "stYFIx APR" },
      aprEpoch1: { label: "Epoch 1 APR" },
    },
    connectBanner: {
      title: "Wallet not connected",
      body: "Connect your wallet to view and manage positions.",
      cta: "Connect wallet",
      wrongNetwork:
        "Wrong network detected. Switch your wallet to Ethereum Mainnet to manage positions.",
    },
  },
  modeSelector: {
    kicker: "Your position",
    compareLabel: "Compare modes",
    compareAria: {
      expand: "Expand mode drawer",
      collapse: "Collapse mode drawer",
    },
    switchAria: (modeLabel: string) => `Switch to ${modeLabel}`,
    balanceSuffix: (modeLabel: string) => `in ${modeLabel}`,
    balanceWithExiting: (unstaking: string) =>
      `Active (+ ${unstaking} unstaking)`,
    balanceWithExited: (withdrawable: string) =>
      `Active (+ ${withdrawable} withdrawable)`,
    balanceExitingOnly: (unstaking: string) => `(${unstaking} unstaking)`,
    balanceExitedOnly: (withdrawable: string) => `(${withdrawable} withdrawable)`,
    disconnected: "Connect your wallet to view balances.",
    drawer: {
      title: "Choose how you want to stake",
      body: "Choose direct voting with stYFI or delegated voting with stYFIx.",
    },
    activeBadge: "Selected",
    cards: {
      styfi: {
        title: "stYFI",
        badge: "Vote-dependent APR",
        kicker: "For active governance participants",
        description:
          "Keep your vote. Your participation determines your Vote Boost.",
      },
      x: {
        title: "stYFIx",
        badge: "Delegated",
        recommended: "Recommended",
        kicker: "For delegated governance",
        description:
          "Delegate your vote to YBC to earn maximum APR.",
      },
    },
  },
  governance: {
    headerLabel: "Voting & Proposals",
  },
  hero: {
    kicker: "Choose your path",
    title: "Stake with stYFI or stYFIx",
    body: "stYFI earns standard rewards with a fixed cooldown. stYFIx delegates voting power for a simpler experience. Pick a mode to enter the cockpit.",
    footer: {
      text: "Need veYFI?",
      linkLabel: "Go to veYFI",
    },
    cards: {
      styfi: {
        description: "Fixed share price, straightforward staking and cooldown.",
        cta: (modeLabel: string) => `Enter ${modeLabel}`,
      },
      x: {
        description:
          "Delegated vault with boosted rewards and flexible deposits.",
        cta: (modeLabel: string) => `Enter ${modeLabel}`,
      },
    },
  },
  toolbar: {
    title: "Your position",
    summarySuffix: (modeLabel: string) => `as ${modeLabel}`,
    descriptions: {
      styfi: "stYFI keeps your vote and earns standard rewards.",
      x: "stYFIx delegates voting to YBC. Its Vote Boost follows YBC participation.",
    },
    mode: {
      styfiLabel: "stYFI",
      xLabel: "stYFIx",
    },
  },
  cockpit: {
    mockBanner: {
      title: "Mock mode",
      body: "This dashboard uses deterministic mock balances, rewards, and voting participation.",
      resetCta: "Reset mock state",
    },
  },
  debug: {
    aprScenariosLabel: "APR scenarios",
    aprScenarios: {
      full: "All votes",
      partial: "Some votes",
      missed: "No votes",
      ybc: "YBC member",
    },
  },
  stakeManage: {
    kicker: (modeLabel: string) => `Manage ${modeLabel.toUpperCase()}`,
    description: {
      styfi: "Manage stYFI and vote to boost your rewards.",
      x: "Manage stYFIx with voting delegated to YBC.",
    },
    tabs: {
      stake: "Stake",
      unstake: "Unstake",
    },
  },
  stakeTab: {
    amountLabel: "Amount to stake",
    balanceLabel: (balance: string) => `Balance: ${balance} YFI`,
    insufficientBalance: "Insufficient balance",
    approve: "Approve YFI",
    stake: "Stake YFI",
  },
  stakingApr: {
    label: "Estimated APR",
    unavailable: "Unavailable",
    loading: "…",
    range: (minimum: string, maximum: string) => `${minimum}–${maximum}`,
  },
  unstakeTab: {
    loading: "Loading unstake data…",
    disconnected: "Connect your wallet to manage unstaking.",
    blacklistedHint:
      "Transfer actions are restricted for this address, but unstaking and withdrawals remain available.",
    empty: "Nothing in cooldown right now. Start a cooldown first.",
    availableLabel: (amount: string) => `${amount} YFI Available`,
    streamingLabel: (amount: string, time?: string) =>
      time
        ? `${amount} YFI Streaming (${time} left)`
        : `${amount} YFI Streaming`,
    withdrawHelper: "Funds available to withdraw",
    withdrawCta: "Withdraw YFI",
    amountLabel: "Start new cooldown",
    availableBalance: (amount: string, modeLabel: string) =>
      `Available: ${amount} ${modeLabel}`,
    insufficientBalance: "Exceeds available",
    warningTitle: "Action Rule",
    warningBody:
      "Adding to your cooldown will immediately claim any liquid assets and reset the 14-day timer for the stream.",
    helper: "Starts a 14-day cooldown. You can withdraw after the timer ends.",
    startCta: "Start new cooldown",
  },
  rewards: {
    title: "Yield & Rewards",
    apr: {
      portfolioLabel: "Current APR",
      portfolioTooltip:
        "Annualized rewards divided by your active balance in YFI.",
      calculationTitle: "APR calculation",
      totalLabel: "Total APR",
      voteBoostLabel: "Applied Vote Boost",
      boostFormula: (maximum: string, votes: string, proposals: string) =>
        `1 + (${maximum} − 1) × ${votes} / ${proposals}`,
      boostScope: "This multiplies stYFI reward weight. It does not multiply your total portfolio APR.",
      delegatedLabel: "stYFIx APR",
      delegatedTooltip:
        "The current stYFIx rate includes its recorded Vote Boost rewards. YBC votes on behalf of stYFIx holders.",
      personalBoostLabel: "Vote Boost rewards",
      ybcLabel: "YBC income",
      baseContributionLabel: "stYFI base rewards",
      delegatedContributionLabel: "stYFIx rewards",
      externalContributionLabel: "veYFI & liquid lockers",
      mixedPositions:
        "Vote Boost combines your eligible positions, including earlier holdings. Its contribution is shown across your total active balance.",
      unavailable: "Unavailable",
      unavailableBody: "Current APR data is unavailable. Your rewards can still be claimed.",
      priceTimestamp: (timestamp: string) => `YFI price updated ${timestamp}.`,
      participation: (votes: string, proposals: string) =>
        `${votes} of ${proposals} proposals`,
      noProposals: "No proposals counted in this reward period, so the applied multiplier is 1×.",
      appliedTiming: (rewardEpoch: number, currentEpoch: number) =>
        `The boost for epoch ${currentEpoch} uses participation through epoch ${rewardEpoch}.`,
      nextEpochLabel: "Next epoch participation",
      participationTiming:
        "Current six-epoch participation. Updates affect rewards from the next epoch.",
      streamingEpoch: (rewardEpoch: number, currentEpoch: number) =>
        `Current rewards: epoch ${currentEpoch}. Vote Boost uses participation through epoch ${rewardEpoch}.`,
    },
    token: {
      label: "Reward Token",
      desc: "Auto-compounding vault",
      tooltip: (symbol: string) =>
        `Rewards are paid in ${symbol}, which earns its own yield automatically.`,
    },
    claim: {
      label: "Available to claim",
      button: "Claim Rewards",
      empty: "No rewards yet",
    },
    epochZeroNotice:
      "Rewards will begin flowing from Epoch 1 and onward.",
    disconnected: "Connect wallet to view rewards.",
  },
} as const;
