import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalVoters } from "@/app/dao/components/ProposalVoters";
import { DAO_MOCK_FEED } from "@/lib/clients/dao/fixtures";
import { useAddressAliases } from "@/lib/hooks/useAddressAliases";
import { useYbcMemberAliases } from "@/app/ybc/useYbcMemberAliases";
import { ADDRESS_ALIASES_STORAGE_KEY } from "@/lib/identity/aliases";
import type { Address } from "viem";

const proposal = DAO_MOCK_FEED.proposals.find((entry) => entry.events.some((event) => event.yeaBps === 7_500))!;
const address = proposal.events.find((event) => event.type === "vote")!.actor!;

describe("DAO voters and shared address names", () => {
  beforeEach(() => localStorage.clear());

  it("shows current voters, split choices, dates and searchable saved names", () => {
    render(<ProposalVoters proposal={proposal} />);
    const table = screen.getByRole("table", { name: "Proposal votes" });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getAllByText("75% For")).toHaveLength(2);
    expect(within(table).getAllByText("25% Against")).toHaveLength(2);
    expect(within(table).getAllByRole("link", { name: /transaction/i })).toHaveLength(4);
    fireEvent.click(within(table).getAllByRole("button", { name: /Edit name/ })[0]);
    fireEvent.change(screen.getByLabelText("Local voter name"), { target: { value: "Treasury delegate" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Edit name: Treasury delegate" })).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Treasury delegate" } });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "does-not-exist" } });
    expect(screen.getByRole("status")).toHaveTextContent("No voters match your search.");
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
    render(<ProposalVoters proposal={{ ...proposal, events }} onVisibleAddressesChange={resolveVisible} />);
    expect(resolveVisible.mock.lastCall?.[0]).toHaveLength(10);
    for (let page = 0; page < 7; page += 1) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(resolveVisible.mock.lastCall?.[0]).toHaveLength(5);
    expect(new Set(resolveVisible.mock.calls.flatMap(([addresses]) => addresses)).size).toBe(75);
  });
});
