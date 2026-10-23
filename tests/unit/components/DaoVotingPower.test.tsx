import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { DaoVotingPower } from "@/app/dao/components/DaoVotingPower";
import { createMockStyfiVotingPower, type StyfiVotingPower } from "@/lib/clients/styfi/voting-power";
import { resetStyfiMockScenario, setStyfiMockScenario } from "@/lib/clients/styfi/scenarios";
import { getDaoMockFixture } from "@/lib/clients/dao";

const mocks = vi.hoisted(() => ({ useStyfiVotingPower: vi.fn(), useDaoMockRuntime: vi.fn() }));
vi.mock("@/lib/hooks/useStyfiVotingPower", () => ({ useStyfiVotingPower: mocks.useStyfiVotingPower }));
vi.mock("@/lib/hooks/useDao", () => ({ useDaoMockRuntime: mocks.useDaoMockRuntime }));
const sample = createMockStyfiVotingPower({ address: "0x1111111111111111111111111111111111111111", stakedPower: 100n * 10n ** 18n, migratedVePower: 10n * 10n ** 18n, delegatedBalance: 50n * 10n ** 18n, isYbcMember: true });
function setResult(data: StyfiVotingPower | null, isConnected = true) {
  mocks.useStyfiVotingPower.mockReturnValue({ data, isConnected, isLoading: false, isSystemLoading: false, isError: !data });
}
function trigger() { return screen.getByRole("button", { name: /Your voting power/ }); }
async function openBreakdown() {
  const button = trigger();
  button.focus();
  fireEvent.click(button);
  return screen.findByRole("dialog", { name: "Voting power breakdown" });
}

describe("DAO voting power control", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.useDaoMockRuntime.mockReturnValue(null); setResult(sample); });
  afterEach(() => act(() => resetStyfiMockScenario()));

  it("shows a compact estimated share with associated math and opens the full YBC breakdown", async () => {
    render(<DaoVotingPower />);
    expect(trigger()).toHaveTextContent("10.28% of total");
    expect(trigger()).not.toHaveTextContent("YBC estimate");
    expect(trigger()).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(trigger()).toHaveAccessibleDescription(/320 YFI ÷ 3,110 YFI ≈ 10.28%/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("stYFIx via YBC")).not.toBeInTheDocument();

    const dialog = await openBreakdown();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByText("110 YFI")).toBeVisible();
    expect(within(dialog).getByText("stYFIx via YBC")).toBeVisible();
    expect(within(dialog).getByText("YBC stake")).toBeVisible();
    expect(within(dialog).getByText("3,110 YFI")).toBeVisible();
    expect(within(dialog).getByText(/Assumes all YBC members vote/)).toBeVisible();
    expect(within(dialog).getByText(/holding it does not add direct voting power/)).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("preserves direct power when the global denominator is unavailable", async () => {
    setResult({ ...sample, isYbcMember: false, systemPower: null });
    render(<DaoVotingPower />);
    expect(trigger()).toHaveTextContent("110 YFI Share unavailable");
    expect(trigger()).not.toHaveTextContent("%");
    expect(trigger()).toHaveAccessibleDescription(/complete, current voting-power snapshot/);
    const dialog = await openBreakdown();
    expect(within(dialog).getByText("110 YFI")).toBeVisible();
    expect(within(dialog).queryByText(/%/)).not.toBeInTheDocument();
  });

  it("falls back to exact personal share if the YBC roster cannot be read", async () => {
    setResult({ ...sample, ybcInfluence: null });
    render(<DaoVotingPower />);
    expect(trigger()).toHaveTextContent("Direct · YBC unavailable");
    expect(trigger()).toHaveTextContent("3.53%");
    expect(trigger()).not.toHaveTextContent("YBC estimate");
    const dialog = await openBreakdown();
    expect(within(dialog).getAllByText("—")).toHaveLength(2);
    expect(within(dialog).getByText(/complete YBC roster is unavailable/)).toBeVisible();
  });

  it("does not report failed personal reads as zero", async () => {
    setResult(null);
    render(<DaoVotingPower />);
    expect(trigger()).toHaveTextContent("Unavailable");
    expect(trigger()).not.toHaveTextContent("0");
    const dialog = await openBreakdown();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Voting power is unavailable");
  });

  it("distinguishes loading personal power and loading a missing total", () => {
    mocks.useStyfiVotingPower.mockReturnValue({ data: null, isConnected: true, isLoading: true, isSystemLoading: true });
    const { rerender } = render(<DaoVotingPower />);
    expect(trigger()).toHaveTextContent("Loading…");
    expect(trigger()).toHaveAttribute("aria-busy", "true");
    mocks.useStyfiVotingPower.mockReturnValue({ data: { ...sample, systemPower: null }, isConnected: true, isLoading: false, isSystemLoading: true });
    rerender(<DaoVotingPower />);
    expect(trigger()).toHaveTextContent("320 YFI Loading total…");
    expect(trigger()).not.toHaveTextContent("%");
  });

  it("does not invent a percentage when the exact system total is zero", () => {
    setResult({ ...sample, isYbcMember: false, directPower: 0n, stakedPower: 0n, migratedVePower: 0n, systemPower: { ...sample.systemPower!, totalPower: 0n, directShareBps: null, estimatedShareBps: null } });
    render(<DaoVotingPower />);
    expect(trigger()).toHaveTextContent("0 YFI Share unavailable");
    expect(trigger()).not.toHaveTextContent("%");
    expect(trigger()).toHaveAccessibleDescription(/no DAO voting power at this snapshot/);
    expect(trigger()).not.toHaveAccessibleDescription(/null/);
  });

  it("hides disconnected live wallets", () => {
    setResult(null, false);
    render(<DaoVotingPower />);
    expect(screen.queryByTestId("dao-voting-power")).not.toBeInTheDocument();
  });

  it("uses DAO base weight and reacts to YBC changes at a fixed time without reading the live wallet", () => {
    const fixture = getDaoMockFixture("voting");
    const runtime = { account: { ...fixture.account, effectiveVotingWeight: 1n }, now: fixture.now };
    mocks.useDaoMockRuntime.mockReturnValue(runtime);
    const { rerender } = render(<DaoVotingPower />);
    expect(trigger()).toHaveTextContent("3.22%");
    act(() => setStyfiMockScenario("ybc"));
    expect(trigger()).toHaveTextContent("10% of total");
    expect(trigger()).toHaveAccessibleDescription(/310 YFI ÷ 3,100 YFI/);
    expect(mocks.useStyfiVotingPower).not.toHaveBeenCalled();
    mocks.useDaoMockRuntime.mockReturnValue({ ...runtime, account: { ...runtime.account, votingWeight: 0n } });
    rerender(<DaoVotingPower />);
    expect(trigger()).toHaveTextContent("0% of total");
  });

  it.each(["connected", "correctChain"] as const)("hides DAO mock power when %s is false", (field) => {
    const fixture = getDaoMockFixture("voting");
    mocks.useDaoMockRuntime.mockReturnValue({ account: { ...fixture.account, [field]: false }, now: fixture.now });
    render(<DaoVotingPower />);
    expect(screen.queryByTestId("dao-voting-power")).not.toBeInTheDocument();
    expect(mocks.useStyfiVotingPower).not.toHaveBeenCalled();
  });
});
