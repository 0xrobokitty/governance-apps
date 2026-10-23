import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StakeManageCard } from "@/app/styfi/components/cards/StakeManageCard";
import type { StyfiAsset } from "@/app/styfi/components/types";
import { createMockStyfiAprSnapshot } from "@/lib/clients/styfi/apr-mock";

vi.mock("@/lib/hooks/useStyfi", () => ({
  useStyfiAccount: () => ({ data: undefined }),
}));

vi.mock("@/lib/hooks/useStyfiApr", () => ({
  useStyfiApr: () => ({ data: createMockStyfiAprSnapshot(), isLoading: false }),
}));

vi.mock("@/lib/hooks/useEpochCountdown", () => ({
  useEpochCountdown: () => ({ isComplete: false }),
}));

vi.mock("@/app/styfi/components/cards/stake/StakeTab", () => ({
  StakeTab: () => <div>Stake form</div>,
}));

vi.mock("@/app/styfi/components/cards/stake/UnstakeTab", () => ({
  UnstakeTab: () => <div>Unstake form</div>,
}));

function Subject() {
  const [asset, setAsset] = useState<StyfiAsset>("stYFI");
  return <StakeManageCard selectedAsset={asset} onSelectAsset={setAsset} />;
}

describe("stYFI management APR", () => {
  it("keeps the selected mode estimate visible when switching between stake and unstake", async () => {
    const user = userEvent.setup();
    render(<Subject />);

    expect(screen.getByText("8%–20%")).toBeVisible();
    expect(screen.getByText("Stake form")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Unstake" }));
    expect(screen.getByText("Unstake form")).toBeVisible();
    expect(screen.getByText("8%–20%")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /^stYFIx$/ }));
    expect(screen.getByTestId("staking-apr-styfix")).toHaveTextContent("Estimated APR20%");
    expect(screen.getByText("Unstake form")).toBeVisible();
    expect(screen.getAllByText("Estimated APR")).toHaveLength(1);
  });
});
