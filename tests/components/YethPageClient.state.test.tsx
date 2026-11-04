import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  YETH_MANUAL_RECOVERY_CLAIM_URL,
  type YethAccountState,
  type YethGlobalState,
} from "@/lib/clients/yeth";
import { setFixedNow } from "@/lib/mocks/time";
import { E2E_MOCK_ADDRESS } from "@/lib/constants";
import { yethCopy } from "@/app/yeth/messages";
import { YethPageClient } from "@/app/yeth/YethPageClient";

const ONE = 10n ** 18n;
const CLOSES_AT = 1_800_000_000;

const claimExitWrite = vi.fn();
const claimStayWrite = vi.fn();
const redeemWrite = vi.fn();

let currentGlobalState: YethGlobalState | undefined;
let currentAccountState: YethAccountState | null;
let currentAccountLoading = false;
let currentYethUsesMockBackend = false;

vi.mock("@/web3/wallet-ui", () => ({
  useConnectModal: () => ({ openConnectModal: vi.fn() }),
}));

vi.mock("@/state/protocol", () => ({
  useProtocol: () => ({ yethUsesMockBackend: currentYethUsesMockBackend }),
}));

vi.mock("@/lib/hooks/useYeth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/useYeth")>();
  return {
    ...actual,
    useYethGlobalState: () => ({ data: currentGlobalState }),
    useYethAccountState: () => ({
      data: currentAccountState,
      isLoading: currentAccountLoading,
    }),
    useYethClaimAndExit: () => ({
      write: claimExitWrite,
      state: { status: "idle" as const },
    }),
    useYethClaimAndStay: () => ({
      write: claimStayWrite,
      state: { status: "idle" as const },
    }),
    useYethRedeemToEth: () => ({
      write: redeemWrite,
      state: { status: "idle" as const },
    }),
  };
});

function buildGlobalState(
  overrides: Partial<YethGlobalState> = {}
): YethGlobalState {
  return {
    asOf: CLOSES_AT - 600,
    claimWindow: { closesAt: CLOSES_AT },
    approvedYipUrl: "https://gov.yearn.fi",
    manualLateClaimUrl: YETH_MANUAL_RECOVERY_CLAIM_URL,
    contracts: {
      claimContract: "0x1111111111111111111111111111111111111111",
      recoveryVault: "0x2222222222222222222222222222222222222222",
      yieldVault: "0x3333333333333333333333333333333333333333",
    },
    recoveryVault: {
      pps: 1_200_000_000_000_000_000n,
      totalAssetsEth: 0n,
      totalShares: 0n,
      hasStrategies: false,
    },
    yieldVault: {
      tvlEth: 0n,
      pps: 0n,
      totalShares: 0n,
      feeRecipient: "0x2222222222222222222222222222222222222222",
    },
    yieldSources: ["source one"],
    risks: ["risk one"],
    ...overrides,
  };
}

function buildAccountState(
  overrides: Partial<YethAccountState> = {}
): YethAccountState {
  return {
    address: "0x1111111111111111111111111111111111111111",
    snapshotLossEth: 10n * ONE,
    claimableNowEth: 4n * ONE,
    recoveryVaultShares: 0n,
    ...overrides,
  };
}

describe("YethPageClient wallet state gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    currentGlobalState = buildGlobalState();
    currentAccountState = buildAccountState();
    currentAccountLoading = false;
    currentYethUsesMockBackend = false;
    setFixedNow(CLOSES_AT - 120);
  });

  it("renders claim flow when claimableNowEth is positive", () => {
    currentAccountState = buildAccountState({
      claimableNowEth: 4n * ONE,
      recoveryVaultShares: 2n * ONE,
    });

    render(<YethPageClient />);

    expect(
      screen.getByRole("button", { name: /Claim 4(?:\.\d+)? ETH & Exit/ })
    ).toBeInTheDocument();
    expect(screen.queryByText(yethCopy.postClaim.stayingTitle)).not.toBeInTheDocument();
  });

  it("renders recovery position flow when claimableNowEth is zero and shares are positive", () => {
    currentAccountState = buildAccountState({
      claimableNowEth: 0n,
      recoveryVaultShares: 3n * ONE,
      snapshotLossEth: 0n,
    });

    render(<YethPageClient />);

    expect(screen.getByText(yethCopy.postClaim.stayingTitle)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Claim .* ETH & Exit/ })
    ).not.toBeInTheDocument();
  });

  it("renders no-snapshot state when claim, shares, and snapshot are all zero", () => {
    currentAccountState = buildAccountState({
      claimableNowEth: 0n,
      recoveryVaultShares: 0n,
      snapshotLossEth: 0n,
    });

    render(<YethPageClient />);

    expect(
      screen.queryByRole("button", { name: /Claim .* ETH & Exit/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(yethCopy.postClaim.stayingTitle)).not.toBeInTheDocument();
    expect(screen.getByText(yethCopy.page.noSnapshotClaimTitle)).toBeInTheDocument();
    expect(screen.getByText(yethCopy.page.noSnapshotClaimBody)).toBeInTheDocument();
    const manualClaimLinks = screen.getAllByRole("link", {
      name: yethCopy.page.noSnapshotClaimManualCta,
    });
    expect(manualClaimLinks).not.toHaveLength(0);
    for (const manualClaimLink of manualClaimLinks) {
      expect(manualClaimLink).toHaveAttribute(
        "href",
        currentGlobalState?.manualLateClaimUrl
      );
    }
    expect(screen.getByText("View Contracts, Risks & Sources")).toBeInTheDocument();
  });

  it("uses persisted claim history for snapshot value, claimed time, and tx reference", () => {
    window.localStorage.setItem(
      "yeth_claim_history_v1",
      JSON.stringify({
        [E2E_MOCK_ADDRESS.toLowerCase()]: {
          snapshotLossEth: (10n * ONE).toString(),
          recoveredEth: (4n * ONE).toString(),
          claimedAt: CLOSES_AT - 3_600,
          txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      })
    );
    currentAccountState = buildAccountState({
      claimableNowEth: 0n,
      recoveryVaultShares: 0n,
      snapshotLossEth: 0n,
    });

    render(<YethPageClient />);

    expect(screen.getByText(yethCopy.page.completeTitle)).toBeInTheDocument();
    expect(screen.getByText(yethCopy.page.completeBody)).toBeInTheDocument();
    expect(screen.getByText(yethCopy.fields.claimedAt)).toBeInTheDocument();
    expect(screen.getByText(yethCopy.fields.recoveredValue)).toBeInTheDocument();
    expect(screen.getByText(/4(?:\.0+)? ETH/)).toBeInTheDocument();
    const txLink = screen.getByRole("link", { name: yethCopy.fields.claimTx });
    expect(txLink).toHaveAttribute(
      "href",
      "https://etherscan.io/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
  });

  it("updates persisted history after a storage event from another tab", () => {
    currentAccountState = buildAccountState({
      claimableNowEth: 0n,
      recoveryVaultShares: 0n,
      snapshotLossEth: 0n,
    });
    render(<YethPageClient />);

    act(() => {
      window.localStorage.setItem("yeth_claim_history_v1", JSON.stringify({
        [E2E_MOCK_ADDRESS.toLowerCase()]: {
          snapshotLossEth: (10n * ONE).toString(),
          recoveredEth: (4n * ONE).toString(),
          claimedAt: CLOSES_AT - 3_600,
          txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      }));
      window.dispatchEvent(new StorageEvent("storage", { key: "yeth_claim_history_v1" }));
    });

    expect(screen.getByText(yethCopy.page.completeTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: yethCopy.fields.claimTx })).toBeInTheDocument();
  });

  it("keeps the last valid deadline when a later payload omits it", () => {
    const { rerender } = render(<YethPageClient />);
    currentGlobalState = buildGlobalState({ claimWindow: { closesAt: 0 } });
    setFixedNow(CLOSES_AT + 10);
    rerender(<YethPageClient />);

    expect(screen.getByText(yethCopy.claimEnded.title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim .* ETH & Exit/ })).not.toBeInTheDocument();
  });

  it("uses local current time for deadline gating even when feed asOf is stale", () => {
    currentGlobalState = buildGlobalState({
      asOf: CLOSES_AT - 3_600,
    });
    currentAccountState = buildAccountState({
      claimableNowEth: 2n * ONE,
    });
    setFixedNow(CLOSES_AT + 10);

    render(<YethPageClient />);

    expect(screen.getByText(yethCopy.claimEnded.title)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Claim .* ETH & Exit/ })
    ).not.toBeInTheDocument();
  });

  it("renders granular countdown in the recovery banner", () => {
    currentGlobalState = buildGlobalState({
      claimWindow: { closesAt: CLOSES_AT },
    });
    setFixedNow(CLOSES_AT - (2 * 86_400 + 5 * 3_600 + 10 * 60));

    render(<YethPageClient />);

    expect(screen.getByText("Ends in 2d 5h")).toBeInTheDocument();
  });

  it("renders hour and minute countdown when less than one day remains", () => {
    currentGlobalState = buildGlobalState({
      claimWindow: { closesAt: CLOSES_AT },
    });
    setFixedNow(CLOSES_AT - (3 * 3_600 + 15 * 60));

    render(<YethPageClient />);

    expect(screen.getByText("Ends in 3h 15m")).toBeInTheDocument();
  });

  it("treats invalid deadlines as unavailable instead of closed/1970", () => {
    currentGlobalState = buildGlobalState({
      claimWindow: { closesAt: 0 },
    });
    currentAccountState = buildAccountState({
      claimableNowEth: 2n * ONE,
    });

    render(<YethPageClient />);

    expect(screen.getByText(yethCopy.page.statusUnavailable)).toBeInTheDocument();
    expect(screen.getByText(yethCopy.page.countdownUnavailable)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Claim 2(?:\.\d+)? ETH & Exit/ })
    ).toBeInTheDocument();
    expect(screen.queryByText(yethCopy.claimEnded.title)).not.toBeInTheDocument();
    expect(screen.queryByText(/Jan 01, 1970/i)).not.toBeInTheDocument();
  });

  it("closes the risk modal and blocks claim-stay writes once deadline passes", async () => {
    currentGlobalState = buildGlobalState();
    currentAccountState = buildAccountState({
      claimableNowEth: 2n * ONE,
    });
    setFixedNow(CLOSES_AT - 60);

    const { rerender } = render(<YethPageClient />);

    fireEvent.click(screen.getByRole("button", { name: yethCopy.actions.stay.cta }));
    fireEvent.click(await screen.findByLabelText(yethCopy.riskModal.checkbox));

    expect(
      screen.getByRole("button", { name: yethCopy.riskModal.continue })
    ).toBeEnabled();

    setFixedNow(CLOSES_AT + 10);
    rerender(<YethPageClient />);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: yethCopy.riskModal.continue })
      ).not.toBeInTheDocument();
    });
    expect(claimStayWrite).not.toHaveBeenCalled();
  });
});
