import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  shouldHandleInternalNavigation,
  TeamsPageClient,
} from "@/app/teams/TeamsPageClient";
import { teamsCopy } from "@/app/teams/messages";
import {
  getMockTeamsRuntimeState,
  patchMockTeamsFundingApproval,
  patchMockTeamsTeam,
  resetMockTeamsStore,
  setMockTeamsEmpty,
  setMockTeamsLoading,
  setMockTeamsPreset,
} from "@/lib/clients/teams";
import { teamsKeys } from "@/lib/hooks/useTeams";
import { renderWithProviders } from "@/tests/test-utils";

async function syncTeamsRuntime(
  queryClient: ReturnType<typeof renderWithProviders>["queryClient"],
  mutate: () => void
) {
  mutate();

  await act(async () => {
    await queryClient.invalidateQueries({
      queryKey: teamsKeys.all,
      refetchType: "all",
    });
  });
}

function installHashScrollMock() {
  const scrollIntoView = vi.fn();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const originalRequestAnimationFrame = window.requestAnimationFrame;

  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0)) as typeof window.requestAnimationFrame;

  return {
    scrollIntoView,
    restore: () => {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
      window.requestAnimationFrame = originalRequestAnimationFrame;
    },
  };
}

describe("TeamsPageClient", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
    resetMockTeamsStore();
  });

  it("renders the Team Finances shell, keeps debug presets off-route, and opens a workspace", async () => {
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />);

    expect(
      screen.getByRole("heading", {
        name: teamsCopy.app.displayLabel,
        level: 1,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(teamsCopy.page.description)).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Teams hierarchy" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Directory|Team/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: teamsCopy.controls.scenarioNames["operator-admin"],
      })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /debug/i })).toBeInTheDocument();

    await screen.findByRole("link", {
      name: "Open Platform details",
    });
    expect(
      screen
        .getByRole("tablist", { name: teamsCopy.directory.scope.label })
        .querySelector('[role="tab"][aria-label^="Period #"]')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin/i })).not.toBeInTheDocument();
    expect(screen.getByText("Retiring")).toBeInTheDocument();
    expect(screen.getByText("Retired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Table/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: teamsCopy.directory.headers.owner })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Cards/i }));
    await waitFor(() => {
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("link", { name: "Open Platform details" }));

    expect(
      await screen.findByRole("heading", { name: "Platform", level: 1 })
    ).toBeInTheDocument();
    const teamsBreadcrumb = screen.getByRole("link", {
      name: teamsCopy.app.routeKey,
    });
    expect(teamsBreadcrumb).toHaveAttribute("href", "/teams");
    const hierarchy = screen.getByRole("navigation", {
      name: "Teams hierarchy",
    });
    expect(within(hierarchy).getByText("platform")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(hierarchy).queryByText("Platform")).not.toBeInTheDocument();
    expect(screen.queryByText(teamsCopy.page.title)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: teamsCopy.workspace.title,
        level: 2,
      }),
    ).toBeInTheDocument();
    const platformAddress =
      "0x1111111111111111111111111111111111111111";
    const platformOwner =
      "0xaaaa000000000000000000000000000000000001";
    expect(
      screen.getByRole("link", {
        name: `View Ethereum address ${platformAddress} on Etherscan`,
      })
    ).toHaveAttribute(
      "href",
      `https://etherscan.io/address/${platformAddress}`
    );
    expect(
      screen.getAllByRole("link", {
        name: `View Ethereum address ${platformOwner} on Etherscan`,
      }).length
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("heading", {
        name: teamsCopy.workspace.cards.current,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: teamsCopy.workspace.cards.lifetime,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(teamsCopy.bonus.noPeriods)).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: teamsCopy.bonus.action.noneCta,
      })[0]
    ).toBeDisabled();
    expect(document.querySelectorAll("#lifecycle")).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        name: teamsCopy.lifecycle.title,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(teamsCopy.workspace.ownership.pendingTransfer)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(teamsCopy.workspace.fields.pendingOwner)
    ).not.toBeInTheDocument();
  });

  it("shows one accessible pending-ownership notice only while a transfer exists", async () => {
    const user = userEvent.setup();
    const pendingOwner =
      "0xdddd000000000000000000000000000000000003";

    renderWithProviders(<TeamsPageClient />);

    await user.click(
      await screen.findByRole("link", { name: "Open Research details" })
    );
    expect(
      await screen.findByRole("heading", { name: "Research", level: 1 })
    ).toBeInTheDocument();

    const transferNotices = screen.getAllByText(
      teamsCopy.workspace.ownership.pendingTransfer
    );
    expect(transferNotices).toHaveLength(1);
    expect(transferNotices[0]?.closest("details")).toBeNull();
    expect(
      screen.queryByText(/Ownership is transferring to/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/with transfer pending to/i)
    ).not.toBeInTheDocument();
    const transferWarning = screen.getByRole("button", {
      name: `${teamsCopy.workspace.ownership.pendingTransfer} ${pendingOwner}`,
    });
    expect(transferWarning).toHaveAccessibleDescription(
      teamsCopy.workspace.ownership.pendingTransferHelp,
    );
    expect(
      screen.getAllByRole("link", {
        name: `View Ethereum address ${pendingOwner} on Etherscan`,
      })
    ).toHaveLength(1);
  });

  it.each([
    "/teams?trace=1&section=overview",
    "/teams?trace=1#ignored",
    "/teams?trace=1&section=overview&team=not-an-address",
  ])(
    "canonicalizes an invalid workspace route without dropping safe query state: %s",
    async (href) => {
      window.history.replaceState(null, "", href);

      renderWithProviders(<TeamsPageClient />);

      await screen.findByRole("heading", {
        name: teamsCopy.directory.title,
      });
      expect(
        screen.queryByRole("navigation", { name: "Teams hierarchy" })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /Directory|Team/i })).not.toBeInTheDocument();
      expect(window.location.search).toBe("?trace=1");
      expect(window.location.hash).toBe("");
    }
  );

  it("loads the saved Teams directory view", async () => {
    window.localStorage.setItem("yearn.teams.directory.view", "visual");

    renderWithProviders(<TeamsPageClient />);

    await screen.findByRole("link", { name: "Open Platform details" });
    await waitFor(() => {
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Cards/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("opens a team from the native stretched row link while nested controls stay independent", async () => {
    const user = userEvent.setup();
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderWithProviders(<TeamsPageClient />);

    await screen.findByRole("link", {
      name: "Open Platform details",
    });

    const openLink = screen.getByRole("link", {
      name: "Open Platform details",
    });
    const row = openLink.closest("tr");
    expect(row).not.toBeNull();
    expect(row).toHaveClass("relative", "cursor-pointer");
    expect(openLink).toHaveAttribute(
      "href",
      "/teams?section=overview&team=0x1111111111111111111111111111111111111111"
    );
    expect(openLink.className).toContain("after:absolute");
    const ownerLink = within(row!).getByRole("link", {
      name: /View Ethereum address .* on Etherscan/,
    });
    expect(ownerLink.parentElement).toHaveClass("relative", "z-10");
    ownerLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });

    await user.click(ownerLink);

    expect(window.location.search).toBe("");
    expect(
      screen.getByRole("heading", {
        name: teamsCopy.app.displayLabel,
        level: 1,
      })
    ).toBeInTheDocument();

    await user.click(
      within(row!).getByRole("button", {
        name: "Copy address",
      })
    );

    expect(writeText).toHaveBeenCalledWith(
      "0xaaaa000000000000000000000000000000000001"
    );
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    expect(window.location.search).toBe("");

    await user.click(openLink);

    expect(
      await screen.findByRole("heading", { name: "Platform", level: 1 })
    ).toBeInTheDocument();
    expect(window.location.search).toContain(
      "team=0x1111111111111111111111111111111111111111"
    );
  });

  it("keeps hierarchy surfaces at the hero", async () => {
    const user = userEvent.setup();
    const hashScroll = installHashScrollMock();

    try {
      renderWithProviders(<TeamsPageClient />);

      await screen.findByRole("link", {
        name: "Open Platform details",
      });
      await waitFor(() => {
        expect(hashScroll.scrollIntoView).toHaveBeenCalled();
      });
      hashScroll.scrollIntoView.mockClear();

      await user.click(
        screen.getByRole("link", { name: "Open Platform details" })
      );
      await waitFor(() => {
        expect(hashScroll.scrollIntoView).toHaveBeenCalled();
      });
      expect(hashScroll.scrollIntoView.mock.contexts.at(-1)).toBe(
        document.getElementById("teams-page-top")
      );
    } finally {
      hashScroll.restore();
    }
  });

  it("restores a workspace on reload and browser history traversal", async () => {
    const user = userEvent.setup();
    setMockTeamsPreset("operator-admin");
    window.history.replaceState(
      null,
      "",
      "/teams?section=funding&team=0x2222222222222222222222222222222222222222"
    );

    renderWithProviders(<TeamsPageClient />);

    expect(
      await screen.findByRole("heading", { name: "Security", level: 1 })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("link", { name: teamsCopy.app.routeKey })
    );
    expect(await screen.findByRole("heading", { name: teamsCopy.directory.title })).toBeInTheDocument();
    await user.click(
      screen.getByRole("link", { name: "Open Research details" })
    );

    expect(
      await screen.findByRole("heading", { name: "Research", level: 1 })
    ).toBeInTheDocument();

    act(() => {
      window.history.back();
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: teamsCopy.directory.title })).toBeInTheDocument();
      expect(window.location.search).toBe("");
    });

    act(() => {
      window.history.back();
    });

    expect(
      await screen.findByRole("heading", { name: "Security", level: 1 })
    ).toBeInTheDocument();
    expect(window.location.search).toContain("section=funding");

    act(() => {
      window.history.forward();
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: teamsCopy.directory.title })).toBeInTheDocument();
    });

    act(() => {
      window.history.forward();
    });

    expect(
      await screen.findByRole("heading", { name: "Research", level: 1 })
    ).toBeInTheDocument();
  });

  it("clears stale selected-team state when returning to the directory", async () => {
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />);
    await user.click(
      await screen.findByRole("link", { name: "Open Platform details" })
    );
    await user.click(
      screen.getByRole("link", { name: teamsCopy.app.routeKey })
    );

    expect(await screen.findByRole("heading", { name: teamsCopy.directory.title })).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(screen.queryByRole("heading", { name: "Platform", level: 1 })).not.toBeInTheDocument();
  });

  it("does not duplicate history or reset the active workspace section", async () => {
    const user = userEvent.setup();
    setMockTeamsPreset("operator-admin");
    window.history.replaceState(
      null,
      "",
      "/teams?section=funding&team=0x2222222222222222222222222222222222222222"
    );

    renderWithProviders(<TeamsPageClient />);

    expect(
      await screen.findByRole("heading", { name: "Security", level: 1 })
    ).toBeInTheDocument();

    const pushState = vi.spyOn(window.history, "pushState");
    const fundingHref = window.location.href;

    expect(window.location.href).toBe(fundingHref);
    expect(window.location.search).toContain("section=funding");
    expect(pushState).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("link", { name: teamsCopy.app.routeKey })
    );
    pushState.mockClear();
    const directoryHref = window.location.href;

    expect(window.location.href).toBe(directoryHref);
    expect(pushState).not.toHaveBeenCalled();
  });

  it("cleans an unknown but well-formed team address after data resolves", async () => {
    window.history.replaceState(
      null,
      "",
      "/teams?section=overview&team=0x9999999999999999999999999999999999999999"
    );

    renderWithProviders(<TeamsPageClient />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: teamsCopy.directory.title })).toBeInTheDocument();
      expect(window.location.search).toBe("");
    });
  });

  it("mounts Teams controls inside the shared debug panel", async () => {
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />);

    await screen.findByRole("link", { name: "Open Platform details" });
    await user.click(screen.getByRole("button", { name: /debug/i }));

    expect(screen.getByText("App Specific")).toBeInTheDocument();
    expect(screen.getByText("Teams")).toBeInTheDocument();
    expect(screen.getByText(teamsCopy.controls.presetLabel)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: teamsCopy.controls.scenarioNames["operator-admin"],
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Directory only" })).toBeInTheDocument();
    await user.click(screen.getByText(teamsCopy.revenue.title, { selector: "summary" }));
    expect(screen.getByRole("button", { name: "No tokens" })).toBeInTheDocument();
  });

  it("mutates route coverage through the shared debug panel", async () => {
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />);

    await user.click(await screen.findByRole("button", { name: /debug/i }));
    await user.click(
      await screen.findByRole("button", {
        name: teamsCopy.controls.scenarioNames["operator-admin"],
      })
    );

    expect(await screen.findByRole("link", { name: /Admin/i })).toBeInTheDocument();
    await user.click(
      screen.getByRole("link", { name: "Open Security details" })
    );
    expect(screen.getByRole("heading", { name: "Security", level: 1 })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.controls.surfaceNames.loading,
      })
    );

    expect(await screen.findByText(teamsCopy.workspace.loadingTitle)).toBeInTheDocument();
    expect(screen.getByText(teamsCopy.revenue.loadingTitle)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.controls.surfaceNames.empty,
      })
    );

    expect(await screen.findByText(teamsCopy.directory.emptyTitle)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.controls.surfaceNames.live,
      })
    );

    await user.click(
      await screen.findByRole("link", { name: "Open Security details" })
    );
    expect(
      await screen.findByRole("heading", { name: "Security", level: 1 })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /Admin/i }));
    expect(
      screen.getByRole("heading", { name: teamsCopy.admin.title, level: 1 })
    ).toBeInTheDocument();
  });

  it("renders the admin console only when the runtime exposes operator/admin access", async () => {
    setMockTeamsPreset("operator-admin");
    const revenueToken =
      getMockTeamsRuntimeState().data.admin?.whitelistedRevenueTokens[0];

    renderWithProviders(<TeamsPageClient />);

    const adminLink = await screen.findByRole("link", { name: /Admin/i });
    expect(adminLink).toHaveAttribute("href", "/teams?section=admin");
    await userEvent.click(adminLink);

    const adminSection = document.getElementById("admin");
    expect(adminSection).not.toBeNull();
    expect(
      screen.getByRole("heading", {
        name: teamsCopy.admin.title,
        level: 1,
      })
    ).toBeInTheDocument();
    expect(
      within(adminSection!).queryByRole("heading", {
        name: teamsCopy.admin.title,
      })
    ).not.toBeInTheDocument();
    expect(
      await within(adminSection!).findByRole("heading", {
        name: teamsCopy.admin.registry.title,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(
      within(adminSection!).getByRole("heading", {
        name: teamsCopy.admin.revenue.title,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(
      within(adminSection!).getByRole("heading", {
        name: teamsCopy.admin.fundingOps.title,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(
      within(adminSection!).getByRole("heading", {
        name: teamsCopy.admin.bonusOps.title,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(revenueToken).toBeDefined();
    expect(
      within(adminSection!).getByRole("link", {
        name: `View Ethereum address ${revenueToken!.tokenAddress} on Etherscan`,
      })
    ).toHaveAttribute(
      "href",
      `https://etherscan.io/address/${revenueToken!.tokenAddress}`
    );
    expect(
      within(adminSection!).getByRole("link", {
        name: `View Ethereum address ${revenueToken!.oracle} on Etherscan`,
      })
    ).toHaveAttribute(
      "href",
      `https://etherscan.io/address/${revenueToken!.oracle}`
    );
  });

  it("intercepts only unmodified primary clicks on hierarchy links", () => {
    const click = {
      altKey: false,
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    };

    expect(shouldHandleInternalNavigation(click)).toBe(true);
    expect(
      shouldHandleInternalNavigation({ ...click, button: 1 })
    ).toBe(false);
    expect(
      shouldHandleInternalNavigation({ ...click, ctrlKey: true })
    ).toBe(false);
    expect(
      shouldHandleInternalNavigation({ ...click, metaKey: true })
    ).toBe(false);
    expect(
      shouldHandleInternalNavigation({ ...click, shiftKey: true })
    ).toBe(false);
    expect(
      shouldHandleInternalNavigation({ ...click, altKey: true })
    ).toBe(false);
  });

  it("opens the canonical Teams admin route for operator/admin viewers", async () => {
    const hashScroll = installHashScrollMock();
    setMockTeamsPreset("operator-admin");
    window.history.replaceState(null, "", "/teams?section=admin");

    try {
      renderWithProviders(<TeamsPageClient />);

      expect(
        await screen.findByRole("heading", {
          name: teamsCopy.admin.title,
          level: 1,
        })
      ).toBeInTheDocument();
      expect(document.getElementById("admin")).not.toBeNull();
      expect(
        within(document.getElementById("admin")!).queryByRole("heading", {
          name: teamsCopy.admin.title,
        })
      ).not.toBeInTheDocument();
      await waitFor(() => {
        expect(hashScroll.scrollIntoView).toHaveBeenCalled();
      });
    } finally {
      hashScroll.restore();
    }
  });

  it("exposes deterministic loading and empty coverage through the shared runtime", async () => {
    setMockTeamsLoading(true);
    window.history.replaceState(
      null,
      "",
      "/teams?section=overview&team=0x1111111111111111111111111111111111111111"
    );
    const { queryClient } = renderWithProviders(<TeamsPageClient />);

    expect(await screen.findByText(teamsCopy.workspace.loadingTitle)).toBeInTheDocument();
    expect(screen.getByText(teamsCopy.revenue.loadingTitle)).toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(5);

    await syncTeamsRuntime(queryClient, () => {
      setMockTeamsLoading(false);
      setMockTeamsEmpty(true);
    });

    expect(await screen.findByText(teamsCopy.directory.emptyTitle)).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("keeps explicit admin empty coverage available under operator access", async () => {
    setMockTeamsPreset("operator-admin");
    setMockTeamsEmpty(true);

    renderWithProviders(<TeamsPageClient />);

    await userEvent.click(await screen.findByRole("link", { name: /Admin/i }));
    expect(await screen.findByText(teamsCopy.admin.emptyTitle)).toBeInTheDocument();
    const adminSection = document.getElementById("admin");
    expect(adminSection).not.toBeNull();
    expect(
      within(adminSection!).getByText(teamsCopy.admin.emptyBody)
    ).toBeInTheDocument();
  });

  it("preserves the URL-selected workspace when the runtime preset changes", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<TeamsPageClient />);

    await user.click(
      await screen.findByRole("link", {
        name: "Open Research details",
      })
    );
    expect(
      await screen.findByRole("heading", { name: "Research", level: 1 })
    ).toBeInTheDocument();

    await syncTeamsRuntime(queryClient, () => {
      setMockTeamsPreset("operator-admin");
    });

    expect(
      await screen.findByRole("heading", { name: "Research", level: 1 })
    ).toBeInTheDocument();
    expect(
      window.location.search
    ).toContain("team=0x3333333333333333333333333333333333333333");
  });

  it("shows claimable bonus detail and resets staged bonus state when the preset changes", async () => {
    const user = userEvent.setup();
    setMockTeamsPreset("bonus-available");
    const { queryClient } = renderWithProviders(<TeamsPageClient />);

    await user.click(
      await screen.findByRole("link", { name: "Open Platform details" })
    );
    expect(
      await screen.findByRole("heading", { name: "Platform", level: 1 })
    ).toBeInTheDocument();
    const bonusCard = document.getElementById("bonus");
    const lifecycleCard = document.getElementById("lifecycle");
    expect(bonusCard).not.toBeNull();
    expect(lifecycleCard).not.toBeNull();
    expect(within(bonusCard!).getAllByText("9.26 YFI").length).toBeGreaterThan(0);
    expect(within(bonusCard!).getByText("2 periods")).toBeInTheDocument();
    expect(within(bonusCard!).getByText("1 period")).toBeInTheDocument();

    const claimButton = within(bonusCard!).getByRole("button", {
      name: teamsCopy.bonus.action.claimCta,
    });
    await user.click(claimButton);

    expect(
      within(bonusCard!).getByRole("button", {
        name: teamsCopy.bonus.action.stagedCta,
      })
    ).toBeDisabled();
    expect(within(bonusCard!).getByText(teamsCopy.bonus.action.stagedBody)).toBeInTheDocument();

    await user.click(screen.getByText(teamsCopy.bonus.periodDetailSummary));
    expect(screen.getByText("Period 3")).toBeInTheDocument();
    expect(screen.getByText("Period 4")).toBeInTheDocument();
    for (const mathTrigger of within(bonusCard!).getAllByRole("button", {
      name: teamsCopy.bonus.mathTrigger,
    })) {
      const tooltipId = mathTrigger.getAttribute("aria-describedby");
      expect(tooltipId).not.toBeNull();
      expect(document.getElementById(tooltipId!)).toHaveAttribute(
        "role",
        "tooltip"
      );
    }

    await syncTeamsRuntime(queryClient, () => {
      setMockTeamsPreset("finance-operator-revenue");
    });

    expect(
      await screen.findByRole("heading", { name: "Platform", level: 1 })
    ).toBeInTheDocument();
    const resetBonusCard = document.getElementById("bonus");
    expect(resetBonusCard).not.toBeNull();
    expect(
      within(resetBonusCard!).queryByRole("button", {
        name: teamsCopy.bonus.action.stagedCta,
      })
    ).not.toBeInTheDocument();
    expect(
      within(resetBonusCard!).getByRole("button", {
        name: teamsCopy.bonus.action.noneCta,
      })
    ).toBeDisabled();
  });

  it("covers claimed and pending-finalization bonus states in the operator preset", async () => {
    const user = userEvent.setup();
    setMockTeamsPreset("operator-admin");

    renderWithProviders(<TeamsPageClient />);

    await user.click(
      await screen.findByRole("link", { name: "Open Security details" })
    );
    expect(
      await screen.findByRole("heading", { name: "Security", level: 1 })
    ).toBeInTheDocument();
    const bonusSection = document.getElementById("bonus");
    expect(bonusSection).not.toBeNull();
    expect(
      within(bonusSection!).getByRole("button", {
        name: teamsCopy.bonus.action.claimedCta,
      })
    ).toBeDisabled();
    expect(within(bonusSection!).getByText(teamsCopy.bonus.action.claimedBody)).toBeInTheDocument();
    await user.click(within(bonusSection!).getByText(teamsCopy.bonus.periodDetailSummary));
    expect(within(bonusSection!).getByText("Unclaimed gross bonus")).toBeInTheDocument();
    expect(within(bonusSection!).getAllByText("0 YFI").length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("link", { name: teamsCopy.app.routeKey })
    );
    await user.click(
      screen.getByRole("link", {
        name: "Open Research details",
      })
    );

    expect(
      await screen.findByRole("heading", { name: "Research", level: 1 })
    ).toBeInTheDocument();
    const researchBonusSection = document.getElementById("bonus");
    expect(researchBonusSection).not.toBeNull();
    expect(
      within(researchBonusSection!).getByRole("button", {
        name: teamsCopy.bonus.action.pendingCta,
      })
    ).toBeDisabled();
    expect(
      within(researchBonusSection!).getByText(teamsCopy.bonus.action.pendingBody)
    ).toBeInTheDocument();
  });

  it("keeps the read-only revenue blocker visible in the retired preset", async () => {
    setMockTeamsPreset("retired-read-only");

    renderWithProviders(<TeamsPageClient />);

    await userEvent.click(
      await screen.findByRole("link", {
        name: "Open Grants Archive details",
      })
    );
    expect(
      await screen.findByRole("heading", { name: "Grants Archive", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Read-only after retirement").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Retired").length).toBeGreaterThan(0);
    expect(screen.getByText(teamsCopy.revenue.unavailable.readOnlyBody)).toBeInTheDocument();
    expect(
      screen.getAllByText("Current claims unavailable").length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Current period #4 — claims unavailable").length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Claims unavailable • current returns stay permissionless"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Use Approval #40 in return flow",
      })
    ).toBeEnabled();
  });

  it("renders the revenue preview, validation, and success state for the operator revenue preset", async () => {
    const user = userEvent.setup();
    setMockTeamsPreset("finance-operator-revenue");

    renderWithProviders(<TeamsPageClient />);

    await user.click(
      await screen.findByRole("link", { name: "Open Platform details" })
    );
    expect(
      await screen.findByText(teamsCopy.revenue.permissionless.title)
    ).toBeInTheDocument();
    expect(screen.getAllByText("$9,985.40").length).toBeGreaterThan(0);

    const amountInput = screen.getByRole("textbox", {
      name: teamsCopy.revenue.form.amountLabel,
    });

    await user.clear(amountInput);
    await user.click(
      screen.getByRole("button", { name: teamsCopy.revenue.form.submit })
    );

    expect(screen.getByText(teamsCopy.revenue.form.amountError)).toBeInTheDocument();

    await user.type(amountInput, "2500");
    await user.click(
      screen.getByRole("button", { name: teamsCopy.revenue.form.submit })
    );

    expect(screen.getByText(teamsCopy.revenue.success.title)).toBeInTheDocument();
    expect(screen.getByText(/Current period #4:/)).toBeInTheDocument();
    expect(screen.getAllByText("$2,496.35").length).toBeGreaterThan(0);
  });

  it("shows the explicit empty revenue history state when a selected team has no deposits", async () => {
    const user = userEvent.setup();

    renderWithProviders(<TeamsPageClient />);

    await user.click(
      await screen.findByRole("link", {
        name: "Open Research details",
      })
    );

    expect(
      await screen.findByRole("heading", { name: "Research", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getAllByText(teamsCopy.revenue.history.emptyTitle).length).toBeGreaterThan(0);
    expect(screen.getAllByText(teamsCopy.revenue.history.emptyBody).length).toBeGreaterThan(0);
  });

  it("rejects a mock deposit when its deterministic credit fixture is missing", async () => {
    const user = userEvent.setup();
    setMockTeamsPreset("finance-operator-revenue");
    const platform = getMockTeamsRuntimeState().data.teams.find(
      (team) => team.id === "platform"
    )!;
    patchMockTeamsTeam("platform", {
      revenueOptions: platform.revenueOptions.map((option) => ({
        ...option,
        previewAmount: null,
        estimatedCreditUsd: null,
      })),
    });

    renderWithProviders(<TeamsPageClient />);

    await user.click(
      await screen.findByRole("link", { name: "Open Platform details" })
    );
    const amountInput = screen.getByRole("textbox", {
      name: teamsCopy.revenue.form.amountLabel,
    });
    await user.type(amountInput, "1");
    await user.click(
      screen.getByRole("button", { name: teamsCopy.revenue.form.submit })
    );

    expect(
      screen.getByText(teamsCopy.revenue.form.quoteUnavailable)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(teamsCopy.revenue.success.title)
    ).not.toBeInTheDocument();
  });

  it("renders funding approval states and the separate claim and return flows for the owner preset", async () => {
    setMockTeamsPreset("team-owner-funding");
    patchMockTeamsFundingApproval("approval-security-23", {
      streamDurationDays: 0,
    });
    patchMockTeamsFundingApproval("approval-security-22", {
      streamDurationDays: 1 / 24,
    });
    const securityTeam = getMockTeamsRuntimeState().data.teams.find(
      (team) => team.id === "security"
    )!;
    const approvalWithRecipient = securityTeam.fundingApprovals.find(
      (approval) => approval.recipient
    )!;

    renderWithProviders(<TeamsPageClient />);

    await userEvent.click(
      await screen.findByRole("link", { name: "Open Security details" })
    );
    await screen.findByRole("heading", { name: "Security", level: 1 });
    expect(
      await screen.findByRole("heading", {
        name: teamsCopy.funding.title,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("50,000 USDC")).toBeInTheDocument();
    expect(
      screen.getByText("Period #3 expired — audit only")
    ).toBeInTheDocument();
    expect(screen.getByText("Queued for period #5")).toBeInTheDocument();
    expect(
      screen.getByText("Vesting window • 1 hour from period start")
    ).toBeInTheDocument();
    expect(screen.getByText("Transfers immediately")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Use Approval #21 in claim flow",
      })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("approval-security-21")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: teamsCopy.funding.claimForm.title,
        level: 3,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: teamsCopy.funding.returnForm.title,
        level: 3,
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", {
        name: `View Ethereum address ${approvalWithRecipient.tokenAddress} on Etherscan`,
      }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", {
        name: `View Ethereum address ${approvalWithRecipient.recipient} on Etherscan`,
      }).every(
        (link) =>
          link.getAttribute("href") ===
          `https://etherscan.io/address/${approvalWithRecipient.recipient}`
      )
    ).toBe(true);
    expect(
      screen.getByText(
        "Approval #22 has 15,500 USDC in the current aggregate return bucket."
      )
    ).toBeInTheDocument();
  });

  it("validates and completes the funding claim flow", async () => {
    const user = userEvent.setup();
    setMockTeamsPreset("team-owner-funding");

    renderWithProviders(<TeamsPageClient />);

    await user.click(
      await screen.findByRole("link", { name: "Open Security details" })
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Use Approval #23 in claim flow",
      })
    );

    const recipientInput = screen.getByLabelText(teamsCopy.funding.claimForm.recipient);
    const claimAmountInput = screen.getByLabelText(teamsCopy.funding.claimForm.amount);

    await user.clear(recipientInput);
    await user.clear(claimAmountInput);
    await user.type(claimAmountInput, "1.25");
    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.funding.claimForm.submit,
      })
    );

    expect(
      screen.getByText(teamsCopy.funding.claimForm.errors.recipientRequired)
    ).toBeInTheDocument();

    await user.type(
      recipientInput,
      "0xcccc000000000000000000000000000000000099"
    );
    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.funding.claimForm.submit,
      })
    );

    expect(
      await screen.findByText(
        "Claimed 1.25 YFI from Approval #23 to 0xcccc...0099."
      )
    ).toBeInTheDocument();
  });

  it("validates and completes the current-period funding return flow", async () => {
    const user = userEvent.setup();
    setMockTeamsPreset("team-owner-funding");

    renderWithProviders(<TeamsPageClient />);

    await user.click(
      await screen.findByRole("link", { name: "Open Security details" })
    );
    const returnAmountInput = await screen.findByLabelText(
      teamsCopy.funding.returnForm.amount
    );

    await user.clear(returnAmountInput);
    await user.type(returnAmountInput, "19000");
    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.funding.returnForm.submit,
      })
    );

    expect(
      screen.getByText(teamsCopy.funding.returnForm.errors.amountExceeds)
    ).toBeInTheDocument();

    await user.clear(returnAmountInput);
    await user.type(returnAmountInput, "1000");
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: teamsCopy.funding.returnForm.submit,
      })
    );

    const returnSuccessMessage =
      "Returned 1,000 USDC from Approval #22 for $1,000.00.";
    expect(await screen.findByText(returnSuccessMessage)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Use Approval #21 in return flow",
      })
    ).not.toBeInTheDocument();
  });
});
