import { isDaoEnabled, isTeamsEnabled, isTreasuryEnabled, isYbcEnabled, isYethEnabled } from "@/lib/runtime/features";
import type { GovernanceApp } from "@/lib/governance-links";

export function isGovernanceAppEnabled(app: GovernanceApp): boolean {
  switch (app) {
    case "dao": return isDaoEnabled();
    case "teams": return isTeamsEnabled();
    case "treasury": return isTreasuryEnabled();
    case "ybc": return isYbcEnabled();
    case "yeth": return isYethEnabled();
    default: return true;
  }
}
