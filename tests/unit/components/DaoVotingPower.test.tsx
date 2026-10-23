import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DaoVotingPower } from "@/app/dao/components/DaoVotingPower";
import { createMockStyfiVotingPower, type StyfiVotingPower } from "@/lib/clients/styfi/voting-power";
import { resetStyfiMockScenario, setStyfiMockScenario } from "@/lib/clients/styfi/scenarios";
import { getDaoMockFixture } from "@/lib/clients/dao";

const mocks = vi.hoisted(() => ({ useStyfiVotingPower: vi.fn(), useDaoMockRuntime: vi.fn() }));
vi.mock("@/lib/hooks/useStyfiVotingPower", () => ({ useStyfiVotingPower: mocks.useStyfiVotingPower }));
vi.mock("@/lib/hooks/useDao", () => ({ useDaoMockRuntime: mocks.useDaoMockRuntime }));
const sample = createMockStyfiVotingPower({
  address: "0x1111111111111111111111111111111111111111",
  stakedPower: 100n * 10n ** 18n,
  migratedVePower: 10n * 10n ** 18n,
  delegatedBalance: 50n * 10n ** 18n,
  isYbcMember: true,
});
function setResult(data: StyfiVotingPower | null, isConnected = true) {
  mocks.useStyfiVotingPower.mockReturnValue({ data, isConnected, isLoading: false, isError: !data });
}

function openBreakdown() {
  fireEvent.focus(screen.getByRole("button", { name: "Voting power breakdown" }));
  return screen.getByRole("tooltip");
}

describe("DAO voting power summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDaoMockRuntime.mockReturnValue(null);
    setResult(sample);
  });
  afterEach(() => resetStyfiMockScenario());

  it("shows one estimated total with the exact direct breakdown available on keyboard focus", () => {
    render(<DaoVotingPower />);
    expect(screen.getByText("320 YFI")).toBeVisible();
    expect(screen.getByText("Including YBC · estimate")).toBeVisible();
    expect(screen.getByRole("tooltip")).toHaveClass("invisible");

    const details = openBreakdown();
    expect(details).toHaveClass("visible");
    expect(within(details).getByText("Direct voting power")).toBeVisible();
    expect(within(details).getByText("110 YFI")).toBeVisible();
    expect(within(details).getByText("stYFIx via YBC")).toBeVisible();
    expect(within(details).getByText("YBC stake")).toBeVisible();
    expect(within(details).getByText("Share of YBC member weight")).toBeVisible();
    expect(within(details).getByText("10%")).toBeVisible();
    expect(within(details).getByText(/Assumes all YBC members vote/)).toBeVisible();
    expect(within(details).getByText(/holding it does not add direct voting power/)).toBeVisible();
  });

  it("opens the breakdown on tap and dismisses it with Escape", async () => {
    render(<DaoVotingPower />);
    const trigger = screen.getByRole("button", { name: "Voting power breakdown" });
    fireEvent.click(trigger);
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveClass("visible");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).not.toHaveFocus();
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveClass("invisible"));
  });

  it("shows unavailable YBC amounts without replacing direct power with zero", () => {
    setResult({ ...sample, ybcInfluence: null });
    render(<DaoVotingPower />);
    expect(screen.getByText("Direct · YBC unavailable")).toBeVisible();
    expect(screen.getAllByText("110 YFI").filter((element) => !element.closest('[role="tooltip"]'))).toHaveLength(1);
    const details = openBreakdown();
    expect(within(details).getAllByText("—")).toHaveLength(2);
    expect(within(details).getByText(/complete YBC roster is unavailable/)).toBeVisible();
    expect(within(details).queryByText("Share of YBC member weight")).not.toBeInTheDocument();
  });

  it("shows exact direct power without implying a share of global governance weight", () => {
    setResult({ ...sample, isYbcMember: false });
    render(<DaoVotingPower />);
    expect(screen.getAllByText("110 YFI").filter((element) => !element.closest('[role="tooltip"]'))).toHaveLength(1);
    expect(screen.queryByText(/Including YBC/)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("shows an unavailable message after a failed personal read", () => {
    setResult(null);
    render(<DaoVotingPower />);
    expect(screen.getByRole("status")).toHaveTextContent("Voting power is unavailable");
    expect(screen.queryByText("0 YFI")).not.toBeInTheDocument();
  });

  it("does not show personal voting power when disconnected", () => {
    setResult(null, false);
    render(<DaoVotingPower />);
    expect(screen.queryByTestId("dao-voting-power")).not.toBeInTheDocument();
  });

  it("uses DAO mock weight and reacts to YBC changes at a fixed time without reading the live wallet", () => {
    const fixture = getDaoMockFixture("voting");
    const runtime = { account: { ...fixture.account, effectiveVotingWeight: 1n }, now: fixture.now };
    mocks.useDaoMockRuntime.mockReturnValue(runtime);
    const { rerender } = render(<DaoVotingPower />);
    expect(screen.getAllByText("100 YFI").filter((element) => !element.closest('[role="tooltip"]'))).toHaveLength(1);

    act(() => setStyfiMockScenario("ybc"));
    expect(screen.getByText("310 YFI")).toBeVisible();
    expect(screen.getByText("Including YBC · estimate")).toBeVisible();
    expect(mocks.useStyfiVotingPower).not.toHaveBeenCalled();

    mocks.useDaoMockRuntime.mockReturnValue({ ...runtime, account: { ...runtime.account, votingWeight: 0n } });
    rerender(<DaoVotingPower />);
    expect(screen.queryByText("310 YFI")).not.toBeInTheDocument();
    expect(screen.getAllByText("0 YFI").filter((element) => !element.closest('[role="tooltip"]'))).toHaveLength(1);
  });

  it.each(["connected", "correctChain"] as const)("hides DAO mock power when %s is false even if the live wallet has power", (field) => {
    const fixture = getDaoMockFixture("voting");
    mocks.useDaoMockRuntime.mockReturnValue({ account: { ...fixture.account, [field]: false }, now: fixture.now });
    render(<DaoVotingPower />);
    expect(screen.queryByTestId("dao-voting-power")).not.toBeInTheDocument();
    expect(mocks.useStyfiVotingPower).not.toHaveBeenCalled();
  });
});
