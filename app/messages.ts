export const homeCopy = {
  page: {
    title: "Yearn Governance Apps",
    description:
      "Choose an app:",
  },
  cta: {
    styfi: {
      label: "stYFI (styfi.yearn.fi)",
      href: "/styfi",
    },
    veyfi: {
      label: "veYFI / LLYFI (veyfi.yearn.fi)",
      href: "/veyfi",
    },
    teams: {
      label: "Team Finances (teams-beta.dao-ops.com)",
      href: "/teams",
    },
    yeth: {
      label: "yETH Recovery (yeth.yearn.fi)",
      href: "/yeth",
    },
    ybc: {
      label: "Yearn Builder's Collective (ybc-beta.dao-ops.com)",
      href: "/ybc",
    },
    dao: {
      label: "DAO Governance",
      href: "/dao",
    },
  },
} as const;

export const governanceShellCopy = {
  directory: {
    title: "Yearn DAO apps",
    description: "Participate in governance. Put your YFI to work. Build Yearn together.",
    navigationLabel: "Explore Yearn DAO apps",
    currentApp: "Current app",
    sourceLabel: "View source on GitHub",
    sourceHref: "https://github.com/yearn/governance-apps",
    sourceNote: "Open source. Built by Yearn contributors.",
    groups: [
      {
        title: "Stake & lock",
        links: [
          { app: "styfi", path: "/", label: "Stake YFI", description: "Stake with stYFI or stYFIx" },
          { app: "veyfi", path: "/#migration-card", label: "veYFI migration", description: "Move your veYFI position" },
          { app: "veyfi", path: "/#llyfi-ledger", label: "Liquid Lockers", description: "Manage liquid YFI positions" },
        ],
      },
      {
        title: "Governance",
        links: [
          { app: "dao", path: "/", label: "Voting & Proposals", description: "Help decide what comes next" },
          { app: "treasury", path: "/", label: "Treasury", description: "Explore Yearn's treasury" },
          { app: "yeth", path: "/", label: "yETH recovery", description: "Manage recovery claims" },
        ],
      },
      {
        title: "Contributors",
        links: [
          { app: "teams", path: "/", label: "Team Finances", description: "Teams, budgets & payments" },
          { app: "ybc", path: "/", label: "Yearn Builder's Collective", description: "Support the people building Yearn" },
        ],
      },
    ],
  },
  voting: {
    title: "Voting is open",
    count: (count: number) => count === 1 ? "1 proposal awaits your vote." : `${count} proposals await your vote.`,
    closes: (remaining: string, multipleDeadlines: boolean) =>
      `${multipleDeadlines ? "Next vote closes" : "Closes"} in ${remaining}`,
    remaining: (seconds: number) => {
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
      const days = Math.floor(hours / 24);
      return `${days} ${days === 1 ? "day" : "days"}`;
    },
    review: "Review proposals",
    dismiss: "Dismiss this voting period",
  },
} as const;
