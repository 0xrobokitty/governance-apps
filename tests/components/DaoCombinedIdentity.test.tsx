import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DaoPageClient } from "@/app/dao/DaoPageClient";
import { DaoProposalActionPanel } from "@/app/dao/proposals/[id]/DaoProposalActionPanel";
import { DAO_MOCK_FEED, getDaoMockSnapshot, type DaoMockRuntimeSnapshot } from "@/lib/clients/dao";

const state = vi.hoisted(() => ({
  runtime: null as DaoMockRuntimeSnapshot | null,
  wallet: { address: undefined as string | undefined, isConnected: false },
  participation: vi.fn(() => ({})),
  account: vi.fn(() => ({ data: null, isPending: false, isFetching: false, isError: false })),
}));
vi.mock("wagmi", async (importOriginal) => ({ ...await importOriginal<typeof import("wagmi")>(), useAccount: () => state.wallet }));
vi.mock("@/lib/hooks/useHostname", () => ({ useHostname: () => "localhost" }));
vi.mock("@/lib/hooks/useDaoParticipation", () => ({ useDaoParticipation: state.participation }));
vi.mock("@/lib/hooks/useDao", () => ({
  useDaoMockRuntime: () => state.runtime,
  useDaoFeed: () => ({ data: { proposals: [], canonicalBlock: { timestamp: 1 } }, isPending: false, isError: false, refetch: vi.fn() }),
  useDaoAccountProposalState: state.account,
  useDaoProposalActions: () => ({ activeAction: null, pendingAction: null, state: { status: "idle" } }),
}));
vi.mock("@/app/dao/components/MockControls", () => ({ MockControls: () => null }));
vi.mock("@/app/dao/components/DaoVotingPower", () => ({ DaoVotingPower: () => <span>Voting summary</span> }));
vi.mock("@/app/dao/components/DaoSnapshotNotice", () => ({ DaoSnapshotNotice: () => null }));

const mockAddress = "0x1111111111111111111111111111111111111111";
const walletAddress = "0x2222222222222222222222222222222222222222";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_E2E", "false");
  state.runtime = null;
  state.wallet = { address: undefined, isConnected: false };
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("combined DAO account selection", () => {
  it("uses the demo account consistently for participation and detail reads outside E2E", () => {
    state.runtime = structuredClone(getDaoMockSnapshot());
    state.runtime.account = { ...state.runtime.account, connected: true, address: mockAddress };
    state.wallet = { address: walletAddress, isConnected: true };
    render(<><DaoPageClient /><DaoProposalActionPanel proposal={DAO_MOCK_FEED.proposals[0]} /></>);
    expect(screen.getByText("Voting summary")).toBeVisible();
    expect(state.participation).toHaveBeenLastCalledWith([], mockAddress, state.runtime);
    expect(state.account).toHaveBeenLastCalledWith(DAO_MOCK_FEED.proposals[0].ref, mockAddress);
  });

  it("hides participation and voting power when the demo account disconnects", () => {
    state.runtime = structuredClone(getDaoMockSnapshot());
    state.runtime.account = { ...state.runtime.account, connected: false, address: mockAddress };
    state.wallet = { address: walletAddress, isConnected: true };
    render(<><DaoPageClient /><DaoProposalActionPanel proposal={DAO_MOCK_FEED.proposals[0]} /></>);
    expect(screen.queryByText("Voting summary")).not.toBeInTheDocument();
    expect(state.participation).toHaveBeenLastCalledWith([], null, state.runtime);
    expect(state.account).toHaveBeenLastCalledWith(DAO_MOCK_FEED.proposals[0].ref, null);
  });

  it("uses the connected real wallet when no mock runtime is active", () => {
    state.wallet = { address: walletAddress, isConnected: true };
    render(<><DaoPageClient /><DaoProposalActionPanel proposal={DAO_MOCK_FEED.proposals[0]} /></>);
    expect(state.participation).toHaveBeenLastCalledWith([], walletAddress, null);
    expect(state.account).toHaveBeenLastCalledWith(DAO_MOCK_FEED.proposals[0].ref, walletAddress);
  });
});
