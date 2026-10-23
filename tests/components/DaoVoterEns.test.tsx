import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { ConnectedProposalVoters } from "@/app/dao/components/ProposalVoters";
import { DAO_MOCK_FEED } from "@/lib/clients/dao/fixtures";

const state = vi.hoisted(() => ({ client: { uid: "first", chain: { id: 1 } } as unknown as PublicClient | null, result: {} as Record<string, string>, settled: true }));
vi.mock("@/state/protocol", () => ({ useProtocol: () => ({ mainnetPublicClient: state.client }) }));
vi.mock("@/lib/hooks/useEnsIdentities", () => ({ useEnsIdentityLookup: () => ({ identities: state.result, settled: state.settled }) }));
const source = DAO_MOCK_FEED.proposals.find((proposal) => proposal.events.some((event) => event.type === "vote"))!;
const event = source.events.find((event) => event.type === "vote")!;
const events = Array.from({ length: 12 }, (_, index) => ({ ...event,
  actor: `0x${(index + 1).toString(16).padStart(40, "0")}` as Address,
  log: { ...event.log, blockNumber: BigInt(index + 1) },
}));
const proposal = { ...source, events };
const firstPageAddress = events[11].actor;
const secondPageAddress = events[0].actor;

describe("DAO voter ENS reconciliation", () => {
  beforeEach(() => {
    localStorage.clear();
    state.client = { uid: "first", chain: { id: 1 } } as unknown as PublicClient;
    state.result = {};
    state.settled = true;
  });

  it("removes a formerly verified name when the same batch returns a negative lookup", () => {
    state.result = { [firstPageAddress]: "former.eth" };
    const view = render(<ConnectedProposalVoters proposal={proposal} isMock={false} />);
    expect(screen.getByRole("button", { name: "Edit name: former.eth" })).toBeVisible();
    state.result = {};
    view.rerender(<ConnectedProposalVoters proposal={proposal} isMock={false} />);
    expect(screen.queryByRole("button", { name: "Edit name: former.eth" })).toBeNull();
  });

  it("preserves other-page names for search but clears the current lookup batch", () => {
    state.result = { [firstPageAddress]: "first.eth" };
    const view = render(<ConnectedProposalVoters proposal={proposal} isMock={false} />);
    state.result = { [secondPageAddress]: "second.eth" };
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Edit name: second.eth" })).toBeVisible();
    state.result = {};
    view.rerender(<ConnectedProposalVoters proposal={proposal} isMock={false} />);
    expect(screen.queryByRole("button", { name: "Edit name: second.eth" })).toBeNull();
    // The previous page can still be found by name before its own lookup batch refreshes.
    state.settled = false;
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "first.eth" } });
    expect(screen.getByRole("button", { name: "Edit name: first.eth" })).toBeVisible();
    state.settled = true;
    view.rerender(<ConnectedProposalVoters proposal={proposal} isMock={false} />);
    expect(screen.queryByRole("button", { name: "Edit name: first.eth" })).toBeNull();
  });

  it("clears prior names on mock mode and client ownership changes", () => {
    state.result = { [firstPageAddress]: "live.eth" };
    const view = render(<ConnectedProposalVoters proposal={proposal} isMock={false} />);
    expect(screen.getByRole("button", { name: "Edit name: live.eth" })).toBeVisible();
    view.rerender(<ConnectedProposalVoters proposal={proposal} isMock />);
    expect(screen.queryByRole("button", { name: "Edit name: live.eth" })).toBeNull();
    state.result = {};
    state.client = { uid: "second", chain: { id: 1 } } as unknown as PublicClient;
    view.rerender(<ConnectedProposalVoters proposal={proposal} isMock={false} />);
    expect(screen.queryByRole("button", { name: "Edit name: live.eth" })).toBeNull();
    state.result = { [firstPageAddress]: "new.eth" };
    view.rerender(<ConnectedProposalVoters proposal={proposal} isMock={false} />);
    expect(screen.getByRole("button", { name: "Edit name: new.eth" })).toBeVisible();
    state.client = null;
    view.rerender(<ConnectedProposalVoters proposal={proposal} isMock={false} />);
    expect(screen.queryByRole("button", { name: "Edit name: new.eth" })).toBeNull();
  });
});
