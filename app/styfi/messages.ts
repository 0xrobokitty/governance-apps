export const styfiCopy = {
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
          "Keep your voting rights. Vote on proposals to earn Vote Boost. Participation across the last six epochs determines your boost.",
      },
      x: {
        title: "stYFIx",
        badge: "Delegated voting",
        recommended: "Recommended",
        kicker: "For delegated governance",
        description:
          "YBC votes on behalf of stYFIx holders. Full Vote Boost requires YBC participation in every counted proposal.",
      },
    },
  },
  governance: {
    headerLabel: "Voting & Proposals",
  },
  votingPower: {
    title: "Your voting power",
    direct: "Direct voting power",
    staked: "stYFI + liquid lockers",
    migrated: "Migrated veYFI",
    delegated: "stYFIx via YBC",
    collective: "YBC stake",
    influence: "Voting influence (estimate)",
    ybcTitle: "Your YBC voting influence",
    beforeDecay: "Current voting weight before any late-vote reduction.",
    aggregation: "The contract combines stYFI and liquid-locker voting weight. New stake gains weight over four epochs.",
    delegatedNotice: "Your stYFIx votes are delegated to YBC. They do not add to your direct voting power.",
    estimate: "The YBC estimate assumes every member with voting weight votes. Your share on each proposal depends on which members participate.",
    unavailable: "Voting power is unavailable. Try again shortly.",
    influenceUnavailable: "Your direct voting power is current. The YBC estimate is unavailable until the complete member roster can be verified.",
    unit: "YFI",
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
      label: "Current Base APR",
      labelEpoch1: "Next Epoch APR",
      tooltip: "Annualized base rate based on the previous epoch's performance.",
      tooltipEpoch1: "Projected base APR for the upcoming epoch.",
      yourLabel: "Your APR",
      averageLabel: "Your Average APR",
      yourTooltip: "The effective APR of your active position.",
      breakdownTitle: "Weighted Yield Breakdown",
      breakdownTotal: "Average Return",
      maxLabel: "Full participation APR",
      maxTooltip:
        "Estimated stYFI APR with full Vote Boost participation at current pool rates. Actual stYFIx APR can differ because rewards use historical balances.",
      portfolioLabel: "Your total APR",
      portfolioTooltip:
        "Annualized rewards across your active governance positions, including your Vote Boost and any YBC income.",
      baseLabel: "stYFI base APR",
      delegatedLabel: "stYFIx APR",
      delegatedTooltip:
        "The current stYFIx rate includes its recorded Vote Boost rewards. YBC votes on behalf of stYFIx holders.",
      delegatedNote:
        "stYFIx includes rewards from YBC voting. Its APR reflects the delegated pool’s recorded rewards.",
      personalLabel: "Your stYFI position APR",
      personalNote:
        "Includes your recorded Vote Boost and any YBC income. Historical rewards can reflect earlier holdings.",
      personalBoostLabel: "Your Vote Boost",
      ybcLabel: "YBC income",
      ybcIncluded: "Your total APR includes your share of YBC rewards.",
      contributionsTitle: "Contributions to your total APR",
      baseContributionLabel: "stYFI base rewards",
      delegatedContributionLabel: "stYFIx rewards",
      externalContributionLabel: "veYFI & liquid lockers",
      mixedPositions:
        "Vote Boost combines your eligible positions, including earlier holdings. Its contribution is shown across your total active balance.",
      unavailable: "Unavailable",
      unavailableBody: "Current APR data is unavailable. Your rewards can still be claimed.",
      priceStale: "Estimates use an older YFI price.",
      participationLabel: "Your voting participation",
      participation: (votes: string, proposals: string) =>
        `${votes} of ${proposals} proposals`,
      noProposals: "No proposals in the current six-epoch window.",
      participationTiming:
        "Participation covers the last six epochs. Votes this epoch affect rewards from the next epoch.",
      streamingEpoch: (rewardEpoch: number, currentEpoch: number) =>
        `Epoch ${rewardEpoch} Vote Boost rewards are streaming in epoch ${currentEpoch}.`,
      ratesEstimate:
        "APRs are annualized estimates. Reward amounts, balances, and YFI prices can change.",
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
