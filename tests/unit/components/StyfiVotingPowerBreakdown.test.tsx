import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { VotingPowerBreakdown } from "@/app/styfi/components/VotingPowerBreakdown";
import { createMockStyfiVotingPower, type StyfiVotingPower } from "@/lib/clients/styfi/voting-power";

const mocks = vi.hoisted(() => ({ useStyfiVotingPower: vi.fn() }));
vi.mock("@/lib/hooks/useStyfiVotingPower", () => mocks);
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

describe("stYFI voting power breakdown", () => {
  beforeEach(() => setResult(sample));

  it("separates canonical direct power from the YBC influence estimate", () => {
    render(<VotingPowerBreakdown />);
    const influence = screen.getByLabelText("Your YBC voting influence");
    expect(within(influence).getByText("stYFIx via YBC")).toBeVisible();
    expect(within(influence).getByText("YBC stake")).toBeVisible();
    expect(within(influence).getByText("Voting influence (estimate)")).toBeVisible();
    expect(within(influence).getByText("320 YFI")).toBeVisible();
    expect(within(influence).getByText(/assumes every member/)).toBeVisible();
    expect(screen.getByText(/They do not add to your direct voting power/)).toBeVisible();
  });

  it("shows unavailable YBC amounts without replacing direct power with zero", () => {
    setResult({ ...sample, ybcInfluence: null });
    render(<VotingPowerBreakdown />);
    const influence = screen.getByLabelText("Your YBC voting influence");
    expect(within(influence).getAllByText("—")).toHaveLength(3);
    expect(within(influence).getByText("110 YFI")).toBeVisible();
    expect(within(influence).getByText(/complete member roster/)).toBeVisible();
  });

  it("shows an unavailable message after a failed personal read", () => {
    setResult(null);
    render(<VotingPowerBreakdown />);
    expect(screen.getByRole("status")).toHaveTextContent("Voting power is unavailable");
    expect(screen.queryByText("0 YFI")).not.toBeInTheDocument();
  });

  it("does not show personal voting power when disconnected", () => {
    setResult(null, false);
    render(<VotingPowerBreakdown />);
    expect(screen.queryByTestId("styfi-voting-power")).not.toBeInTheDocument();
  });
});
