import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalVoters } from "@/app/dao/components/ProposalVoters";
import { DAO_MOCK_FEED, DAO_MOCK_YBC_AGGREGATE_ADDRESS } from "@/lib/clients/dao/fixtures";
import { useAddressAliases } from "@/lib/hooks/useAddressAliases";
import { useYbcMemberAliases } from "@/app/ybc/useYbcMemberAliases";
import { ADDRESS_ALIASES_STORAGE_KEY } from "@/lib/identity/aliases";
import { YBC_MAINNET_DEPLOYMENT } from "@/lib/clients/ybc/deployment";
import type { Address } from "viem";

const proposal = DAO_MOCK_FEED.proposals.find((entry) => entry.events.some((event) => event.yeaBps === 7_500))!;
const address = proposal.events.find((event) => event.type === "vote")!.actor!;

describe("DAO voters and shared address names", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "development");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keeps individual choices sortable and a combined YBC vote pinned through searches", () => {
    render(<ProposalVoters proposal={proposal} />);
    const table = screen.getByRole("table", { name: "Proposal votes" });
    const individuals = within(table).getByRole("rowgroup", { name: "Individual voters" });
    const collective = within(table).getByRole("rowgroup", { name: "Current YBC vote" });
    expect(within(individuals).getAllByRole("row")).toHaveLength(2);
    expect(within(collective).getByText("75% Yea")).toBeVisible();
    expect(within(collective).getByText("25% Nay")).toBeVisible();
    expect(within(collective).getByText("6 YFI")).toBeVisible();
    expect(within(collective).getByText("54.54% of votes")).toBeVisible();
    expect(within(collective).getByText("Includes stYFIx")).toBeVisible();
    expect(within(collective).queryByRole("button", { name: /Edit name/ })).not.toBeInTheDocument();
    expect(within(table).getByText("Yea", { exact: true })).toBeVisible();
    expect(within(table).getByText("Nay", { exact: true })).toBeVisible();
    expect(within(individuals).getAllByRole("link", { name: /transaction/i })).toHaveLength(2);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "power" } });
    expect(within(individuals).getAllByRole("row")[0]).toHaveTextContent("3 YFI");
    fireEvent.click(within(table).getAllByRole("button", { name: /Edit name/ })[0]);
    fireEvent.change(screen.getByLabelText("Local voter name"), { target: { value: "Treasury delegate" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Edit name: Treasury delegate" })).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Treasury delegate" } });
    expect(within(individuals).getAllByRole("row")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "does-not-exist" } });
    expect(screen.getByRole("status")).toHaveTextContent("No voters match your search.");
    expect(within(collective).getByText("6 YFI")).toBeVisible();
    expect(within(collective).getByText("75% Yea")).toBeVisible();
  });

  it("keeps saved names ahead of verified ENS for individual YBC members", () => {
    localStorage.setItem(ADDRESS_ALIASES_STORAGE_KEY, JSON.stringify({ version: 1, aliases: { [address.toLowerCase()]: "My delegate" } }));
    render(<ProposalVoters proposal={proposal} verifiedEns={{ [address.toLowerCase()]: "member.eth" }} />);
    expect(screen.getByRole("button", { name: "Edit name: My delegate" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit name: My delegate" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: "Edit name: member.eth" })).toBeVisible();
  });

  it("does not exclude mainnet collective addresses on another chain", () => {
    render(<ProposalVoters proposal={{ ...proposal, ref: { ...proposal.ref, chainId: 10 } }} />);
    expect(within(screen.getByRole("rowgroup", { name: "Individual voters" })).getAllByRole("row")).toHaveLength(4);
    expect(screen.queryByRole("rowgroup", { name: "Current YBC vote" })).not.toBeInTheDocument();
  });

  it("uses configured live addresses instead of mock collective addresses", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    const live = { ...proposal, events: proposal.events.map((event) => event.actor === DAO_MOCK_YBC_AGGREGATE_ADDRESS
      ? { ...event, actor: YBC_MAINNET_DEPLOYMENT.ybc } : event) };
    render(<ProposalVoters proposal={live} />);
    expect(within(screen.getByRole("rowgroup", { name: "Individual voters" })).getAllByRole("row")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: `View Ethereum address ${YBC_MAINNET_DEPLOYMENT.ybc} on Etherscan` })).not.toBeInTheDocument();
    expect(screen.getByText("YBC vote data is incomplete.")).toBeVisible();
    expect(screen.queryByText("6 YFI")).not.toBeInTheDocument();
  });

  it("keeps the summary independent of aliases and handles an absent collective vote", () => {
    localStorage.setItem(ADDRESS_ALIASES_STORAGE_KEY, JSON.stringify({ version: 1, aliases: { [address.toLowerCase()]: "YBC vote" } }));
    const { rerender } = render(<ProposalVoters proposal={proposal} />);
    expect(screen.getByRole("button", { name: "Edit name: YBC vote" })).toBeVisible();
    expect(within(screen.getByRole("rowgroup", { name: "Individual voters" })).getAllByRole("row")).toHaveLength(2);
    rerender(<ProposalVoters proposal={{ ...proposal, events: [] }} />);
    expect(screen.getByText("No YBC vote recorded.")).toBeVisible();
    expect(screen.queryByText("6 YFI")).not.toBeInTheDocument();
  });

  it("reads deployed YBC names and synchronizes edits and resets across mounted apps", () => {
    localStorage.setItem(ADDRESS_ALIASES_STORAGE_KEY, JSON.stringify({ version: 1, aliases: { [address.toLowerCase()]: "Existing YBC name" } }));
    const dao = renderHook(useAddressAliases);
    const ybc = renderHook(useYbcMemberAliases);
    expect(dao.result.current.aliases[address.toLowerCase()]).toBe("Existing YBC name");
    act(() => { expect(dao.result.current.setAlias(address, "Shared name")).toBe("saved"); });
    expect(ybc.result.current.aliases[address.toLowerCase()]).toBe("Shared name");
    act(() => { expect(ybc.result.current.resetAlias(address)).toBe("saved"); });
    expect(dao.result.current.aliases).toEqual({});
  });

  it("keeps a failed save visible for correction instead of claiming persistence", () => {
    render(<ProposalVoters proposal={proposal} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Edit name/ })[0]);
    fireEvent.change(screen.getByLabelText("Local voter name"), { target: { value: "Name" } });
    const blocked = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("could not save");
    expect(screen.getByLabelText("Local voter name")).toHaveValue("Name");
    blocked.mockRestore();
  });

  it("requests ENS for each visible page even beyond the first 64 addresses", () => {
    const event = proposal.events.find((candidate) => candidate.type === "vote")!;
    const events = Array.from({ length: 75 }, (_, index) => ({
      ...event, actor: `0x${(index + 1).toString(16).padStart(40, "0")}` as Address,
      log: { ...event.log, blockNumber: BigInt(index + 1) },
    }));
    const resolveVisible = vi.fn();
    const collectiveEvents = proposal.events.filter((candidate) => candidate.type === "vote" && candidate.yeaBps === 7_500);
    render(<ProposalVoters proposal={{ ...proposal, events: [...events, ...collectiveEvents] }} onVisibleAddressesChange={resolveVisible} />);
    expect(resolveVisible.mock.lastCall?.[0]).toHaveLength(10);
    for (let page = 0; page < 7; page += 1) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(resolveVisible.mock.lastCall?.[0]).toHaveLength(5);
    expect(new Set(resolveVisible.mock.calls.flatMap(([addresses]) => addresses)).size).toBe(75);
    expect(within(screen.getByRole("rowgroup", { name: "Current YBC vote" })).getByText("6 YFI")).toBeVisible();
  });
});
