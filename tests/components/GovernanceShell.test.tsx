import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GovernanceAppFooter, GovernanceAppNotice } from "@/app/GovernanceShell";

const { host, path } = vi.hoisted(() => ({ host: vi.fn(), path: vi.fn() }));
vi.mock("@/lib/hooks/useHostname", () => ({ useHostname: host }));
vi.mock("next/navigation", () => ({ usePathname: path, useSelectedLayoutSegments: () => [] }));
vi.mock("next/dynamic", () => ({ default: () => function MockNotice() { return <div data-testid="mounted-notice" />; } }));

beforeEach(() => {
  host.mockReturnValue("localhost");
  path.mockReturnValue("/styfi");
  vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "development");
});
afterEach(() => vi.unstubAllEnvs());

describe("governance discovery shell", () => {
  it("provides local routes and real veYFI section anchors", () => {
    render(<GovernanceAppFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: /Voting & Proposals/ })).toHaveAttribute("href", "/dao");
    expect(within(footer).getByRole("link", { name: /veYFI migration/ })).toHaveAttribute("href", "/veyfi#migration-card");
    expect(within(footer).getByRole("link", { name: /Liquid Lockers/ })).toHaveAttribute("href", "/veyfi#llyfi-ledger");
    expect(within(footer).getByRole("link", { name: /Stake YFI/ })).toHaveAttribute("aria-current", "location");
    expect(within(footer).getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/yearn/governance-apps");
  });

  it.each([
    ["styfi.yearn.fi", "https://dao.yearn.fi/"],
    ["styfi-beta.dao-ops.com", "https://dao-beta.dao-ops.com/"],
    ["app.dao-ops.com", "/dao"],
    ["preview.workers.dev", "/dao"],
  ])("keeps discovery in the %s environment", (hostname, href) => {
    host.mockReturnValue(hostname);
    render(<GovernanceAppFooter />);
    expect(screen.getByRole("link", { name: /Voting & Proposals/ })).toHaveAttribute("href", href);
  });

  it("does not mount discovery on non-app routes", () => {
    path.mockReturnValue("/");
    render(<><GovernanceAppFooter /><GovernanceAppNotice /></>);
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mounted-notice")).not.toBeInTheDocument();
  });

  it("does not mount the notice on nested DAO routes or the DAO root host", () => {
    path.mockReturnValue("/dao/proposals/2");
    const view = render(<GovernanceAppNotice />);
    expect(screen.queryByTestId("mounted-notice")).not.toBeInTheDocument();
    host.mockReturnValue("dao-beta.dao-ops.com");
    path.mockReturnValue("/proposals/2");
    view.rerender(<GovernanceAppNotice />);
    expect(screen.queryByTestId("mounted-notice")).not.toBeInTheDocument();
  });

  it("gates the production directory and notice, then filters unreleased destinations", () => {
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_MODE", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY", "false");
    const view = render(<><GovernanceAppFooter /><GovernanceAppNotice /></>);
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mounted-notice")).not.toBeInTheDocument();
    vi.stubEnv("NEXT_PUBLIC_ENABLE_GOVERNANCE_DISCOVERY", "true");
    for (const key of ["DAO", "TEAMS", "TREASURY", "YBC", "YETH"]) vi.stubEnv("NEXT_PUBLIC_ENABLE_" + key, "false");
    view.rerender(<><GovernanceAppFooter /><GovernanceAppNotice /></>);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Voting & Proposals|Team Finances|Treasury|Builder|yETH/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("mounted-notice")).not.toBeInTheDocument();
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DAO", "true");
    view.rerender(<><GovernanceAppFooter /><GovernanceAppNotice /></>);
    expect(screen.getByTestId("mounted-notice")).toBeInTheDocument();
  });
});
