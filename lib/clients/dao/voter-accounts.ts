import deployment from "@/lib/deployment.json";
import { YBC_MAINNET_DEPLOYMENT } from "@/lib/clients/ybc/deployment";
import { DAO_MOCK_STYFIX_AGGREGATE_ADDRESS, DAO_MOCK_YBC_AGGREGATE_ADDRESS } from "./fixtures";
import type { DaoCollectiveVoteAddresses } from "./votes";

/** Table rows and navigation counts must use the same exact aggregate accounts. */
export function getDaoCollectiveVoteAddresses(chainId: number, isMock: boolean): DaoCollectiveVoteAddresses | null {
  if (chainId !== 1) return null;
  return {
    ybc: isMock ? DAO_MOCK_YBC_AGGREGATE_ADDRESS : YBC_MAINNET_DEPLOYMENT.ybc,
    styfix: isMock ? DAO_MOCK_STYFIX_AGGREGATE_ADDRESS : deployment.STYFIX,
  };
}
