import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    expect(close).toHaveFocus();
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
