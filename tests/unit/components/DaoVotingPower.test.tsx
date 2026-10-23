import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
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

describe("DAO voting power section", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.useDaoMockRuntime.mockReturnValue(null); setResult(sample); });
  afterEach(() => resetStyfiMockScenario());

  it("shows system total and estimated YBC share with a collapsible accessible breakdown", () => {
    render(<DaoVotingPower />);
    expect(screen.getByRole("region", { name: "Voting power" })).toBeVisible();
    expect(screen.getByText("320 YFI")).toBeVisible();
    expect(screen.getByText("Including YBC · estimate")).toBeVisible();
    expect(screen.getByText("10.28%")).toBeVisible();
    expect(screen.getAllByText("3,110 YFI")).toHaveLength(2);
    const details = screen.getByText("Voting power breakdown").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    // jsdom does not implement the native summary activation behavior.
    details.open = true;
    expect(screen.getByText("110 YFI")).toBeVisible();
    expect(screen.getByText("stYFIx via YBC")).toBeVisible();
    expect(screen.getByText("YBC stake")).toBeVisible();
    expect(screen.getByText(/Assumes all YBC members vote/)).toBeVisible();
    expect(screen.getByText(/holding it does not add direct voting power/)).toBeVisible();
    expect(details).toHaveAttribute("open");
  });

  it("preserves direct power without a guessed global denominator", () => {
    setResult({ ...sample, isYbcMember: false, systemPower: null });
    render(<DaoVotingPower />);
    expect(screen.getAllByText("110 YFI")).toHaveLength(2);
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.getByText("—")).toBeVisible();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getByText(/complete, current voting-power snapshot/)).toBeInTheDocument();
  });

  it("falls back to exact personal share if the YBC roster cannot be read", () => {
    setResult({ ...sample, ybcInfluence: null });
    render(<DaoVotingPower />);
    expect(screen.getByText("Direct · YBC unavailable")).toBeVisible();
    expect(screen.getByText("3.53%")).toBeVisible();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText(/complete YBC roster is unavailable/)).toBeInTheDocument();
  });

  it("does not report failed personal reads as zero", () => {
    setResult(null);
    render(<DaoVotingPower />);
    expect(screen.getByRole("status")).toHaveTextContent("Voting power is unavailable");
    expect(screen.queryByText("0 YFI")).not.toBeInTheDocument();
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
    expect(screen.getAllByText("100 YFI")).toHaveLength(3);
    act(() => setStyfiMockScenario("ybc"));
    expect(screen.getByText("310 YFI")).toBeVisible();
    expect(screen.getAllByText("10%").find((element) => element.tagName === "P")).toBeVisible();
    expect(mocks.useStyfiVotingPower).not.toHaveBeenCalled();
    mocks.useDaoMockRuntime.mockReturnValue({ ...runtime, account: { ...runtime.account, votingWeight: 0n } });
    rerender(<DaoVotingPower />);
    expect(screen.queryByText("310 YFI")).not.toBeInTheDocument();
    expect(screen.getByText("0%")).toBeVisible();
  });

  it.each(["connected", "correctChain"] as const)("hides DAO mock power when %s is false", (field) => {
    const fixture = getDaoMockFixture("voting");
    mocks.useDaoMockRuntime.mockReturnValue({ account: { ...fixture.account, [field]: false }, now: fixture.now });
    render(<DaoVotingPower />);
    expect(screen.queryByTestId("dao-voting-power")).not.toBeInTheDocument();
    expect(mocks.useStyfiVotingPower).not.toHaveBeenCalled();
  });
});
