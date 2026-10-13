import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GovernanceVotingNotice from "@/app/GovernanceVotingNotice";
import { DAO_MOCK_FEED, DAO_MOCK_NOW } from "@/lib/clients/dao";
import type { DaoSnapshot } from "@/lib/clients/dao/types";
import { dismissVotingPeriods, VOTING_NOTICE_STORAGE_KEY } from "@/lib/voting-notice-dismissal";

const { feedQuery, runtimeQuery } = vi.hoisted(() => ({ feedQuery: vi.fn(), runtimeQuery: vi.fn() }));
vi.mock("@/lib/hooks/useDao", () => ({ useDaoFeed: feedQuery, useDaoMockRuntime: runtimeQuery }));

let snapshot: DaoSnapshot;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(DAO_MOCK_NOW * 1000);
  // A successful write also resets the session-only storage fallback.
  dismissVotingPeriods([]);
  localStorage.clear();
  snapshot = structuredClone(DAO_MOCK_FEED);
  snapshot.proposals = [snapshot.proposals.find(p => p.protocolStatus === "voting")!];
  snapshot.generatedAt = new Date(DAO_MOCK_NOW * 1000).toISOString();
  snapshot.canonicalBlock.timestamp = DAO_MOCK_NOW;
  feedQuery.mockImplementation(() => ({ data: snapshot, isError: false, isPending: false }));
  runtimeQuery.mockReturnValue(null);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("shared governance voting notice", () => {
  it("links to DAO and remembers a dismissal across remounts", () => {
    const view = render(<GovernanceVotingNotice href="/dao" />);
    expect(screen.getByRole("link", { name: "Review proposals" })).toHaveAttribute("href", "/dao");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this voting period" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(localStorage.getItem(VOTING_NOTICE_STORAGE_KEY)).toContain("live:");
    view.unmount();
    render(<GovernanceVotingNotice href="/dao" />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("resurfaces for a later voting period", () => {
    const view = render(<GovernanceVotingNotice href="/dao" />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this voting period" }));
    snapshot.proposals[0].voteStartsAt += 1;
    snapshot.proposals[0].voteEndsAt += 1;
    view.rerender(<GovernanceVotingNotice href="/dao" />);
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("hides retained last-good data on a failed refresh", () => {
    feedQuery.mockReturnValue({ data: snapshot, isError: true, isPending: false });
    render(<GovernanceVotingNotice href="/dao" />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("expires at the end of voting without another fetch", () => {
    snapshot.proposals[0].voteEndsAt = DAO_MOCK_NOW + 2;
    render(<GovernanceVotingNotice href="/dao" />);
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("hides a snapshot that becomes stale while open", () => {
    render(<GovernanceVotingNotice href="/dao" />);
    act(() => vi.advanceTimersByTime(301_000));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("uses the explicit mock clock for deterministic previews", () => {
    vi.setSystemTime(new Date("2035-01-01"));
    runtimeQuery.mockReturnValue({ now: DAO_MOCK_NOW });
    render(<GovernanceVotingNotice href="/dao" />);
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("closes when reads work but writing over a prior stored period fails", () => {
    localStorage.setItem(VOTING_NOTICE_STORAGE_KEY, JSON.stringify(["older-period"]));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    render(<GovernanceVotingNotice href="/dao" />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this voting period" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("ignores corrupt storage and tolerates unavailable storage", () => {
    localStorage.setItem(VOTING_NOTICE_STORAGE_KEY, "{");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
    render(<GovernanceVotingNotice href="/dao" />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this voting period" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("responds to dismissal from another tab", () => {
    render(<GovernanceVotingNotice href="/dao" />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this voting period" }));
    act(() => {
      localStorage.removeItem(VOTING_NOTICE_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: VOTING_NOTICE_STORAGE_KEY }));
    });
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });
});
