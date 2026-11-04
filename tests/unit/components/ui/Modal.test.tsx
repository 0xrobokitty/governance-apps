import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/ui/Modal";

function Example() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open breakdown</button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Breakdown">
      <button tabIndex={-1}>Excluded from tab order</button>
      <button hidden>Hidden control</button>
      <button>Last control</button>
    </Modal>
  </>;
}

describe("Modal keyboard behavior", () => {
  it("names the dialog, traps focus, and restores the trigger and prior scroll state", async () => {
    document.body.style.overflow = "clip";
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Open breakdown" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Breakdown" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    const last = within(dialog).getByRole("button", { name: "Last control" });
    // The dialog can render before its passive effect moves focus.
    await waitFor(() => expect(close).toHaveFocus());
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("clip");
    document.body.style.overflow = "";
  });


  it("wraps through a collapsed summary instead of its hidden wallet links", async () => {
    render(
      <Modal isOpen onClose={() => {}} title="Wallet choices">
        <button>WalletConnect</button>
        <details>
          <summary>Need a wallet?</summary>
          <a href="https://metamask.io/">Get MetaMask</a>
          <a href="https://rabby.io/">Get Rabby</a>
        </details>
      </Modal>
    );
    const dialog = await screen.findByRole("dialog", { name: "Wallet choices" });
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    const summary = screen.getByText("Need a wallet?");
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(summary).toHaveFocus();
    fireEvent.keyDown(summary, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.click(summary);
    const last = screen.getByRole("link", { name: "Get Rabby" });
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
  });

  it("keeps the connection-link summary in tab order with empty collapsed content", async () => {
    render(
      <Modal isOpen onClose={() => {}} title="Pair wallet">
        <button>Copy connection link</button>
        <details>
          <summary>Show connection link</summary>
          <p>Private connection URI</p>
        </details>
        <div style={{ display: "none" }}><button>Hidden parent control</button></div>
        <fieldset disabled><button>Disabled fieldset control</button></fieldset>
      </Modal>
    );
    const dialog = await screen.findByRole("dialog", { name: "Pair wallet" });
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    const summary = screen.getByText("Show connection link");
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(summary).toHaveFocus();
    fireEvent.keyDown(summary, { key: "Tab" });
    expect(close).toHaveFocus();
  });

  it("excludes summaries inside a collapsed parent disclosure", async () => {
    render(
      <Modal isOpen onClose={() => {}} title="Nested disclosures">
        <details>
          <summary>Visible summary</summary>
          <details><summary>Hidden nested summary</summary><button>Hidden nested action</button></details>
        </details>
      </Modal>
    );
    const dialog = await screen.findByRole("dialog", { name: "Nested disclosures" });
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(screen.getByText("Visible summary")).toHaveFocus();
  });

  it("fits opted-in dialogs to a panned visual viewport and follows viewport changes", async () => {
    const viewport = Object.assign(new EventTarget(), {
      offsetLeft: 32,
      offsetTop: 20,
      width: 320,
      height: 844,
    });
    const remove = vi.spyOn(viewport, "removeEventListener");
    vi.stubGlobal("visualViewport", viewport);
    try {
      const view = render(<Modal isOpen onClose={() => {}} title="Visible screen" fitVisualViewport><button>Continue</button></Modal>);
      const dialog = await screen.findByRole("dialog", { name: "Visible screen" });
      const overlay = dialog.parentElement!;
      expect(overlay).toHaveStyle({ left: "32px", top: "20px", width: "320px", height: "844px" });
      expect(overlay.style.getPropertyValue("--modal-viewport-width")).toBe("320px");
      viewport.offsetLeft = 48;
      viewport.offsetTop = 40;
      viewport.width = 280;
      viewport.height = 600;
      viewport.dispatchEvent(new Event("scroll"));
      expect(overlay).toHaveStyle({ left: "48px", top: "40px", width: "280px", height: "600px" });
      expect(overlay.style.getPropertyValue("--modal-viewport-height")).toBe("600px");
      view.unmount();
      expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
      expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the existing close button and outside-click behavior", async () => {
    render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: "Open breakdown" }));
    const dialog = await screen.findByRole("dialog", { name: "Breakdown" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open breakdown" }));
    expect(await screen.findByRole("dialog", { name: "Breakdown" })).toBeVisible();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
