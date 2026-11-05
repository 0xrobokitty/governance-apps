import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEther, type Hash } from "viem";
import { RecoveryDashboard, type RecoveryController } from "@/app/yeth/RecoveryPreviewClient";
import { MockRecoveryPreviewClient } from "@/lib/clients/yeth/recovery/mock";
import type { RecoveryExitState } from "@/lib/hooks/useYethRecoveryExit";

afterEach(cleanup);
const initial = (): RecoveryExitState => ({
  phase:"idle", step:null, mode:"complete", originalShares:0n, remainingShares:0n, receivedWeth:0n, canContinue:false,
});
function controller(scenario: "limited" | "waiting" = "limited"): RecoveryController {
  const mock = new MockRecoveryPreviewClient();
  mock.setScenario(scenario);
  return {
    snapshot:mock.getSnapshot(), error:null, refresh:vi.fn(), approve:vi.fn(), take:vi.fn(), redeem:vi.fn(),
    tx:{state:{status:"idle"},reset:vi.fn()} as unknown as RecoveryController["tx"],
    canTransact:true,canRedeem:true,walletPromptActive:false,
    exit:{state:initial(),start:vi.fn().mockResolvedValue(undefined),continue:vi.fn(),pause:vi.fn()},
  };
}
describe("production exit journey", () => {
  it("names the auction and percentage, then uses one consent for the whole exit", async () => {
    const c=controller();
    const view=render(<RecoveryDashboard controller={c} mode="fork" />);
    expect(screen.queryByText("Test network")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Refresh"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/Exit via auction.*50.7%/}));
    const dialog=await screen.findByRole("dialog");
    expect(within(dialog).getByText("50.7%")).toBeVisible();
    expect(within(dialog).getByText("5.068 WETH")).toBeVisible();
    expect(within(dialog).getByRole("button",{name:"Confirm exit"})).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    await act(async()=>fireEvent.click(within(dialog).getByRole("button",{name:"Confirm exit"})));
    expect(c.exit!.start).toHaveBeenCalledTimes(1);
    expect(c.exit!.start).toHaveBeenCalledWith(expect.objectContaining({mode:"complete",originalShares:c.snapshot!.shares,weth:parseEther(".75")}));
    c.exit!.state={...initial(),phase:"take",step:"take",mode:"complete",originalShares:c.snapshot!.shares,remainingShares:c.snapshot!.shares};
    view.rerender(<RecoveryDashboard controller={c} mode="fork" />);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    c.exit!.state={...c.exit!.state,phase:"redeem",step:"redeem",receivedWeth:parseEther(".75")};
    view.rerender(<RecoveryDashboard controller={c} mode="fork" />);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Redeem remaining shares")).toBeVisible();
    expect(c.redeem).not.toHaveBeenCalled(); // the sequencer, not presentation, owns writes
  });

  it("resumes a paused exit without another risk checkbox or a repeated auction", async () => {
    const c=controller();
    c.exit!.state={...initial(),phase:"paused",step:"redeem",receivedWeth:parseEther(".75"),canContinue:true};
    render(<RecoveryDashboard controller={c} mode="fork" />);
    await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Continue exit"})));
    const dialog=await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(c.exit!.continue).toHaveBeenCalledTimes(1);
    expect(c.exit!.start).not.toHaveBeenCalled();
    expect(c.take).not.toHaveBeenCalled();
  });

  it("keeps a rejected start in review instead of showing an old success", async () => {
    const c=controller();
    c.exit!.state={...initial(),phase:"complete",receivedWeth:parseEther("2")};
    c.exit!.start=vi.fn().mockRejectedValue(new Error("Your wallet changed."));
    render(<RecoveryDashboard controller={c} mode="fork" />);
    fireEvent.click(screen.getByRole("button",{name:/Exit via auction/}));
    const dialog=await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    await act(async()=>fireEvent.click(within(dialog).getByRole("button",{name:"Confirm exit"})));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Your wallet changed.");
    expect(within(dialog).getByRole("checkbox")).toBeVisible();
    expect(within(dialog).queryByText("Exit complete")).not.toBeInTheDocument();
  });

  it("normal direct redemption asks for confirmation, never a transaction hash", async () => {
    const c=controller("waiting");
    const view=render(<RecoveryDashboard controller={c} mode="fork" />);
    fireEvent.click(screen.getByRole("button",{name:/Exit position/}));
    const dialog=await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    await act(async()=>fireEvent.click(within(dialog).getByRole("button",{name:"Confirm exit"})));
    c.walletPromptActive=true;
    c.exit!.state={...initial(),phase:"redeem",step:"redeem"};
    c.pendingExecution={version:1,id:"ordinary-send",account:"0x1111111111111111111111111111111111111111",chainId:31337,connectorId:"injected",kind:"transaction",action:"redeem",status:"submitting",createdAt:1800000000,submittedBlock:"100",maxShares:c.snapshot!.shares.toString()};
    view.rerender(<RecoveryDashboard controller={c} mode="fork" />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Recover submission/)).not.toBeInTheDocument();
    expect(screen.queryByText("Troubleshoot transaction")).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("Confirm in your wallet").length).toBeGreaterThan(0);
    expect(c.exit!.start).toHaveBeenCalledWith({mode:"complete",originalShares:c.snapshot!.shares});
  });

  it("keeps missing-hash recovery behind explicit troubleshooting after an uncertain response", () => {
    const c=controller("waiting");
    c.pendingExecution={version:1,id:"uncertain",account:"0x1111111111111111111111111111111111111111",chainId:31337,connectorId:"injected",kind:"transaction",action:"redeem",status:"attention",createdAt:1800000000,submittedBlock:"100",maxShares:"100"};
    render(<RecoveryDashboard controller={c} mode="fork" />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Troubleshoot transaction"));
    expect(screen.getByRole("textbox")).toBeVisible();
    expect(c.redeem).not.toHaveBeenCalled();
  });

  it("does not strand the user after an offer changes beyond the reviewed bounds", () => {
    const c=controller();
    c.exit!.state={...initial(),phase:"paused",step:"take",error:"The auction offer changed.",canContinue:false};
    render(<RecoveryDashboard controller={c} mode="fork" />);
    expect(screen.queryByRole("button",{name:"Continue exit"})).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:/Exit via auction/})).toBeEnabled();
  });
  it("keeps the completed exit in the headline across tabs, with its own receipt link", () => {
    const c=controller();
    const hash=("0x"+"ab".repeat(32)) as Hash;
    const unrelated=("0x"+"cd".repeat(32)) as Hash;
    c.snapshot={...c.snapshot!,shares:0n,originalClaimEth:0n,walletWeth:parseEther("999")};
    c.exit!.state={...initial(),phase:"complete",receivedWeth:parseEther("5.068"),hash};
    c.completion={status:"confirmed",action:"approve",hash:unrelated};
    render(<RecoveryDashboard controller={c} mode="live" />);
    const summary=screen.getByTestId("recovery-exit-summary");
    const headline=screen.getByRole("region",{name:"yETH Recovery"});
    expect(headline).toContainElement(summary);
    expect(within(headline).getByRole("heading",{name:"Exit complete"})).toBeVisible();
    expect(screen.getByTestId("recovery-headline")).toHaveTextContent("5.068WETH");
    expect(summary.querySelector("a")).toHaveAttribute("href",expect.stringContaining(hash));
    expect(screen.queryByText(/999/)).not.toBeInTheDocument();
    for (const name of ["FAQ","Contracts","Holders"]) {
      fireEvent.click(screen.getByRole("tab",{name}));
      expect(headline).toContainElement(screen.getByTestId("recovery-exit-summary"));
      expect(screen.getAllByTestId("recovery-exit-summary")).toHaveLength(1);
      expect(screen.getByRole("tabpanel")).not.toContainElement(summary);
    }
  });

  it("restores only the confirmed action amount and hides it when disconnected", () => {
    const c=controller();
    const hash=("0x"+"ab".repeat(32)) as Hash;
    c.snapshot={...c.snapshot!,shares:0n,originalClaimEth:0n};
    c.completion={status:"confirmed",action:"redeem",hash,receipt:{hash,blockNumber:101n,wethReceived:parseEther("4.318"),sharesSpent:parseEther("8"),remainingShares:0n}};
    const view=render(<RecoveryDashboard controller={c} mode="live" />);
    expect(screen.getByRole("heading",{name:"Last vault redemption"})).toBeVisible();
    expect(screen.getByTestId("recovery-headline")).toHaveTextContent("4.318WETH");
    expect(screen.queryByRole("heading",{name:"Exit complete"})).not.toBeInTheDocument();
    c.snapshot={...c.snapshot,connected:false};
    view.rerender(<RecoveryDashboard controller={c} mode="live" />);
    expect(screen.queryByTestId("recovery-exit-summary")).not.toBeInTheDocument();
  });

});
