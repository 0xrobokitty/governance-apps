import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";

const { hostnameMock, pathnameMock, segmentsMock } = vi.hoisted(() => ({
  hostnameMock: vi.fn<() => string | undefined>(),
  pathnameMock: vi.fn<() => string>(),
  segmentsMock: vi.fn<() => string[]>(),
}));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
  useSelectedLayoutSegments: segmentsMock,
}));

vi.mock("@/lib/hooks/useHostname", () => ({
  useHostname: hostnameMock,
}));

vi.mock("@/lib/hooks/useEpochClock", () => ({
  useEpochClock: () => ({
    epochInfo: { currentEpoch: 1, epochEnd: 2 },
    now: 1,
  }),
}));

vi.mock("@/lib/hooks/useGlobalData", () => ({
  useGlobalData: () => ({ isLoading: false }),
}));

vi.mock("@/state/protocol", () => ({
  useProtocol: () => ({ publicClient: null }),
}));

vi.mock("@/lib/hooks/useDao", () => ({
  useDaoMockRuntime: () => null,
}));

vi.mock("@/components/header/HeaderNavMenu", () => ({
  HeaderNavMenu: () => <nav aria-label="Desktop navigation" />,
}));

vi.mock("@/components/WalletButton", () => ({
  WalletButton: () => null,
}));

vi.mock("@/components/ui/ThemeToggle", () => ({
  ThemeToggle: () => null,
}));

vi.mock("@/lib/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("@/web3/wallet-ui", () => ({
  useAccountModal: () => ({ openAccountModal: vi.fn() }),
  useChainModal: () => ({ openChainModal: vi.fn() }),
  useConnectModal: () => ({ openConnectModal: vi.fn() }),
}));

describe("Header application home links", () => {
  beforeEach(() => {
    hostnameMock.mockReturnValue("app.dao-ops.com");
    pathnameMock.mockReturnValue("/dao/proposals/19");
    segmentsMock.mockReturnValue(["dao"]);
  });

  it("links the desktop application label to the shared-host landing path", () => {
    render(<Header />);

    const link = screen.getByRole("link", { name: "DAO Governance" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/dao");
    expect(link).toHaveClass("min-h-10");
    expect(link.className).toContain("focus-visible:ring-2");
    expect(link.className).toContain("motion-reduce:transition-none");
  });

  it("links the desktop application label to root on its branded host", () => {
    hostnameMock.mockReturnValue("dao-beta.dao-ops.com");
    pathnameMock.mockReturnValue("/proposals/19");
    segmentsMock.mockReturnValue([]);
    render(<Header />);

    expect(
      screen.getByRole("link", { name: "DAO Governance" })
    ).toHaveAttribute("href", "/");
  });

  it("closes the mobile dialog and restores focus from its current-app link", async () => {
    const user = userEvent.setup();
    render(<Header />);

    const trigger = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
    const link = within(dialog).getByRole("link", { name: "DAO Governance" });
    expect(link).toHaveAttribute("href", "/dao");
    expect(link).toHaveClass("min-h-[44px]");
    expect(link.className).toContain("focus-visible:ring-2");

    link.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    await user.click(link);

    expect(
      screen.queryByRole("dialog", { name: "Navigation menu" })
    ).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
